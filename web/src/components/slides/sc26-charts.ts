import Chart from 'chart.js/auto'
import type { Plugin } from 'chart.js'
import { evaluations, loss } from './sc26-chart-data'
import { optimizerHistories } from './sc26-optimizer-data'

const family = 'mIosevka-QP Web'
// Series colors come from the active theme's accent variables (--blue, --red, …)
// instead of hard-coded hex. Canvas needs concrete srgb/rgb values, so each
// custom property is painted through a 1×1 canvas and read back as rgb().
// Slide 4 series colors, theme-aware. MDS reference is muted grey; the two
// 2B TorchTitan chains: 256N solid pink, 512N dashed blue; stage-2 segments
// repeat the stage-1 hue/dash. 20B chains: 256N purple dotted, 512N green solid.
const paletteVars = [
    '--foreground1',
    '--pink',
    '--blue',
    '--purple',
    '--green',
] as const
const paletteFallback = ['#3f4652', '#ea76cb', '#2196f3', '#9a76ce', '#4caf50']
function withAlpha(rgb: string, alpha: number) {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
    return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : rgb
}
const tasks = ['hellaswag', 'arc_easy', 'arc_challenge', 'winogrande']
const titles = ['HellaSwag', 'ARC-Easy', 'ARC-Challenge', 'Winogrande']
// Stage-2 (dolmino) continuations are merged into the stage-1 series (see sc26-chart-data).
const labels = ['2B MDS', '2B 256N', '2B 512N', '20B 256N', '20B 512N']
const reference = evaluations[0].rows[0]
const match = evaluations[3].rows.find((row) => row[1] >= reference[1])!
const ratio = (reference[0] / match[0]).toFixed(1)


// W&B's default line-plot smoothing ("Time weighted EMA") applies a
// debias-corrected EMA weighted by elapsed x-distance, normalized by the x-range:
//   weight = min(sqrt(smoothingParam), 0.999)
//   last   = last * weight^(dx / xRange * VIEWPORT_SCALE) + y
// W&B does not publish VIEWPORT_SCALE; we use 1000 (points across a ~1000-px
// panel) so the smoothing strength is comparable to the default panel. Docs:
// https://docs.wandb.ai/models/app/features/panels/line-plot/smoothing
const WAND_SMOOTHING = 0.6
const WAND_VIEWPORT_SCALE = 1000
function twema(rows: { x: number; y: number }[], w = WAND_SMOOTHING) {
    if (!rows.length) return rows
    const weight = Math.min(Math.sqrt(w), 0.999)
    const xMin = rows[0].x
    const xMax = rows[rows.length - 1].x
    const range = Math.max(xMax - xMin, 1e-9)
    let last = 0
    let debias = 0
    return rows.map((row, i) => {
        const prevX = i > 0 ? rows[i - 1].x : row.x
        const dx = Math.max(row.x - prevX, 0)
        const adj = Math.pow(weight, (dx / range) * WAND_VIEWPORT_SCALE)
        last = last * adj + row.y
        debias = debias * adj + 1
        return { x: row.x, y: last / debias }
    })
}

function dataset(
    label: string,
    color: string,
    rows: number[][],
    column: number,
    pointRadius: number,
    smooth = false,
) {
    const data = rows.map((row) => ({ x: row[0] / 1000, y: row[column] }))
    return {
        label,
        data: smooth ? twema(data) : data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: smooth ? 3 : 2.6,
        pointRadius,
        pointHoverRadius: 6,
    }
}

