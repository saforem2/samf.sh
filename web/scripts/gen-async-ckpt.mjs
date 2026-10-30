#!/usr/bin/env node
/*
 * Async-checkpointing per-save stall chart for the 2026-08-03 talk's
 * async-checkpoint slide. Recreates the headline result from the ezpz
 * checkpoint-restart guide (ezpz.cool/guides/checkpoint-restart): the
 * synchronous save blocks the training thread for the full blocking write,
 * while async drops that to a short stage + drain because the bytes flush on a
 * background thread.
 *
 * Data transcribed verbatim from the guide:
 *   agpt-2b  (23 GB) : sync 3.75 s  |  async 1.05 s (stage 0.31 + drain 0.73)
 *   agpt-20b (232 GB): sync 23.6 s  |  async 5.4 s  (stage 1.73 + drain 3.69)
 * Async is ~3.6x less at 2B and ~4.4x less at 20B.
 *
 * Two model groups, each a sync bar (solid) next to an async bar (stacked
 * stage + drain), in the deck's chart style (transparent bg, #838383 chrome,
 * Iosevka embedded, deck palette). Landscape + mobile variants.
 * Regenerate:  node scripts/gen-async-ckpt.mjs
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
const OUT = join(FIG_DIR, 'async-ckpt.svg')
const OUT_MOBILE = join(FIG_DIR, 'async-ckpt-mobile.svg')

const FONT = FONT_STACK
const C = {
    sync: '#e05560', // sync blocking write: red (it stalls training)
    stage: '#118cc2', // async stage: blue
    drain: '#1da811', // async drain residual: green
}

// [group label, sync total, async stage, async drain, x-speedup]
const GROUPS = [
    {
        label: '2B',
        sub: '23 GB',
        sync: 3.75,
        stage: 0.31,
        drain: 0.73,
        x: '3.6x',
    },
    {
        label: '20B',
        sub: '232 GB',
        sync: 23.6,
        stage: 1.73,
        drain: 3.69,
        x: '4.4x',
    },
]
const Y_MAX = 26 // seconds

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const LANDSCAPE = {
    W: 920,
    H: 420,
    M: { top: 58, right: 32, bottom: 52, left: 84 },
    barW: 88,
    pairGap: 20,
    groupGap: 260,
    titleSize: 27,
    subSize: 18,
    axisSize: 21,
    tickSize: 18,
    labelSize: 19,
    valSize: 18,
    legendSize: 19,
}
const MOBILE = {
    W: 620,
    H: 600,
    M: { top: 104, right: 20, bottom: 78, left: 70 },
    barW: 62,
    pairGap: 20,
    groupGap: 96,
    titleSize: 25,
    subSize: 16,
    axisSize: 20,
    tickSize: 17,
    labelSize: 18,
    valSize: 17,
    legendSize: 18,
}

function buildSVG(cfg) {
    const { W, H, M } = cfg
    const ax = M.left
    const ay = M.top
    const aw = W - M.left - M.right
    const ah = H - M.top - M.bottom
    const sy = (v) => ay + ah - (v / Y_MAX) * ah
    const barH = (v) => (v / Y_MAX) * ah

    let body = ''

    // title + subtitle
    body += `<text x="${W / 2}" y="22" text-anchor="middle" font-family="${FONT}" font-size="${cfg.titleSize}" font-weight="700" fill="#838383">Async hides the write: per-save training stall</text>`
    body += `<text x="${W / 2}" y="40" text-anchor="middle" font-family="${FONT}" font-size="${cfg.subSize}" fill="#838383">sync blocks on the full write; async pays only stage + drain</text>`

    // axes box + y gridlines (every 5 s)
    body += `<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="none" stroke="#83838355" stroke-width="1"/>`
    for (let v = 0; v <= 25 + 1e-9; v += 5) {
        const yy = sy(v)
        body += `<line x1="${ax}" y1="${yy.toFixed(1)}" x2="${ax + aw}" y2="${yy.toFixed(1)}" stroke="#83838318" stroke-width="1"/>`
        body += `<text x="${ax - 10}" y="${(yy + 5).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="${cfg.tickSize}" fill="#838383">${v}</text>`
    }

    // groups: sync bar then async stacked bar
    const groupW = 2 * cfg.barW + cfg.pairGap
    const totalW = GROUPS.length * groupW + (GROUPS.length - 1) * cfg.groupGap
    let gx = ax + (aw - totalW) / 2

    for (const g of GROUPS) {
        // sync bar
        const sBot = sy(0)
        const sTop = sy(g.sync)
        body += `<rect x="${gx.toFixed(1)}" y="${sTop.toFixed(1)}" width="${cfg.barW}" height="${barH(g.sync).toFixed(1)}" fill="${C.sync}" stroke="#fff" stroke-width="0.75"/>`
        body += `<text x="${(gx + cfg.barW / 2).toFixed(1)}" y="${(sTop - 8).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.valSize}" font-weight="700" fill="${C.sync}">${g.sync}s</text>`
        body += `<text x="${(gx + cfg.barW / 2).toFixed(1)}" y="${(sBot + cfg.labelSize + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.labelSize}" fill="#838383">sync</text>`

        // async stacked bar (stage on bottom, drain on top)
        const axx = gx + cfg.barW + cfg.pairGap
        const stageH = barH(g.stage)
        const drainH = barH(g.drain)
        const stageTop = sy(g.stage)
        const drainTop = sy(g.stage + g.drain)
        body += `<rect x="${axx.toFixed(1)}" y="${stageTop.toFixed(1)}" width="${cfg.barW}" height="${stageH.toFixed(1)}" fill="${C.stage}" stroke="#fff" stroke-width="0.75"/>`
        body += `<rect x="${axx.toFixed(1)}" y="${drainTop.toFixed(1)}" width="${cfg.barW}" height="${drainH.toFixed(1)}" fill="${C.drain}" stroke="#fff" stroke-width="0.75"/>`
        const asyncTotal = (g.stage + g.drain).toFixed(1)
        // value label just above the async bar
        body += `<text x="${(axx + cfg.barW / 2).toFixed(1)}" y="${(drainTop - 8).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.valSize}" font-weight="700" fill="${C.drain}">${asyncTotal}s</text>`
        // speedup chip ABOVE the value label (one line higher), so they stack
        // cleanly over the async bar instead of overprinting each other
        body += `<text x="${(axx + cfg.barW / 2).toFixed(1)}" y="${(drainTop - 8 - cfg.valSize - 6).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${(cfg.valSize * 0.95).toFixed(0)}" font-weight="700" fill="#1da811">${esc(g.x)} less</text>`
        body += `<text x="${(axx + cfg.barW / 2).toFixed(1)}" y="${(sBot + cfg.labelSize + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.labelSize}" fill="#838383">async</text>`

        // group label (model + size) centered under the pair, on its own row
        const cx = gx + groupW / 2
        body += `<text x="${cx.toFixed(1)}" y="${(sBot + 2 * cfg.labelSize + 8).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.labelSize}" font-weight="700" fill="#838383">${esc(g.label)} <tspan font-weight="400" font-size="${(cfg.labelSize * 0.82).toFixed(0)}">(${esc(g.sub)})</tspan></text>`

        gx += groupW + cfg.groupGap
    }

    // y axis label
    body += `<text x="24" y="${(ay + ah / 2).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.axisSize}" fill="#838383" transform="rotate(-90 24 ${(ay + ah / 2).toFixed(1)})">training-thread stall (s)</text>`

    // legend
    const items = [
        [C.sync, 'sync: blocking write'],
        [C.stage, 'async: stage'],
        [C.drain, 'async: drain residual'],
    ]
    const sw = 16
    // legend sits under the subtitle, inside the top margin, so the bottom row
    // is free for the per-group model labels (which used to collide with it)
    const legendY = 64
    const approxW = items.reduce(
        (a, [, lbl]) => a + sw + 8 + lbl.length * cfg.legendSize * 0.58 + 24,
        0,
    )
    let lx = Math.max(ax, (W - approxW) / 2)
    for (const [col, lbl] of items) {
        body += `<rect x="${lx.toFixed(1)}" y="${(legendY - sw + 4).toFixed(1)}" width="${sw}" height="${sw}" fill="${col}" stroke="#fff" stroke-width="0.75"/>`
        body += `<text x="${(lx + sw + 8).toFixed(1)}" y="${legendY.toFixed(1)}" font-family="${FONT}" font-size="${cfg.legendSize}" fill="#555">${esc(lbl)}</text>`
        lx += sw + 8 + lbl.length * cfg.legendSize * 0.58 + 24
    }

    return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
${fontDefs()}
${body}
</svg>
`
}

writeFileSync(OUT, buildSVG(LANDSCAPE))
console.log('wrote', OUT)
writeFileSync(OUT_MOBILE, buildSVG(MOBILE))
console.log('wrote', OUT_MOBILE)
