// Render the ATPESC 2026 deck to a print-quality PDF, one slide per page.
//
// Uses Playwright's page.pdf(), which emulates print media -- so the deck's
// own `@media print` rules (in slides.css) lay every <Slide> out flat, one
// per page, with the per-slide URL stamp. Page size is 13.333in x 7.5in
// (PowerPoint widescreen 16:9), matching the slides' aspect-ratio: 16/9 so
// each slide fills exactly one page edge-to-edge.
//
// Usage: node scripts/gen-slides-pdf.mjs [url] [outPath]
//   defaults: http://localhost:4399/talks/2026/08/03/  ->  ../<slug>.pdf
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The pinned playwright build number can drift from what's actually installed
// in the ms-playwright cache (a newer `npx playwright install` may have left a
// different build). Rather than fight the version pin, find the newest complete
// chrome-headless-shell on disk and launch it directly.
function findHeadlessShell() {
    const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
    if (!existsSync(cache)) return null
    const builds = readdirSync(cache)
        .filter((d) => d.startsWith('chromium_headless_shell-'))
        .map((d) => ({
            n: parseInt(d.split('-')[1], 10) || 0,
            p: resolve(
                cache,
                d,
                'chrome-headless-shell-mac-arm64/chrome-headless-shell',
            ),
        }))
        .filter((b) => existsSync(b.p))
        .sort((a, b) => b.n - a.n)
    return builds[0]?.p ?? null
}
const url = process.argv[2] ?? 'http://localhost:4399/talks/2026/08/03/'
const out =
    process.argv[3] ??
    resolve(__dirname, '..', '..', 'atpesc-2026-pretraining-llms.pdf')

const shell = findHeadlessShell()
const browser = await chromium.launch(shell ? { executablePath: shell } : {})
// Match the PDF page (13.333in x 7.5in = 1280x720 CSS px). Mermaid only
// renders blocks visible at load, and decks hide desktop diagrams behind
// `screen and (max-width: 1100px)` -- a narrower viewport leaves those
// blocks as raw source in the PDF.
const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
})

// Print CSS keys off @media print (page.pdf emulates it) OR the
// .slides-print-mode body class. We do NOT navigate with ?print-pdf, since
// that calls window.print() (headless no-op) -- print media emulation alone
// flattens the deck. Use the CSS page size for consistent print metrics.
await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
await page.emulateMedia({ media: 'print' })

// Let mermaid/katex/webfonts settle before snapshotting.
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(1500)

await page.pdf({
    path: out,
    width: '13.333in',
    height: '7.5in',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: true,
    pageRanges: `1-${await page.locator('[is-~="slide"]').count()}`,
})

await browser.close()
console.log(`wrote ${out}`)
