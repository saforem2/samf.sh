/**
 * rehype-ansi — if ANY code block contains ANSI SGR escapes (\x1b[…m),
 * decode them into colored <span>s inside the normal bash frame.
 *
 * The idea: the Rich table dump has real ESC bytes from `script`,
 * `FORCE_COLOR=3`, or `Console(record=True)`. Instead of needing a
 * separate ```ansi fence (its own border/badge), we just detect those
 * bytes in any block and render the colors — otherwise leave the
 * block alone.
 *
 * Runs after Shiki, so rawText is inside <pre><code> with inline style
 * tokens already. We replace the code's children with ANSI-decoded spans
 * when escapes are present; the <pre> chrome stays exactly as Shiki made it.
 */

import { visit } from 'unist-util-visit'

const FG_CLASS = {
    30: 'ansi-black', 31: 'ansi-red', 32: 'ansi-green', 33: 'ansi-yellow',
    34: 'ansi-blue', 35: 'ansi-magenta', 36: 'ansi-cyan', 37: 'ansi-white',
    90: 'ansi-bright-black', 91: 'ansi-bright-red', 92: 'ansi-bright-green', 93: 'ansi-bright-yellow',
    94: 'ansi-bright-blue', 95: 'ansi-bright-magenta', 96: 'ansi-bright-cyan', 97: 'ansi-bright-white',
}
const BG_CLASS = {
    40: 'ansi-bg-black', 41: 'ansi-bg-red', 42: 'ansi-bg-green', 43: 'ansi-bg-yellow',
    44: 'ansi-bg-blue', 45: 'ansi-bg-magenta', 46: 'ansi-bg-cyan', 47: 'ansi-bg-white',
    100: 'ansi-bg-bright-black', 101: 'ansi-bg-bright-red', 102: 'ansi-bg-bright-green', 103: 'ansi-bg-bright-yellow',
    104: 'ansi-bg-bright-blue', 105: 'ansi-bg-bright-magenta', 106: 'ansi-bg-bright-cyan', 107: 'ansi-bg-bright-white',
}

