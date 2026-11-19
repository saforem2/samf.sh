interface Scene {
    id: string
    duration: number
    kicker: string
    title: string
    detail: string
    note: string
    event: string
}

interface Point {
    x: number
    y: number
}

interface Palette {
    text: string
    muted: string
    background: string
    cyan: string
    purple: string
    orange: string
    green: string
    red: string
    /** One hue per batch shard, resolved from the theme's badge accents. */
    shards: string[]
}

const scenes: Scene[] = [
    {
        id: 'batch',
        duration: 5500,
        kicker: 'Training · step 3003',
        title: 'One batch, eight hosts',
        detail: 'Each host receives a shard and computes its gradients.',
        note: 'The colored blocks represent work moving through the run.',
        event: 'step 3003 · distributing batch shards',
    },
    {
        id: 'sync',
        duration: 6000,
        kicker: 'Training · step 3003',
        title: 'The collective completes',
        detail: 'Gradients go out and return synchronized across all eight hosts.',
        note: 'The optimizer step can finish when the collective does.',
        event: 'step 3003 · synchronizing gradients',
    },
    {
        id: 'save',
        duration: 5000,
        kicker: 'Checkpoint',
        title: 'Save the finished step',
        detail: 'The trainer saves checkpoint 3003 to shared storage.',
        note: 'This example assumes a checkpoint at step 3003.',
        event: 'step 3003 · saving checkpoint',
    },
    {
        id: 'stall',
        duration: 10000,
        kicker: 'Training · step 3004',
        title: 'One host goes silent',
        detail: 'Seven hosts reach the collective. The eighth stops responding.',
        note: 'The idle clock is accelerated from 0 to 30 minutes.',
        event: 'step 3004 · waiting for host-041',
    },
    {
        id: 'timeout',
        duration: 4500,
        kicker: 'Watchdog',
        title: 'No output for 30 min',
        detail: 'The idle watchdog ends the attempt with exit 124.',
        note: 'The timeout is the default and can be configured.',
        event: 'idle watchdog · exit 124',
    },
    {
        id: 'swap',
        duration: 6500,
        kicker: 'Retry',
        title: 'Rotate in a spare',
        detail: 'A blind retry replaces the first active host with a spare.',
        note: 'In this example it happens to be the stalled host. A blind rotation is a guess.',
        event: 'blind rotation · host-041 → spare-007',
    },
    {
        id: 'restore',
        duration: 6500,
        kicker: 'Relaunch',
        title: 'Reload the checkpoint',
        detail: 'The trainer restores checkpoint 3003 on the new host list.',
        note: 'The unfinished step is run again.',
        event: 'relaunch · loading checkpoint 3003',
    },
    {
        id: 'batch-retry',
        duration: 5500,
        kicker: 'Training · step 3004',
        title: 'A fresh batch goes out',
        detail: 'The replacement run restarts step 3004 from the checkpoint.',
        note: 'The unfinished step is replayed from the saved state.',
        event: 'step 3004 · distributing batch shards',
    },
    {
        id: 'resume',
        duration: 6000,
        kicker: 'Training · step 3004',
        title: 'The collective completes',
        detail: 'All eight hosts participate and step 3004 completes.',
        note: 'Training continues from the saved checkpoint.',
        event: 'step 3004 · synchronizing gradients',
    },
    {
        id: 'done',
        duration: 3500,
        kicker: 'Training resumed',
        title: 'Back to training',
        detail: 'The replacement host joins the same distributed run.',
        note: 'If retries cannot continue, the launcher returns an error.',
        event: 'step 3004 complete · training continues',
    },
]

const width = 960
const height = 520
const busY = 260
const sourceX = 132
const collectiveX = 743
const ranks = [
    { x: 220, y: 145, name: 'host-041' },
    { x: 355, y: 145, name: 'host-042' },
    { x: 490, y: 145, name: 'host-043' },
    { x: 625, y: 145, name: 'host-044' },
    { x: 220, y: 337, name: 'host-045' },
    { x: 355, y: 337, name: 'host-046' },
    { x: 490, y: 337, name: 'host-047' },
    { x: 625, y: 337, name: 'host-048' },
]

/** Batch-shard hues come straight from the theme's badge accent tokens. */
const shardTokens = [
    '--red',
    '--orange',
    '--yellow',
    '--green',
    '--teal',
    '--blue',
    '--purple',
    '--pink',
]

