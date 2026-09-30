// Slice a chrome trace to a [t0,t1] window (absolute us).
//
//   node web/scripts/slice-trace.mjs <in.json> <out.json> <t0_us> <t1_us>
//        [--keep-flows] [--max-depth N] [--drop-cat a,b]
//
// Events overlapping the window are CLAMPED to it, not just kept: Perfetto
// fits its initial viewport to the trace extent, so a single un-clamped span
// (e.g. the whole-run "PyTorch Profiler" span) would zoom the view back out to
// the full trace and defeat the slice. Flow ('f'/'s'/'t') events are dropped by
// default -- at 135k of them they render as a solid smear.
import fs from 'node:fs'
const [inp, outp, a, b] = process.argv.slice(2)
const keepFlows = process.argv.includes('--keep-flows')
const argvFlag = (n, d) => {
    const i = process.argv.indexOf(`--${n}`)
    return i >= 0 ? process.argv[i + 1] : d
}
// PyTorch's CPU op tree is ~15 levels deep. Rendered in full it eats the whole
// viewport and pushes the XPU Stream rows below the fold, which is exactly the
// comparison the slide needs. --max-depth keeps only the top N nesting levels
// per thread, computed from actual ts/dur containment.
const maxDepth = Number(argvFlag('max-depth', 0))
const dropCats = new Set(
    (argvFlag('drop-cat', '') || '').split(',').filter(Boolean),
)
// The XPU backend registers ~100 one-shot XCCL init streams that carry a
// single event each. Perfetto gives every one of them a full-height row, which
// pushes the rows that matter off-screen. --min-events drops a (pid,tid) track
// (and its thread_name metadata) below the threshold.
const minEvents = Number(argvFlag('min-events', 0))
const t0 = Number(a),
    t1 = Number(b)
const d = JSON.parse(fs.readFileSync(inp, 'utf8'))
const ev = d.traceEvents
const out = []
let dropped = 0,
    clamped = 0
for (const e of ev) {
    if (e.ph === 'M') {
        out.push(e)
        continue
    }
    if (!keepFlows && (e.ph === 'f' || e.ph === 's' || e.ph === 't')) {
        dropped++
        continue
    }
    if (e.ph === 'i' || e.ph === 'I') {
        if (e.ts >= t0 && e.ts <= t1) out.push(e)
        else dropped++
        continue
    }
    const s = e.ts,
        en = e.ts + (e.dur || 0)
    if (en < t0 || s > t1) {
        dropped++
        continue
    }
    if (s < t0 || en > t1) {
        const ns = Math.max(s, t0),
            ne = Math.min(en, t1)
        out.push({ ...e, ts: ns, dur: Math.max(1, ne - ns) })
        clamped++
    } else out.push(e)
}
let final = out
if (dropCats.size) {
    const before = final.length
    final = final.filter((e) => e.ph === 'M' || !dropCats.has(e.cat))
    console.log(`   drop-cat removed ${before - final.length}`)
}
if (maxDepth > 0) {
    // depth per (pid,tid) by a sweep over start-sorted X events
    const byTid = new Map()
    for (const e of final) {
        if (e.ph !== 'X') continue
        const k = `${e.pid}/${e.tid}`
        if (!byTid.has(k)) byTid.set(k, [])
        byTid.get(k).push(e)
    }
    const deep = new Set()
    for (const [, arr] of byTid) {
        arr.sort((x, y) => x.ts - y.ts || (y.dur || 0) - (x.dur || 0))
        const stack = []
        for (const e of arr) {
            const end = e.ts + (e.dur || 0)
            while (stack.length && stack[stack.length - 1] <= e.ts) stack.pop()
            if (stack.length >= maxDepth) deep.add(e)
            stack.push(end)
        }
    }
    const before = final.length
    final = final.filter((e) => !deep.has(e))
    console.log(`   max-depth ${maxDepth} removed ${before - final.length}`)
}
if (minEvents > 0) {
    const n = new Map()
    for (const e of final)
        if (e.ph === 'X') {
            const k = `${e.pid}/${e.tid}`
            n.set(k, (n.get(k) || 0) + 1)
        }
    const keep = new Set(
        [...n].filter(([, c]) => c >= minEvents).map(([k]) => k),
    )
    const before = final.length
    final = final.filter((e) => {
        const k = `${e.pid}/${e.tid}`
        if (e.ph === 'M' && e.name === 'thread_name') return keep.has(k)
        if (e.ph === 'M') return true
        return keep.has(k)
    })
    console.log(
        `   min-events ${minEvents}: kept ${keep.size}/${n.size} tracks, removed ${before - final.length} events`,
    )
}
d.traceEvents = final
fs.writeFileSync(outp, JSON.stringify(d))
console.log(
    `${outp}: kept ${d.traceEvents.length}/${ev.length} (dropped ${dropped}, clamped ${clamped}), window ${((t1 - t0) / 1000).toFixed(2)} ms, ${(fs.statSync(outp).size / 1e6).toFixed(1)} MB`,
)
