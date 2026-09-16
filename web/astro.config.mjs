import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import { visit } from 'unist-util-visit'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkSlides from './src/utils/remark-slides.mjs'
import rehypeTaskListInteractive from './src/utils/rehype-task-list-interactive.mjs'
import rehypeNotebookCells from './src/utils/rehype-notebook-cells.mjs'
// import rehypeMermaid from 'rehype-mermaid'
// import Catppuccin from 'tm-themes/themes/catppuccin-mocha'
// import { getSingletonHighlighter } from 'shiki'

// type LineHighlight = 'add' | 'remove' | 'change'
//
// interface Props {
//     code: string
//     lang?: 'html' | 'css'
//     file?: {
//         name: string
//         icon: [string, string] | string
//     }
//     highlights?: [number, LineHighlight][]
//     withShadow?: boolean
// }
//
// const {
//     code,
//     highlights,
//     lang = 'html',
//     file,
//     withShadow = false,
//     ...props
// } = Astro.props
//
// const highlighter = await getSingletonHighlighter({
//     themes: ['catppuccin-mocha'],
//     langs: ['html', 'css'],
// })
// const tokens = highlighter.codeToTokens(code, {
//     lang,
//     theme: 'catppuccin-mocha',
// })

import { createHighlighter } from 'shiki'
import { createCssVariablesTheme } from 'shiki'

// In-house Shiki themes generated from the project palette. Live alongside
// the prepackaged themes (min-light, one-dark-pro, catppuccin-*) — see the
// shikiConfig.themes block below. JSON imports use Node's import-attributes
// proposal, which Vite/Node 22+ support.
import samLight from './src/shiki-themes/sam-light.json' with { type: 'json' }
import samDark from './src/shiki-themes/sam-dark.json' with { type: 'json' }
// Neovim-mirrored themes: nvim-light = onelight (onedarkpro), nvim-dark =
// cyberdream — both transcribed from the user's live nvim auto_dark_mode.lua
// (palette + custom highlight overrides). See src/shiki-themes/nvim-*.json.
// Neovim-mirrored syntax themes — onelight (light) / cyberdream (dark), each in
// two palette-swap variants generated from the default themes by
// scripts/gen-nvim-themes.mjs: "role" maps by semantic role, "hue" keeps the
// default theme's structure shifted to the nearest nvim hue.
import nvimLightRole from './src/shiki-themes/nvim-light-role.json' with { type: 'json' }
import nvimLightHue from './src/shiki-themes/nvim-light-hue.json' with { type: 'json' }
import nvimDarkRole from './src/shiki-themes/nvim-dark-role.json' with { type: 'json' }
import nvimDarkHue from './src/shiki-themes/nvim-dark-hue.json' with { type: 'json' }

const oneLight = createCssVariablesTheme({
    name: 'one-light',
    variablePrefix: '--shiki',
    variableDefaults: {},
    fontStyle: true,
})

const catpuccinMocha = createCssVariablesTheme({
    name: 'css-variables',
    variablePrefix: '--shiki-',
    variableDefaults: {},
    fontStyle: true,
})
const highlighter = await createHighlighter({
    themes: [
        oneLight,
        catpuccinMocha,
        samLight,
        samDark,
        nvimLightRole,
        nvimLightHue,
        nvimDarkRole,
        nvimDarkHue,
    ],
})

// import oneLight from 'shiki/themes/one-light.json'

const indexableElements = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'li',
    'p',
    'a',
    'div',
    'details',
    'summary',
    'flex-container',
    'column',
    'flex',
]

const calloutTypeAliases = {
    note: 'note',
    abstract: 'note',
    summary: 'note',
    info: 'tip',
    tip: 'tip',
    hint: 'tip',
    important: 'important',
    todo: 'important',
    warning: 'warning',
    caution: 'warning',
    attention: 'warning',
    error: 'error',
    danger: 'error',
    failure: 'error',
    fail: 'error',
    bug: 'error',
    success: 'success',
    question: 'note',
}

const calloutTitleByType = {
    note: 'Note',
    tip: 'Tip',
    important: 'Important',
    warning: 'Warning',
    error: 'Error',
    success: 'Success',
}

// [!TYPE] marker, with optional `|flag` modifiers inside the brackets
// (e.g. `[!IMPORTANT|inline]`) and the usual trailing `+`/`-` fold state.
//   [1] type   [2] pipe-separated flags (or undefined)   [3] +/-   [4] rest
const calloutMarkerPattern =
    /^\s*\[!([a-zA-Z]+)((?:\|[a-zA-Z-]+)*)\]([+-])?\s*(.*)$/

