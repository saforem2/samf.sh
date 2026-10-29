/**
 * Offline OG image generator — C2 "terminal rebuilt, tightened".
 * Single continuous frame: titlebar (dots · $ cat · tinted pill) + body
 * (46px bold white title, prompt spine) + thin footer (`samf.sh · date`).
 */

import { readdir, stat, mkdir } from 'node:fs/promises'
import { join, relative, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const PAGES_DIR = join(import.meta.dir, '..', 'web', 'src', 'pages')
const OUT_DIR = join(import.meta.dir, '..', 'web', 'public', 'og')
const FONT_REGULAR = join(import.meta.dir, 'fonts', 'Iosevka-Regular.ttf')
const FONT_BOLD = join(import.meta.dir, 'fonts', 'Iosevka-Bold.ttf')

const regularData = await Bun.file(FONT_REGULAR).arrayBuffer()
const boldData = await Bun.file(FONT_BOLD).arrayBuffer()

const BG = '#14151b'
const BODY_BG = '#0c0d12'
const FG = '#fff'
const MUTED = '#8b8b9a'
const FRAME_BORDER = 'rgba(255,255,255,.11)'
const TITLEBAR_BG = '#1e2030'
const CATEGORY_COLOR: Record<string, string> = {
    posts: '#3b9dd2',
    talks: '#ee8f24',
    projects: '#9a76ce',
    ideas: '#ee8f24',
    about: '#3fb950',
    now: '#3fb950',
    css: '#3b9dd2',
    webtui: '#3b9dd2',
}
const DEFAULT_ACCENT = '#e05560'

const SCRIPT_MTIME = (await stat(new URL(import.meta.url).pathname)).mtimeMs
const FONT_MTIME = Math.max(
    (await stat(FONT_REGULAR)).mtimeMs,
    (await stat(FONT_BOLD)).mtimeMs,
)
const GENERATOR_MTIME = Math.max(SCRIPT_MTIME, FONT_MTIME)

function stripEmoji(text: string): string {
    return text
        .replace(
            /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}\u{E000}-\u{F8FF}\u{200D}\u{20E3}]/gu,
            '',
        )
        .replace(/\s{2,}/g, ' ')
        .trim()
}

function extractFrontmatter(content: string): Record<string, string> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null
    const fm: Record<string, string> = {}
    for (const line of match[1].split('\n')) {
        const idx = line.indexOf(':')
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        const val = line
            .slice(idx + 1)
            .trim()
            .replace(/^['"]|['"]$/g, '')
        fm[key] = val
    }
    return fm
}

async function findPages(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...(await findPages(full)))
        } else if (/\.(mdx?|md)$/.test(entry.name)) {
            files.push(full)
        }
    }
    return files
}

const col = (style: Record<string, unknown>, children: unknown[]) => ({
    type: 'div',
    props: { style: { display: 'flex', flexDirection: 'column', ...style }, children },
})
const row = (style: Record<string, unknown>, children: unknown[]) => ({
    type: 'div',
    props: { style: { display: 'flex', flexDirection: 'row', ...style }, children },
})
const txt = (text: string, style: Record<string, unknown> = {}) => ({
    type: 'div',
    props: { style: { display: 'flex', fontFamily: 'IBM Plex Mono, Iosevka, monospace', ...style }, children: text },
})

const pill = (label: string, tint: string) =>
    txt(label, {
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '.09em',
        textTransform: 'uppercase',
        color: tint,
        border: `1px solid ${tint}`,
        borderRadius: '999px',
        padding: '4px 10px',
        whiteSpace: 'nowrap',
    })

