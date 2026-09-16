/**
 * Render notebook exports as notebook cells: In[n] / Out[n] gutters binding
 * each code block to the output it produced, plus colorized log output.
 *
 * Two independent passes, in this order:
 *
 * 1. LOG COLORIZING. Console output was colored by Rich in the terminal, but
 *    the export either stripped the ANSI (leaving flat monochrome) or kept it
 *    as raw escape bytes a browser cannot render. Either way the structure is
 *    gone. It is recovered by parsing the log FORMAT, not by decoding ANSI:
 *
 *      [2025-12-31 11:21:32,364810][I][pytorch/experiment:117:evaluate] Running...
 *       └ timestamp             └ level └ source                      └ message
 *
 *    Lines that do not match -- tensor dumps, bare prints, torch warnings --
 *    pass through untouched. They were never colored either.
 *
 * 2. CELL WRAPPING. Code and output render as unrelated sibling <pre>s with a
 *    gap between them, so a reader cannot tell which output belongs to which
 *    cell. Each input, plus the outputs that follow it, is wrapped in a
 *    .nb-cell carrying In[n] / Out[n] prompts.
 *
 * Three notebook posts exist and each uses a different source convention
 * (```logs vs a <div class="cell-output"> wrapping ```text; ```python vs
 * ``` python). Rather than normalize three sources, both passes key off the
 * RENDERED shapes, which are stable across all three:
 *
 *    pre[data-language]           -> input cell
 *    pre > code.language-logs     -> output  (current convention)
 *    div.cell-output              -> output  (legacy Quarto exports)
 *
 * Note these are the PRE-Shiki shapes. Rehype runs before syntax highlighting,
 * so `.astro-code` does not exist yet at this point.
 *
 * `logs` is registered in astro.config.mjs `syntaxHighlight.excludeLangs`, so
 * Shiki skips those blocks (without it, the build warns "The language 'logs'
 * doesn't exist" and falls back to plaintext), leaving a plain
 * `<pre><code class="language-logs">` for pass 1 to walk.
 */
import { visit } from 'unist-util-visit'

/** `[ts][LEVEL][source] message`, with the message optional. */
const LOG_LINE = /^\[([\d-]+ [\d:,]+)\]\[([A-Z])\]\[([^\]]+)\]\s?(.*)$/

/** Level letter -> modifier class. Anything else gets no level color. */
const LEVEL_CLASS = {
    I: 'log-level-i',
    W: 'log-level-w',
    E: 'log-level-e',
    C: 'log-level-e',
    D: 'log-level-d',
}

function span(className, value) {
    return {
        type: 'element',
        tagName: 'span',
        properties: { className: [className] },
        children: [{ type: 'text', value }],
    }
}

/**
 * One log line -> hast nodes. Returns a flat array so the caller can splice
 * it straight into `<code>`'s children.
 *
 * Building nodes (not HTML strings) means hast handles escaping, so a log
 * message containing `<` or `&` cannot break the document.
 */
function lineToNodes(line) {
    const m = LOG_LINE.exec(line)
    if (!m) return [{ type: 'text', value: line }]

    const [, ts, level, src, msg] = m
    const levelClass = LEVEL_CLASS[level]
    const nodes = [
        span('log-ts', `[${ts}]`),
        {
            type: 'element',
            tagName: 'span',
            properties: {
                className: levelClass
                    ? ['log-level', levelClass]
                    : ['log-level'],
            },
            children: [{ type: 'text', value: `[${level}]` }],
        },
        span('log-src', `[${src}]`),
    ]
    if (msg) nodes.push(span('log-msg', ` ${msg}`))
    return nodes
}