const toTitleCase = (value) =>
    value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value

const rehypeGitHubCallouts = () => {
    // @ts-expect-error doesn't matter
    return (tree) => {
        visit(tree, 'element', (node, index, parent) => {
            if (!parent || typeof index !== 'number') return
            if (node.tagName !== 'blockquote') return

            const paragraphIndex = node.children.findIndex(
                (child) => child.type === 'element' && child.tagName === 'p',
            )

            if (paragraphIndex < 0) return

            const paragraph = node.children[paragraphIndex]
            const firstTextNode = paragraph.children.find(
                (child) => child.type === 'text',
            )

            if (!firstTextNode || typeof firstTextNode.value !== 'string') {
                return
            }

            const [firstLine, ...remainingLines] =
                firstTextNode.value.split('\n')
            const markerMatch = firstLine.match(calloutMarkerPattern)
            if (!markerMatch) return

            const rawType = markerMatch[1].toLowerCase()
            const calloutType = calloutTypeAliases[rawType] ?? rawType
            // Flags after the type, e.g. `[!NOTE|inline]` → ['inline'].
            const calloutFlags = (markerMatch[2] || '')
                .split('|')
                .map((f) => f.trim().toLowerCase())
                .filter(Boolean)
            const calloutTitle = markerMatch[4]?.trim()
            const isInline = calloutFlags.includes('inline')
            // Inline callouts show ONLY the title/body — suppress the auto
            // type-label fallback ("Important", "Note", …) so a bare
            // `[!TYPE|inline] …` doesn't prepend the type name. A normal
            // callout still gets the type label when no explicit title.
            // Suppress the type-label fallback when the title's text head is
            // empty but markup follows (`> [!TIP] <span>…</span>`), or the
            // summary would read "Tip" immediately followed by the real title.
            // titleTailNodes is computed just below; recompute the predicate
            // here rather than reorder the existing code.
            const hasTitleMarkupOnly =
                !calloutTitle &&
                markerMatch[4] !== undefined &&
                firstTextNode.value.split('\n').length === 1 &&
                paragraph.children.indexOf(firstTextNode) <
                    paragraph.children.length - 1
            const summaryText = isInline
                ? calloutTitle || ''
                : calloutTitle ||
                  (hasTitleMarkupOnly
                      ? ''
                      : calloutTitleByType[calloutType] || toTitleCase(rawType))

            // Rich titles: `> [!TIP] Using your own \`conda\`` or
            // `> [!TIP] <span>…</span>`.
            //
            // remark parses the title's markup into sibling nodes BEFORE this
            // plugin runs, so markerMatch[4] only captures the plain-text head
            // and everything from the first tag onward was silently dropped
            // ("Using your own `conda`" rendered as "Using your own"; a title
            // that STARTS with markup rendered as the bare type label).
            //
            // The title runs to the END OF THE MARKER LINE, not the end of
            // the paragraph. With no blank `>` separator the body lives in the
            // SAME paragraph, so walk the siblings and stop at the first text
            // node containing a newline — that is where the body starts.
            // Splitting there keeps the body out of the <summary> and leaves
            // the remainder as the callout body.
            //
            // Deliberately NOT recursive: this hoists the marker paragraph's
            // direct inline children only, which is what a title is.
            const markerNodeIndex = paragraph.children.indexOf(firstTextNode)
            const titleTailNodes = []
            let bodyStartIndex = -1
            if (markerMatch[4] !== undefined && remainingLines.length === 0) {
                for (
                    let i = markerNodeIndex + 1;
                    i < paragraph.children.length;
                    i++
                ) {
                    const child = paragraph.children[i]
                    if (
                        child.type === 'text' &&
                        typeof child.value === 'string' &&
                        child.value.includes('\n')
                    ) {
                        // Title keeps the head of this node (up to the
                        // newline); the tail becomes the body's first text.
                        const nl = child.value.indexOf('\n')
                        const head = child.value.slice(0, nl)
                        if (head)
                            titleTailNodes.push({ type: 'text', value: head })
                        child.value = child.value
                            .slice(nl + 1)
                            .replace(/^\s+/, '')
                        bodyStartIndex = i
                        break
                    }
                    titleTailNodes.push(child)
                }
                if (titleTailNodes.length > 0) {
                    // Remove exactly the nodes that moved into the summary.
                    const removeCount =
                        (bodyStartIndex === -1
                            ? paragraph.children.length
                            : bodyStartIndex) -
                        (markerNodeIndex + 1)
                    paragraph.children.splice(markerNodeIndex + 1, removeCount)
                }
            }

            // Three blockquote shapes we need to handle:
            //   (a) `> [!NOTE] body on same line`    → single <p>, single text node
            //   (b) `> [!NOTE]\n> body on next line` → single <p>, body in
            //       following children of THAT paragraph
            //   (c) `> [!NOTE]\n>\n> body in next paragraph` (blank `>` line)
            //       → TWO <p>s — marker paragraph + body paragraph
            //
            // The original implementation only handled (a). For (b)/(c) the
            // marker's first text node had no remaining lines, so the
            // marker paragraph was deleted and the rest of the paragraph
            // (case b) or the entire body paragraph (case c) was either
            // dropped or stranded as a sibling of the marker text.
            const remainingTextOnFirstLine = remainingLines
                .join('\n')
                .replace(/^\s+/, '')
            const hasInlineBody = remainingTextOnFirstLine.trim().length > 0
            const hasMoreSiblingsInMarkerParagraph =
                paragraph.children.indexOf(firstTextNode) <
                paragraph.children.length - 1
            const markerParagraphHasBody =
                hasInlineBody || hasMoreSiblingsInMarkerParagraph

            if (hasInlineBody) {
                // Case (a)/(b) inline tail — strip the marker line, keep
                // the rest as the paragraph's leading text.
                firstTextNode.value = remainingTextOnFirstLine
            } else if (titleTailNodes.length > 0) {
                // Title nodes were already spliced out above. Drop just the
                // marker text node; whatever remains in this paragraph is
                // body content and must stay.
                paragraph.children.splice(markerNodeIndex, 1)
                const next = paragraph.children[markerNodeIndex]
                if (
                    next &&
                    next.type === 'text' &&
                    typeof next.value === 'string'
                ) {
                    next.value = next.value.replace(/^\s+/, '')
                }
            } else if (hasMoreSiblingsInMarkerParagraph) {
                // Case (b) where the marker is the only text on the first
                // line but the paragraph has more inline content after
                // (e.g. `> [!NOTE]\n> **bold** body`). Drop the marker
                // text node, keep the rest of the paragraph intact.
                paragraph.children.splice(
                    paragraph.children.indexOf(firstTextNode),
                    1,
                )
                // Trim a leading newline-text remnant if remark left one.
                const next =
                    paragraph.children[
                        paragraph.children.indexOf(firstTextNode)
                    ]
                if (
                    next &&
                    next.type === 'text' &&
                    typeof next.value === 'string'
                ) {
                    next.value = next.value.replace(/^\s+/, '')
                }
            }

            // Drop the marker paragraph from the blockquote if it has no
            // remaining body content (case c — body is in a separate <p>).
            if (!markerParagraphHasBody || paragraph.children.length === 0) {
                node.children.splice(paragraphIndex, 1)
            }

            const calloutClasses = ['callout', `callout-${calloutType}`]
            if (calloutFlags.includes('inline'))
                calloutClasses.push('callout-inline')
            // `[!TIP|wide]` → break out of the prose-measure width cap and
            // span the full article column (see .callout-wide in global.css).
            // Slide-deck embeds also get this automatically via :has(), so the
            // flag is only needed for wide non-slide callouts.
            if (calloutFlags.includes('wide'))
                calloutClasses.push('callout-wide')

            const detailsNode = {
                type: 'element',
                tagName: 'details',
                properties: {
                    'is-': 'accordion',
                    className: calloutClasses,
                    'data-callout': calloutType,
                },
                children: [
                    {
                        type: 'element',
                        tagName: 'summary',
                        properties: {},
                        children: [
                            ...(summaryText
                                ? [
                                      {
                                          type: 'text',
                                          // calloutTitle is trimmed, so a title
                                          // whose text head is followed by
                                          // markup ("The `Host *` trap") would
                                          // render as "The<code>". Restore the
                                          // single separating space.
                                          value:
                                              titleTailNodes.length > 0
                                                  ? summaryText + ' '
                                                  : summaryText,
                                      },
                                  ]
                                : []),
                            ...titleTailNodes,
                        ],
                    },
                    ...node.children,
                ],
            }

            // Inline callouts have no meaningful collapsed state (just a
            // one-line title/link), so always render them open.
            if (isInline) {
                detailsNode.properties.open = true
            }

            if (markerMatch[3] === '+') {
                detailsNode.properties.open = true
            }

            parent.children[index] = detailsNode
        })
    }
}