function relativeLuminance(cssColor: string) {
    const m = cssColor.match(/[\d.]+/g)
    if (!m || m.length < 3) return 0.5
    const [r, g, b] = m
        .slice(0, 3)
        .map(Number)
        .map((v) => {
            const c = v / 255
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function shardTextColor(cssColor: string) {
    return relativeLuminance(cssColor) > 0.35 ? '#0b0b0b' : '#f5f5f5'
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (value: number) => {
    const p = clamp(value)
    return p * p * (3 - 2 * p)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function rgbParts(cssColor: string) {
    const m = cssColor.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const parts = m[1].split(',').map((n) => Number.parseFloat(n))
    if (parts.length < 3 || parts.some(Number.isNaN)) return null
    return parts.slice(0, 3) as [number, number, number]
}

/** Interpolate two rgb() colors; falls back to `to` when either side is not rgb(). */
function mixColor(from: string, to: string, t: number) {
    const a = rgbParts(from)
    const b = rgbParts(to)
    const k = clamp(t)
    if (!a || !b) return k < 0.5 ? from : to
    const c = a.map((v, i) => Math.round(lerp(v, b[i], k)))
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function cubic(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    progress: number,
): Point {
    const t = clamp(progress)
    const inverse = 1 - t
    return {
        x:
            inverse ** 3 * a.x +
            3 * inverse ** 2 * t * b.x +
            3 * inverse * t ** 2 * c.x +
            t ** 3 * d.x,
        y:
            inverse ** 3 * a.y +
            3 * inverse ** 2 * t * b.y +
            3 * inverse * t ** 2 * c.y +
            t ** 3 * d.y,
    }
}

function polygon(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    opacity: number,
) {
    ctx.save()
    ctx.globalAlpha = opacity
    ctx.beginPath()
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
}

function host(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    opacity = 1,
) {
    const left = x - size * 0.45
    const top = y - size * 0.27
    const faceWidth = size * 0.76
    const faceHeight = size * 0.65
    const depth = size * 0.14
    polygon(
        ctx,
        [
            { x: left, y: top },
            { x: left + depth, y: top - depth },
            { x: left + faceWidth + depth, y: top - depth },
            { x: left + faceWidth, y: top },
        ],
        color,
        opacity * 0.4,
    )
    polygon(
        ctx,
        [
            { x: left + faceWidth, y: top },
            { x: left + faceWidth + depth, y: top - depth },
            { x: left + faceWidth + depth, y: top + faceHeight - depth },
            { x: left + faceWidth, y: top + faceHeight },
        ],
        color,
        opacity * 0.23,
    )
    ctx.save()
    ctx.fillStyle = color
    ctx.globalAlpha = opacity * 0.16
    ctx.fillRect(left, top, faceWidth, faceHeight)
    ctx.globalAlpha = opacity * 0.9
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, size * 0.016)
    ctx.strokeRect(left, top, faceWidth, faceHeight)
    for (let i = 0; i < 3; i++) {
        const rowTop = top + (faceHeight * i) / 3
        const center = rowTop + faceHeight / 6
        if (i > 0) {
            ctx.beginPath()
            ctx.moveTo(left, rowTop)
            ctx.lineTo(left + faceWidth, rowTop)
            ctx.stroke()
        }
        ctx.fillRect(
            left + size * 0.07,
            center - size * 0.018,
            size * 0.036,
            size * 0.036,
        )
        ctx.beginPath()
        ctx.moveTo(left + size * 0.2, center)
        ctx.lineTo(left + size * 0.57, center)
        ctx.stroke()
    }
    ctx.restore()
}

function batchGrid(
    ctx: CanvasRenderingContext2D,
    shards: string[],
    x: number,
    y: number,
) {
    const tile = 21
    const gap = 3
    const left = x - (tile * 4 + gap * 3) / 2
    const top = y - (tile * 2 + gap) / 2
    ctx.save()
    ctx.lineWidth = 1
    for (let row = 0; row < 2; row++) {
        for (let column = 0; column < 4; column++) {
            const index = row * 4 + column
            const tileX = left + column * (tile + gap)
            const tileY = top + row * (tile + gap)
            ctx.globalAlpha = 0.32
            ctx.fillStyle = shards[index]
            ctx.fillRect(tileX, tileY, tile, tile)
            ctx.globalAlpha = 0.95
            ctx.strokeStyle = shards[index]
            ctx.strokeRect(tileX, tileY, tile, tile)
            ctx.globalAlpha = 1
            ctx.fillStyle = shardTextColor(shards[index])
            ctx.font = '700 12px ' + ctx.canvas.dataset.font
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(
                String(index),
                tileX + tile / 2,
                tileY + tile / 2 + 0.5,
            )
        }
    }
    ctx.restore()
}

function label(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    size = 17,
    weight = 400,
    align: CanvasTextAlign = 'center',
) {
    ctx.save()
    ctx.fillStyle = color
    ctx.font = weight + ' ' + size + 'px ' + ctx.canvas.dataset.font
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
    ctx.restore()
}

function line(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    opacity = 0.35,
    dashed = false,
) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.globalAlpha = opacity
    ctx.lineWidth = 1.4
    ctx.setLineDash(dashed ? [5, 6] : [])
    ctx.beginPath()
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
    })
    ctx.stroke()
    ctx.restore()
}

function curve(
    ctx: CanvasRenderingContext2D,
    points: [Point, Point, Point, Point],
    color: string,
    opacity = 0.45,
) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.globalAlpha = opacity
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 6])
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    ctx.bezierCurveTo(
        points[1].x,
        points[1].y,
        points[2].x,
        points[2].y,
        points[3].x,
        points[3].y,
    )
    ctx.stroke()
    ctx.restore()
}

