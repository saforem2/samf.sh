#!/usr/bin/env node
/*
 * ZeRO / FSDP memory-partitioning figure for the 2026-08-03 talk's zero-fsdp
 * slide. Faithful recreation of the user's own `ddp-vs-fsdp.svg` from the HPC
 * Bootcamp course (NOT the DeepSpeed zero.png): horizontal memory-proportional
 * bars, one row per GPU, four labeled stages
 *   Baseline (DDP) / ZeRO-1 / ZeRO-2 / ZeRO-3 (FULL_SHARD)
 * where each stage shards one more component (optimizer -> +gradients ->
 * +params) into a per-GPU 1/N slice that sits at a different horizontal offset
 * on each GPU, over a greyed "freed memory" track. Widths are proportional to
 * the fp32 Adam budget: params 4 GB + grads 4 GB + optimizer 8 GB = 16 GB.
 *
 * Rendered in the deck's chart style: transparent bg, #838383 theme-invariant
 * chrome, deck palette, Iosevka embedded. Landscape + mobile variants.
 * Regenerate:  node scripts/gen-zero-memory.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fontDefs, FONT_STACK } from './svg-font.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIG_DIR = join(
    __dirname,
    '..',
    'public',
    'talks',
    '2026-08-03',
    'figures',
)
const OUT = join(FIG_DIR, 'zero-memory.svg')
const OUT_MOBILE = join(FIG_DIR, 'zero-memory-mobile.svg')

const FONT = FONT_STACK
// Component palette (matches the course figure): params green, grads orange,
// optimizer blue. GB per component for the fp32 Adam budget.
const COMP = [
    { key: 'params', label: 'Parameters', gb: 4, color: '#1da811' },
    { key: 'grads', label: 'Gradients', gb: 4, color: '#ee8f24' },
    { key: 'optim', label: 'Optimizer States', gb: 8, color: '#118cc2' },
]
const GPUS = ['GPU 0', 'GPU 1', 'GPU N']

// Which components are sharded (per-GPU 1/N slice) at each stage.
const STAGES = [
    {
        title: 'Baseline (DDP): no sharding',
        shard: { params: false, grads: false, optim: false },
    },
    {
        title: 'ZeRO-1: shard optimizer states',
        shard: { params: false, grads: false, optim: true },
    },
    {
        title: 'ZeRO-2: shard optimizer states + gradients',
        shard: { params: false, grads: true, optim: true },
    },
    {
        title: 'ZeRO-3 (FULL_SHARD): shard everything',
        shard: { params: true, grads: true, optim: true },
    },
]

const FORMULA = [
    ['Baseline', 'Params + Grads + Optim', '16 GB'],
    ['ZeRO-1', 'Params + Grads + Optim/N', '8 + 8/N GB'],
    ['ZeRO-2', 'Params + Grads/N + Optim/N', '4 + 12/N GB'],
    ['ZeRO-3', 'Params/N + Grads/N + Optim/N', '16/N GB'],
]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const LANDSCAPE = {
    W: 760,
    H: 640,
    labelX: 20,
    barX: 72,
    unit: 40, // px per GB (params/grads 4GB -> 160px, optim 8GB -> 320px)
    barH: 16,
    rowGap: 22,
    gap: 6, // gap between component groups
    stageTop: 62,
    stageHeadGap: 24,
    afterRows: 30,
    titleSize: 14,
    gpuSize: 11,
    legendSize: 13,
    subSize: 11,
    formulaSize: 12,
}
const MOBILE = {
    W: 600,
    H: 720,
    labelX: 16,
    barX: 62,
    unit: 30,
    barH: 18,
    rowGap: 24,
    gap: 5,
    stageTop: 70,
    stageHeadGap: 26,
    afterRows: 34,
    titleSize: 15,
    gpuSize: 12,
    legendSize: 13,
    subSize: 11,
    formulaSize: 12,
}

function buildSVG(cfg) {
    const { W } = cfg
    const shardFrac = 1 / 3 // N=3 GPUs -> each shard is 1/3 of the full bar
    // component x-offsets and full widths
    const widths = COMP.map((c) => c.gb * cfg.unit)
    const offs = []
    let x = cfg.barX
    for (const w of widths) {
        offs.push(x)
        x += w + cfg.gap
    }
    const gridRight = offs[offs.length - 1] + widths[widths.length - 1]

    let body = ''

    // ── legend ──
    let lx = cfg.labelX
    const ly = 20
    for (const c of COMP) {
        body += `<rect x="${lx}" y="${ly - 10}" width="15" height="12" rx="2" fill="${c.color}"/>`
        const t = `${c.label} (${c.gb} GB)`
        body += `<text x="${lx + 20}" y="${ly}" font-family="${FONT}" font-size="${cfg.legendSize}" fill="#838383">${esc(t)}</text>`
        lx += 20 + t.length * cfg.legendSize * 0.6 + 16
    }
    body += `<text x="${cfg.labelX}" y="42" font-family="${FONT}" font-size="${cfg.subSize}" fill="#83838399">Bar widths ∝ memory (1B params, fp32, Adam → 4 + 4 + 8 = 16 GB)</text>`

    // ── stages ──
    let y = cfg.stageTop
    STAGES.forEach((stage, si) => {
        body += `<text x="${cfg.labelX}" y="${y}" font-family="${FONT}" font-size="${cfg.titleSize}" font-weight="700" fill="#838383">${esc(stage.title)}</text>`
        let ry = y + cfg.stageHeadGap
        GPUS.forEach((gpu, gi) => {
            body += `<text x="${cfg.labelX}" y="${(ry + cfg.barH - 4).toFixed(0)}" font-family="${FONT}" font-size="${cfg.gpuSize}" fill="#838383">${esc(gpu)}</text>`
            COMP.forEach((c, ci) => {
                const full = widths[ci]
                const ox = offs[ci]
                if (stage.shard[c.key]) {
                    // greyed full track + a 1/N slice offset by this GPU's index
                    const sliceW = full * shardFrac
                    const sliceX = ox + gi * sliceW
                    body += `<rect x="${ox}" y="${ry}" width="${full}" height="${cfg.barH}" rx="3" fill="#838383" fill-opacity="0.1"/>`
                    body += `<rect x="${sliceX.toFixed(1)}" y="${ry}" width="${sliceW.toFixed(1)}" height="${cfg.barH}" rx="3" fill="${c.color}"/>`
                } else {
                    body += `<rect x="${ox}" y="${ry}" width="${full}" height="${cfg.barH}" rx="3" fill="${c.color}"/>`
                }
            })
            ry += cfg.rowGap
        })
        // divider under the stage (except the last)
        y = ry + 8
        if (si < STAGES.length - 1) {
            body += `<line x1="${cfg.labelX}" y1="${(y - 4).toFixed(0)}" x2="${gridRight.toFixed(0)}" y2="${(y - 4).toFixed(0)}" stroke="#83838333" stroke-width="1" stroke-dasharray="4"/>`
            y += 6
        }
    })

    // ── summary formulas ──
    body += `<line x1="${cfg.labelX}" y1="${y.toFixed(0)}" x2="${gridRight.toFixed(0)}" y2="${y.toFixed(0)}" stroke="#83838333" stroke-width="1" stroke-dasharray="4"/>`
    let fy = y + cfg.afterRows
    body += `<text x="${cfg.labelX}" y="${fy.toFixed(0)}" font-family="${FONT}" font-size="${cfg.formulaSize}" fill="#838383">Per-GPU memory (1B params, fp32, N GPUs):</text>`
    fy += 22
    for (const [name, expr, val] of FORMULA) {
        body += `<text x="${cfg.labelX}" y="${fy.toFixed(0)}" font-family="${FONT}" font-size="${cfg.formulaSize}" fill="#838383"><tspan font-weight="700">${esc(name.padEnd(9))}</tspan> = ${esc(expr)}  = <tspan font-weight="700" fill="#555">${esc(val)}</tspan></text>`
        fy += 20
    }
    fy += 8
    body += `<text x="${cfg.labelX}" y="${fy.toFixed(0)}" font-family="${FONT}" font-size="${cfg.subSize}" fill="#83838399">ezpz: reshard_after_forward=False → ZeRO-2 · =True → ZeRO-3</text>`

    const H = fy + 20

    return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H.toFixed(0)}" width="${W}" height="${H.toFixed(0)}" font-family="${FONT}">
${fontDefs()}
${body}
</svg>
`
}

writeFileSync(OUT, buildSVG(LANDSCAPE))
console.log('wrote', OUT)
writeFileSync(OUT_MOBILE, buildSVG(MOBILE))
console.log('wrote', OUT_MOBILE)