const rehypeMermaidClientSide = () => {
    // @ts-expect-error doesn't matter
    return (tree) => {
        visit(tree, 'element', (node, index, parent) => {
            if (!parent || typeof index !== 'number') return
            if (node.tagName !== 'pre') return

            const codeNode = node.children.find(
                (child) => child.type === 'element' && child.tagName === 'code',
            )
            if (!codeNode) return

            const classes = Array.isArray(codeNode.properties?.className)
                ? codeNode.properties.className
                : []
            const lang =
                codeNode.properties?.dataLanguage ??
                classes
                    .find(
                        (cls) =>
                            typeof cls === 'string' &&
                            cls.startsWith('language-'),
                    )
                    ?.slice('language-'.length)

            if (lang !== 'mermaid') return

            const source = codeNode.children
                .filter((child) => child.type === 'text')
                .map((child) => child.value)
                .join('')

            parent.children[index] = {
                type: 'element',
                tagName: 'div',
                properties: {
                    className: ['mermaid'],
                    'data-mermaid': source,
                },
                children: [{ type: 'text', value: source }],
            }
        })
    }
}

const rehypeMarkdownTabIndex = () => {
    // @ts-expect-error doesn't matter
    return (tree) => {
        visit(tree, 'element', (node) => {
            if (indexableElements.includes(node.tagName)) {
                node.properties.tabIndex = 0
            }
        })
    }
}