function alongRoute(
    rank: Point,
    amount: number,
    direction: 'in' | 'out',
): Point {
    const endY = rank.y < busY ? rank.y + 45 : rank.y - 22
    const verticalLength = Math.abs(endY - busY)
    const horizontalLength =
        direction === 'in' ? rank.x - sourceX : collectiveX - rank.x
    const distance = clamp(amount) * (verticalLength + horizontalLength)
    if (direction === 'in') {
        if (distance < horizontalLength)
            return { x: sourceX + distance, y: busY }
        return {
            x: rank.x,
            y: lerp(busY, endY, (distance - horizontalLength) / verticalLength),
        }
    }
    if (distance < verticalLength)
        return { x: rank.x, y: lerp(endY, busY, distance / verticalLength) }
    return { x: rank.x + distance - verticalLength, y: busY }
}

function packet(
    ctx: CanvasRenderingContext2D,
    point: Point,
    color: string,
    label?: string,
) {
    ctx.save()
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.28
    ctx.fillRect(point.x - 10, point.y - 10, 20, 20)
    ctx.globalAlpha = 1
    ctx.lineWidth = 1.5
    ctx.strokeRect(point.x - 9, point.y - 9, 18, 18)
    if (label !== undefined) {
        ctx.fillStyle = color
        ctx.font = '700 11px ' + ctx.canvas.dataset.font
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, point.x, point.y + 0.5)
    }
    ctx.restore()
}

function delayed(progress: number, index: number) {
    return clamp((progress - index * 0.035) / 0.72)
}

function readableClock(seconds: number) {
    const minutes = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0')
    const remainder = Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')
    return minutes + ':' + remainder
}

