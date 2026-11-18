import Chart from 'chart.js/auto'
import type { Plugin } from 'chart.js'
import { evaluations, loss } from './sc26-chart-data'

const family = 'mIosevka-QP Web'
const colors = ['#2196f3', '#ef5350', '#ae81ff', '#ffa726', '#4caf50']
const tasks = ['hellaswag', 'arc_easy', 'arc_challenge', 'winogrande']
const titles = ['HellaSwag', 'ARC-Easy', 'ARC-Challenge', 'Winogrande']
const labels = ['2B MDS', '2B TT 256N', '2B TT 512N', '20B TT 256N', '20B TT 512N']
const reference = evaluations[0].rows[0]
const match = evaluations[3].rows.find((row) => row[1] >= reference[1])!
const ratio = (reference[0] / match[0]).toFixed(1)

function dataset(label: string, color: string, rows: number[][], column: number, pointRadius: number) {
    return {
        label,
        data: rows.map((row) => ({ x: row[0] / 1000, y: row[column] })),
        borderColor: color, backgroundColor: color, borderWidth: 2.6, pointRadius,
        pointHoverRadius: 6,
    }
}

function mount(root: HTMLElement, canvas: HTMLCanvasElement, frame: HTMLElement, animate: boolean) {
    const zoom = root.dataset.sc26Chart === 'loss-zoom'
    const isLoss = zoom || root.dataset.sc26Chart === 'loss'
    const task = tasks.indexOf(root.dataset.sc26Chart ?? '')
    const compact = root.classList.contains('compact')
    const color = getComputedStyle(root).getPropertyValue('--foreground0').trim() || '#838383'
    const font = { family, size: compact ? 20 : 23 }
    const datasets = isLoss
        ? Object.values(loss).map((rows, i) => ({
              ...dataset(labels[i], colors[i], rows, 1, 0),
              borderWidth: i >= 3 ? 5 : 4,
              borderDash: i === 0 || i === 3 ? [12, 7] : [],
              pointStyle: i === 3 ? 'rectRot' as const : 'triangle' as const,
              pointRadius: i >= 3
                  ? rows.map((_, index) => index % Math.ceil(rows.length / 8) === 0 ? 5 : 0)
                  : 0,
              pointBorderWidth: 1,
          })).filter((_, i) => !zoom || i >= 3)
        : evaluations.map((run, i) => ({
              ...dataset(run.label, colors[[0, 1, 2, 4][i]], run.rows, task + 1, compact ? 3 : 6),
              pointStyle: (['crossRot', 'circle', 'rect', 'triangle'] as const)[i],
          })).filter((_, i) => compact || i === 0 || i === 3)

    let progress = 1
    const reveal: Plugin<'line'> = {
        id: 'sc26Reveal',
        beforeDatasetsDraw({ ctx, chartArea }) {
            ctx.save()
            ctx.beginPath()
            ctx.rect(chartArea.left, chartArea.top, chartArea.width * progress, chartArea.height)
            ctx.clip()
        },
        afterDatasetsDraw(chart) {
            const { ctx, scales, chartArea } = chart
            ctx.restore()
            if (!zoom || progress < 1) return
            ctx.save()
            ctx.fillStyle = color
            ctx.font = 'bold 21px "' + family + '"'
            datasets.forEach((series, index) => {
                const point = [...series.data].reverse().find(({ x }) => x <= 0.6)
                if (!point || !chart.isDatasetVisible(index)) return
                const label = index === 0 ? '256 nodes' : '512 nodes'
                const x = Math.min(scales.x.getPixelForValue(point.x) + 14, chartArea.right - ctx.measureText(label))
                const y = scales.y.getPixelForValue(point.y) + (index === 0 ? -14 : 22)
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
            ctx.font = 'bold 24px "' + family + '"'
            ctx.textAlign = 'center'
            ctx.fillText(ratio + '× fewer tokens', (left + right) / 2, y - 11)
            ctx.restore()
        },
    }
    const axis = { ticks: { color, font, maxTicksLimit: compact ? 4 : 6 }, grid: { color: '#83838340' } }
    frame.hidden = false
    const chart = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        plugins: isLoss ? [reveal] : !compact && task === 0 ? [compare] : [],
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { display: !compact, labels: { color, font, usePointStyle: !isLoss } },
                title: { display: compact, text: titles[task], color, font },
                tooltip: { titleFont: font, bodyFont: font },
            },
            scales: {
                x: { ...axis, type: 'linear', min: 0, max: zoom ? 0.6 : undefined, title: { display: !compact, text: 'Tokens consumed (trillions)', color, font } },
                y: { ...axis, min: isLoss ? 2 : undefined, max: isLoss ? 4.5 : undefined,
                    title: { display: !compact, text: isLoss ? 'Training loss' : 'HellaSwag accuracy', color, font } },
            },
        },
    })
    root.dataset.ready = ''
    if (animate && isLoss && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    await document.fonts.load('19px "' + family + '"')
    for (const root of document.querySelectorAll<HTMLElement>('[data-sc26-chart]')) {
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
                    attributes: true, attributeFilter: ['data-webtui-theme'],
                })
            } catch (error) {
                frame.hidden = true
                console.error('Could not render the SC26 chart', error)
            }
        }
        const observer = new MutationObserver(activate)
        observer.observe(slide, { attributes: true, attributeFilter: ['data-current'] })
        activate()
    }
}
void initialize()
