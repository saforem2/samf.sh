import Chart from 'chart.js/auto'
import type { Plugin } from 'chart.js'
import { evaluations, loss, mdsHellaswag } from './sc26-chart-data'
import { mdsStages, optimizerHistories } from './sc26-backup-data'

const family = 'mIosevka-QP Web'
// Series colors come from the active theme's accent variables (--blue, --red, …)
// instead of hard-coded hex. Canvas needs concrete srgb/rgb values, so each
// custom property is painted through a 1×1 canvas and read back as rgb().
const paletteVars = [
    '--blue',
    '--red',
    '--purple',
    '--orange',
    '--green',
] as const
const paletteFallback = ['#2196f3', '#ef5350', '#ae81ff', '#ffa726', '#4caf50']
function withAlpha(rgb: string, alpha: number) {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
    return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : rgb
}
const tasks = ['hellaswag', 'arc_easy', 'arc_challenge', 'winogrande']
const titles = ['HellaSwag', 'ARC-Easy', 'ARC-Challenge', 'Winogrande']
const labels = [
    '2B MDS',
    '2B TT 256N',
    '2B TT 512N',
    '20B TT 256N',
    '20B TT 512N',
]
const reference = evaluations[0].rows[0]
const match = evaluations[3].rows.find((row) => row[1] >= reference[1])!
const ratio = (reference[0] / match[0]).toFixed(1)

function dataset(
    label: string,
    color: string,
    rows: number[][],
    column: number,
    pointRadius: number,
) {
    return {
        label,
        data: rows.map((row) => ({ x: row[0] / 1000, y: row[column] })),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2.6,
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
    const zoom = root.dataset.sc26Chart === 'loss-zoom'
    const isLoss = zoom || root.dataset.sc26Chart === 'loss'
    const mds = root.dataset.sc26Chart === 'mds-loss'
    const optLoss = root.dataset.sc26Chart === 'optimizer-loss'
    const optGrad = root.dataset.sc26Chart === 'optimizer-grad'
    const optimizer = optLoss || optGrad
    const history = root.dataset.sc26Chart === 'hellaswag-history'
    const task = history ? 0 : tasks.indexOf(root.dataset.sc26Chart ?? '')
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
    const datasets = mds
        ? mdsStages.map((rows, i) =>
              dataset(
                  ['Pre-train', 'Continued pre-train', 'Math + code'][i],
                  [colors[0], teal, colors[2]][i],
                  rows,
                  1,
                  0,
              ),
          )
        : optimizer
          ? optimizerHistories.map((run, i) =>
                // Gradient norms are sampled at ~11M-token bins, so a line
                // interpolates between points that were never measured; plot
                // points only. The loss curves stay lines (dense + smooth).
                optGrad
                    ? {
                          ...dataset(
                              ['LAMB', 'Muon', 'AdamW', 'SophiaG'][i],
                              [colors[2], colors[0], colors[4], colors[1]][i],
                              run.grad,
                              1,
                              3,
                          ),
                          showLine: false,
                      }
                    : dataset(
                          ['LAMB', 'Muon', 'AdamW', 'SophiaG'][i],
                          [colors[2], colors[0], colors[4], colors[1]][i],
                          run.loss,
                          1,
                          0,
                      ),
            )
          : isLoss
            ? Object.values(loss)
                  .map((rows, i) => ({
                      ...dataset(labels[i], colors[i], rows, 1, 0),
                      borderWidth: i >= 3 ? 5 : 4,
                      borderDash: i === 0 || i === 3 ? [12, 7] : [],
                      pointStyle:
                          i === 3
                              ? ('rectRot' as const)
                              : ('triangle' as const),
                      pointRadius:
                          i >= 3
                              ? rows.map((_, index) =>
                                    index % Math.ceil(rows.length / 8) === 0
                                        ? 5
                                        : 0,
                                )
                              : 0,
                      pointBorderWidth: 1,
                  }))
                  .filter((_, i) => !zoom || i >= 3)
            : evaluations
                  .map((run, i) => ({
                      ...dataset(
                          run.label,
                          colors[[0, 1, 2, 4][i]],
                          history && i === 0 ? mdsHellaswag : run.rows,
                          task + 1,
                          compact ? 3 : 6,
                      ),
                      pointStyle: (
                          ['crossRot', 'circle', 'rect', 'triangle'] as const
                      )[i],
                  }))
                  .filter((_, i) => history || compact || i === 0 || i === 3)

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
            if (!zoom || progress < 1) return
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
            ? [reveal]
            : !history && !compact && task === 0
              ? [compare]
              : [],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: {
                    display: !compact,
                    labels: { color, font, usePointStyle: !isLoss },
                },
                title: {
                    display: compact,
                    text: titles[task],
                    color,
                    font: { ...font, weight: 700 },
                },
                tooltip: { titleFont: font, bodyFont: font },
            },
            scales: {
                x: {
                    ...axis,
                    type: 'linear',
                    min: 0,
                    max: zoom ? 0.6 : optimizer ? 1.5 : undefined,
                    title: {
                        ...axisTitle,
                        text: 'Tokens consumed (trillions)',
                    },
                },
                y: {
                    ...axis,
                    min: isLoss ? 2 : undefined,
                    max: isLoss ? 4.5 : undefined,
                    type: optimizer || mds ? 'logarithmic' : 'linear',
                    title: {
                        ...axisTitle,
                        text: optGrad
                            ? 'Gradient norm'
                            : isLoss || mds || optLoss
                              ? 'Training loss'
                              : 'HellaSwag accuracy',
                    },
                },
            },
        },
    })
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
            const t = Math.min(1, (time - start) / 1600)
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
