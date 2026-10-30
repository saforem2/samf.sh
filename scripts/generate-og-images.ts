/**
 * Offline OG image generator — C2 + description + larger type (no stoplights, square badge).
 * Single continuous frame: titlebar ($ cat + square pill) + body
 * (left-aligned title + muted description at 28px) + footer (samf.sh · date, 14px).
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

async function generateOgImage(
    title: string,
    description: string | null,
    date: string | null,
    category: string,
    promptPath: string,
): Promise<Buffer> {
    const accent = CATEGORY_COLOR[category] ?? DEFAULT_ACCENT
    const titleSize = description ? 52 : 56
    const prompt = `$ cat ${promptPath}`
    const promptSize = prompt.length > 58 ? 20 : prompt.length > 46 ? 23 : 26
    const footerText = date ? `samf.sh · ${date}` : 'samf.sh'

    let shortDesc: string | null = null
    if (description) {
        const cleaned = description.replace(/\s+/g, ' ').trim()
        if (cleaned.length > 140) {
            const cut = cleaned.slice(0, 137)
            const lastSpace = cut.lastIndexOf(' ')
            shortDesc = (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + '…'
        } else {
            shortDesc = cleaned
        }
    }

    const tree = col(
        {
            width: '100%', height: '100%',
            backgroundColor: BG,
            fontFamily: 'IBM Plex Sans, IBM Plex Mono, sans-serif',
        },
        [
            col({
                width: '100%', height: '100%',
                backgroundColor: BODY_BG,
                border: `1px solid ${FRAME_BORDER}`,
                borderRadius: '14px',
                overflow: 'hidden',
                color: FG,
            }, [
                // Titlebar: $ cat path + square badge (no stoplights)
                row({
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 18px',
                    backgroundColor: TITLEBAR_BG,
                    borderBottom: `1px solid ${FRAME_BORDER}`,
                }, [
                    { type: 'div', props: { style: { display: 'flex', fontFamily: 'IBM Plex Mono, monospace', fontSize: `${promptSize}px`, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }, children: prompt } },
                    { type: 'div', props: { style: { display: 'flex', fontSize: '13px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: accent, border: `1px solid ${accent}`, borderRadius: '0', padding: '5px 12px', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '16px' }, children: category } },
                ]),
                // Body: left-aligned title + description
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex', flex: 1, width: '100%',
                            padding: '28px 36px',
                            flexDirection: 'column',
                            alignItems: 'flex-start', justifyContent: 'center',
                            gap: '14px',
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
                                        textAlign: 'left',
                                    },
                                    children: title,
                                },
                            },
                            ...(shortDesc
                                ? [{
                                      type: 'div' as const,
                                      props: {
                                          style: {
                                              fontSize: '28px',
                                              fontWeight: 400,
                                              color: MUTED,
                                              lineHeight: 1.35,
                                              textAlign: 'left' as const,
                                          },
                                          children: shortDesc,
                                      },
                                  }]
                                : []),
                        ],
                    },
                },
                // Footer
                row({
                    display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 24px',
                    borderTop: `1px solid ${FRAME_BORDER}`,
                }, [
                    { type: 'div', props: { style: { fontSize: '14px', fontFamily: 'IBM Plex Mono, monospace', color: MUTED, letterSpacing: '.05em' }, children: footerText } },
                    { type: 'div', props: { style: { width: '10px', height: '18px', backgroundColor: accent, flexShrink: 0, display: 'flex' }, children: [] } },
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
        const rawDesc = fm.description?.trim() || null
        const description = rawDesc && rawDesc.length > 0 ? stripEmoji(rawDesc) : null
        const category = slug.split('/')[0] || 'samf.sh'
        const promptPath = '/' + relative(PAGES_DIR, page)
        const date = fm.date
            ? new Date(fm.date).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
              })
            : null
        const png = await generateOgImage(title, description, date, category, promptPath)
        await mkdir(dirname(outPath), { recursive: true })
        await Bun.write(outPath, png)
        generated++
        console.log(`  ${slug}.png`)
    }
    console.log(`\nDone: ${generated} generated, ${skipped} skipped`)
}

main().catch((err) => { console.error(err); process.exit(1) })
