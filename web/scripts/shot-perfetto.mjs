// Load a chrome trace into ui.perfetto.dev and capture a slide-grade screenshot.
//
//   node web/scripts/shot-perfetto.mjs <trace.json> <out.png> [--expand] [--pin <regex>]
//
// Zooming is done by pre-slicing the trace JSON (see slice-trace.mjs), not by
// driving Perfetto's keyboard zoom, which does not respond reliably under
// automation. Perfetto auto-fits the viewport to the trace extent, so a sliced
// trace lands already zoomed to the window you want.
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const argv = process.argv.slice(2)
const pos = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a))
const flag = (n, d) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 ? argv[i + 1] : d
}
const trace = path.resolve(pos[0])
const outPng = path.resolve(pos[1])
const doExpand = argv.includes('--expand')
const keepRe = flag('keep', null)
fs.mkdirSync(path.dirname(outPng), { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const VW = 1600,
    VH = 1000

const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--force-device-scale-factor=2', '--hide-scrollbars'],
})
const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
})
const page = await ctx.newPage()

console.log(
    `-> ${path.basename(trace)} (${(fs.statSync(trace).size / 1e6).toFixed(1)} MB)`,
)
await page.goto('https://ui.perfetto.dev', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
})
await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {})
await sleep(5000)
await page.locator('input[type=file]').first().setInputFiles(trace)

let ok = false
for (let i = 0; i < 150; i++) {
    await sleep(2000)
    const st = await page.evaluate(() => ({
        big: [...document.querySelectorAll('canvas')].filter(
            (c) => c.width > 400 && c.height > 200,
        ).length,
        loading: /Loading trace|Processing trace/i.test(
            document.body.innerText || '',
        ),
    }))
    if (st.big > 0 && !st.loading) {
        ok = true
        break
    }
}
console.log(`-> timeline ready: ${ok}`)
await sleep(4000)

// Dismiss the Google cookie banner (overlays the bottom of the frame).
for (const t of ['OK', 'Ok', 'Got it']) {
    const b = page.getByText(t, { exact: true })
    if (await b.count()) {
        await b
            .first()
            .click({ timeout: 3000 })
            .catch(() => {})
        break
    }
}
await sleep(1000)

// Collapse the sidebar -> timeline gets the full 1600px.
await page.evaluate(() => {
    const h = [...document.querySelectorAll('button, i, .material-icons')].find(
        (e) => (e.textContent || '').trim() === 'menu',
    )
    if (h) h.click()
})
await sleep(1500)

// Perfetto ships an "Expand all" toolbar button; that is far more reliable
// than clicking individual chevrons.
if (doExpand) {
    const n = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(
            (e) => e.title === 'Expand all',
        )
        if (b) {
            b.click()
            return 1
        }
        return 0
    })
    console.log(`-> expand-all clicked: ${n}`)
    await sleep(4000)
}

// Optionally hide tracks whose name does not match --keep, so the shot is not
// 90% empty XCCL streams.
if (keepRe) {
    const hidden = await page.evaluate((src) => {
        const rx = new RegExp(src, 'i')
        let n = 0
        for (const sh of document.querySelectorAll(
            '.pf-track-shell, [class*=track-shell]',
        )) {
            const t = (sh.textContent || '').trim()
            if (t && !rx.test(t)) {
                const row = sh.closest('.pf-track') || sh.parentElement
                if (row) {
                    row.style.display = 'none'
                    n++
                }
            }
        }
        return n
    }, keepRe.source || keepRe)
    console.log(`-> hid ${hidden} non-matching tracks`)
    await sleep(1200)
}

// Perfetto auto-opens a "Trace Doctor" drawer on traces with import
// warnings; it covers the bottom half of the frame. Close it.
await page.evaluate(() => {
    for (const t of document.querySelectorAll(
        '.pf-tab-handle, [class*=tab-handle], [class*=tab]',
    )) {
        if (/Trace Doctor/i.test(t.textContent || '')) {
            const x = t.querySelector('.material-icons, i, button')
            if (x && /close/i.test(x.textContent || '')) x.click()
        }
    }
    // and collapse the whole drawer via its chevron
    const c = [...document.querySelectorAll('button, i, .material-icons')].find(
        (e) =>
            /keyboard_arrow_down|expand_more/.test(
                (e.textContent || '').trim(),
            ) && e.getBoundingClientRect().top > innerHeight * 0.6,
    )
    if (c) c.click()
})
await sleep(1500)

// Crop away the omnibox strip and the dead space under the last track row.
// Perfetto's canvas is full-viewport-height regardless of content, so measure
// the track *shells* (the left-hand labels), which do stop at the last row.
const contentBottom = await page.evaluate(() => {
    // Track rows are labelled in the left gutter. Collect every label-ish box in
    // the left 300px, sort by top, and stop at the first vertical gap > 100px:
    // that gap is the empty area between the last track and the bottom drawer
    // ("Current Selection" / "Trace Doctor"), which must not be included.
    const rects = []
    for (const el of document.querySelectorAll('div, span, h1, h2')) {
        const t = (el.textContent || '').trim()
        if (!t || t.length > 60) continue
        const r = el.getBoundingClientRect()
        if (r.left > 300 || r.width < 40) continue
        if (r.height < 10 || r.height > 120) continue
        if (r.top < 150 || r.bottom > innerHeight) continue
        rects.push(r)
    }
    rects.sort((x, y) => x.top - y.top)
    let max = 0
    for (const r of rects) {
        if (max && r.top - max > 45) break
        if (r.bottom > max) max = r.bottom
    }
    return max
})
const top = 44
const bottom = Math.min(VH - 24, Math.max(280, contentBottom + 10))
await page.screenshot({
    path: outPng,
    clip: { x: 0, y: top, width: VW, height: bottom - top },
})
console.log(
    `-> wrote ${outPng} clip=${VW}x${Math.round(bottom - top)} css @2x (contentBottom=${Math.round(contentBottom)})`,
)

await browser.close()
