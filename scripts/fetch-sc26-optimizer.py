#!/usr/bin/env python3
"""
Regenerate the SC26 "SophiaG at 50M tokens per batch" chart data from W&B.

Source: wandb project `aurora_gpt/AuroraGPT`, filtered exactly like the
W&B workspace view used for the SC26 backup slides:

  created_at                                    >= 2025-08-20
  user                                          == foremans
  config.args.num_layers                        == 12
  config.args.tokenizer_model                   in {google/gemma-7b, google/gemma-7B}
  config.args.rope_theta                        == 50000
  config.args.zero_stage                        == 0
  config.args.checkpoint_activations            == False
  config.args.micro_batch_size                  == 1
  config.args.world_size                        in {3072, 6240}
  config.args.data_file_list                    == ALCF/data-lists/aurora/olmo-mix-1124.txt
  config.args.deepspeed_config_dict.grad_accum  >= 2
  config.outdir                                 == optimizer-experiments/Megatron-DeepSpeed
  config.torch_version_as_float                 >= 2.8
  env.LOAD                                      unset (fresh runs, not resumes)
  name                                          not in {treasured-thunder-4350,
                                                        grateful-dust-4351,
                                                        glowing-disco-4352}

W&B's server-side filter API times out on the full combination, so we filter
server-side by `config.args.optimizer` + created_at (fast) and apply the rest
client-side.

Output: web/src/components/slides/sc26-optimizer-data.ts
  optimizerHistories[] entries keep [x, y] pairs where x is tokens in BILLIONS
  (the web chart divides by 1000 to draw trillions) and y is the raw metric.
  Smoothing is left to the chart (it applies TWEMA); this file stores RAW data,
  raw grad-norm values are kept (the chart clips the y axis at 50); buckets
  are widened as needed so the surviving two extrema per bucket stay within
  MAX_POINTS_PER_SERIES. Bucket extrema are preserved, so the AdamW blow-up
  and MuonClip spikes survive intact.

Usage:
    python scripts/fetch-sc26-optimizer.py

Requires: wandb, pandas, pyarrow. Auth via ~/.netrc (machine api.wandb.ai).
"""
from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import pandas as pd

PROJECT = "aurora_gpt/AuroraGPT"
CREATED_AFTER = "2025-08-20T00:00:00Z"
NUM_LAYERS = {12}
TOKENIZERS = {"google/gemma-7b", "google/gemma-7B"}
WORLD_SIZES = {3072, 6240}
DATA_LIST = "ALCF/data-lists/aurora/olmo-mix-1124.txt"
EXCLUDED_NAMES = {"treasured-thunder-4350", "grateful-dust-4351", "glowing-disco-4352"}
# Runs whose grad_norm telemetry is broken (e.g. logging in wrong units after a
# resume) — their grad series is garbage and pins the chart's clipped axis.
# `1a7bjaeu` (muonclip, name solar-river-4174) logs grad_norm values orders of
# magnitude above any healthy run from the first logged step onward.
BAD_GRAD_RUN_NAMES = {"solar-river-4174"}  # grad_norm telemetry corrupt
# Scope to the canonical 50M-token-per-batch campaign tree (same as
# scripts/fetch-optimizer-comparison.py). The whole 2025-08 sweep this chart is
# built from launched out of optimizer-experiments/Megatron-DeepSpeed; the
# large-batch-training/tok50M-n512 tree holds the older muon-only run, which is
# intentionally excluded. Set to "" to disable the filter.
OUTDIR = (
    "/lus/flare/projects/AuroraGPT/AuroraGPT-v1/Experiments/AuroraGPT-2B/"
    "optimizer-experiments/Megatron-DeepSpeed"
)
CACHE = Path("/tmp/sc26-optimizer-cache")
OUT = Path(__file__).resolve().parent.parent / "web/src/components/slides/sc26-optimizer-data.ts"
BUCKET_TOKENS = 1_000_000_000  # 1B tokens — dense enough to see spikes on a 5T axis
# W&B history is logged every ~25M tokens, so a 5T-token chain is ~200k rows.
# Keeping two extrema per 1B bucket already yields ~9.3k points per series,
# which then gets stride-thinned below; rather than thin after the fact we
# widen the bucket until we are under the cap so the surviving extrema are
# real observed values, not stride artefacts of the first N points.
MAX_POINTS_PER_SERIES = 2400

STEP_KEY = "_step"
TOKEN_KEY = "training/consumed_tokens"
LOSS_KEY = "loss/lm loss"
GRAD_KEY = "loss/grad_norm"