function mount(
    root: HTMLElement,
    canvas: HTMLCanvasElement,
    frame: HTMLElement,
    animate: boolean,
) {
    const isLoss = root.dataset.sc26Chart === 'loss'
    const fullLoss = root.dataset.sc26Chart === 'loss'
    const optLoss = root.dataset.sc26Chart === 'optimizer-loss'
    const optGrad = root.dataset.sc26Chart === 'optimizer-grad'
    const optimizer = optLoss || optGrad
    const task = tasks.indexOf(root.dataset.sc26Chart ?? '')
    const compact = root.classList.contains('compact')
    // Resolve any CSS <color> (oklch(), color-mix(), vars, …) to an rgb() string
    // both canvas and chart.js's (hex/rgb/hsl-only) color parser accept: paint
    // the resolved color into a 1×1 canvas and read back concrete sRGB bytes.
    const probeCanvas = document.createElement('canvas')
    probeCanvas.width = 1
    probeCanvas.height = 1
    const probe = probeCanvas.getContext('2d', { willReadFrequently: true })!
    const readVar = (name: string, fallback: string) => {
        const raw = getComputedStyle(root).getPropertyValue(name).trim()
        if (!raw || !CSS.supports('color', raw)) return fallback
        probe.clearRect(0, 0, 1, 1)
        probe.fillStyle = raw
        probe.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
        return a === 255
            ? `rgb(${r}, ${g}, ${b})`
            : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
    }
    const color = readVar('--foreground0', '#838383')
    const grid = withAlpha(readVar('--foreground3', '#838383'), 0.25)
    const teal = readVar('--teal', '#008fa8')
    const colors = paletteVars.map((name, i) =>
        readVar(name, paletteFallback[i]),
    )
    // Optimizer panel needs its own hues so it doesn't collide with the loss chart.
    const optColors = [readVar('--blue', '#2196f3'), readVar('--foreground3', '#838383'), readVar('--green', '#4caf50'), readVar('--pink', '#ea76cb')]
    // Canvas is sized by CSS (maintainAspectRatio: false), so derive the
    // label size from the rendered width instead of a fixed px value.
    // Reference width 620px ~ the full slide figure column; clamped so the
    // text never collapses on narrow layouts or balloons on 4K.
    const frameWidth = () => frame.clientWidth || frame.parentElement?.clientWidth || 620
    const frameHeight = () => frame.clientHeight || frame.parentElement?.clientHeight || 320
    // Anchor on the measured desktop panel width (~558px for the two-up
    // backup grid, wider for full-width figures). The floor is low because
    // phone-landscape gives the frame ~185px of height: a 30px axis title
    // rotated 90° is taller than the canvas and gets clipped top/bottom.
    // Height is the binding constraint there, so scale by both.
    const referenceWidth = compact ? 280 : 560
    const minSize = compact ? 14 : 15
    const maxSize = compact ? 34 : 40
    const baseTarget = compact ? 22 : 30
    const fontSizeFor = (w: number, h: number) => {
        const byWidth = (w / referenceWidth) * baseTarget
        const byHeight = h / 11
        return Math.round(Math.max(minSize, Math.min(maxSize, Math.min(byWidth, byHeight))))
    }
    const baseSize = fontSizeFor(frameWidth(), frameHeight())
    const font = { family, size: baseSize, weight: 400 as const }
    const axisTitleFont = { family, size: baseSize, weight: 700 as const }
    const datasets = optimizer
          ? optimizerHistories.map((run, i) =>
                // W&B full-fidelity view: faint raw trace + smoothed line on top.
                [
                    dataset(
                        ['LAMB', 'Muon', 'AdamW', 'SophiaG'][i] + ' (raw)',
                        withAlpha(optColors[i], 0.18),
                        optGrad ? run.grad : run.loss,
                        1,
                        0,
                    ),
                    dataset(
                        ['LAMB', 'Muon', 'AdamW', 'SophiaG'][i],
                        optColors[i],
                        optGrad ? run.grad : run.loss,
                        1,
                        0,
                        true,
                    ),
                ]).flat()
          : isLoss
            ? Object.values(loss)
                  .map((rows, i) => ({
                      // Index 0..4: MDS, 2B 256N, 2B 512N, 20B 256N, 20B 512N.
                      // MDS dotted grey · 2B 256N solid pink · 2B 512N dashed blue ·
                      // 20B 256N dotted purple · 20B 512N solid green
                      ...dataset(labels[i], [colors[0], colors[1], colors[2], colors[3], colors[4]][i], rows, 1, 0),
                      borderWidth: i >= 3 ? 5 : 4,
                      borderDash: ([[2, 6], [], [12, 7], [2, 6], []] as number[][])[i],
                      pointRadius: 0,
                      pointBorderWidth: 1,
                  }))
            : evaluations
                  .map((run, i) => ({
                      // Same family as the production-loss chart: MDS = grey dashed
                      // crosses, 2B 256N = pink, 2B 512N = blue (dashed), 20B 512N = green.
                      ...dataset(
                          run.label,
                          i === 0 ? colors[0] : [colors[1], colors[2], colors[4]][(i - 1) % 3],
                          run.rows,
                          task + 1,
                          compact ? 3 : 6,
                      ),
                      borderDash: i === 0 || i === 2 ? [10, 6] : [],
                      borderWidth: i === 0 ? 2 : 2.6,
                      pointStyle: (
                          ['crossRot', 'circle', 'rect', 'triangle'] as const
                      )[i],
                  }))
                  .filter((_, i) => compact || i === 0 || i === 1 || i === 2 || i === 3)

    let progress = 1
    const reveal: Plugin<'line'> = {
        id: 'sc26Reveal',
        beforeDatasetsDraw({ ctx, chartArea }) {
            ctx.save()
            ctx.beginPath()
            ctx.rect(
                chartArea.left,
                chartArea.top,
                chartArea.width * progress,
                chartArea.height,
            )
            ctx.clip()
        },
        afterDatasetsDraw(chart) {
            const { ctx, scales, chartArea } = chart
            ctx.restore()
            if (progress < 1) return
            ctx.save()
            ctx.fillStyle = color
            ctx.font = 'bold ' + Math.round(fontSizeFor(frameWidth(), frameHeight()) * 0.8) + 'px "' + family + '"'
            datasets.forEach((series, index) => {
                const point = [...series.data]
                    .reverse()
                    .find(({ x }) => x <= 0.6)
                if (!point || !chart.isDatasetVisible(index)) return
                const label = index === 0 ? '256 nodes' : '512 nodes'
                const x = Math.min(
                    scales.x.getPixelForValue(point.x) + 14,
                    chartArea.right - ctx.measureText(label),
                )
                const y =
                    scales.y.getPixelForValue(point.y) +
                    (index === 0 ? -14 : 22)
                ctx.fillText(label, x, y)
            })
            ctx.restore()
        },
    }
    // Stage boundaries for the full production-loss view. MDS cumulative-token
    // milestones from the 10/21 figure (τ in trillions): stage 1 -> 2 at 4.674,
    // stage 2 -> 3 at 7.064, and the 7.771T MDS endpoint. 2B v2 chains branch at
    // stage 2; the 20B runs stopped in stage 1.
    // Inset guide: outline the zoomed x-range [0, 0.6T] on the main chart and
    // connect its right edge to the inset panel, so the magnification reads as
    // a callout rather than a random floating axis.
    // The inset position is driven by CSS (sc26-inset: left/top/width/height as
    // fractions of the frame), so the box is resolved in pixel terms there.
    const insetGuide: Plugin<'line'> = {
        id: 'sc26InsetGuide',
        beforeDatasetsDraw({ ctx, scales, chartArea }) {
            if (!fullLoss) return
            const inset = frame.querySelector<HTMLElement>('.sc26-inset')
            if (!inset || !inset.hasAttribute('data-visible')) return
            const frameRect = frame.getBoundingClientRect()
            const ir = inset.getBoundingClientRect()
            const canvasRect = canvas.getBoundingClientRect()
            const x0 = scales.x.getPixelForValue(0)
            const x1 = scales.x.getPixelForValue(0.6)
            const y0 = chartArea.top
            const y1 = chartArea.bottom
            // Chart.js draws in CSS pixels (it pre-scales the context by DPR), so
            // convert the inset's frame-relative position straight into canvas CSS px.
            const cx0 = ir.left - canvasRect.left
            const cy0 = ir.top - canvasRect.top
            const ch = ir.height
            ctx.save()
            // highlight the source region
            ctx.fillStyle = withAlpha(readVar('--foreground1', color), 0.08)
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
            ctx.strokeStyle = withAlpha(color, 0.55)
            ctx.lineWidth = 1.5
            ctx.setLineDash([5, 4])
            ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
            // connectors from the source box's top-right and bottom-right corners
            // to the inset's top-left and bottom-left corners
            ctx.setLineDash([])
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(x1, y0)
            ctx.lineTo(cx0, cy0)
            ctx.moveTo(x1, y1)
            ctx.lineTo(cx0, cy0 + ch)
            ctx.stroke()
            ctx.restore()
        },
    }
    const stageMarks: { t: number; label: string }[] = [
        { t: 4.67378, label: 'stage 1 → 2' },
        { t: 7.06416, label: 'stage 2 → 3' },
    ]
    const stageMarksPlugin: Plugin<'line'> = {
        id: 'sc26StageMarks',
        afterDatasetsDraw({ ctx, scales, chartArea }) {
            if (!fullLoss) return
            ctx.save()
            ctx.setLineDash([6, 5])
            ctx.strokeStyle = withAlpha(readVar('--foreground2', color), 0.45)
            ctx.lineWidth = 1.5
            ctx.fillStyle = color
            ctx.font = '500 ' + Math.round(fontSizeFor(frameWidth(), frameHeight()) * 0.62) + 'px "' + family + '"'
            ctx.textAlign = 'right'
            ctx.textBaseline = 'bottom'
            let row = 0
            for (const { t, label } of stageMarks) {
                const x = scales.x.getPixelForValue(t)
                if (x < chartArea.left || x > chartArea.right) continue
                ctx.beginPath()
                ctx.moveTo(x, chartArea.top)
                ctx.lineTo(x, chartArea.bottom)
                ctx.stroke()
                // Stagger the labels vertically so adjacent markers at 7.06 and 7.77 don't collide.
                ctx.fillText(label, x - 8, chartArea.bottom - 6 - row * (Math.round(fontSizeFor(frameWidth(), frameHeight()) * 0.72) + 4))
                row += 1
            }
            ctx.restore()
        },
    }
    const compare: Plugin<'line'> = {
        id: 'sc26Compare',
        afterDatasetsDraw({ ctx, scales }) {
            const left = scales.x.getPixelForValue(match[0] / 1000)
            const right = scales.x.getPixelForValue(reference[0] / 1000)
            const y = scales.y.getPixelForValue(reference[1])
            ctx.save()
            ctx.strokeStyle = color
            ctx.fillStyle = color
            ctx.setLineDash([6, 4])
            ctx.beginPath()
            ctx.moveTo(left, y)
            ctx.lineTo(right, y)
            ctx.stroke()
            ctx.font = 'bold ' + Math.round(fontSizeFor(frameWidth(), frameHeight()) * 0.9) + 'px "' + family + '"'
            ctx.textAlign = 'center'
            ctx.fillText(ratio + '× fewer tokens', (left + right) / 2, y - 11)
            ctx.restore()
        },
    }
    const axis = {
        ticks: { color, font, maxTicksLimit: compact ? 4 : 6, padding: 8 },
        grid: { color: grid },
    }
    // Wordy axis titles don't fit narrow or short panels; drop them there
    // rather than let chart.js widen the plot past the frame edge.
    const titleFits = () => !compact && frameWidth() >= 520 && frameHeight() >= 260
    const axisTitle = { display: titleFits(), color, font: axisTitleFont, padding: { top: 8, bottom: 4 } }
    frame.hidden = false
    const chart = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        plugins: isLoss
            ? [reveal, stageMarksPlugin, insetGuide]
            : !compact && task === 0
              ? [compare]
              : [],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            layout: { padding: { top: compact ? 4 : 14 } },
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: {
                    // The optimizer backup slide renders two panels of the same
                    // four optimizers; only the loss panel carries the legend.
                    // The production-loss view splits its legend into two columns
                    // (2B | 20B) rendered as a caption row instead — see below.
                    display: !optGrad && !fullLoss,
                    position: 'top',
                    align: 'center',

                    labels: {
                        color,
                        font: { family, size: Math.max(11, Math.round(font.size * 0.72)), weight: 500 },
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 14,
                        usePointStyle: optimizer,
                        filter: (item) => !item.text.endsWith(' (raw)'),
                    },
                },
                title: {
                    display: compact,
                    text: titles[task],
                    color,
                    font: { ...font, weight: 700 },
                },
                tooltip: {
                    titleFont: font,
                    bodyFont: font,
                    filter: (item) => !item.dataset.label.endsWith(' (raw)'),
                },
            },
            scales: {
                x: {
                    ...axis,
                    type: 'linear',
                    min: 0,
                    max: undefined,
                    title: {
                        ...axisTitle,
                        text: 'Tokens consumed (trillions)',
                    },
                },
                y: {
                    ...axis,
                    // Loss axes start at 2 (detail lives between 2 and 8). Grad-norm
                    // axis spans from its floor up to the 50 clip used in the data;
                    // log scale with ticks at 1/2/10/50 keeps the divergences visible
                    // without flattening the 0.2–5 band the healthy runs live in.
                    min: optimizer ? (optGrad ? 0.2 : 2) : isLoss ? 2 : undefined,
                    max: optGrad ? 50 : optLoss ? 8 : isLoss ? 4.5 : undefined,
                    type: optimizer ? 'logarithmic' : 'linear',
                    title: {
                        ...axisTitle,
                        text: optGrad
                            ? 'Gradient norm'
                            : isLoss || optLoss
                              ? 'Training loss'
                              : 'HellaSwag accuracy',
                    },
                },
            },
        },
    })
    // Full-loss view: overlay a second, small chart in the empty lower-right
    // region showing the first 600B tokens for the two 20B chains — this is the
    if (fullLoss) {
        // Legend split into two columns: a 2B group and a 20B group, matching the
        // "v1 | v2" grouping style but rendered as compact custom HTML so the two
        // groups can sit side by side instead of wrapping into one row.
        const cidAttrs: [string, string][] = []
        for (const attr of frame.getAttributeNames()) {
            if (attr.startsWith('data-astro-cid-')) cidAttrs.push([attr, ''])
        }
        const copyCid = (el: HTMLElement) => { for (const [k, v] of cidAttrs) el.setAttribute(k, v) }
        const legendEl = document.createElement('div')
        legendEl.className = 'sc26-legend'
        copyCid(legendEl)
        const mkGroup = (title: string, entries: { label: string; stroke: string; dash?: string }[]) => {
            const col = document.createElement('div')
            col.className = 'sc26-legend-col'
            copyCid(col)
            const head = document.createElement('div')
            head.className = 'sc26-legend-head'
            head.textContent = title
            copyCid(head)
            col.appendChild(head)
            for (const e of entries) {
                const row = document.createElement('div')
                row.className = 'sc26-legend-row'
                copyCid(row)
                const swatch = document.createElement('span')
                swatch.className = 'sc26-legend-swatch'
                copyCid(swatch)
                // inline styles beat Astro's scoped stylesheet, which sets a
                // fallback border-bottom on the class with higher specificity.
                swatch.style.cssText += `;display:inline-block;width:2.1em;height:0;flex:0 0 2.1em;border-bottom:3px ${e.dash ? 'dashed' : 'solid'} ${e.stroke};`
                row.appendChild(swatch)
                const label = document.createElement('span')
                label.className = 'sc26-legend-label'
                copyCid(label)
                label.textContent = e.label
                row.appendChild(label)
                col.appendChild(row)
            }
            return col
        }
        legendEl.appendChild(mkGroup('2B', [
            { label: 'MDS (reference)', stroke: colors[0], dash: '2 6' },
            { label: '256N (dolmino)', stroke: colors[1] },
            { label: '512N (dolmino)', stroke: colors[2], dash: '12 7' },
        ]))
        legendEl.appendChild(mkGroup('20B', [
            { label: '256N', stroke: colors[3], dash: '2 6' },
            { label: '512N', stroke: colors[4] },
        ]))
        frame.appendChild(legendEl)
        // Wrap the inset canvas in its own sized box; a bare canvas would be
        // stretched by chart.js's resize observer to the frame's full size.
        const holder = document.createElement('div')
        holder.className = 'sc26-inset fragment'
        // The deck controls fragment visibility via [data-visible]; watch it so
        // the on-canvas guide lines redraw in step with the inset reveal.
        new MutationObserver(() => chart.draw()).observe(holder, { attributes: true, attributeFilter: ['data-visible'] })
        copyCid(holder)
        frame.appendChild(holder)
        const insetCanvas = document.createElement('canvas')
        holder.appendChild(insetCanvas)
        const insetChart = new Chart(insetCanvas, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: '20B 256N',
                        data: loss.C_20B_256.filter(([x]) => x <= 600).map(([x, y]) => ({ x: x / 1000, y })),
                        borderColor: colors[3],
                        backgroundColor: colors[3],
                        borderWidth: 2,
                        borderDash: [10, 6],
                        pointRadius: 0,
                    },
                    {
                        label: '20B 512N',
                        data: loss.C_20B_512.filter(([x]) => x <= 600).map(([x, y]) => ({ x: x / 1000, y })),
                        borderColor: colors[4],
                        backgroundColor: colors[4],
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    title: { display: false },
                    tooltip: { titleFont: font, bodyFont: font },
                },
                layout: { padding: { top: 2, right: 6, bottom: 0, left: 2 } },
                scales: {
                    x: { type: 'linear', min: 0, max: 0.6, ticks: { color, font: { family, size: Math.max(9, Math.round(baseSize * 0.55)) }, maxTicksLimit: 4, padding: 2 }, grid: { color: grid } },
                    y: { type: 'linear', min: 2, max: 4.5, ticks: { color, font: { family, size: Math.max(9, Math.round(baseSize * 0.55)) }, maxTicksLimit: 4, padding: 2 }, grid: { color: grid } },
                },
            },
        })
        void insetChart
    }

    // Fonts are baked into option objects, so resizing the container does not
    // rescale them on its own. Recompute on width changes and push the new
    // sizes in place (no destroy/recreate, so the reveal animation and theme
    // observer are unaffected).
    const applyFontSize = (size: number) => {
        const scaled = { family, size, weight: 400 as const }
        const title = { family, size, weight: 700 as const }
        for (const scale of Object.values(chart.options.scales ?? {})) {
            if (scale.ticks) scale.ticks.font = scaled
            if (scale.title) scale.title.font = title
        }
        const plugins = chart.options.plugins ?? {}
        if (plugins.legend?.labels) plugins.legend.labels.font = scaled
        if (plugins.title) plugins.title.font = title
        if (plugins.tooltip) {
            plugins.tooltip.titleFont = scaled
            plugins.tooltip.bodyFont = scaled
        }
        const fit = titleFits()
        for (const scale of Object.values(chart.options.scales ?? {})) {
            if (scale.title) scale.title.display = fit
        }
    }
    let lastWidth = frameWidth()
    const resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? frame.clientWidth
        if (!width || Math.abs(width - lastWidth) < 24) return
        lastWidth = width
        applyFontSize(fontSizeFor(width, frameHeight()))
        chart.update('none')
    })
    resizeObserver.observe(frame)
    root.dataset.ready = ''
    if (
        animate &&
        isLoss &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        const start = performance.now()
        const draw = (time: number) => {
            if (!Chart.getChart(canvas)) return
            const t = Math.min(1, (time - start) / 2600)
            progress = 1 - (1 - t) ** 2
            chart.draw()
            if (t < 1) requestAnimationFrame(draw)
        }
        progress = 0
        chart.draw()
        requestAnimationFrame(draw)
    }
    return chart
}

async function initialize() {
    await Promise.all(
        [400, 700].map((weight) =>
            document.fonts.load(weight + ' 30px "' + family + '"'),
        ),
    )
    for (const root of document.querySelectorAll<HTMLElement>(
        '[data-sc26-chart]',
    )) {
        const canvas = root.querySelector('canvas')
        const frame = canvas?.parentElement
        if (!canvas || !frame) continue
        const slide = root.closest('[is-~="slide"]')
        if (!slide) continue
        const activate = () => {
            if (!slide.hasAttribute('data-current')) return
            observer.disconnect()
            try {
                let chart = mount(root, canvas, frame, true)
                new MutationObserver(() => {
                    chart.destroy()
                    chart = mount(root, canvas, frame, false)
                }).observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-webtui-theme'],
                })
            } catch (error) {
                frame.hidden = true
                console.error('Could not render the SC26 chart', error)
            }
        }
        const observer = new MutationObserver(activate)
        observer.observe(slide, {
            attributes: true,
            attributeFilter: ['data-current'],
        })
        activate()
    }
}
void initialize()
