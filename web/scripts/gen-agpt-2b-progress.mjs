import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { fontDefs, FONT_STACK } from './svg-font.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(root, 'public/talks/2026-10-21/figures')
const snapshot = JSON.parse(
    readFileSync(resolve(dir, 'agpt-2b-progress.json'), 'utf8'),
)
const series = [
    ['2b_v1_mds', '2B MDS reference', '#666666', '8 4'],
    ['2b_v2_256', '2B 256N stage 1', '#0072B2', ''],
    ['2b_v2_512', '2B 512N stage 1', '#0072B2', '10 4'],
    ['2b_v2_256_stage2_dolmino', '2B 256N stage 2', '#D33682', ''],
    ['2b_v2_512_stage2_dolmino', '2B 512N stage 2', '#D33682', '10 4'],
].map(([key, label, color, dash]) => {
    const c = snapshot.chains[key]
    const tokens = (step) => (c.prior_tokens + step * c.gbs * c.seq_len) / 1e12
    return {
        key,
        label,
        color,
        dash,
        data: c.data.map(([step, loss]) => [tokens(step), loss]),
        end: tokens(c.latest_step),
        loss: c.latest_loss,
    }
})
const W = 1200,
    H = 650,
    box = { x: 70, y: 85, w: 1090, h: 465 }
const sx = (t) => box.x + (t / 8) * box.w,
    sy = (l) => box.y + box.h - ((l - 2) / 2.5) * box.h