// Propagate a `data-table-style` attribute from a wrapper element down to the
// <table> it contains. Markdown pipe tables can't carry an inline attribute,
// so wrapping one in `<div data-table-style="terminal"> … </div>` (with blank
// lines so the pipe table still parses as markdown) is the only way to opt a
// markdown table into the terminal ascii-box style. The CSS keys off the attr
// being on the <table> itself, so copy it there.
//
// In the MDX pipeline the wrapper is an `mdxJsxFlowElement` (attrs live on
// `node.attributes`), not a hast `element` (attrs on `node.properties`), so
// handle both. The inner <table> is always a hast element by the time this
// runs, so we set `properties` on it either way.
const rehypePropagateTableStyle = () => {
    // @ts-expect-error hast/mdast node typing not worth importing
    return (tree) => {
        const stampTables = (node, style) => {
            visit(node, 'element', (child) => {
                if (
                    child.tagName === 'table' &&
                    !child.properties.dataTableStyle
                )
                    child.properties.dataTableStyle = style
            })
        }
        // hast <div data-table-style="…"> wrappers
        visit(tree, 'element', (node) => {
            const style = node.properties?.['dataTableStyle']
            if (style && node.tagName !== 'table') stampTables(node, style)
        })
        // MDX <div data-table-style="…"> wrappers
        visit(tree, 'mdxJsxFlowElement', (node) => {
            const attr = (node.attributes || []).find(
                (a) =>
                    a.type === 'mdxJsxAttribute' &&
                    a.name === 'data-table-style',
            )
            if (attr && typeof attr.value === 'string')
                stampTables(node, attr.value)
        })
    }
}

// https://astro.build/config
export default defineConfig({
    devToolbar: { enabled: false },
    site: 'https://samf.sh',
    compressHTML: false,
    markdown: {
        remarkPlugins: [remarkMath],
        rehypePlugins: [
            rehypeHeadingIds,
            rehypeGitHubCallouts,
            rehypeMarkdownTabIndex,
            rehypePropagateTableStyle,
            rehypeKatex,
            rehypeMermaidClientSide,
            rehypeTaskListInteractive,
            rehypeNotebookCells,
        ],
        syntaxHighlight: {
            type: 'shiki',
            excludeLangs: ['mermaid', 'math', 'logs'],
        },
        shikiConfig: {
            wrap: false,
            // theme: 'one-dark-pro',
            defaultColor: 'custom-light',
            themes: {
                'custom-light': 'min-light',
                'custom-dark': 'one-dark-pro',
                catppuccin: 'catppuccin-mocha',
                'catppuccin-latte': 'catppuccin-latte',
                // In-house themes generated from the project palette.
                // Toggle via the theme picker → "sam-light" / "sam-dark".
                'sam-light': samLight,
                'sam-dark': samDark,
                // Neovim-mirrored syntax themes (onelight / cyberdream), two
                // palette-swap variants each (role / hue).
                'nvim-light-role': nvimLightRole,
                'nvim-light-hue': nvimLightHue,
                'nvim-dark-role': nvimDarkRole,
                'nvim-dark-hue': nvimDarkHue,
            },
            colorReplacements: {
                'one-light': {
                    '#986801': '#ee8f24',
                    '#C18401': '#eea724',
                },
            },
        },
    },
    integrations: [
        mdx({
            extendMarkdownConfig: true,
            remarkPlugins: [remarkMath, remarkSlides],
            rehypePlugins: [
                rehypeGitHubCallouts,
                rehypePropagateTableStyle,
                rehypeKatex,
                rehypeMermaidClientSide,
                rehypeTaskListInteractive,
                rehypeNotebookCells,
            ],
        }),
        sitemap(),
    ],
    vite: {
        ssr: {
            noExternal: [
                '@webtui/css',
                '@webtui/theme-catppuccin',
                '@webtui/theme-custom',
                '@webtui/plugin-nf',
            ],
        },
        plugins: [stubUnusedMermaidDiagrams()],
    },
})