function draw(
    ctx: CanvasRenderingContext2D,
    palette: Palette,
    scene: Scene,
    rawProgress: number,
    reducedMotion: boolean,
    compact: boolean,
) {
    const p = reducedMotion ? (rawProgress < 0.5 ? 0 : 1) : rawProgress
    const id = scene.id
    const failed = id === 'stall' || id === 'timeout'
    const swapping = id === 'swap'
    const swapped =
        id === 'restore' ||
        id === 'resume' ||
        id === 'done' ||
        id === 'batch-retry'
    const stopped = id === 'timeout' || swapping
    // host-041 fades into red over the opening of the stall instead of
    // snapping red on scene entry; it holds through the timeout and swap.
    const failRamp =
        id === 'stall' ? smooth(clamp(p / 0.18)) : failed || swapping ? 1 : 0
    // Opacity eases instead of snapping at scene boundaries: stall ramps the
    // healthy ranks down over the scene, timeout/swap hold them, restore
    // eases everybody back up as the checkpoint lands. With motion reduced
    // `p` is already quantised to 0/1, so this collapses to the old snap.
    const healthyOpacity =
        id === 'stall'
            ? lerp(0.95, 0.45, smooth(p))
            : id === 'timeout' || id === 'swap'
              ? 0.45
              : id === 'restore'
                ? lerp(0.45, 0.95, smooth(clamp(p / 0.45)))
                : 0.95
    const gradient = id === 'sync' || id === 'resume'
    const signal =
        failed || swapping
            ? palette.orange
            : gradient || id === 'batch-retry'
              ? palette.purple
              : palette.cyan
    const checkpoint = [
        'save',
        'stall',
        'timeout',
        'swap',
        'restore',
        'resume',
        'batch-retry',
        'done',
    ].includes(id)
    const saveDone = id !== 'save' || p > 0.78
    // A packet is "in" when its own delayed() ramp completes — the same test
    // the packet renderer uses — so the pips and the count can never run
    // ahead of the animation.
    const packetArrived = (i: number) =>
        id === 'stall'
            ? i > 0 && delayed(p * 1.85, i) >= 1
            : id === 'batch-retry'
              ? delayed(p, i) >= 1
              : id === 'sync' || id === 'resume'
                ? delayed(p / 0.6, i) >= 1
                : false
    const packetScene =
        id === 'stall' ||
        id === 'sync' ||
        id === 'resume' ||
        id === 'batch-retry'
    const collectiveProgress = packetScene
        ? ranks.reduce((n, _, i) => n + (packetArrived(i) ? 1 : 0), 0)
        : id === 'save' || id === 'done'
          ? 8
          : 0
    // Batch-retry pips colour by shard (each host's own shard) rather than the
    // collective-result hue, so the panel reads as "shards arriving", not "gradients in".
    const batchRetry = id === 'batch-retry'

    ctx.clearRect(0, 0, width, height)

    label(ctx, 'training hosts', 415, 51, palette.muted, compact ? 27 : 21, 700)
    label(
        ctx,
        id === 'batch' || id === 'sync' || id === 'save'
            ? 'step 3003'
            : 'step 3004',
        415,
        79,
        palette.text,
        compact ? 29 : 23,
        700,
    )

    line(
        ctx,
        [
            { x: sourceX, y: busY },
            { x: collectiveX, y: busY },
        ],
        palette.muted,
        0.35,
    )
    for (const [index, rank] of ranks.entries()) {
        const endY = rank.y < busY ? rank.y + 45 : rank.y - 22
        // host-041's link is up — it just carries nothing. Dashed + faint.
        const silent = id === 'stall' && index === 0
        line(
            ctx,
            [
                { x: rank.x, y: endY },
                { x: rank.x, y: busY },
            ],
            palette.muted,
            silent ? 0.18 : 0.3,
            silent,
        )
    }

    const checkpointPath: [Point, Point, Point, Point] = [
        { x: 625, y: 385 },
        { x: 635, y: 436 },
        { x: 706, y: 449 },
        { x: 767, y: 440 },
    ]
    const sparePath: [Point, Point, Point, Point] = [
        { x: 146, y: 433 },
        { x: 140, y: 350 },
        { x: 135, y: 120 },
        { x: 220, y: 145 },
    ]
    const restorePath: [Point, Point, Point, Point] = [
        { x: 767, y: 440 },
        { x: 698, y: 441 },
        { x: 685, y: 300 },
        { x: 743, y: 260 },
    ]
    if (id === 'save') curve(ctx, checkpointPath, palette.green)
    if (id === 'restore') curve(ctx, restorePath, palette.green)
    if (swapping) curve(ctx, sparePath, palette.green, 0.75)

    // The eight batch cells travel to the eight hosts. On the retry attempt
    // the same source batch is redistributed after restore.
    batchGrid(ctx, palette.shards, 69, 255)
    label(ctx, 'batch', 69, 331, palette.text, compact ? 30 : 25, 700)
    label(ctx, '8 shards', 69, 354, palette.muted, compact ? 22 : 17)

    // This box represents the collective operation, not a dedicated server.
    ctx.save()
    ctx.strokeStyle = signal
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.9
    ctx.strokeRect(744, 215, 178, 95)
    ctx.globalAlpha = 0.08
    ctx.fillStyle = signal
    ctx.fillRect(744, 215, 178, 95)
    ctx.restore()
    label(
        ctx,
        compact ? 'sync' : 'gradient sync',
        833,
        238,
        palette.text,
        compact ? 30 : 21,
        700,
    )
    for (let i = 0; i < 8; i++) {
        ctx.save()
        if (packetScene) {
            const shardIndex = id === 'stall' ? (i === 0 ? -1 : i) : i
            const arrived = batchRetry ? delayed(p, i) >= 1 : packetArrived(i)
            ctx.fillStyle =
                arrived && shardIndex >= 0
                    ? palette.shards[shardIndex]
                    : palette.muted
            ctx.globalAlpha = arrived ? 0.95 : 0.24
        } else {
            ctx.fillStyle = i < collectiveProgress ? signal : palette.muted
            ctx.globalAlpha = i < collectiveProgress ? 0.95 : 0.24
        }
        ctx.fillRect(767 + i * 17, 263, 10, 10)
        ctx.restore()
    }
    const arrived = collectiveProgress
    const count = stopped
        ? compact
            ? 'stopped'
            : 'attempt stopped'
        : arrived + ' / 8 in'
    label(ctx, count, 833, 292, palette.text, compact ? 27 : 18, 700)

    if (id === 'stall') {
        // Seven healthy hosts tick waiting-for-you clocks; the stalled one is frozen red.
        for (let i = 1; i < ranks.length; i++) {
            const label_ = readableClock(p * 1800)
            const iy = ranks[i].y < busY ? ranks[i].y - 34 : ranks[i].y + 88
            label(
                ctx,
                label_,
                ranks[i].x,
                iy,
                palette.muted,
                compact ? 18 : 15,
                700,
            )
        }
    }

    let idleLabel = 'output flowing'
    let idleColor = palette.muted
    if (id === 'stall') {
        idleLabel = 'idle ' + readableClock(p * 1800)
        idleColor = palette.orange
    } else if (id === 'timeout') {
        idleLabel = 'idle 30:00'
        idleColor = palette.orange
    } else if (swapping || id === 'restore') {
        idleLabel = 'relaunching'
    }
    if (id === 'timeout') {
        label(
            ctx,
            compact ? 'exit 124' : 'watchdog · exit 124',
            833,
            166,
            palette.orange,
            compact ? 27 : 20,
            700,
        )
    }
    label(ctx, idleLabel, 833, 190, idleColor, compact ? 25 : 22, 700)

    // The saved file remains visible through the failed attempt.
    ctx.save()
    ctx.fillStyle = palette.green
    ctx.strokeStyle = palette.green
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(767, 415)
    ctx.lineTo(797, 415)
    ctx.lineTo(807, 425)
    ctx.lineTo(807, 466)
    ctx.lineTo(767, 466)
    ctx.closePath()
    // Idle checkpoint: barely there until the step-3003 save actually begins,
    // then it ramps up with the write and stays solid for the rest of the run.
    const checkpointAlpha =
        id === 'save'
            ? lerp(0.12, 0.95, smooth(clamp(p / 0.78)))
            : checkpoint
              ? 0.95
              : 0.12
    ctx.globalAlpha = checkpointAlpha * 0.16
    ctx.fill()
    ctx.globalAlpha = checkpointAlpha
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(797, 415)
    ctx.lineTo(797, 425)
    ctx.lineTo(807, 425)
    ctx.moveTo(776, 435)
    ctx.lineTo(798, 435)
    ctx.moveTo(776, 442)
    ctx.lineTo(798, 442)
    ctx.moveTo(776, 449)
    ctx.lineTo(791, 449)
    ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = checkpoint ? 1 : 0.35
    label(
        ctx,
        compact ? 'ckpt' : 'checkpoint',
        820,
        430,
        checkpoint && saveDone ? palette.green : palette.muted,
        compact ? 28 : 20,
        700,
        'left',
    )
    label(
        ctx,
        checkpoint && saveDone
            ? compact
                ? '3003'
                : 'step 3003'
            : compact
              ? '3002'
              : 'step 3002',
        820,
        454,
        palette.text,
        compact ? 24 : 18,
        400,
        'left',
    )
    ctx.restore()

    const swapProgress = swapping ? smooth((p - 0.16) / 0.65) : 0
    const spareOnTheMove = swapping && swapProgress > 0 && swapProgress < 1
    const spareInSlot = swapped || (swapping && swapProgress >= 1)
    const spareInDock = !swapped && (!swapping || swapProgress === 0)

    if (spareInDock) {
        // Idling spare: barely there until the rotation actually calls it up.
        host(ctx, 146, 433, 50, palette.green, 0.22)
        label(ctx, 'spare-007', 146, 482, palette.muted, compact ? 26 : 20, 700)
        label(ctx, 'standby', 146, 502, palette.muted, compact ? 20 : 16)
    } else if (swapping || swapped) {
        label(
            ctx,
            compact ? '041 rotated out' : 'host-041 rotated out',
            146,
            488,
            palette.muted,
            compact ? 23 : 18,
        )
    }

    // Fill each host from its own delivery state, never from the scene id
    // alone: neutral until a colored packet actually lands on it. Passes:
    //   batch shard -> all-reduce result -> checkpoint restore.
    // State is a function of p and scene only, so frames never flicker.
    const allReduceLanded = (i, phase, offset) =>
        delayed((p - offset) / phase, i) >= 1
    const hostColorFor = (i: number) => {
        if (id === 'batch')
            return delayed(p, i) >= 1 ? palette.shards[i] : palette.muted
        if (id === 'batch-retry')
            // The replacement host (slot 0) is still checkpoint-green until
            // its shard lands; the rest are green from the restore as well.
            return delayed(p, i) >= 1 ? palette.shards[i] : palette.green
        // Flip each host only when its all-reduce packet lands (delayed()
        // already staggers ranks), so purple sweeps through one host at a time.
        if (id === 'sync')
            return allReduceLanded(i, 0.4, 0.6)
                ? palette.purple
                : palette.shards[i]
        // Step 3004 re-runs the all-reduce on the restored ranks. Restore
        // leaves every host green, so resume flips each green host to purple
        // as its packet lands; never routing back through shard colors.
        if (id === 'resume')
            return allReduceLanded(i, 0.4, 0.6) ? palette.purple : palette.green
        if (id === 'done') return palette.purple
        // Restore: checkpoint bytes arrive per rank; the step-3003 purple is
        // still the last completed state until a rank's shard is restored, at
        // which point it shows green. After restore completes every host is
        // green (checkpoint), not purple, and resume re-derives purple.
        if (id === 'restore')
            return p > 0.45 && delayed((p - 0.45) / 0.55, i) >= 1
                ? palette.green
                : palette.purple
        // save/stall/timeout/swap: step 3003's all-reduce already landed.
        return palette.purple
    }
    // Draw hosts above their connections so the lines don't cross the blocks.
    ranks.forEach((rank, index) => {
        const badHost = index === 0
        if (badHost && swapping && swapProgress > 0) {
            const moved = smooth(Math.min(1, swapProgress * 2))
            host(
                ctx,
                rank.x - moved * 75,
                rank.y - moved * 27,
                80,
                palette.red,
                0.7 * (1 - moved * 0.75),
            )
        } else if (!(badHost && (swapping || swapped))) {
            const hostColor =
                badHost && (failed || swapping)
                    ? mixColor(hostColorFor(index), palette.red, failRamp)
                    : hostColorFor(index)
            const opacity = healthyOpacity
            host(ctx, rank.x, rank.y, 80, hostColor, opacity)
        }
        if (badHost && spareInSlot)
            // The spare inherits the failed slot. It takes its shard colour
            // when the redistributed batch lands on rank 0, flips to purple
            // once the all-reduce reaches it, and stays purple from then on.
            host(
                ctx,
                rank.x,
                rank.y,
                80,
                (id === 'resume' && allReduceLanded(0, 0.4, 0.6)) ||
                    id === 'done'
                    ? palette.purple
                    : id === 'batch-retry' && delayed(p, 0) >= 1
                      ? palette.shards[0]
                      : palette.green,
                1,
            )
        // Same eased opacity as everywhere else in the stall arc; drawing a
        // second, more opaque red pass here popped brighter at swap entry.
        if (badHost && swapping && swapProgress === 0)
            host(
                ctx,
                rank.x,
                rank.y,
                80,
                mixColor(hostColorFor(0), palette.red, 1),
                healthyOpacity,
            )
    })

    if (spareOnTheMove) {
        const point = cubic(...sparePath, swapProgress)
        // Grow into the slot's footprint so arrival doesn't pop in size.
        host(
            ctx,
            point.x,
            point.y,
            lerp(60, 80, swapProgress),
            palette.green,
            lerp(0.22, 1, smooth(swapProgress)),
        )
        label(
            ctx,
            compact ? 'spare' : 'spare-007',
            point.x,
            point.y + 49,
            palette.green,
            compact ? 26 : 18,
            700,
        )
    }

    if (id === 'batch' || id === 'batch-retry') {
        ranks.forEach((rank, index) => {
            const progress = delayed(p, index)
            if (progress > 0 && progress < 1)
                packet(
                    ctx,
                    alongRoute(rank, progress, 'in'),
                    palette.shards[index],
                    String(index),
                )
        })
    }

    if (id === 'sync' || id === 'resume' || id === 'stall') {
        ranks.forEach((rank, index) => {
            if (id === 'stall' && index === 0) return
            const outbound = delayed(id === 'stall' ? p * 1.85 : p / 0.6, index)
            if (outbound > 0 && outbound < 1)
                packet(
                    ctx,
                    alongRoute(rank, outbound, 'out'),
                    palette.shards[index],
                    String(index),
                )
            if (id !== 'stall' && p >= 0.6) {
                const inbound = delayed((p - 0.6) / 0.4, index)
                if (inbound > 0 && inbound < 1)
                    // All-reduced gradient is identical on every rank: one hue, no shard label.
                    packet(
                        ctx,
                        alongRoute(rank, 1 - inbound, 'out'),
                        palette.purple,
                    )
            }
        })
    }

    if (id === 'save') {
        if (p < 0.8)
            packet(
                ctx,
                cubic(...checkpointPath, smooth(p / 0.8)),
                palette.green,
            )
        const written = Math.min(1, p / 0.8)
        const mb = Math.round(412 * written)
        const barX = 767,
            barY = 474,
            barW = 118,
            barH = 5
        ctx.save()
        ctx.fillStyle = palette.muted
        ctx.globalAlpha = 0.35
        ctx.fillRect(barX, barY, barW, barH)
        ctx.globalAlpha = 1
        ctx.fillStyle = palette.green
        ctx.fillRect(barX, barY, barW * written, barH)
        ctx.restore()
        label(
            ctx,
            mb + ' / 412 MB',
            barX + barW / 2,
            barY + 17,
            palette.muted,
            compact ? 16 : 13,
            600,
        )
    }
    if (id === 'restore') {
        const q = clamp(p / 0.45)
        if (q < 1) packet(ctx, cubic(...restorePath, smooth(q)), palette.green)
        if (p > 0.45) {
            ranks.forEach((rank, index) => {
                const progress = delayed((p - 0.45) / 0.55, index)
                if (progress > 0 && progress < 1) {
                    // Re-enter the fabric at the right and follow it back to each host.
                    packet(
                        ctx,
                        alongRoute(rank, 1 - progress, 'out'),
                        palette.green,
                    )
                }
            })
        }
    }

    // Keep labels readable when a shard passes along the host connection.
    ranks.forEach((rank, index) => {
        const affected = index === 0
        const name =
            affected && spareInSlot
                ? 'spare-007'
                : affected && swapping && swapProgress > 0
                  ? 'open slot'
                  : rank.name
        const displayedName = compact
            ? name.replace('host-', '').replace('spare-007', 'spare')
            : name
        const size = compact ? 29 : 22
        const labelY = rank.y + 65
        ctx.save()
        ctx.font = '700 ' + size + 'px ' + ctx.canvas.dataset.font
        const labelWidth = ctx.measureText(displayedName).width + 8
        ctx.fillStyle = palette.background
        ctx.fillRect(
            rank.x - labelWidth / 2,
            labelY - size * 0.65,
            labelWidth,
            size * 1.3,
        )
        ctx.restore()
        label(
            ctx,
            displayedName,
            rank.x,
            labelY,
            affected && failed ? palette.red : palette.text,
            size,
            700,
        )
        if (affected && id === 'stall') {
            label(
                ctx,
                compact ? 'stalled' : 'unresponsive',
                rank.x,
                rank.y + 87,
                palette.red,
                compact ? 24 : 18,
                700,
            )
            // Node is alive; it just never sends. Heartbeat ticks, bytes don't.
            const beat = 0.5 + 0.5 * Math.sin(p * Math.PI * 8)
            // 'size' 80 matches the host() call; LED sits in the first slot.
            const ledX = rank.x - 80 * 0.45 + 80 * 0.07 + 80 * 0.018
            const ledY = rank.y - 80 * 0.27 + (80 * 0.65) / 6
            ctx.save()
            ctx.globalAlpha = 0.25 + 0.75 * beat
            ctx.fillStyle = palette.green
            ctx.shadowColor = palette.green
            ctx.shadowBlur = 6 + 6 * beat
            ctx.beginPath()
            ctx.arc(ledX + 2, ledY, 3.4, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
            label(
                ctx,
                'heartbeat · 0 B/s',
                rank.x,
                rank.y + 107,
                palette.muted,
                compact ? 15 : 12,
                600,
            )
        }
    })
}

/** Resolve a custom property to a concrete color via a probe element. */
function resolveColor(root: HTMLElement, name: string, fallback: string) {
    const probe = document.createElement('span')
    probe.style.cssText =
        'position:absolute;visibility:hidden;background-color:var(' +
        name +
        ', ' +
        fallback +
        ')'
    root.appendChild(probe)
    const resolved = getComputedStyle(probe).backgroundColor
    probe.remove()
    return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : fallback
}

function paletteFor(root: HTMLElement): Palette {
    const style = getComputedStyle(root)
    const color = (name: string, fallback: string) =>
        style.getPropertyValue(name).trim() || fallback
    const shards = shardTokens.map((token) =>
        resolveColor(root, token, '#888888'),
    )
    return {
        text: color('--foreground0', '#262626'),
        muted: color('--foreground2', '#777777'),
        background: color('--background0', '#ffffff'),
        cyan: color('--sc-cyan', '#00779f'),
        purple: color('--sc-purple', '#7048a8'),
        orange: color('--sc-orange', '#c55500'),
        green: color('--sc-green', '#187a43'),
        red: color('--sc-pink', '#c21f63'),
        shards,
    }
}

export function initTrainingReplay(root: HTMLElement) {
    const canvas = root.querySelector<HTMLCanvasElement>(
        '[data-training-canvas]',
    )
    const controls = root.querySelector<HTMLElement>('[data-controls]')
    const play = root.querySelector<HTMLButtonElement>('[data-play]')
    const previous = root.querySelector<HTMLButtonElement>('[data-previous]')
    const next = root.querySelector<HTMLButtonElement>('[data-next]')
    const seek = root.querySelector<HTMLInputElement>('[data-seek]')
    const progress = root.querySelector<HTMLElement>('[data-progress]')
    const kicker = root.querySelector<HTMLElement>('[data-kicker]')
    const title = root.querySelector<HTMLElement>('[data-title]')
    const detail = root.querySelector<HTMLElement>('[data-detail]')
    const note = root.querySelector<HTMLElement>('[data-note]')
    const eventText = root.querySelector<HTMLElement>('[data-event]')
    if (
        !canvas ||
        !controls ||
        !play ||
        !previous ||
        !next ||
        !seek ||
        !progress ||
        !kicker ||
        !title ||
        !detail ||
        !note ||
        !eventText
    )
        return
    const context = canvas.getContext('2d')
    if (!context) return

    const slide = root.closest<HTMLElement>('[is-~="slide"]')
    const deck = root.closest<HTMLElement>('[is-~="presentation"]')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const offsets: number[] = []
    let total = 0
    for (const scene of scenes) {
        offsets.push(total)
        total += scene.duration
    }

    let time = 0
    let playing = false
    let started = false
    let previousTimestamp: number | undefined
    let animationFrame = 0
    let lastScene = -1
    let palette = paletteFor(root)
    const isCurrent = () =>
        !!slide?.hasAttribute('data-current') && deck?.dataset.mode === 'deck'

    function sceneIndex() {
        return Math.max(
            0,
            offsets.findLastIndex((offset) => time >= offset),
        )
    }

    function render() {
        const index = sceneIndex()
        const scene = scenes[index]
        const fraction = clamp((time - offsets[index]) / scene.duration)
        root.dataset.scene = scene.id
        root.dataset.playing = String(playing)
        root.dataset.time = String(Math.round(time))
        if (index !== lastScene) {
            kicker!.textContent = scene.kicker
            title!.textContent = scene.title
            detail!.textContent = scene.detail
            note!.textContent = scene.note
            eventText!.textContent = scene.event
            lastScene = index
        }
        play!.textContent = playing
            ? 'Pause'
            : time >= total
              ? 'Replay'
              : time > 0
                ? 'Continue'
                : 'Play'
        previous!.setAttribute('aria-disabled', String(index === 0))
        next!.setAttribute('aria-disabled', String(index === scenes.length - 1))
        seek!.value = String(Math.round((time / total) * 1000))
        seek!.setAttribute(
            'aria-valuetext',
            scene.title + ', scene ' + (index + 1) + ' of ' + scenes.length,
        )
        progress!.textContent = index + 1 + ' / ' + scenes.length

        const rect = canvas!.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        const pixelWidth = Math.round(rect.width * ratio)
        const pixelHeight = Math.round(rect.height * ratio)
        if (canvas!.width !== pixelWidth || canvas!.height !== pixelHeight) {
            canvas!.width = pixelWidth
            canvas!.height = pixelHeight
        }
        canvas!.dataset.font = getComputedStyle(root).fontFamily
        context!.setTransform(
            pixelWidth / width,
            0,
            0,
            pixelHeight / height,
            0,
            0,
        )
        draw(
            context!,
            palette,
            scene,
            fraction,
            reduced.matches,
            rect.width < 500,
        )
    }

    function pause() {
        if (!playing) return
        playing = false
        previousTimestamp = undefined
        cancelAnimationFrame(animationFrame)
        render()
    }

    function tick(timestamp: number) {
        if (!playing) return
        if (previousTimestamp !== undefined)
            time += timestamp - previousTimestamp
        previousTimestamp = timestamp
        if (time >= total) {
            time = total
            playing = false
            previousTimestamp = undefined
        }
        render()
        if (playing) animationFrame = requestAnimationFrame(tick)
    }

    function start() {
        if (!isCurrent()) return
        if (time >= total) time = 0
        started = true
        playing = true
        previousTimestamp = undefined
        render()
        animationFrame = requestAnimationFrame(tick)
    }

    function seekTo(value: number) {
        pause()
        time = Math.max(0, Math.min(total, value))
        render()
    }

    play.addEventListener('click', () => {
        if (playing) pause()
        else start()
    })
    previous.addEventListener('click', () => {
        const index = sceneIndex()
        if (index > 0) seekTo(offsets[index - 1])
    })
    next.addEventListener('click', () => {
        const index = sceneIndex()
        if (index < scenes.length - 1) seekTo(offsets[index + 1])
    })
    seek.addEventListener('input', () =>
        seekTo((Number(seek.value) / 1000) * total),
    )
    controls.addEventListener('keydown', (event) => {
        if (!isCurrent()) return
        if (
            event.key === ' ' ||
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowRight'
        ) {
            event.stopPropagation()
        }
    })

    function onVisibilityChange() {
        if (!isCurrent() || document.hidden) {
            pause()
            return
        }
        palette = paletteFor(root)
        render()
        if (!started && !reduced.matches) start()
    }

    const visibilityObserver = new MutationObserver(onVisibilityChange)
    if (slide)
        visibilityObserver.observe(slide, { attributeFilter: ['data-current'] })
    if (deck)
        visibilityObserver.observe(deck, { attributeFilter: ['data-mode'] })
    const themeObserver = new MutationObserver(() => {
        palette = paletteFor(root)
        render()
    })
    themeObserver.observe(document.documentElement, {
        attributeFilter: ['data-webtui-theme'],
    })
    const resizeObserver = new ResizeObserver(() => render())
    resizeObserver.observe(canvas)
    document.addEventListener('visibilitychange', onVisibilityChange)
    reduced.addEventListener('change', () => {
        if (reduced.matches) pause()
        render()
    })

    controls.hidden = false
    render()
    requestAnimationFrame(onVisibilityChange)
}