const text = (x, y, label, size = 17, extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${label}</text>`
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT_STACK}" fill="#666">${fontDefs()}`
svg += text(
    70,
    30,
    'AuroraGPT 2B: production training progress',
    25,
    'font-weight="700"',
)
svg += text(70, 56, 'Stage 1 and stage 2 · cumulative tokens', 16)
svg += `<defs><clipPath id="main"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath></defs>`
svg += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#aaa"/>`
for (let t = 0; t <= 8; t++) {
    svg +=
        `<path d="M${sx(t)} ${box.y}V${box.y + box.h}" stroke="#ddd" stroke-width=".6"/>` +
        text(sx(t), 577, String(t), 17, 'text-anchor="middle"')
}
for (let l = 2; l <= 4.5; l += 0.5) {
    svg +=
        `<path d="M${box.x} ${sy(l)}H${box.x + box.w}" stroke="#ddd" stroke-width=".6"/>` +
        text(58, sy(l) + 5, l.toFixed(1), 17, 'text-anchor="end"')
}
for (const [t, label] of [
    [4.67378, 'stage 1 → 2'],
    [7.06416, 'stage 2 → 3 (MDS)'],
]) {
    svg +=
        `<path d="M${sx(t)} ${box.y}V${box.y + box.h}" stroke="#aaa" stroke-dasharray="3 4"/>` +
        text(sx(t), box.y - 8, label, 13, 'text-anchor="middle"')
}
const path = (s, fx, fy) =>
    s.data
        .map(
            ([t, l], i) =>
                `${i ? 'L' : 'M'}${fx(t).toFixed(2)},${fy(l).toFixed(2)}`,
        )
        .join(' ')
svg += '<g clip-path="url(#main)">'
for (const s of series) {
    svg += `<path d="${path(s, sx, sy)}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="${s.dash}"/>`
    if (s.loss >= 2 && s.loss <= 4.5)
        svg += `<circle cx="${sx(s.end)}" cy="${sy(s.loss)}" r="3" fill="${s.color}"/>`
}
svg += '</g>'
// Legend sits above the training curves; endpoints are raw, not binned means.
let y = 122
svg += text(1145, 100, 'Shown tokens / raw loss', 14, 'text-anchor="end"')
for (const s of series) {
    svg +=
        `<path d="M690 ${y - 5}h25" stroke="${s.color}" stroke-width="3" stroke-dasharray="${s.dash}"/>` +
        text(725, y, s.label, 16, `fill="${s.color}" font-weight="700"`) +
        text(
            1145,
            y,
            `${s.end.toFixed(3)}T / ${s.loss.toFixed(3)}`,
            16,
            'text-anchor="end"',
        )
    y += 27
}
svg +=
    text(615, 608, 'tokens consumed (T)', 19, 'text-anchor="middle"') +
    text(
        20,
        320,
        'training loss',
        18,
        'transform="rotate(-90 20 320)" text-anchor="middle"',
    )
svg += text(
    70,
    637,
    'Solid: 256 nodes · dashed: 512 nodes. Stage 2 includes stage-1 tokens; training mixes differ.',
    14,
)
svg += '</svg>\n'
writeFileSync(resolve(dir, 'agpt-2b-progress.svg'), svg)
console.log('wrote agpt-2b-progress.svg')

// Phone layout: give the plot most of the width, then put the legend below it
// so the chart stays legible at a single-column viewport width.
const MW = 720,
    MH = 900,
    mobileBox = { x: 78, y: 112, w: 610, h: 445 }
const msx = (t) => mobileBox.x + (t / 8) * mobileBox.w,
    msy = (l) => mobileBox.y + mobileBox.h - ((l - 2) / 2.5) * mobileBox.h
let mobileSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW} ${MH}" width="${MW}" height="${MH}" font-family="${FONT_STACK}" fill="#666">${fontDefs()}`
mobileSvg += text(78, 34, 'AuroraGPT 2B: training progress', 24, 'font-weight="700"')
mobileSvg += text(78, 62, 'Stage 1 and stage 2 · cumulative tokens', 16)
mobileSvg += `<defs><clipPath id="mobile-main"><rect x="${mobileBox.x}" y="${mobileBox.y}" width="${mobileBox.w}" height="${mobileBox.h}"/></clipPath></defs>`
mobileSvg += `<rect x="${mobileBox.x}" y="${mobileBox.y}" width="${mobileBox.w}" height="${mobileBox.h}" fill="none" stroke="#aaa"/>`
for (let t = 0; t <= 8; t++) {
    mobileSvg +=
        `<path d="M${msx(t)} ${mobileBox.y}V${mobileBox.y + mobileBox.h}" stroke="#ddd" stroke-width=".6"/>` +
        text(msx(t), 582, String(t), 16, 'text-anchor="middle"')
}
for (let l = 2; l <= 4.5; l += 0.5) {
    mobileSvg +=
        `<path d="M${mobileBox.x} ${msy(l)}H${mobileBox.x + mobileBox.w}" stroke="#ddd" stroke-width=".6"/>` +
        text(66, msy(l) + 5, l.toFixed(1), 16, 'text-anchor="end"')
}
for (const [t, label] of [
    [4.67378, 'stage 1 → 2'],
    [7.06416, 'stage 2 → 3 (MDS)'],
]) {
    mobileSvg +=
        `<path d="M${msx(t)} ${mobileBox.y}V${mobileBox.y + mobileBox.h}" stroke="#aaa" stroke-dasharray="3 4"/>` +
        text(msx(t), mobileBox.y - 9, label, 12, 'text-anchor="middle"')
}
mobileSvg += '<g clip-path="url(#mobile-main)">'
for (const s of series) {
    mobileSvg += `<path d="${path(s, msx, msy)}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="${s.dash}"/>`
    if (s.loss >= 2 && s.loss <= 4.5)
        mobileSvg += `<circle cx="${msx(s.end)}" cy="${msy(s.loss)}" r="3" fill="${s.color}"/>`
}
mobileSvg += '</g>'
mobileSvg += text(383, 620, 'tokens consumed (T)', 17, 'text-anchor="middle"')
mobileSvg += text(20, 335, 'training loss', 16, 'transform="rotate(-90 20 335)" text-anchor="middle"')
mobileSvg += text(78, 666, 'Shown tokens / raw loss', 15, 'font-weight="700"')
let mobileY = 704
for (const s of series) {
    mobileSvg +=
        `<path d="M80 ${mobileY - 5}h28" stroke="${s.color}" stroke-width="3" stroke-dasharray="${s.dash}"/>` +
        text(120, mobileY, s.label, 15, `fill="${s.color}" font-weight="700"`) +
        text(680, mobileY, `${s.end.toFixed(3)}T / ${s.loss.toFixed(3)}`, 14, 'text-anchor="end"')
    mobileY += 31
}
mobileSvg += text(78, 883, 'Solid: 256 nodes · dashed: 512 nodes. Training mixes differ.', 13)
mobileSvg += '</svg>\n'
writeFileSync(resolve(dir, 'agpt-2b-progress-mobile.svg'), mobileSvg)
console.log('wrote agpt-2b-progress-mobile.svg')