export default function rehypeNotebookCells() {
    return (tree) => {
        visit(tree, 'element', (node) => {
            if (node.tagName !== 'code') return
            const classes = node.properties?.className
            if (!Array.isArray(classes) || !classes.includes('language-logs')) {
                return
            }

            // Excluded from Shiki, so the body is a single raw text node.
            const raw = node.children
                .filter((c) => c.type === 'text')
                .map((c) => c.value)
                .join('')
            if (!raw) return

            const out = []
            // Split on \n and re-add it between lines, so a trailing newline
            // in the source does not become a stray empty line at the end.
            const lines = raw.split('\n')
            lines.forEach((line, i) => {
                if (i > 0) out.push({ type: 'text', value: '\n' })
                out.push(...lineToNodes(line))
            })
            node.children = out
        })

        wrapNotebookCells(tree)
    }
}

// ---------------------------------------------------------------------------
// Pass 2: notebook cell wrapping
// ---------------------------------------------------------------------------

/**
 * Class test that handles both shapes hast produces here.
 *
 * Markdown-generated elements get `properties.className` as an ARRAY, but the
 * legacy exports write their wrapper as literal HTML in the .mdx
 * (`<div class="output cell-output …">`), which arrives as a `class` STRING.
 * Checking only className silently missed all 68 legacy output blocks across
 * the diffusion and jupyter/test posts.
 */
function hasClass(node, name) {
    const props = node?.properties
    if (props) {
        if (Array.isArray(props.className)) {
            return props.className.includes(name)
        }
        const raw = props.className ?? props.class
        if (typeof raw === 'string') return raw.split(/\s+/).includes(name)
    }
    // Literal HTML in .mdx is parsed as JSX, not as a hast element: the node
    // is `mdxJsxFlowElement` and its class lives in `attributes`, not
    // `properties`. This is why the legacy exports' 68 <div class="cell-output">
    // wrappers were invisible to a plain properties check.
    if (Array.isArray(node?.attributes)) {
        const attr = node.attributes.find(
            (a) => a.name === 'class' || a.name === 'className',
        )
        return (
            typeof attr?.value === 'string' &&
            attr.value.split(/\s+/).includes(name)
        )
    }
    return false
}

/** Tag name, for both hast elements and MDX JSX elements. */
const tagOf = (node) =>
    node?.tagName ?? (node?.type?.startsWith('mdxJsx') ? node.name : undefined)

/**
 * Language of a fenced block.
 *
 * Two shapes reach this plugin, because Shiki has ALREADY run by the time
 * these rehype plugins execute (the reverse of what the pipeline order in
 * astro.config.mjs suggests):
 *
 *   highlighted   <pre data-language="python" class="astro-code …">
 *   excluded      <pre><code class="language-logs">   (logs / mermaid / math)
 *
 * The highlighted case carries the language in `properties.dataLanguage`, not
 * in a class. Reading only the class matched nothing and produced 0 input
 * cells with 7 orphan outputs.
 */
function fenceLang(node) {
    if (tagOf(node) !== 'pre') return null
    const data = node.properties?.dataLanguage
    if (typeof data === 'string') return data
    const code = node.children?.find((c) => tagOf(c) === 'code')
    const classes = code?.properties?.className
    if (!Array.isArray(classes)) return ''
    const lang = classes.find((c) => c.startsWith?.('language-'))
    return lang ? lang.slice('language-'.length) : ''
}

/**
 * A fence that represents an executed input cell.
 *
 * `text` is excluded because that is what the legacy exports use for OUTPUT,
 * and `logs` is the current output convention. Everything else with a real
 * language (python, bash, json, …) is an input.
 */
const isInputPre = (node) => {
    const lang = fenceLang(node)
    return !!lang && lang !== 'logs' && lang !== 'text'
}

/** True for the <pre> holding a ```logs fence. */
const isLogsPre = (node) => fenceLang(node) === 'logs'

/**
 * A <details> written by scripts/build-4dsu3-post.mjs to fold the tail of a
 * long output. Identified by containing a logs <pre> and nothing else of
 * substance -- deliberately narrow, so a hand-written <details> in prose is
 * not swallowed into the cell above it.
 */