/**
 * Vite plugin: stub out the mermaid diagram chunks we never render.
 *
 * Mermaid's core entry contains `import('./chunks/mermaid.core/{X}-{hash}.mjs')`
 * for every diagram type it knows about. Rollup follows those dynamic imports
 * and builds a chunk per diagram — plus their transitive vendor deps. Two of
 * those vendor chunks dominate the bundle:
 *   - cytoscape (~442 KB) — only needed by c4 / architecture / kanban
 *   - treemap (~453 KB) — only needed by treemap / mindmap
 *
 * Our deck uses flowchart, stateDiagram-v2, and gantt (in older posts). Every
 * other diagram class is unused. Resolving each unused chunk path to a stub
 * module that throws "diagram type not bundled" lets Rollup tree-shake their
 * vendor deps out of the build. If someone authors an architecture/treemap/etc
 * block later, mermaid will surface a clear runtime error pointing at this
 * stub, and the fix is to add the diagram to the keep-list below.
 */
function stubUnusedMermaidDiagrams() {
    const KEEP = new Set([
        'flowDiagram',
        'flowchartElk',
        'flowchart-elk',
        'stateDiagram',
        'stateDiagram-v2',
        'ganttDiagram',
        // 'diagram-*' is mermaid's per-type registration shim; keep them
        // all since they're tiny and removing them breaks registry init.
    ])
    // Match `chunks/mermaid.{core,esm}/{Name}-{HASH}.mjs`. Hash is
    // case-insensitive — mermaid's filenames use mixed-case rollup
    // hashes (e.g. `flowDiagram-PKNHOUZH.mjs`, `chunk-AGHRB4JF.mjs`),
    // so don't require all-uppercase. Also match the bare relative
    // form mermaid emits (no `mermaid/dist/` prefix) since the
    // importer is already inside mermaid's dist.
    const CHUNK_RE =
        /chunks[/\\]mermaid\.(?:core|esm)[/\\]([A-Za-z][A-Za-z0-9-]*)-[A-Za-z0-9]+\.mjs$/

    return {
        name: 'stub-unused-mermaid-diagrams',
        enforce: 'pre',
        async resolveId(source, importer) {
            if (!source.includes('chunks/mermaid.')) return null
            const m = source.match(CHUNK_RE)
            if (!m) {
                if (process.env.STUB_DEBUG) {
                    console.log('[stub] no match:', source, 'from', importer)
                }
                return null
            }
            const name = m[1]
            // Always allow the bare `diagram-*` registration shim
            // through, and the `chunk-*` shared internal modules
            // (those are common mermaid runtime, not per-diagram).
            if (name.startsWith('diagram-')) return null
            if (name === 'chunk') return null
            if (KEEP.has(name)) return null
            if (process.env.STUB_DEBUG) {
                console.log('[stub] STUBBING:', name, 'from', importer)
            }
            // Synthetic ID — load() below returns an empty module so
            // Rollup tree-shakes the transitive vendor deps out.
            return `\0mermaid-stub:${name}`
        },
        load(id) {
            if (!id.startsWith('\0mermaid-stub:')) return null
            const name = id.slice('\0mermaid-stub:'.length)
            return [
                `// Stubbed by astro.config.mjs:stubUnusedMermaidDiagrams.`,
                `// '${name}' isn't used anywhere in the site; authoring a diagram of`,
                `// this type will throw at runtime — add the chunk name to the KEEP`,
                `// set in astro.config.mjs to re-enable.`,
                `export default {`,
                `  id: '${name}',`,
                `  detector: () => false,`,
                `  loader: () => {`,
                `    throw new Error(`,
                `      "mermaid diagram type '${name}' is not bundled on this site. " +`,
                `      "Add it to the KEEP set in astro.config.mjs to re-enable."`,
                `    )`,
                `  },`,
                `}`,
            ].join('\n')
        },
    }
}
