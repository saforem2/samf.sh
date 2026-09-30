#!/usr/bin/env node
/*
 * Roofline figure for the 2026-10-15 talk. Log-log plot of achievable
 * throughput (TFLOP/s, bf16) against arithmetic intensity (FLOP/byte), with
 * Intel Data Center GPU Max 1550 (per tile) as the primary roof and NVIDIA
 * A100 40GB as a visually subordinate second roof.
 *
 * The math. A kernel that moves B bytes of HBM traffic and does F flops has
 * arithmetic intensity I = F / B. On a device with peak compute P (FLOP/s) and
 * peak memory bandwidth M (byte/s), the best it can do is
 *
 *     attainable(I) = min(P, M * I)
 *
 * which on log-log axes is a slope-1 diagonal (the memory roof, M * I) meeting
 * a flat ceiling (the compute roof, P). The corner is the RIDGE POINT
 *
 *     I_ridge = P / M       [FLOP/byte]
 *
 * Left of the ridge a kernel is memory-bound (more FLOP/s only comes from
 * moving fewer bytes); right of it, compute-bound. The ridge points plotted
 * here are 208 FLOP/byte for the Max 1550 tile and 201 FLOP/byte for the A100
 * 40GB -- close enough that the two devices ask essentially the same thing of
 * a kernel, which is the point of the slide.
 *
 * Data provenance -- every number below is vendor-sourced, none are estimated.
 *
 *   Max 1550 compute, 340.8 TFLOP/s bf16 PER TILE
 *     512 ops/cycle x 512 CU x 1300 MHz. This is the formula ezpz uses in
 *     src/ezpz/flops.py:140-155 (_compute_pvc_peak_flops) against the live
 *     torch.xpu compute-unit count; 448 active CUs gives 298.2 TFLOP/s.
 *     Mechanism is DPAS/XMX, documented in Intel's oneAPI GPU optimization
 *     guide, which lists the Xe-core matrix throughput as "4096 FP16/BF16
 *     operations/cycle" and the Max 1550 DPAS row as "262144 x 2" FLOPs/clk
 *     -- the "x 2" being the second stack, i.e. the un-doubled figure is
 *     per tile, matching the per-tile reading used here:
 *     https://www.intel.com/content/www/us/en/docs/oneapi/optimization-guide-gpu/2024-0/intel-xe-gpu-architecture.html
 *
 *   Max 1550 bandwidth, 1638.4 GB/s PER TILE  <-- converted, read carefully
 *     Intel ARK lists "Graphics Memory Bandwidth 3276.8 GB/s" for the whole
 *     128 GB HBM2e card over a 1024-bit interface:
 *     https://www.intel.com/content/www/us/en/products/sku/232873/intel-data-center-gpu-max-1550/specifications.html
 *     The card is 2 stacks (tiles), so per tile is 3276.8 / 2 = 1638.4 GB/s.
 *     The halving is required: the compute number above is PER TILE, and
 *     mixing per-card bandwidth with per-tile FLOP/s would move the ridge by
 *     2x. Three independent confirmations that the split is even:
 *       (a) 4 HBM2e controllers per stack, 8 per card (oneAPI guide above),
 *           and ALCF's Aurora overview: "4 slices are combined along with a
 *           large L2 cache and 4 HBM2E memory controllers to form a stack or
 *           tile" -- https://docs.alcf.anl.gov/aurora/hardware-overview/machine-overview/
 *       (b) 1024-bit at HBM2e's 3.2 Gbps pin rate is 409.6 GB/s per stack;
 *           8 stacks = 3276.8 GB/s (card), 4 stacks = 1638.4 GB/s (tile).
 *           Cross-checks against the 1-stack-lighter Max 1100, which ARK
 *           lists at 1228.8 GB/s = 3 x 409.6:
 *           https://www.intel.com/content/www/us/en/products/sku/232876/intel-data-center-gpu-max-1100/specifications.html
 *       (c) ALCF's Aurora node card gives "19.66 Peak GPU HBM BW (TB/s)" for
 *           6 GPUs = 3.2767 TB/s per card:
 *           https://www.alcf.anl.gov/sites/default/files/2024-11/Overview-of-Aurora-Oct-2024.pdf
 *
 *   A100 40GB compute, 312 TFLOP/s bf16 dense (no sparsity)
 *   A100 40GB bandwidth, 1555 GB/s HBM2
 *     Both from the NVIDIA A100 Tensor Core GPU datasheet, "A100 40GB PCIe"
 *     column: "BFLOAT16 Tensor Core 312 TFLOPS | 624 TFLOPS*" where the
 *     asterisk reads "* With sparsity", and "GPU Memory Bandwidth 1,555GB/s":
 *     https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf
 *     The 40GB variant is the one that matters here: Polaris is 4x A100 with
 *     "GPU Memory 40 GiB HBM2" per ALCF, and 1536 of Perlmutter's 1792 GPU
 *     nodes are "4x NVIDIA A100 (40GB)" per NERSC. The 80GB SXM part is
 *     2039 GB/s at the same 312 TFLOP/s, i.e. a ridge of 153 FLOP/byte.
 *       https://docs.alcf.anl.gov/polaris/hardware-overview/machine-overview/
 *       https://docs.nersc.gov/systems/perlmutter/architecture/
 *
 * Deck chart style: transparent bg, #838383 theme-invariant chrome, deck
 * palette, Iosevka embedded. Landscape + mobile variants.
 * Regenerate:  node scripts/gen-roofline.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fontDefs, FONT_STACK } from './svg-font.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIG_DIR = join(
    __dirname,
    '..',
    'public',
    'talks',
    '2026-10-15',
    'figures',
)
const OUT = join(FIG_DIR, 'roofline.svg')
const OUT_MOBILE = join(FIG_DIR, 'roofline-mobile.svg')

const FONT = FONT_STACK
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

// Devices. peak in TFLOP/s (bf16 dense), bw in GB/s. See provenance above.
const MAX1550 = {
    label: 'Max 1550',
    // The per-tile qualifier is its own readout line, not part of the name:
    // "Max 1550 (per tile)" set on one line is wide enough to run back past
    // the ridge and collide with the diagonal at the mobile aspect ratio.
    note: 'per tile',
    peak: 340.8, // 512 ops/cycle x 512 CU x 1300 MHz
    bw: 1638.4, // 3276.8 GB/s per card / 2 tiles
    color: '#118cc2',
    lw: 1.0, // multiplier on cfg.lw
}
const A100 = {
    label: 'A100 40GB',
    note: 'HBM2',
    peak: 312.0,
    bw: 1555.0,
    color: '#838383',
    lw: 0.62, // subordinate: thinner and grey
}
// Ridge point, FLOP/byte. TFLOP/s over GB/s cancels to (10^12 / 10^9) = 1000x.
const ridge = (d) => (d.peak * 1000) / d.bw
// Attainable TFLOP/s at arithmetic intensity I (FLOP/byte).
const attainable = (d, I) => Math.min(d.peak, (d.bw * I) / 1000)

const X_MIN = 1 // FLOP/byte
const X_MAX = 4096
const Y_MIN = 4 // TFLOP/s
const Y_MAX = 512

const lg = (x) => Math.log10(x)
// Decade-ish ticks: powers of two read better on a 1..4096 intensity axis,
// and they land on the byte counts people actually reason about.
const X_TICKS = [1, 4, 16, 64, 256, 1024, 4096]
const Y_TICKS = [4, 8, 16, 32, 64, 128, 256, 512]

const LANDSCAPE = {
    W: 820,
    H: 540,
    M: { top: 40, right: 26, bottom: 66, left: 74 },
    titleSize: 0, // title lives on the slide, not the figure
    axisSize: 21,
    tickSize: 18,
    labelSize: 21,
    noteSize: 17,
    lw: 4.2,
    dotR: 6,
}
const MOBILE = {
    W: 600,
    H: 430,
    M: { top: 34, right: 18, bottom: 60, left: 62 },
    titleSize: 0,
    axisSize: 18,
    tickSize: 15,
    labelSize: 17,
    noteSize: 14,
    lw: 3.4,
    dotR: 5,
}

function buildSVG(cfg) {
    const { W, H, M } = cfg
    const ax = M.left
    const ay = M.top
    const aw = W - M.left - M.right
    const ah = H - M.top - M.bottom
    const sx = (I) => ax + ((lg(I) - lg(X_MIN)) / (lg(X_MAX) - lg(X_MIN))) * aw
    const sy = (v) =>
        ay + ah - ((lg(v) - lg(Y_MIN)) / (lg(Y_MAX) - lg(Y_MIN))) * ah

    let body = ''

    // Regime tint: left of the primary ridge is memory-bound, right is
    // compute-bound. Keyed to the Max 1550 since it is the primary device.
    const xr = sx(ridge(MAX1550))
    body += `<rect x="${ax}" y="${ay}" width="${(xr - ax).toFixed(1)}" height="${ah}" fill="#ee8f24" opacity="0.05"/>`
    body += `<rect x="${xr.toFixed(1)}" y="${ay}" width="${(ax + aw - xr).toFixed(1)}" height="${ah}" fill="#1da811" opacity="0.05"/>`

    // plot frame
    body += `<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="none" stroke="#83838355" stroke-width="1"/>`

    // y gridlines + ticks (TFLOP/s)
    for (const v of Y_TICKS) {
        const yy = sy(v)
        body += `<line x1="${ax}" y1="${yy.toFixed(1)}" x2="${ax + aw}" y2="${yy.toFixed(1)}" stroke="#83838318" stroke-width="1"/>`
        body += `<text x="${(ax - 8).toFixed(1)}" y="${(yy + cfg.tickSize * 0.34).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="${cfg.tickSize}" fill="#838383">${v}</text>`
    }
    // x gridlines + ticks (FLOP/byte)
    for (const I of X_TICKS) {
        const xx = sx(I)
        body += `<line x1="${xx.toFixed(1)}" y1="${ay}" x2="${xx.toFixed(1)}" y2="${ay + ah}" stroke="#83838312" stroke-width="1"/>`
        body += `<text x="${xx.toFixed(1)}" y="${(ay + ah + cfg.tickSize + 6).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.tickSize}" fill="#838383">${I}</text>`
    }

    const clipId = `clip-roof-${cfg.W}`
    body += `<clipPath id="${clipId}"><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}"/></clipPath>`

    // Roof polylines. Drawn A100 first so the primary sits on top.
    for (const d of [A100, MAX1550]) {
        const Ir = ridge(d)
        const pts = [
            [X_MIN, attainable(d, X_MIN)],
            [Ir, d.peak],
            [X_MAX, d.peak],
        ]
        const path = pts
            .map(
                ([I, v], i) =>
                    `${i ? 'L' : 'M'}${sx(I).toFixed(1)} ${sy(v).toFixed(1)}`,
            )
            .join(' ')
        body += `<g clip-path="url(#${clipId})"><path d="${path}" fill="none" stroke="${d.color}" stroke-width="${(cfg.lw * d.lw).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" opacity="${d === MAX1550 ? 1 : 0.75}"/></g>`
    }

    // Ridge markers. Only the primary gets a dropped guide line: the two
    // ridges are 208 vs 201 FLOP/byte, so a second dashed line would just
    // overprint the first. Both corners keep a dot.
    body += `<line x1="${xr.toFixed(1)}" y1="${sy(MAX1550.peak).toFixed(1)}" x2="${xr.toFixed(1)}" y2="${ay + ah}" stroke="${MAX1550.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.85"/>`
    for (const d of [A100, MAX1550]) {
        body += `<circle cx="${sx(ridge(d)).toFixed(1)}" cy="${sy(d.peak).toFixed(1)}" r="${d === MAX1550 ? cfg.dotR : cfg.dotR - 1}" fill="${d.color}"/>`
    }

    // Device readouts: a right-anchored block in the empty upper-right of the
    // compute-bound region, under the ceilings. Kept to three SHORT lines per
    // device -- the long single-line form runs left past the ridge and crosses
    // the diagonal at this aspect ratio.
    const lx = ax + aw - 10
    let ly = sy(MAX1550.peak) + cfg.labelSize + 16
    const readout = (d) => {
        const lines = [
            [d.label, cfg.labelSize, 700],
            [d.note, cfg.noteSize, 400],
            [`${d.peak.toFixed(1)} TFLOP/s`, cfg.noteSize, 400],
            [`ridge ${ridge(d).toFixed(0)} FLOP/byte`, cfg.noteSize, 400],
        ]
        let t = ''
        for (const [s, size, weight] of lines) {
            t += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${d.color}">${esc(s)}</text>`
            ly += size + 5
        }
        ly += 14
        return t
    }
    body += readout(MAX1550)
    body += readout(A100)

    // Regime labels pinned to the bottom of the plot. The memory-bound pair
    // ALSO has to clear the diagonal horizontally: the line reaches the
    // y-floor at I = peak_floor/bw = 2.44 FLOP/byte, only ~11% across the
    // plot, so anything anchored at the left edge is struck through no
    // matter how low it sits. Start it just right of that crossing instead,
    // which is still well inside the memory-bound region.
    const regimeBottom = ay + ah - 14
    const regimeY = regimeBottom - cfg.noteSize - 6
    const floorCrossX = sx((Y_MIN * 1000) / MAX1550.bw)
    const memX = floorCrossX + cfg.noteSize * 1.6
    body += `<text x="${memX.toFixed(1)}" y="${regimeY.toFixed(1)}" font-family="${FONT}" font-size="${cfg.labelSize}" font-weight="700" fill="#ee8f24">memory-bound</text>`
    body += `<text x="${memX.toFixed(1)}" y="${regimeBottom.toFixed(1)}" font-family="${FONT}" font-size="${cfg.noteSize}" fill="#838383">HBM sets the limit</text>`
    body += `<text x="${(ax + aw - 12).toFixed(1)}" y="${regimeY.toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="${cfg.labelSize}" font-weight="700" fill="#1da811">compute-bound</text>`
    body += `<text x="${(ax + aw - 12).toFixed(1)}" y="${regimeBottom.toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="${cfg.noteSize}" fill="#838383">DPAS sets the limit</text>`

    // Bandwidth annotation for the memory diagonal. A plain vertical offset
    // does NOT clear a slope-1 log-log line -- at -10px the line struck
    // straight through the text. Rotate the label to the diagonal's screen
    // angle and push it perpendicular, so it rides alongside the line
    // instead of across it.
    const Islope = 7.0
    const bx = sx(Islope)
    const by = sy(attainable(MAX1550, Islope))
    // screen angle of the diagonal, measured from two points on it
    const x1 = sx(Islope / 2),
        y1 = sy(attainable(MAX1550, Islope / 2))
    const x2 = sx(Islope * 2),
        y2 = sy(attainable(MAX1550, Islope * 2))
    const angDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
    // unit normal, pointing up-left away from the line
    const len = Math.hypot(x2 - x1, y2 - y1)
    // normal pointing UP-LEFT of the line (screen y grows downward, and the
    // diagonal rises left-to-right, so this is the empty side)
    const nx = (y2 - y1) / len,
        ny = -((x2 - x1) / len)
    const off = cfg.noteSize * 1.4
    body += `<text x="${(bx + nx * off).toFixed(1)}" y="${(by + ny * off).toFixed(1)}" transform="rotate(${angDeg.toFixed(2)} ${(bx + nx * off).toFixed(1)} ${(by + ny * off).toFixed(1)})" text-anchor="middle" font-family="${FONT}" font-size="${cfg.noteSize}" fill="${MAX1550.color}">${MAX1550.bw.toFixed(1)} GB/s HBM2e</text>`

    // axis labels
    body += `<text x="${(ax + aw / 2).toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.axisSize}" fill="#838383">arithmetic intensity (FLOP/byte) →</text>`
    body += `<text x="18" y="${(ay + ah / 2).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.axisSize}" fill="#838383" transform="rotate(-90 18 ${(ay + ah / 2).toFixed(1)})">attainable bf16 TFLOP/s →</text>`

    return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
${fontDefs()}
${body}
</svg>
`
}

mkdirSync(FIG_DIR, { recursive: true })
writeFileSync(OUT, buildSVG(LANDSCAPE))
console.log('wrote', OUT)
writeFileSync(OUT_MOBILE, buildSVG(MOBILE))
console.log('wrote', OUT_MOBILE)