function isTruncationDetails(node) {
    if (tagOf(node) !== 'details') return false
    if (hasClass(node, 'heading-collapse')) return false
    let logs = 0
    visit(node, (n) => {
        if (isLogsPre(n)) logs += 1
    })
    return logs > 0
}

/**
 * A wrapper that CONTAINS a cell's output rather than being one.
 *
 * jupyter/test uses a fourth structure the other posts do not:
 *
 *   <div>
 *     <details is-="accordion">
 *       <summary><code>output</code></summary>
 *       <div class="cell-output …">
 *
 * so the output the input cell should absorb is two levels down. Without
 * this, all 25 of that post's collapsed outputs detached and rendered as
 * Out[1].
 */
function containsCellOutput(node) {
    const tag = tagOf(node)
    if (tag !== 'div' && tag !== 'details') return false
    if (hasClass(node, 'cell-output')) return false
    let found = false
    visit(node, (n) => {
        if (hasClass(n, 'cell-output')) {
            found = true
            return false
        }
    })
    return found
}

/**
 * A figure emitted by a cell: `<p><img></p>` and nothing else.
 *
 * Matplotlib output lands in the markdown as a bare image paragraph
 * (`![](/assets/output_13_0.svg)`), one per figure, as plain siblings after
 * the code fence. They are output and belong inside the cell -- without this
 * a `plot_all()` call showed nine charts floating below its Out[n] with
 * nothing tying them to it.
 *
 * Requires the paragraph to hold ONLY images, so a prose paragraph that
 * happens to contain an inline image is not swallowed into the cell above.
 */
function isFigureParagraph(node) {
    if (tagOf(node) !== 'p') return false
    let imgs = 0
    for (const c of node.children ?? []) {
        if (c.type === 'text') {
            if (c.value.trim()) return false
            continue
        }
        if (tagOf(c) === 'img') {
            imgs += 1
            continue
        }
        return false
    }
    return imgs > 0
}

function el(tagName, className, children) {
    return {
        type: 'element',
        tagName,
        properties: { className },
        children,
    }
}

/** `In [3]:` / `Out[3]:`, right-aligned in the gutter by CSS. */
function promptRow(kind, n, block) {
    const label = kind === 'in' ? `In [${n}]:` : `Out[${n}]:`
    return el(
        'div',
        [`nb-${kind}`],
        [
            el('span', ['nb-prompt'], [{ type: 'text', value: label }]),
            el('div', ['nb-body'], [block]),
        ],
    )
}

/**
 * Walk a parent's children, replacing input/output <pre> runs with .nb-cell
 * wrappers. Recurses first so blocks nested in <details> (23 of them on the
 * 4D SU(3) post live inside details.heading-collapse) are handled too.
 *
 * `counter` is shared across the whole page so numbering is sequential in
 * document order rather than restarting inside each <details>.
 */