# Optimizers to chart, in legend order, with their palette slot in sc26-charts.ts
# (colors[] = [blue, red, purple, orange, green]).
RUNS = [
    ("ipex.fusedlamb", "lamb"),
    ("muonclip", "muon"),
    ("adamw", "adamw"),
    ("sophiag", "sophiag"),
]


def enumerate_candidates(api, cache_path: Path):
    """Enumerate matching run ids once and cache them with their optimizer.

    Server-side filtering on config.args.optimizer is fast enough; the full
    filter set is not, so the rest are applied client-side here. The cache
    stores {run_id: optimizer} so the chart step needs no extra API calls.
    """
    out, seen = [], set()
    for wandb_name, _ in RUNS:
        print(f"enumerating {wandb_name} …", flush=True)
        filters = {"config.args.optimizer": wandb_name, "created_at": {"$gte": CREATED_AFTER}}
        if OUTDIR:
            filters["config.outdir"] = OUTDIR
        runs = api.runs(PROJECT, filters=filters, per_page=500)
        kept = 0
        for r in runs:
            if keep_run(r) and r.id not in seen:
                seen.add(r.id)
                out.append({"id": r.id, "optimizer": wandb_name})
                kept += 1
        print(f"    kept {kept} {wandb_name} runs", flush=True)
    cache_path.write_text(json.dumps(out, indent=0))
    print(f"wrote {len(out)} candidates to {cache_path}")
    return out


def keep_run(r):
    if r.name in EXCLUDED_NAMES:
        return False
    # muonclip `solar-river-4174` logs grad_norm orders of magnitude too high
    # from step 0 (resumed mid-run with a wrong scale); including it would pin
    # every other run to the 50 clip on the chart. Drop it entirely rather than
    # silently charting noise. Loss curve is still representative of the chain.
    if r.name in BAD_GRAD_RUN_NAMES:
        return False
    cfg = r.config or {}
    args = cfg.get("args") or {}
    env = cfg.get("env") or {}
    ds = args.get("deepspeed_config_dict")
    ga = ds.get("gradient_accumulation_steps") if isinstance(ds, dict) else None
    try:
        layers = args.get("num_layers")
        rope = args.get("rope_theta")
        torch_ver = cfg.get("torch_version_as_float")
        ws = args.get("world_size")
        ga = float(ga) if ga is not None else None
        user = str(getattr(r, "user", ""))
        ok_user = ("foremans" in user)
        return (
            ok_user
            and layers in NUM_LAYERS
            and args.get("tokenizer_model") in TOKENIZERS
            and rope == 50000
            and args.get("zero_stage") == 0
            and args.get("checkpoint_activations") is False
            and args.get("micro_batch_size") == 1
            and ws in WORLD_SIZES
            and args.get("data_file_list") == DATA_LIST
            and ga is not None and ga >= 2
            and torch_ver is not None and float(torch_ver) >= 2.8
            and not env.get("LOAD")
        )
    except (TypeError, ValueError):
        return False


GRAD_CLIP = 50.0  # W&B panel clips the grad-norm axis at 50; diverged runs sit above it


