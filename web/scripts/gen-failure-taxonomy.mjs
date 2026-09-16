#!/usr/bin/env node
/*
 * Failure-taxonomy 2x2(-ish) matrix for the 2026-08-03 talk's failure-taxonomy
 * slide. The slide's lead line promises "two axes: where it broke x transient
 * vs systemic" but drew two flat text lists. This renders the actual grid:
 *   rows    = WHERE it broke (Hardware / Software / Network / System)
 *   columns = TRANSIENT (retry, fine) vs SYSTEMIC (retry reproduces it)
 * Each cell holds example failures; the silent ones (no traceback, loss looks
 * fine) are marked so the "two silent killers coming up" hook has a visual home.
 *
 * Deck chart style: transparent bg, #838383 theme-invariant chrome, deck
 * palette, Iosevka embedded. Landscape + mobile variants.
 * Regenerate:  node scripts/gen-failure-taxonomy.mjs
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
const OUT = join(FIG_DIR, 'failure-taxonomy.svg')
const OUT_MOBILE = join(FIG_DIR, 'failure-taxonomy-mobile.svg')

const FONT = FONT_STACK
// column accent: transient = green (retry, fine), systemic = red (stop)
const COL = { transient: '#1da811', systemic: '#e05560' }
// row accent (where it broke)
const ROW_COLOR = '#838383'

// [rowLabel, transient cell items, systemic cell items]
// a trailing ' ●' marks a SILENT failure (no traceback, loss still looks fine)
const ROWS = [
    {
        where: 'Hardware',
        transient: ['ECC blip', 'thermal throttle', 'one bad node'],
        systemic: ['dead XPU (persistent)'],
    },
    {
        where: 'Software',
        transient: ['mid-save kill', 'flaked dataloader worker'],
        systemic: [
            'OOM (config too big)',
            'corrupt shard ●',
            'bad upstream commit ●',
        ],
    },
    {
        where: 'Network',
        transient: ['fabric flap', 'gloo drop'],
        systemic: ['collective hang ●'],
    },
    {
        where: 'System',
        transient: ['scheduler hiccup', 'stale ckpt placeholder'],
        systemic: ['Lustre stall', 'un-drained bad node'],
    },
]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const LANDSCAPE = {
    W: 900,
    H: 500,
    M: { top: 78, right: 20, bottom: 58, left: 116 },
    rowLabelW: 116,
    headSize: 20,
    axisSize: 15,
    rowSize: 17,
    cellSize: 15,
    titleSize: 22,
}
const MOBILE = {
    W: 620,
    H: 560,
    M: { top: 78, right: 14, bottom: 64, left: 92 },
    rowLabelW: 92,
    headSize: 18,
    axisSize: 14,
    rowSize: 16,
    cellSize: 14,
    titleSize: 20,
}

function buildSVG(cfg) {
    const { W, H, M } = cfg
    const gx = M.left
    const gy = M.top
    const gw = W - M.left - M.right
    const gh = H - M.top - M.bottom
    const colW = gw / 2
    const rowH = gh / ROWS.length

    let body = ''

    // title
    body += `<text x="${W / 2}" y="26" text-anchor="middle" font-family="${FONT}" font-size="${cfg.titleSize}" font-weight="700" fill="#838383">Two axes: where it broke x how you treat it</text>`

    // column headers (transient / systemic) with tinted bands
    const cols = [
        { key: 'transient', label: 'TRANSIENT', sub: 'retry, fine' },
        { key: 'systemic', label: 'SYSTEMIC', sub: 'retry reproduces it' },
    ]
    cols.forEach((c, ci) => {
        const cx0 = gx + ci * colW
        // faint column band
        body += `<rect x="${cx0.toFixed(1)}" y="${gy.toFixed(1)}" width="${colW.toFixed(1)}" height="${gh.toFixed(1)}" fill="${COL[c.key]}" fill-opacity="0.05"/>`
        const cxc = cx0 + colW / 2
        body += `<text x="${cxc.toFixed(1)}" y="${(gy - 30).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.headSize}" font-weight="700" fill="${COL[c.key]}">${esc(c.label)}</text>`
        body += `<text x="${cxc.toFixed(1)}" y="${(gy - 12).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${cfg.axisSize}" fill="#83838399">${esc(c.sub)}</text>`
    })

    // grid lines
    body += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" fill="none" stroke="#83838355" stroke-width="1"/>`
    body += `<line x1="${(gx + colW).toFixed(1)}" y1="${gy}" x2="${(gx + colW).toFixed(1)}" y2="${gy + gh}" stroke="#83838355" stroke-width="1"/>`
    for (let r = 1; r < ROWS.length; r++) {
        const y = gy + r * rowH
        body += `<line x1="${gx}" y1="${y.toFixed(1)}" x2="${gx + gw}" y2="${y.toFixed(1)}" stroke="#83838333" stroke-width="1"/>`
    }

    // rows: label + cells
    ROWS.forEach((row, r) => {
        const y0 = gy + r * rowH
        // row label (left gutter), vertically centered
        body += `<text x="${(gx - 12).toFixed(1)}" y="${(y0 + rowH / 2 + cfg.rowSize / 3).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="${cfg.rowSize}" font-weight="700" fill="${ROW_COLOR}">${esc(row.where)}</text>`
        ;['transient', 'systemic'].forEach((key, ci) => {
            const cx0 = gx + ci * colW
            const items = row[key]
            // stack items vertically, centered in the cell
            const lh = cfg.cellSize + 6
            const blockH = items.length * lh
            let ty = y0 + (rowH - blockH) / 2 + cfg.cellSize
            for (const raw of items) {
                const silent = raw.endsWith(' ●')
                const label = silent ? raw.slice(0, -2) : raw
                const tx = cx0 + 14
                if (silent) {
                    // silent marker dot in the column color, bold label
                    body += `<circle cx="${(tx + 3).toFixed(1)}" cy="${(ty - cfg.cellSize / 3).toFixed(1)}" r="3.2" fill="${COL[key]}"/>`
                    body += `<text x="${(tx + 12).toFixed(1)}" y="${ty.toFixed(1)}" font-family="${FONT}" font-size="${cfg.cellSize}" font-weight="700" fill="#555">${esc(label)}</text>`
                } else {
                    body += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-family="${FONT}" font-size="${cfg.cellSize}" fill="#666">${esc(label)}</text>`
                }
                ty += lh
            }
        })
    })

    // footnote: silent-marker legend
    body += `<circle cx="${(gx + 5).toFixed(1)}" cy="${(H - 20).toFixed(1)}" r="3.2" fill="#838383"/>`
    body += `<text x="${(gx + 14).toFixed(1)}" y="${(H - 15).toFixed(1)}" font-family="${FONT}" font-size="${cfg.axisSize}" fill="#83838399">● = silent: no traceback, loss still looks fine (the dangerous ones)</text>`

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
