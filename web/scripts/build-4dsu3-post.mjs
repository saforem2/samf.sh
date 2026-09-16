/**
 * One-shot converter: the 2025 l2hmc-qcd 4D SU(3) notebook export
 * (posts/jupyter/l2hmc-4dSU3) -> posts/2023/12/05.
 *
 * Three exports of this notebook were published, none of which displayed cell
 * output correctly. This one had the best bones (valid Python indentation, the
 * newest ezpz API, the complete arc through the final pdiff comparison), but
 * its output was flat 4-space-indented text with no structure.
 *
 * What this changes, and nothing else:
 *   1. indented output blocks  -> ```logs fences, so rehype-notebook-cells.mjs
 *      can colorize the timestamp / level / source / message fields
 *   2. long output (> KEEP_LINES) -> wrapped in <details>, nothing deleted
 *   3. relative index_files/ image paths -> /assets/output_*.svg, which already
 *      exist in public/ and do not move when the route changes
 *   4. fresh frontmatter + a short authored intro (the source had no prose)
 *
 * Code cells are copied verbatim. Run once; the output is the artifact.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src/pages/posts/jupyter/l2hmc-4dSU3/index.mdx')
const OUT = path.join(ROOT, 'src/pages/posts/2023/12/05/index.mdx')

/** Lines of output shown before the rest is folded into a <details>. */
const KEEP_LINES = 12

/**
 * C's figures and B's are the same plots from the same run, exported under
 * different naming schemes. B's live in public/assets/ and are referenced
 * absolutely, so they survive this page moving to a new route. The mapping is
 * contiguous per section.
 */
const FIGURE_BASE = { 11: 13, 14: 17, 16: 20, 18: 22 }

/**
 * The source escaped `<`, `{` and `}` as HTML entities because its output sat
 * in raw indented blocks that MDX would otherwise try to parse as JSX. Inside
 * a fence that is no longer needed, and leaving them escaped would print the
 * literal text `&lt;module>` to the reader.
 */
function unescapeEntities(s) {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#123;/g, '{')
        .replace(/&#125;/g, '}')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
}

function remapImage(line) {
    return line.replace(
        /!\[\]\(index_files\/figure-commonmark\/cell-(\d+)-output-(\d+)\.svg\)/g,
        (whole, cell, out) => {
            const base = FIGURE_BASE[Number(cell)]
            if (base === undefined) return whole // unknown cell: leave as-is
            return `![](/assets/output_${base}_${Number(out) - 1}.svg)`
        },
    )
}

const FRONTMATTER = `---
layout: '@/layouts/Doc.astro'
title: '🔳 l2hmc-qcd Example: 4D SU(3)'
date: 2023-12-05
date-modified: today
description: 'Training and evaluating the L2HMC sampler on 4D SU(3) lattice gauge theory: HMC baseline, 100 training steps, and a plaquette comparison against HMC.'
---

A minimal end-to-end run of [\`l2hmc-qcd\`](https://github.com/saforem2/l2hmc-qcd)
on four-dimensional $SU(3)$ lattice gauge theory. The model is a 27.9M-parameter
sampler on a $4^4$ lattice with 8 chains, trained for 100 steps at $\\beta = 6$.

The arc is: run plain HMC as a baseline, train the learned sampler, evaluate it,
then compare plaquette values between the two. The last figure is the payoff, the
difference $|\\delta U_{\\mu\\nu}|^{2}$ between evaluation and HMC.

> [!NOTE]
> Console output below is shown as it was logged. The cell outputs come from a
> later re-run of the same notebook than the publication date suggests.

`

function convert() {
    const raw = fs.readFileSync(SRC, 'utf8')
    const body = raw.split(/^---$/m).slice(2).join('---\n')
    const lines = body.split('\n')

    const out = []
    let i = 0
    let inFence = false
    const stats = { logBlocks: 0, details: 0, images: 0, logLines: 0 }

    while (i < lines.length) {
        const line = lines[i]

        // Track fenced regions so indented lines INSIDE a code block are not
        // mistaken for output.
        if (line.startsWith('```')) {
            inFence = !inFence
            out.push(line)
            i += 1
            continue
        }
        if (inFence) {
            // Entities are literal inside a fence too. The source escaped them
            // for its ```text config dump; left alone they would print as
            // `&#123;` instead of `{`.
            out.push(unescapeEntities(line))
            i += 1
            continue
        }

        // A run of 4-space-indented lines is one cell's output. Blank lines
        // inside the run belong to it; a non-indented, non-blank line ends it.
        if (/^ {4}\S/.test(line)) {
            const block = []
            while (i < lines.length) {
                const l = lines[i]
                if (/^ {4}/.test(l)) {
                    block.push(unescapeEntities(l.slice(4)))
                    i += 1
                } else if (l.trim() === '') {
                    // Only absorb the blank if indented output follows it.
                    let j = i + 1
                    while (j < lines.length && lines[j].trim() === '') j += 1
                    if (j < lines.length && /^ {4}/.test(lines[j])) {
                        block.push('')
                        i += 1
                    } else break
                } else break
            }
            while (block.length && block[block.length - 1] === '') block.pop()
            if (!block.length) continue

            stats.logBlocks += 1
            stats.logLines += block.length

            if (block.length > KEEP_LINES) {
                stats.details += 1
                const head = block.slice(0, KEEP_LINES)
                const rest = block.slice(KEEP_LINES)
                out.push('```logs')
                out.push(...head)
                out.push('```')
                out.push('')
                out.push('<details>')
                out.push(
                    `<summary>show the remaining ${rest.length} lines</summary>`,
                )
                out.push('')
                out.push('```logs')
                out.push(...rest)
                out.push('```')
                out.push('')
                out.push('</details>')
            } else {
                out.push('```logs')
                out.push(...block)
                out.push('```')
            }
            out.push('')
            continue
        }

        if (line.includes('index_files/figure-commonmark/')) {
            stats.images += 1
            out.push(remapImage(line))
            i += 1
            continue
        }

        out.push(line)
        i += 1
    }

    // Collapse 3+ blank lines to 2.
    const text = out.join('\n').replace(/\n{3,}/g, '\n\n')
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, FRONTMATTER + text.replace(/^\n+/, ''))

    console.log(`wrote ${OUT}`)
    console.log(
        `  log blocks: ${stats.logBlocks}  (${stats.logLines} lines)\n` +
            `  <details> wrappers: ${stats.details}\n` +
            `  images remapped: ${stats.images}`,
    )
}

convert()
