#!/usr/bin/env node
/*
 * Critical-batch-size illustration for the 2026-08-03 talk. Visualizes the
 * definition on the slide: "B_crit is the largest batch where more
 * data-parallel workers still buy near-linear speedup."
 *
 * Speedup (time-to-target improvement) vs global batch, log-log. Two curves:
 *   ideal   -- linear speedup, a straight 45deg reference (2x batch -> 2x fast)
 *   actual  -- McCandlish-style saturating speedup s(b) = b / (1 + b/Bc):
 *              hugs the ideal below Bc, then peels off and plateaus toward ~Bc.
 * A dashed vertical marks B_crit (where actual has fallen to ~half of ideal);
 * the region left of it is tinted (more nodes ~ free), right of it is greyed
 * (speedup saturates, training destabilizes). This is a schematic -- axes are
 * relative multiples, not measured numbers -- so it carries no fake data.
 *
 * Deck chart style: transparent bg, #838383 theme-invariant chrome, deck
 * palette, Iosevka embedded. Landscape + mobile variants.
 * Regenerate:  node scripts/gen-critical-batch.mjs
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
const OUT = join(FIG_DIR, 'critical-batch.svg')
const OUT_MOBILE = join(FIG_DIR, 'critical-batch-mobile.svg')

const FONT = FONT_STACK

const BC = 8 // critical batch, in relative "x" batch multiples
const B_MIN = 1
const B_MAX = 64
// speedup models over batch b
const ideal = (b) => b
const actual = (b) => b / (1 + b / BC)
// log helpers (base 2, since batch doubles)
const lg = (x) => Math.log2(x)

const LANDSCAPE = {
    W: 720,
    H: 500,
    M: { top: 52, right: 26, bottom: 64, left: 66 },
    titleSize: 0, // title lives on the slide, not the figure
    axisSize: 23,
    tickSize: 20,
    labelSize: 22,
    lw: 3.6,
}
const MOBILE = {
    W: 620,
    H: 400,
    M: { top: 44, right: 20, bottom: 62, left: 60 },
    titleSize: 0,
    axisSize: 20,
    tickSize: 18,
    labelSize: 19,
    lw: 3.6,
}

function buildSVG(cfg) {
    const { W, H, M } = cfg
    const ax = M.left
    const ay = M.top
    const aw = W - M.left - M.right
    const ah = H - M.top - M.bottom
    // log-log scales
    const yMax = ideal(B_MAX) // 64
    const sx = (b) => ax + (lg(b) / lg(B_MAX)) * aw
    const sy = (s) => ay + ah - (lg(s) / lg(yMax)) * ah

    let body = ''

    // shaded regions: left of Bc = near-linear (green tint), right = saturating (grey)
    const xbc = sx(BC)
    body += `<rect x="${ax}" y="${ay}" width="${(xbc - ax).toFixed(1)}" height="${ah}" fill="#1da811" opacity="0.06"/>`
    body += `<rect x="${xbc.toFixed(1)}" y="${ay}" width="${(ax + aw - xbc).toFixed(1)}" height="${ah}" fill="#838383" opacity="0.08"/>`

    // plot frame
    body += `<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="none" stroke="#83838355" stroke-width="1"/>`

    // x ticks at powers of two (batch multiples)
    for (let b = B_MIN; b <= B_MAX; b *= 2) {
        const xx = sx(b)
        body += `<line x1="${xx.toFixed(1)}" y1="${ay}" x2="${xx.toFixed(1)}" y2="${ay + ah}" stroke="#83838312" stroke-width="1"/>`
        body += `<text x="${xx.toFixed(1)}" y="${(ay + ah + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.tickSize}" fill="#838383">${b}×</text>`
    }

    // ideal (linear) reference — dashed diagonal
    let di = ''
    for (let i = 0; i <= 40; i++) {
        const b = B_MIN * Math.pow(B_MAX / B_MIN, i / 40)
        di += `${i ? 'L' : 'M'}${sx(b).toFixed(1)} ${sy(ideal(b)).toFixed(1)} `
    }
    body += `<path d="${di.trim()}" fill="none" stroke="#838383" stroke-width="${cfg.lw - 1}" stroke-dasharray="6 5"/>`

    // actual (saturating) — solid, colored: green while near-linear, blue after
    let da = ''
    for (let i = 0; i <= 60; i++) {
        const b = B_MIN * Math.pow(B_MAX / B_MIN, i / 60)
        da += `${i ? 'L' : 'M'}${sx(b).toFixed(1)} ${sy(actual(b)).toFixed(1)} `
    }
    body += `<path d="${da.trim()}" fill="none" stroke="#118cc2" stroke-width="${cfg.lw}"/>`

    // B_crit marker
    body += `<line x1="${xbc.toFixed(1)}" y1="${ay}" x2="${xbc.toFixed(1)}" y2="${ay + ah}" stroke="#e05560" stroke-width="1.5" stroke-dasharray="4 3"/>`
    body += `<circle cx="${xbc.toFixed(1)}" cy="${sy(actual(BC)).toFixed(1)}" r="4" fill="#e05560"/>`
    body += `<text x="${(xbc + 8).toFixed(1)}" y="${(ay + 16).toFixed(1)}" font-family="${FONT}" font-size="${cfg.labelSize}" font-weight="700" fill="#e05560">B_crit</text>`

    // region labels: "near-linear" low in the green zone, "saturates" in the
    // grey right zone between the two curves (kept clear of the top B_crit label).
    body += `<text x="${((ax + xbc) / 2).toFixed(1)}" y="${(ay + ah - 12).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.labelSize}" fill="#1da811">2× batch ≈ ½ the steps</text>`
    body += `<text x="${sx(22).toFixed(1)}" y="${(ay + ah * 0.42).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.labelSize}" fill="#838383">speedup saturates</text>`

    // curve labels: "ideal" above the dashed line mid-span (clear of the right
    // edge + the saturates label); "actual" on the flattened tail, pulled inside.
    body += `<text x="${sx(26).toFixed(1)}" y="${(sy(ideal(26)) - 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.tickSize}" fill="#838383">ideal (linear)</text>`
    body += `<text x="${(sx(B_MAX) - 6).toFixed(1)}" y="${(sy(actual(B_MAX)) - 10).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="${cfg.tickSize}" font-weight="700" fill="#118cc2">actual</text>`

    // axis labels
    body += `<text x="${(ax + aw / 2).toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.axisSize}" fill="#838383">global batch (data-parallel workers) →</text>`
    body += `<text x="16" y="${(ay + ah / 2).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.axisSize}" fill="#838383" transform="rotate(-90 16 ${(ay + ah / 2).toFixed(1)})">speedup →</text>`

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