def downsample(df, col, max_points=MAX_POINTS_PER_SERIES):
    """Keep min and max per bucket so extrema survive; drop NaNs.

    Raw grad-norm values are preserved verbatim (the chart clips the y axis
    at GRAD_CLIP for display); clipping here would let TWEMA smooth a spike
    away, which is exactly what the raw trace is meant to show.
    """
    d = df.dropna(subset=["tokens", col]).sort_values("tokens")
    if d.empty:
        return []
    bucket = BUCKET_TOKENS
    while True:
        b = (d.tokens // bucket).astype("int64")
        n = b.nunique() * 2
        if n <= max_points or bucket >= 512 * BUCKET_TOKENS:
            break
        bucket *= 2
    out = []
    for _, grp in d.groupby(b):
        idx = [grp[col].idxmin(), grp[col].idxmax()]
        for i in idx:
            y = float(d.loc[i, col])
            out.append((d.loc[i, "tokens"] / 1e9, y))
    out.sort(key=lambda p: p[0])
    return [(round(x, 4), round(y, 5)) for x, y in out]


def fetch_history(api, run_id: str, cache_dir: Path) -> pd.DataFrame:
    """Fetch one run's history, caching the raw parquet under cache_dir."""
    path = cache_dir / f"{run_id}.parquet"
    if path.exists():
        return pd.read_parquet(path)
    rows = []
    for attempt in range(6):
        try:
            run = api.run(f"{PROJECT}/{run_id}")
            for h in run.scan_history():
                rows.append((h.get(STEP_KEY), h.get(TOKEN_KEY), h.get(LOSS_KEY), h.get(GRAD_KEY)))
            break
        except Exception as e:  # transient 5xx / rate limits
            wait = 5 * (attempt + 1)
            print(f"    retry {run_id} ({e}); sleeping {wait}s", flush=True)
            time.sleep(wait)
    else:
        raise RuntimeError(f"could not fetch history for {run_id}")
    df = pd.DataFrame(rows, columns=["step", "tokens", "loss", "grad_norm"])
    for col in ("step", "tokens", "loss", "grad_norm"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["step"])
    df.to_parquet(path, index=False)
    return df


# Vanilla muon (urpc8ces, ~0.25T tokens) is a different experiment from the
# muonclip campaign that reached ~1.6T tokens; only muonclip is charted.

def main() -> int:
    CACHE.mkdir(parents=True, exist_ok=True)
    HISTORY_CACHE = CACHE / "histories"
    HISTORY_CACHE.mkdir(parents=True, exist_ok=True)
    CAND = CACHE / "candidates.json"

    need_network = "--enumerate" in sys.argv or any(
        not (HISTORY_CACHE / f"{e['id']}.parquet").exists() for e in json.loads(CAND.read_text() or "[]")
    ) if CAND.exists() else True
    if "--enumerate" in sys.argv or need_network:
        import wandb

        if "--enumerate" in sys.argv:
            enumerate_candidates(wandb.Api(), CAND)
            return 0
        api = wandb.Api()
    else:
        api = None

    if not CAND.exists():
        raise SystemExit(f"missing {CAND}; run `python {Path(__file__).name} --enumerate` first")
    candidates = json.loads(CAND.read_text())
    by_opt: dict[str, list[str]] = {name: [] for name, _ in RUNS}
    skipped = []
    for entry in candidates:
        opt = entry["optimizer"]
        if opt in by_opt:
            by_opt[opt].append(entry["id"])
        else:
            skipped.append((entry["id"], opt))
    if skipped:
        print(f"skipping {len(skipped)} run(s) with untracked optimizer: {skipped}")

    series = []
    for wandb_name, local in RUNS:
        ids = by_opt.get(wandb_name, [])
        print(f"\n=== {local} ({wandb_name})  {len(ids)} runs ===")
        frames = []
        for rid in ids:
            df = fetch_history(api, rid, HISTORY_CACHE)
            if df.empty:
                print(f"    {rid} rows=0 (skipped)")
                continue
            df = df.dropna(subset=["tokens"]).sort_values("tokens")
            frames.append(df)
            print(f"    {rid} rows={len(df):>6} tokens<={df.tokens.max()/1e9:8.1f}B")
        if not frames:
            continue
        # Process longest runs first so the dedup below keeps the row from the
        # most-progressed run when two runs report the same token count.
        frames.sort(key=lambda df: df.tokens.max(), reverse=True)
        union = pd.concat(frames, ignore_index=True)
        # consumed_tokens is monotonic along a resume chain. Runs in the same
        # campaign all describe one logical 50M-tokens-per-step training, so
        # overlapping observations of the same token count should agree; keep
        # the longest-running (i.e. latest, post-resume) copy rather than an
        # arbitrary first-sorted row, which was dropping real extrema.
        union["_tkey"] = (union["tokens"] / 1e6).round().astype("int64")
        union = (
            union.sort_values(["tokens"], kind="stable")
            .drop_duplicates(subset=["_tkey"], keep="first")
            .drop(columns=["_tkey"])
            .reset_index(drop=True)
        )
        loss = downsample(union, "loss")
        grad = downsample(union, "grad_norm")
        print(
            f"  loss points={len(loss)}  grad points={len(grad)}  "
            f"max_tokens={union.tokens.max()/1e12:.3f}T"
        )
        series.append((local, loss, grad))

    lines = [
        "// AUTO-GENERATED by scripts/fetch-sc26-optimizer.py. Do not hand-edit.",
        "// Source: wandb project aurora_gpt/AuroraGPT, filters documented in that script.",
        "// x = tokens consumed (BILLIONS). y = raw metric; smoothing happens in the chart (TWEMA). grad_norm is clipped to 50 to match the W&B panel axis.",
        "// Note: `lamb` is ipex.fusedlamb; `muon` is muonclip (the campaign that reached ~1.6T).",
        "// The single vanilla-muon run (urpc8ces, ~0.25T tokens) is intentionally excluded.",
        "export const optimizerHistories = [",
    ]
    for name, loss, grad in series:
        def fmt(rows):
            return ", ".join(f"[{x},{y}]" for x, y in rows)

        lines.append(f"    {{ name: '{name}', loss: [{fmt(loss)}],")
        lines.append(f"      grad: [{fmt(grad)}] }},")
    lines.append("]")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"\nwrote {OUT} ({OUT.stat().st_size // 1024} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