function walk(parent, counter, inCitation, claimable = false) {
    // The citation block is a pre.astro-code too, and must not become In[1].
    const skip = inCitation || hasClass(parent, 'cite-body')

    for (const child of parent.children ?? []) {
        if (child.type === 'element' || child.type?.startsWith('mdxJsx')) {
            // A wrapper whose output the enclosing input cell will absorb:
            // descend, but tell the subtree not to self-label.
            walk(child, counter, skip, claimable || containsCellOutput(child))
        }
    }
    if (skip) return

    const kids = parent.children ?? []
    const out = []
    let i = 0

    while (i < kids.length) {
        const node = kids[i]
        const isEl = node.type === 'element' || node.type?.startsWith('mdxJsx')
        if (!isEl) {
            out.push(node)
            i += 1
            continue
        }

        // A legacy .cell-output div. Only label it here if nothing upstream
        // will claim it: jupyter/test nests these inside
        // <div><details is-="accordion">, and the recursion reaches the inner
        // div BEFORE the outer wrapper is offered to the input cell above.
        // Labelling unconditionally produced 25 nested, doubled Out[1] rows.
        if (hasClass(node, 'cell-output')) {
            if (claimable) {
                out.push(node)
            } else {
                out.push(
                    el(
                        'div',
                        ['nb-cell', 'nb-cell-orphan'],
                        [promptRow('out', counter.value || 1, node)],
                    ),
                )
            }
            i += 1
            continue
        }

        if (!isInputPre(node)) {
            // A bare logs <pre> with no preceding input. Rare, and it is
            // genuinely output, so label it with the number of whatever cell
            // last ran rather than inventing one.
            if (isLogsPre(node) && counter.value > 0) {
                out.push(
                    el(
                        'div',
                        ['nb-cell', 'nb-cell-orphan'],
                        [promptRow('out', counter.value, node)],
                    ),
                )
                i += 1
                continue
            }
            out.push(node)
            i += 1
            continue
        }

        // An input cell. Claim it, then absorb every output that directly
        // follows it (ignoring whitespace-only text nodes between them).
        counter.value += 1
        const n = counter.value
        const rows = [promptRow('in', n, node)]
        i += 1

        while (i < kids.length) {
            const next = kids[i]
            if (next.type === 'text' && !next.value.trim()) {
                i += 1
                continue
            }
            const nextIsEl =
                next.type === 'element' || next.type?.startsWith('mdxJsx')

            // A RUN of figure paragraphs is ONE output: `plot_all()` emits
            // nine charts as nine sibling <p><img>, and giving each its own
            // Out[n] row repeated the same prompt nine times down the page.
            // Collect the whole run into a single row.
            if (nextIsEl && isFigureParagraph(next)) {
                const figs = []
                while (i < kids.length) {
                    const f = kids[i]
                    if (f.type === 'text' && !f.value.trim()) {
                        i += 1
                        continue
                    }
                    if (!isFigureParagraph(f)) break
                    figs.push(f)
                    i += 1
                }
                rows.push(promptRow('out', n, el('div', ['nb-figures'], figs)))
                continue
            }

            if (
                nextIsEl &&
                (isLogsPre(next) ||
                    fenceLang(next) === 'text' ||
                    hasClass(next, 'cell-output') ||
                    containsCellOutput(next))
            ) {
                rows.push(promptRow('out', n, next))
                i += 1
                continue
            }
            // A truncation <details> is a CONTINUATION of the output above it
            // ("show the remaining 500 lines"), not a new cell. Fold it into
            // the same Out[n] row. Left as a sibling it became its own
            // prompt-less block, and its inner logs <pre> was picked up as an
            // orphan -- which is how five separate blocks all rendered Out[1].
            if (nextIsEl && isTruncationDetails(next)) {
                rows.push(
                    el(
                        'div',
                        ['nb-out', 'nb-out-more'],
                        [
                            el('span', ['nb-prompt'], []),
                            el('div', ['nb-body'], [next]),
                        ],
                    ),
                )
                i += 1
                continue
            }
            break
        }

        out.push(el('div', ['nb-cell'], rows))
    }

    parent.children = out
}

/**
 * Only notebook posts get cell treatment. A page qualifies if it contains at
 * least one output block -- a ```logs fence or a legacy .cell-output div.
 * Ordinary posts with plain code blocks have neither, so their code is left
 * exactly as it is.
 *
 * Note the tree here is the MDX document fragment, NOT the rendered page:
 * #doc-article lives in Doc.astro and is wrapped around this later, so it is
 * not visible from a rehype plugin.
 */
function looksLikeNotebook(tree) {
    let found = false
    visit(tree, (node) => {
        if (hasClass(node, 'cell-output') || isLogsPre(node)) {
            found = true
            return false
        }
    })
    return found
}

function wrapNotebookCells(tree) {
    if (!looksLikeNotebook(tree)) return
    walk(tree, { value: 0 }, false)
}
