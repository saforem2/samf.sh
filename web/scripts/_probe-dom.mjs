import { chromium } from 'playwright'
import fs from 'node:fs'
// System Chrome on macOS if present, else Playwright's own Chromium.
// Override with CHROME_PATH.
const MAC_CHROME =
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CHROME =
    process.env.CHROME_PATH ??
    (fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ executablePath: CHROME, headless: true })
const c = await b.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
})
const p = await c.newPage()
await p.goto('https://ui.perfetto.dev', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
})
await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
await sleep(5000)
await p
    .locator('input[type=file]')
    .first()
    .setInputFiles('/tmp/aurora-trace/synthetic-probe.json')
for (let i = 0; i < 40; i++) {
    await sleep(2000)
    const n = await p.evaluate(
        () =>
            [...document.querySelectorAll('canvas')].filter(
                (c) => c.width > 400,
            ).length,
    )
    if (n > 0) break
}
await sleep(4000)
const info = await p.evaluate(() => {
    const out = {}
    out.trackShells = [
        ...document.querySelectorAll(
            '[class*=track_shell],[class*=track-shell],.pf-track-shell,.pf-track',
        ),
    ]
        .slice(0, 12)
        .map((e) => ({
            cls: e.className,
            txt: (e.textContent || '').slice(0, 60).replace(/\s+/g, ' '),
        }))
    out.chevrons = [...document.querySelectorAll('i,span')]
        .filter(
            (e) =>
                /chevron|arrow|expand/i.test(e.textContent || '') ||
                /chevron|arrow|expand/i.test(e.className || ''),
        )
        .slice(0, 12)
        .map((e) => ({
            tag: e.tagName,
            cls: String(e.className).slice(0, 60),
            txt: (e.textContent || '').slice(0, 30),
        }))
    out.classSample = [
        ...new Set(
            [...document.querySelectorAll('div')]
                .map((e) => String(e.className))
                .filter((x) => x && x.includes('pf-')),
        ),
    ].slice(0, 40)
    out.buttons = [...document.querySelectorAll('button')]
        .slice(0, 20)
        .map((e) => ({
            cls: String(e.className).slice(0, 50),
            txt: (e.textContent || '').slice(0, 30),
            title: e.title,
        }))
    return out
})
console.log(JSON.stringify(info, null, 1).slice(0, 5000))
await b.close()