const ANSI_RE = /\x1b\[([0-9;]*)m/g
const ANSI_STRIP = /\x1b\[[0-9;]*m/g

function color256(n) {
    if (n < 16) return null
    if (n < 232) {
        const v = n - 16
        const r = Math.floor(v / 36), g = Math.floor((v % 36) / 6), b = v % 6
        const to8 = (c) => (c === 0 ? 0 : 55 + c * 40)
        return `rgb(${to8(r)},${to8(g)},${to8(b)})`
    }
    const g = 8 + (n - 232) * 10
    return `rgb(${g},${g},${g})`
}

function applyParams(params, s) {
    if (params.length === 0 || (params.length === 1 && params[0] === '')) {
        s.fg = s.bg = s.fgInline = s.bgInline = null; s.bold = s.dim = false; return
    }
    let i = 0
    while (i < params.length) {
        const p = params[i] === '' ? 0 : Number(params[i])
        if (p === 0) { s.fg = s.bg = s.fgInline = s.bgInline = null; s.bold = s.dim = false }
        else if (p === 1) s.bold = true
        else if (p === 2) s.dim = true
        else if (p === 22) { s.bold = false; s.dim = false }
        else if (FG_CLASS[p]) { s.fg = FG_CLASS[p]; s.fgInline = null }
        else if (BG_CLASS[p]) { s.bg = BG_CLASS[p]; s.bgInline = null }
        else if (p === 39) { s.fg = s.fgInline = null }
        else if (p === 49) { s.bg = s.bgInline = null }
        else if (p === 38 || p === 48) {
            const isFg = p === 38, mode = Number(params[i + 1])
            if (mode === 5) {
                const n = Number(params[i + 2]), c = color256(n)
                if (c) { if (isFg) { s.fg = null; s.fgInline = c } else { s.bg = null; s.bgInline = c } }
                else if (n < 16) {
                    const code = n < 8 ? 30 + n : 90 + (n - 8)
                    if (isFg) { s.fg = FG_CLASS[code] ?? null; s.fgInline = null }
                    else { const bg = n < 8 ? 40 + n : 100 + (n - 8); s.bg = BG_CLASS[bg] ?? null; s.bgInline = null }
                }
                i += 2
            } else if (mode === 2) {
                const c = `rgb(${Number(params[i+2])},${Number(params[i+3])},${Number(params[i+4])})`
                if (isFg) { s.fg = null; s.fgInline = c } else { s.bg = null; s.bgInline = c }
                i += 4
            }
        }
        i++
    }
}
function stateClasses(s) { const o=[]; if(s.fg)o.push(s.fg); if(s.bg)o.push(s.bg); if(s.bold)o.push('ansi-bold'); if(s.dim)o.push('ansi-dim'); return o }
function stateStyle(s) { const p=[]; if(s.fgInline)p.push(`color:${s.fgInline}`); if(s.bgInline)p.push(`background-color:${s.bgInline}`); return p.length?p.join(';'):null }

function ansiToHast(raw) {
    const st = { fg:null, bg:null, fgInline:null, bgInline:null, bold:false, dim:false }
    const out=[]; let last=0; ANSI_RE.lastIndex=0; let m
    while ((m=ANSI_RE.exec(raw))!==null) {
        if (m.index>last) {
            const text=raw.slice(last,m.index), cls=stateClasses(st), style=stateStyle(st)
            out.push(cls.length||style ? { type:'element', tagName:'span', properties:{ ...(cls.length&&{className:cls}), ...(style&&{style}) }, children:[{type:'text',value:text}] } : {type:'text',value:text})
        }
        applyParams(m[1].split(';'), st); last=ANSI_RE.lastIndex
    }
    if (last<raw.length) {
        const text=raw.slice(last), cls=stateClasses(st), style=stateStyle(st)
        out.push(cls.length||style ? { type:'element', tagName:'span', properties:{ ...(cls.length&&{className:cls}), ...(style&&{style}) }, children:[{type:'text',value:text}] } : {type:'text',value:text})
    }
    return out
}

export function rehypeAnsi() {
    return (tree) => {
        visit(tree, 'element', (node) => {
            if (node.tagName !== 'pre') return
            const code = node.children?.find(c => c.tagName === 'code')
            if (!code) return
            // Collect raw text from all nested text nodes (Shiki wraps tokens in spans)
            let raw = ''
            const collect = (n) => {
                if (n.type === 'text') raw += n.value
                else if (n.children) n.children.forEach(collect)
            }
            code.children.forEach(collect)
            if (!raw || !raw.includes('\x1b[')) return

            // Verify it actually has SGR
            ANSI_STRIP.lastIndex = 0
            if (!ANSI_STRIP.test(raw)) return

            const decoded = ansiToHast(raw)
            // Wrap each logical line so box-drawing tables don't splay in flex-column
            const out=[]; let cur=[]
            const flush=()=>{ out.push({type:'element',tagName:'span',properties:{className:['ansi-line']},children: cur.length?cur:[{type:'text',value:'\n'}]}); cur=[] }
            for (const n of decoded) {
                if (n.type==='text') {
                    const parts=n.value.split('\n')
                    for (let i=0;i<parts.length;i++){ if(i>0)flush(); if(parts[i]) cur.push({type:'text',value:parts[i]}) }
                } else {
                    const txt=n.children?.[0]?.value??''
                    if (txt.includes('\n')) {
                        const parts=txt.split('\n')
                        for(let i=0;i<parts.length;i++){ if(i>0)flush(); if(parts[i]) cur.push({type:'element',tagName:'span',properties:{...n.properties},children:[{type:'text',value:parts[i]}]}) }
                    } else cur.push(n)
                }
            }
            flush()
            code.children = out
            // Tag the pre so CSS can suppress the numbered gutter on ANSI-colored blocks
            node.properties = node.properties ?? {}
            node.properties.className = [...(node.properties.className ?? []), 'ansi-block']
        })
    }
}

export function stripAnsi(s) { return s.replace(ANSI_STRIP,'') }