const trafficDots = () =>
    row({ alignItems: 'center', gap: '7px', display: 'flex', flexShrink: 0 }, [
        { type: 'div', props: { style: { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ff5f56' }, children: [] } },
        { type: 'div', props: { style: { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ffbd2e' }, children: [] } },
        { type: 'div', props: { style: { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27c93f' }, children: [] } },
    ])

async function generateOgImage(
    title: string,
    date: string | null,
    category: string,
    promptPath: string,
): Promise<Buffer> {
    const accent = CATEGORY_COLOR[category] ?? DEFAULT_ACCENT
    // 46px bold sans title (fixed for C2 — shorter titles can breathe)
    const titleSize = 46
    const prompt = `$ cat ${promptPath}`
    const promptSize = prompt.length > 58 ? 18 : prompt.length > 46 ? 21 : 23

    const footerText = date ? `samf.sh · ${date}` : 'samf.sh'

    const tree = col(
        {
            width: '100%', height: '100%',
            backgroundColor: BG,
            fontFamily: 'IBM Plex Sans, IBM Plex Mono, sans-serif',
        },
        [
            // Outer card: one continuous frame, square bottom
            col({
                width: '100%', height: '100%',
                backgroundColor: BODY_BG,
                border: `1px solid ${FRAME_BORDER}`,
                borderRadius: '14px',
                overflow: 'hidden',
                color: FG,
            }, [
                // Titlebar: traffic dots · path · tinted pill
                row({
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px',
                    backgroundColor: TITLEBAR_BG,
                    borderBottom: `1px solid ${FRAME_BORDER}`,
                }, [
                    // Left: dots + prompt wrapped in a single flex container (satori-safe)
                    row({ alignItems: 'center', gap: '10px', flexShrink: 1, overflow: 'hidden' }, [
                        row({ alignItems: 'center', gap: '7px', flexShrink: 0 }, [
                            { type: 'div', props: { style: { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ff5f56', display: 'flex' }, children: [] } },
                            { type: 'div', props: { style: { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ffbd2e', display: 'flex' }, children: [] } },
                            { type: 'div', props: { style: { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27c93f', display: 'flex' }, children: [] } },
                        ]),
                        { type: 'div', props: { style: { display: 'flex', fontFamily: 'IBM Plex Mono, monospace', fontSize: `${promptSize}px`, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }, children: prompt } },
                    ]),
                    // Right pill
                    { type: 'div', props: { style: { display: 'flex', fontSize: '10px', fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: accent, border: `1px solid ${accent}`, borderRadius: '999px', padding: '4px 10px', whiteSpace: 'nowrap', flexShrink: 0 }, children: category } },
                ]),
                // Body: single div with the title as direct text node (satori-safe)
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex', flex: 1,
                            padding: '32px 36px',
                            alignItems: 'flex-start', justifyContent: 'center',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: `${titleSize}px`,
                                        fontWeight: 700,
                                        color: FG,
                                        lineHeight: 1.05,
                                        letterSpacing: '-.03em',
                                        fontFamily: 'IBM Plex Sans, sans-serif',
                                        textWrap: 'balance',
                                    },
                                    children: title,
                                },
                            },
                        ],
                    },
                },
                // Footer: single thin mono line — flat row with 2 single children
                row({
                    display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 24px',
                    borderTop: `1px solid ${FRAME_BORDER}`,
                }, [
                    { type: 'div', props: { style: { fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', color: MUTED, letterSpacing: '.06em' }, children: footerText } },
                    { type: 'div', props: { style: { width: '9px', height: '16px', backgroundColor: accent, flexShrink: 0, display: 'flex' }, children: [] } },
                ]),
            ]),
        ],
    )

    const svg = await satori(tree, {
        width: 1200,
        height: 630,
        fonts: [
            { name: 'IBM Plex Mono', data: regularData, weight: 400 as const, style: 'normal' as const },
            { name: 'IBM Plex Mono', data: boldData, weight: 700 as const, style: 'normal' as const },
            // IBM Plex Sans is not loaded as a file; satori falls back to sans-serif for the title,
            // which keeps it clean. Add if a real font file is available.
        ],
    })
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
    return Buffer.from(resvg.render().asPng())
}

async function main() {
    const pages = await findPages(PAGES_DIR)
    let generated = 0
    let skipped = 0
    for (const page of pages) {
        const content = await Bun.file(page).text()
        const fm = extractFrontmatter(content)
        if (!fm?.title) continue
        if (fm.draft === 'true') continue
        let slug = relative(PAGES_DIR, page)
            .replace(/\/index\.(mdx?|md)$/, '')
            .replace(/\.(mdx?|md)$/, '')
        const outPath = join(OUT_DIR, `${slug}.png`)
        if (existsSync(outPath)) {
            const srcStat = await stat(page)
            const outStat = await stat(outPath)
            if (outStat.mtimeMs >= srcStat.mtimeMs && outStat.mtimeMs >= GENERATOR_MTIME) {
                skipped++
                continue
            }
        }
        const title = stripEmoji(fm.title)
        const category = slug.split('/')[0] || 'samf.sh'
        const promptPath = '/' + relative(PAGES_DIR, page)
        const date = fm.date
            ? new Date(fm.date).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
              })
            : null
        const png = await generateOgImage(title, date, category, promptPath)
        await mkdir(dirname(outPath), { recursive: true })
        await Bun.write(outPath, png)
        generated++
        console.log(`  ${slug}.png`)
    }
    console.log(`\nDone: ${generated} generated, ${skipped} skipped`)
}

main().catch((err) => { console.error(err); process.exit(1) })
