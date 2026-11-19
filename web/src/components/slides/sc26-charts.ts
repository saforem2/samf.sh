import Chart from 'chart.js/auto'
import type { Plugin } from 'chart.js'
import { evaluations, loss } from './sc26-chart-data'
import { optimizerHistories } from './sc26-optimizer-data'

// Canvas can't resolve CSS variables, so read the theme's resolved font stack
// off the root element at init. Falls back to the mono stack if empty.
const themeFontFamily = () => {
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--font-family')
        .trim()
    return raw || 'ui-monospace, Menlo, Monaco, monospace'
}
const family = themeFontFamily()
// Series colors come from the active theme's accent variables instead of
// hard-coded hex. Canvas needs concrete srgb/rgb values, so each custom
// property is painted through a 1×1 canvas and read back as rgb().
// Dash grammar is consistent across model sizes: 256N = solid, 512N = dotted,
// MDS reference = dashed muted grey. Hues track family, not size:
//   MDS  → --foreground2 (dashed grey)
//   TT   → 2B = --accent (pink-ish) family? no — 256N uses --accent, 512N uses --blue
//   256N → --accent (2B) / --orange (20B)  [solid]
//   512N → --blue   (2B) / --green  (20B)  [dotted]
const paletteVars = [
    '--foreground2', // MDS
    '--accent', // 2B TT 256N
    '--blue', // 2B TT 512N
    '--orange', // 20B TT 256N
    '--green', // 20B TT 512N
] as const
const paletteFallback = ['#6b7280', '#e0559a', '#2196f3', '#ff7900', '#4caf50']
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
    const colors = paletteVars.map((name, i) =>
        readVar(name, paletteFallback[i]),
    )
    // Optimizer panel needs its own hues so it doesn't collide with the loss chart.
    const optColors = [
        readVar('--blue', '#2196f3'),
        readVar('--foreground3', '#838383'),
        readVar('--green', '#4caf50'),
        readVar('--pink', '#ea76cb'),
    ]
    // Canvas is sized by CSS (maintainAspectRatio: false), so derive the
    // label size from the rendered width instead of a fixed px value.
    // Reference width 620px ~ the full slide figure column; clamped so the
    // text never collapses on narrow layouts or balloons on 4K.
    const frameWidth = () =>
        frame.clientWidth || frame.parentElement?.clientWidth || 620
    const frameHeight = () =>
        frame.clientHeight || frame.parentElement?.clientHeight || 320
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
        return Math.round(
            Math.max(minSize, Math.min(maxSize, Math.min(byWidth, byHeight))),
        )
    }
    const baseSize = fontSizeFor(frameWidth(), frameHeight())
    const font = { family, size: baseSize, weight: 400 as const }
    const axisTitleFont = { family, size: baseSize, weight: 700 as const }
    const datasets = optimizer
        ? optimizerHistories
              .map((run, i) =>
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
                  ],
              )
              .flat()
        : isLoss
          ? Object.values(loss).map((rows, i) => ({
                // Index 0..4: MDS, 2B 256N, 2B 512N, 20B 256N, 20B 512N.
                // MDS dashed grey · 2B 256N solid accent · 2B 512N dotted blue ·
                // 20B 256N solid orange · 20B 512N dotted green
                ...dataset(
                    labels[i],
                    i === 0
                        ? withAlpha(colors[0], 0.75)
                        : withAlpha(colors[i], i === 1 || i === 3 ? 0.62 : 1),
                    rows,
                    1,
                    0,
                ),
                borderWidth: i === 0 ? 3 : i >= 3 ? 5 : 4,
                borderDash: (
                    [
                        [7, 6],
                        [],
                        [10, 4, 1.5, 4],
                        [],
                        [10, 4, 1.5, 4],
                    ] as number[][]
                )[i],
                pointRadius: 0,
                pointBorderWidth: 1,
                // Loss chart reveal sequence: MDS is the resting state,
                // first press adds the 2B TT pair, second adds the 20B runs.
                hidden: fullLoss && i >= 1,
                sc26Stage: fullLoss ? (i === 0 ? 1 : i <= 2 ? 2 : 3) : 0,
            }))
          : evaluations
                .map((run, i) => ({
                    // Eval panels share the production-loss family:
                    // MDS = dashed grey, 2B 256N = solid accent, 2B 512N = dotted blue,
                    // 20B 512N = dotted green.
                    ...dataset(
                        run.label,
                        i === 0
                            ? colors[0]
                            : [colors[1], colors[2], colors[4]][(i - 1) % 3],
                        run.rows,
                        task + 1,
                        compact ? 3 : 6,
                    ),
                    borderDash:
                        i === 0 ? [7, 6] : i === 2 ? [10, 4, 1.5, 4] : [],
                    borderWidth: i === 0 ? 2 : 2.6,
                    pointStyle: (
                        ['crossRot', 'circle', 'rect', 'triangle'] as const
                    )[i],
                }))
                .filter(
                    (_, i) =>
                        compact || i === 0 || i === 1 || i === 2 || i === 3,
                )

    // Per-stage reveal: one clip width per dataset group (MDS, 2B, 20B).
    // 0 = not yet revealed, 0..1 easing in, 1 = fully drawn.
    const stageProgress = [0, 0, 0]
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const easeOutQuad = (t: number) => 1 - (1 - t) ** 2
    const datasetStage = (i: number) => (i === 0 ? 1 : i <= 2 ? 2 : 3)
    const reveal: Plugin<'line'> = {
        id: 'sc26Reveal',
        beforeDatasetsDraw() {
            // Clipping happens per dataset in beforeDatasetDraw.
        },
        beforeDatasetDraw({ ctx, chartArea }, args) {
            const stage = datasetStage(args.index)
            const p = Math.max(0, Math.min(1, stageProgress[stage - 1]))
            ctx.save()
            ctx.beginPath()
            ctx.rect(
                chartArea.left,
                chartArea.top,
                chartArea.width * p,
                chartArea.height,
            )
            ctx.clip()
        },
        afterDatasetDraw({ ctx }) {
            ctx.restore()
        },
        afterDatasetsDraw(chart) {
            const { ctx } = chart
            if (stageProgress.some((p) => p < 1)) return
            ctx.save()
            ctx.fillStyle = color
            // (End-of-curve labels removed: truncated x<=0.6T 2B series are
            // fully inside the plot and need no annotation; the legend carries identity.)
            ctx.restore()
        },
    }
    // Stage boundaries for the full production-loss view. MDS cumulative-token
    // milestones from the 10/21 figure (τ in trillions): stage 1 -> 2 at 4.674,
    // stage 2 -> 3 at 7.064, and the 7.771T MDS endpoint. 2B v2 chains branch at
    // stage 2; the 20B runs stopped in stage 1.
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
            ctx.font =
                '500 ' +
                Math.round(fontSizeFor(frameWidth(), frameHeight()) * 0.62) +
                'px ' +
                family
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
                ctx.fillText(
                    label,
                    x - 8,
                    chartArea.bottom -
                        6 -
                        row *
                            (Math.round(
                                fontSizeFor(frameWidth(), frameHeight()) * 0.72,
                            ) +
                                4),
                )
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
            ctx.font =
                'bold ' +
                Math.round(fontSizeFor(frameWidth(), frameHeight()) * 0.9) +
                'px ' +
                family
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
    const titleFits = () =>
        !compact && frameWidth() >= 520 && frameHeight() >= 260
    const axisTitle = {
        display: titleFits(),
        color,
        font: axisTitleFont,
        padding: { top: 8, bottom: 4 },
    }
    frame.hidden = false
    const chart = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        plugins: isLoss
            ? [reveal, stageMarksPlugin]
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
                        font: {
                            family,
                            size: Math.max(11, Math.round(font.size * 0.72)),
                            weight: 500,
                        },
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
                    // Pin the axis so a fully-hidden loss chart (stage 0) doesn't collapse to 0-1.
                    max: isLoss ? 8 : undefined,
                    title: {
                        ...axisTitle,
                        text: 'Tokens consumed (trillions)',
                    },
                },
                y: {
                    ...axis,
                    // Loss axes start at 2.33 (optimizer-loss data floors at 2.62)
                    // so the low end is not wasted. Grad-norm axis spans from its
                    // floor up to the 50 clip used in the data; log scale with ticks
                    // at 1/2/10/50 keeps the divergences visible without flattening
                    // the 0.2–5 band the healthy runs live in.
                    min: optimizer
                        ? optGrad
                            ? 0.2
                            : 2.33
                        : isLoss
                          ? 2
                          : undefined,
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
    let placeLegendRef: (() => void) | null = null
    // region showing the first 600B tokens for the two 20B chains — this is the
    if (fullLoss) {
        // Legend split into two columns: a 2B group and a 20B group, matching the
        // "v1 | v2" grouping style but rendered as compact custom HTML so the two
        // groups can sit side by side instead of wrapping into one row.
        const cidAttrs: [string, string][] = []
        for (const attr of frame.getAttributeNames()) {
            if (attr.startsWith('data-astro-cid-')) cidAttrs.push([attr, ''])
        }
        const copyCid = (el: HTMLElement) => {
            for (const [k, v] of cidAttrs) el.setAttribute(k, v)
        }
        const legendEl = document.createElement('div')
        legendEl.className = 'sc26-legend'
        copyCid(legendEl)
        // Two column groups: 20B (hidden until the reveal fragment) and 2B.
        const columnDefs: {
            title: string
            late: boolean
            entries: ({ label: string; stroke: string; dash?: string } | null)[]
        }[] = [
            {
                title: '20B',
                late: true,
                entries: [
                    {
                        label: 'TT (512N)',
                        stroke: colors[4],
                        dash: '8 3 1.5 3',
                    },
                    { label: 'TT (256N)', stroke: withAlpha(colors[3], 0.62) },
                    null,
                ],
            },
            {
                title: '2B',
                late: false,
                entries: [
                    {
                        label: 'TT (512N)',
                        stroke: colors[2],
                        dash: '8 3 1.5 3',
                    },
                    { label: 'TT (256N)', stroke: withAlpha(colors[1], 0.62) },
                    {
                        label: 'MDS (256N)',
                        stroke: withAlpha(colors[0], 0.75),
                        dash: '7 6',
                    },
                ],
            },
        ]
        for (const col of columnDefs) {
            const group = document.createElement('div')
            group.className = 'sc26-legend-col'
            group.classList.add('sc26-legend-col')
            group.dataset.stage = col.late ? '3' : '1'
            copyCid(group)
            const head = document.createElement('div')
            head.className = 'sc26-legend-head'
            head.textContent = col.title
            copyCid(head)
            group.appendChild(head)
            col.entries.forEach((entry, row) => {
                const cell = document.createElement('div')
                cell.className = 'sc26-legend-cell'
                // Stage mapping: 2B column rows are TT512/TT256 (stage 2) then MDS (stage 1);
                // 20B column rows are all stage 3.
                const stage = col.late ? 3 : row === 2 ? 1 : 2
                cell.dataset.stage = String(stage)
                copyCid(cell)
                if (entry) {
                    const swatch = document.createElement('span')
                    swatch.className = 'sc26-legend-swatch'
                    copyCid(swatch)
                    // inline SVG so multi-segment dash patterns (dot-dash) render
                    // exactly as the canvas series do; CSS border-style can't express that.
                    swatch.style.cssText +=
                        ';display:inline-block;width:2em;height:0.75em;flex:0 0 2em;'
                    swatch.innerHTML = ''
                    const NS = 'http://www.w3.org/2000/svg'
                    const svg = document.createElementNS(NS, 'svg')
                    svg.setAttribute('viewBox', '0 0 32 8')
                    svg.setAttribute('width', '100%')
                    svg.setAttribute('height', '100%')
                    svg.setAttribute('aria-hidden', 'true')
                    const line = document.createElementNS(NS, 'line')
                    line.setAttribute('x1', '0')
                    line.setAttribute('y1', '4')
                    line.setAttribute('x2', '32')
                    line.setAttribute('y2', '4')
                    line.setAttribute('stroke', entry.stroke)
                    line.setAttribute('stroke-width', '3')
                    if (entry.dash) {
                        line.setAttribute(
                            'stroke-dasharray',
                            entry.dash
                                .split(' ')
                                .map((n) => String(Number(n) * 1.1))
                                .join(' '),
                        )
                    }
                    svg.appendChild(line)
                    swatch.appendChild(svg)
                    cell.appendChild(swatch)
                    const label = document.createElement('span')
                    label.className = 'sc26-legend-label'
                    copyCid(label)
                    label.textContent = entry.label
                    cell.appendChild(label)
                } else {
                    cell.setAttribute('aria-hidden', 'true')
                }
                group.appendChild(cell)
            })
            legendEl.appendChild(group)
        }
        frame.appendChild(legendEl)
        // Stage sentinels: the deck steps these fragments to advance the reveal.
        for (const n of [2, 3]) {
            const sentinel = document.createElement('span')
            sentinel.className = 'fragment sc26-fragment-stage'
            sentinel.dataset.stage = String(n)
            sentinel.setAttribute('aria-hidden', 'true')
            copyCid(sentinel)
            frame.appendChild(sentinel)
        }
        const sentinels = () =>
            Array.from(
                frame.querySelectorAll<HTMLElement>('.sc26-fragment-stage'),
            )
        // Stage 0 is the resting view: MDS only. Each sentinel pressed adds one.
        const stage = () =>
            sentinels().filter((el) => el.hasAttribute('data-visible')).length +
            1
        const syncStages = () => {
            const n = stage()
            for (const el of frame.querySelectorAll<HTMLElement>(
                '[data-stage]',
            )) {
                const st = Number(el.dataset.stage)
                if (el.classList.contains('sc26-legend-col')) {
                    // Column visibility is driven by its cells; keep it in the flow
                    // iff any cell will show.
                    const anyVisible = Array.from(
                        el.querySelectorAll('[data-stage]'),
                    ).some(
                        (cell) =>
                            Number((cell as HTMLElement).dataset.stage) <= n,
                    )
                    el.style.display = anyVisible ? '' : 'none'
                } else {
                    el.style.display = st <= n ? '' : 'none'
                }
            }
            legendEl.style.display = ''
            let dirty = false
            chart.data.datasets.forEach((ds, i) => {
                const dsStage = (ds as { sc26Stage?: number }).sc26Stage ?? 0
                const want = dsStage === 0 || dsStage <= n
                if (chart.isDatasetVisible(i) !== want) {
                    chart.setDatasetVisibility(i, want)
                    dirty = true
                }
            })
            if (dirty) chart.update('none')
            // Animate the newly-revealed stage(s): ease a per-stage clip from 0→1.
            const targets = [0, 1, 2].map((i) => (n >= i + 1 ? 1 : 0))
            const startVals = [...stageProgress]
            if (reduceMotion) {
                stageProgress.splice(0, 3, ...targets)
                chart.draw()
            } else {
                // Reveal duration per stage; later stages (the 20B pair is its
                // own clip) get a slower draw so the eye can follow the pair.
                const stageDurations = [2100, 2100, 4500]
                const start = performance.now()
                const from = startVals.slice()
                const active = [0, 1, 2].map((i) => from[i] !== targets[i])
                const tick = (time: number) => {
                    for (let i = 0; i < 3; i++) {
                        if (!active[i]) continue
                        const t = Math.min(
                            1,
                            (time - start) / stageDurations[i],
                        )
                        const e = easeOutQuad(t)
                        stageProgress[i] = from[i] + (targets[i] - from[i]) * e
                    }
                    chart.draw()
                    const done = [0, 1, 2].every(
                        (i) => !active[i] || time - start >= stageDurations[i],
                    )
                    if (!done) requestAnimationFrame(tick)
                }
                requestAnimationFrame(tick)
            }
            // The reveal changes legend width; re-anchor it to the plot's top-right.
            // (placeLegend is declared below; defer if we're still in init.)
            if (placeLegendRef) placeLegendRef()
        }
        for (const el of sentinels()) {
            new MutationObserver(syncStages).observe(el, {
                attributes: true,
                attributeFilter: ['data-visible'],
            })
        }
        syncStages()
    }

    // Pin the caller-supplied module-level legend into the plot area's top-right
    // corner; the legend is position:absolute in the frame, so we convert the
    // chart area into frame-relative coordinates and offset by the legend size.
    const placeLegend = () => {
        const legend = frame.querySelector<HTMLElement>('.sc26-legend')
        if (!legend) return
        const frameRect = frame.getBoundingClientRect()
        const canvasRect = canvas.getBoundingClientRect()
        const area = chart.chartArea
        if (!area) return
        const right = canvasRect.left - frameRect.left + area.right
        const top = canvasRect.top - frameRect.top + area.top
        legend.style.left = 'auto'
        legend.style.transform = 'none'
        legend.style.left = `${Math.max(0, right - legend.offsetWidth - 8)}px`
        legend.style.top = `${top + 6}px`
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
    placeLegendRef = placeLegend

    let lastWidth = frameWidth()
    const resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? frame.clientWidth
        if (!width || Math.abs(width - lastWidth) < 24) return
        lastWidth = width
        applyFontSize(fontSizeFor(width, frameHeight()))
        chart.update('none')
        placeLegend()
    })
    resizeObserver.observe(frame)
    placeLegend()
    root.dataset.ready = ''
    return chart
}

async function initialize() {
    await Promise.all(
        [400, 700].map((weight) =>
            document.fonts.load(
                weight +
                    ' 30px ' +
                    family
                        .split(',')[0]
                        .trim()
                        .replace(/^['"]|['"]$/g, ''),
            ),
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
                let chart = mount(root, canvas, frame)
                new MutationObserver(() => {
                    chart.destroy()
                    chart = mount(root, canvas, frame)
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
