/**
 * Dev harness for src/utils/rehype-notebook-cells.mjs, pass 2 (cell wrapping).
 *
 * Run it and read the tree:  node scripts/notebook-cells-harness.mjs
 *
 * The plugin binds each input <pre> to the outputs that follow it, wrapping
 * both in a .nb-cell with In[n] / Out[n] prompts. The tricky part is finding
 * the outputs: legacy Quarto exports nest div.cell-output at inconsistent
 * depths inside a wrapper div, so a naive direct-children scan misses some
 * and a naive deep scan can pull one output into two cells.
 *
 * The two shapes that pin that behavior down:
 *
 *   K  wrapper { cell-output, section { cell-output } }   mixed depth
 *   L  wrapper { cell-output, cell-output }               two direct siblings
 *
 * Both must land under a SINGLE nb-out, with the nested output kept in place.
 * The serializer prints the whole tree rather than asserting, so a regression
 * shows you what actually happened instead of just a failed boolean.
 */

import rehypeNotebookCells from '../src/utils/rehype-notebook-cells.mjs'

const el = (tagName, props, children = []) => ({
    type: 'element',
    tagName,
    properties: props,
    children,
})
const pre = (lang, txt) =>
    el('pre', { dataLanguage: lang, className: ['astro-code'] }, [
        el('code', {}, [{ type: 'text', value: txt }]),
    ])
const cellOut = (txt) =>
    el('div', { className: ['cell-output', 'cell-output-display'] }, [
        { type: 'text', value: txt },
    ])

function ser(n, d = 0) {
    const pad = '  '.repeat(d)
    if (n.type === 'text')
        return n.value.trim() ? pad + 'TEXT(' + n.value.trim() + ')\n' : ''
    const cn = n.properties?.className
    const cls = Array.isArray(cn) ? '.' + cn.join('.') : ''
    const tag = n.tagName ?? n.type
    let s = pad + tag + cls + '\n'
    for (const c of n.children ?? []) s += ser(c, d + 1)
    return s
}

function show(name, tree) {
    rehypeNotebookCells()(tree)
    console.log('='.repeat(64))
    console.log(name)
    console.log(ser(tree))
}

show('K: input + wrapper{ cellOut, section{cellOut} }', {
    type: 'root',
    children: [
        pre('python', 'print(1)'),
        el('div', {}, [
            cellOut('FIRST'),
            el('section', {}, [cellOut('SECOND')]),
        ]),
    ],
})

show('L: input + wrapper{ cellOut, cellOut } (two DIRECT siblings)', {
    type: 'root',
    children: [
        pre('python', 'print(1)'),
        el('div', {}, [cellOut('FIRST'), cellOut('SECOND')]),
    ],
})
