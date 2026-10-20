import mermaid from 'mermaid'

const PAN_STEP = 40
const ZOOM_STEP = 1.2
const MIN_SCALE = 0.5
const MAX_SCALE = 8

interface ViewportState {
    scale: number
    tx: number
    ty: number
}

function applyTransform(svg: SVGElement, state: ViewportState) {
    svg.style.setProperty(
        'transform',
        `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`,
        'important',
    )
}

function clampScale(scale: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

async function copyMermaidSource(btn: HTMLButtonElement, source: string) {
    if (!source) return
    try {
        await navigator.clipboard.writeText(source)
        btn.classList.add('mc-success')
        const originalTitle = btn.title
        btn.title = 'Copied!'
        setTimeout(() => {
            btn.classList.remove('mc-success')
            btn.title = originalTitle
        }, 1200)
    } catch (error) {
        console.error('Copy failed:', error)
    }
}

function openExpandedView(svg: SVGElement, source: string) {
    document.querySelector('.mermaid-modal')?.remove()

    const modal = document.createElement('div')
    modal.className = 'mermaid-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Expanded diagram')
    modal.tabIndex = -1

    const inner = document.createElement('div')
    inner.className = 'mermaid-modal-inner'

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'mermaid-modal-close'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.title = 'Close (Esc)'

    const svgClone = svg.cloneNode(true) as SVGElement
    svgClone.removeAttribute('style')
    svgClone.style.setProperty('width', '100%', 'important')
    svgClone.style.setProperty('height', '100%', 'important')
    svgClone.style.setProperty('max-width', 'none', 'important')
    svgClone.style.setProperty('max-height', 'none', 'important')

    inner.append(closeBtn, svgClone)
    modal.appendChild(inner)
    document.body.appendChild(modal)

    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'

    const close = () => {
        modal.remove()
        document.body.style.overflow = ''
        document.removeEventListener('keydown', onKey)
        previousFocus?.focus?.()
    }

    const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            close()
        }
    }

    closeBtn.addEventListener('click', close)
    modal.addEventListener('click', (event) => {
        if (event.target === modal) close()
    })
    document.addEventListener('keydown', onKey)

    modal.focus()

    // Source is intentionally unused in the expanded view but kept for future use
    void source
}

function setupInteractiveViewport(block: HTMLElement) {
    if (block.dataset.interactive === 'true') return

    const svg = block.querySelector('svg[id^="mermaid-"]')
    if (!(svg instanceof SVGElement)) return

    block.dataset.interactive = 'true'
    block.classList.add('mermaid-interactive')

    // Wrap SVG in a viewport so overflow:hidden does not collapse the block
    // when it sits inside a flex container.
    const viewport = document.createElement('div')
    viewport.className = 'mermaid-viewport'
    svg.parentNode?.insertBefore(viewport, svg)
    viewport.appendChild(svg)

    const state: ViewportState = { scale: 1, tx: 0, ty: 0 }

    svg.style.setProperty('transform-origin', '0 0', 'important')
    svg.style.setProperty('cursor', 'grab', 'important')
    svg.style.setProperty('transition', 'transform 0.15s ease-out', 'important')

    const reset = () => {
        state.scale = 1
        state.tx = 0
        state.ty = 0
        applyTransform(svg, state)
    }

    const pan = (dx: number, dy: number) => {
        state.tx += dx
        state.ty += dy
        applyTransform(svg, state)
    }

    const zoomAt = (factor: number, originX?: number, originY?: number) => {
        const newScale = clampScale(state.scale * factor)
        if (newScale === state.scale) return

        if (originX !== undefined && originY !== undefined) {
            const rect = viewport.getBoundingClientRect()
            const cx = originX - rect.left
            const cy = originY - rect.top
            const ratio = newScale / state.scale
            state.tx = cx - (cx - state.tx) * ratio
            state.ty = cy - (cy - state.ty) * ratio
        }

        state.scale = newScale
        applyTransform(svg, state)
    }

    // Drag-to-pan
    let dragging = false
    let dragStartX = 0
    let dragStartY = 0
    let dragStartTx = 0
    let dragStartTy = 0

    const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return
        const target = event.target
        if (target instanceof Element && target.closest('.mermaid-controls')) {
            return
        }
        dragging = true
        dragStartX = event.clientX
        dragStartY = event.clientY
        dragStartTx = state.tx
        dragStartTy = state.ty
        svg.style.setProperty('cursor', 'grabbing', 'important')
        svg.style.setProperty('transition', 'none', 'important')
        try {
            svg.setPointerCapture(event.pointerId)
        } catch {
            /* ignore */
        }
        event.preventDefault()
    }

    const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return
        state.tx = dragStartTx + (event.clientX - dragStartX)
        state.ty = dragStartTy + (event.clientY - dragStartY)
        applyTransform(svg, state)
    }

    const endDrag = (event: PointerEvent) => {
        if (!dragging) return
        dragging = false
        svg.style.setProperty('cursor', 'grab', 'important')
        svg.style.setProperty(
            'transition',
            'transform 0.15s ease-out',
            'important',
        )
        try {
            svg.releasePointerCapture(event.pointerId)
        } catch {
            /* ignore */
        }
    }

    svg.addEventListener('pointerdown', onPointerDown)
    svg.addEventListener('pointermove', onPointerMove)
    svg.addEventListener('pointerup', endDrag)
    svg.addEventListener('pointercancel', endDrag)

    // Wheel-to-zoom (only when pointer is over the block)
    block.addEventListener(
        'wheel',
        (event) => {
            if (!event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
            zoomAt(factor, event.clientX, event.clientY)
        },
        { passive: false },
    )

    // Build controls
    const controls = document.createElement('div')
    controls.className = 'mermaid-controls'
    controls.setAttribute('aria-label', 'Diagram controls')

    const makeButton = (
        label: string,
        title: string,
        onClick: () => void,
        extraClass = '',
    ) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = `mermaid-ctrl ${extraClass}`.trim()
        btn.setAttribute('aria-label', title)
        btn.title = title
        btn.textContent = label
        btn.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            onClick()
        })
        return btn
    }

    // GitHub-style layout: arrows in a cross, reset in center, zoom buttons separate
    const padCluster = document.createElement('div')
    padCluster.className = 'mermaid-pad'

    const upBtn = makeButton('▲', 'Pan up', () => pan(0, PAN_STEP), 'mc-up')
    const leftBtn = makeButton(
        '◀',
        'Pan left',
        () => pan(PAN_STEP, 0),
        'mc-left',
    )
    const resetBtn = makeButton('↻', 'Reset view', reset, 'mc-reset')
    const rightBtn = makeButton(
        '▶',
        'Pan right',
        () => pan(-PAN_STEP, 0),
        'mc-right',
    )
    const downBtn = makeButton(
        '▼',
        'Pan down',
        () => pan(0, -PAN_STEP),
        'mc-down',
    )

    padCluster.append(upBtn, leftBtn, resetBtn, rightBtn, downBtn)

    const zoomCluster = document.createElement('div')
    zoomCluster.className = 'mermaid-zoom'
    const zoomInBtn = makeButton(
        '+',
        'Zoom in',
        () => zoomAt(ZOOM_STEP),
        'mc-zoom-in',
    )
    const zoomOutBtn = makeButton(
        '−',
        'Zoom out',
        () => zoomAt(1 / ZOOM_STEP),
        'mc-zoom-out',
    )
    zoomCluster.append(zoomInBtn, zoomOutBtn)

    controls.append(padCluster, zoomCluster)
    viewport.appendChild(controls)

    // Top-right cluster: expand + copy
    const topActions = document.createElement('div')
    topActions.className = 'mermaid-actions'

    const expandBtn = makeButton(
        '',
        'Expand diagram',
        () => openExpandedView(svg, block.dataset.mermaid ?? ''),
        'mc-expand',
    )
    const copyBtn = makeButton(
        '',
        'Copy diagram source',
        () => copyMermaidSource(copyBtn, block.dataset.mermaid ?? ''),
        'mc-copy',
    )
    topActions.append(expandBtn, copyBtn)
    viewport.appendChild(topActions)

    // Keyboard support when block is focused
    block.tabIndex = block.tabIndex < 0 ? 0 : block.tabIndex
    block.addEventListener('keydown', (event) => {
        if (event.target !== block) return
        switch (event.key) {
            case 'ArrowUp':
                pan(0, PAN_STEP)
                break
            case 'ArrowDown':
                pan(0, -PAN_STEP)
                break
            case 'ArrowLeft':
                pan(PAN_STEP, 0)
                break
            case 'ArrowRight':
                pan(-PAN_STEP, 0)
                break
            case '+':
            case '=':
                zoomAt(ZOOM_STEP)
                break
            case '-':
            case '_':
                zoomAt(1 / ZOOM_STEP)
                break
            case '0':
                reset()
                break
            default:
                return
        }
        event.preventDefault()
    })
}

function stabilizeMermaidSvgLayout() {
    const mermaidSvgs = document.querySelectorAll('svg[id^="mermaid-"]')

    mermaidSvgs.forEach((node) => {
        if (!(node instanceof SVGElement)) return

        const viewBox = node.getAttribute('viewBox')
        if (!viewBox) return

        const [, , widthRaw, heightRaw] = viewBox
            .trim()
            .split(/\s+/)
            .map((value) => Number(value))

        if (!Number.isFinite(widthRaw) || !Number.isFinite(heightRaw)) return
        if (widthRaw <= 0 || heightRaw <= 0) return

        node.setAttribute('width', String(widthRaw))
        node.setAttribute('height', String(heightRaw))
        node.style.setProperty('display', 'block', 'important')
        node.style.setProperty('width', '100%', 'important')
        node.style.setProperty('max-width', '100%', 'important')

        const renderedWidth =
            node.getBoundingClientRect().width ||
            node.parentElement?.getBoundingClientRect().width ||
            widthRaw
        const maxHeight = window.innerHeight * 0.5
        const naturalHeight = (renderedWidth * heightRaw) / widthRaw
        const resolvedHeight =
            Number.isFinite(naturalHeight) && naturalHeight > 0
                ? Math.min(naturalHeight, maxHeight)
                : heightRaw

        node.style.setProperty('height', `${resolvedHeight}px`, 'important')
        node.style.setProperty(
            'max-height',
            'var(--mermaid-max-height, 50vh)',
            'important',
        )
        node.style.setProperty(
            'aspect-ratio',
            `${widthRaw} / ${heightRaw}`,
            'important',
        )
        node.style.setProperty('visibility', 'visible', 'important')

        // Enlarge arrowhead markers on the fork-tax diagram: its node text
        // is bumped to 1.6em for slide-distance viewing, which leaves
        // mermaid's default 8px arrowheads (SVG markerWidth/Height attrs,
        // not stylable via CSS) looking tiny. Scale them ~1.9x once here.
        if (node.closest('#fork-tax')) {
            node.querySelectorAll('marker').forEach((marker) => {
                if (marker.getAttribute('data-scaled') === '1') return
                const w = Number(marker.getAttribute('markerWidth'))
                const h = Number(marker.getAttribute('markerHeight'))
                if (Number.isFinite(w) && w > 0)
                    marker.setAttribute('markerWidth', (w * 1.9).toFixed(1))
                if (Number.isFinite(h) && h > 0)
                    marker.setAttribute('markerHeight', (h * 1.9).toFixed(1))
                marker.setAttribute('data-scaled', '1')
            })
        }

        // Timeline readability: match the blog version — keep all grid lines
        // (they anchor every milestone to the time axis) and just hide
        // duplicate year labels. Blog does this via CSS alone
        // (.grid .tick line { stroke:…; opacity:0.6 }) — no index math.
        const mermaidBlock = node.closest<HTMLElement>('.mermaid')
        if (mermaidBlock?.closest('#timeline')) {
            const seen = new Set<string>()
            for (const g of node.querySelectorAll<SVGGElement>('g.tick')) {
                const label = g.querySelector('text')?.textContent?.trim() ?? ''
                if (!label) continue
                if (seen.has(label)) {
                    const t = g.querySelector('text')
                    if (t) t.style.display = 'none'
                } else seen.add(label)
            }
        }
        if (mermaidBlock?.closest('#timeline')) {
            for (const el of node.querySelectorAll<SVGTextElement>(
                '.critText',
            )) {
                el.style.fill = '#fff'
                el.setAttribute('fill', '#fff')
            }
            // Mermaid puts .task.crit text INSIDE the bar's <g> but
            // with dark inherited fill — force all texts inside crit
            // groups to white. Use display text query too.
            for (const g of node.querySelectorAll('g.task.crit, g.crit')) {
                g.querySelectorAll('text').forEach((t) => {
                    ;(t as SVGTextElement).style.fill = '#fff'
                    t.setAttribute('fill', '#fff')
                })
            }
            // Broader: any text whose content is the problematic label
            // and sits inside a red fill — covers label-outside-text too
            node.querySelectorAll('text').forEach((t) => {
                const txt = t.textContent?.trim() ?? ''
                if (txt === 'torchtitan/ezpz') {
                    const fill =
                        (t as SVGTextElement).style.fill ||
                        t.getAttribute('fill') ||
                        ''
                    // Only override if parent has red fill
                    const parent = t.closest('g')
                    if (
                        parent?.querySelector(
                            'rect[fill=\"#ee3b24\"], rect[style*=\"ee3b24\"]',
                        ) ||
                        parent?.classList.contains('crit')
                    ) {
                        ;(t as SVGTextElement).style.fill = '#fff'
                        t.setAttribute('fill', '#fff')
                    } else if (
                        !fill ||
                        fill === 'var(--foreground0)' ||
                        fill === '#000'
                    ) {
                        // label-outside on a crit milestone — force white with shadow context
                        ;(t as SVGTextElement).style.fill = '#fff'
                        t.setAttribute('fill', '#fff')
                    }
                }
            })
        }

        const block = node.closest('.mermaid')
        if (block instanceof HTMLElement) {
            setupInteractiveViewport(block)
        }
    })
}

export function initMermaid() {
    const mermaidBlocks = document.querySelectorAll('.mermaid')
    if (mermaidBlocks.length === 0) return

    const cssVar = (name: string, fallback = '') => {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim()
        return value || fallback
    }

    /** Resolve a CSS variable (which may contain oklch(from ...) /
     *  color-mix() / etc.) into a #rrggbb string the mermaid color parser
     *  can handle. Uses a canvas to coerce any CSS color into sRGB hex. */
    const colorProbe = document.createElement('div')
    colorProbe.style.cssText =
        'position:absolute;width:0;height:0;visibility:hidden'
    document.body.appendChild(colorProbe)
    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = colorCanvas.height = 1
    const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true })
    const toHex = (cssColor: string, fallback: string) => {
        if (!colorCtx) return fallback
        try {
            colorCtx.clearRect(0, 0, 1, 1)
            colorCtx.fillStyle = '#000'
            colorCtx.fillStyle = cssColor
            colorCtx.fillRect(0, 0, 1, 1)
            const [r, g, b] = colorCtx.getImageData(0, 0, 1, 1).data
            return `#${[r, g, b]
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('')}`
        } catch {
            return fallback
        }
    }
    const resolveColor = (varName: string, fallback: string) => {
        colorProbe.style.color = ''
        colorProbe.style.color = `var(${varName})`
        const resolved = getComputedStyle(colorProbe).color
        if (!resolved || resolved === 'rgba(0, 0, 0, 0)') return fallback
        return toHex(resolved, fallback)
    }

    const resolveMermaidFontFamily = () => cssVar('--font-family', 'monospace')
    const resolveMermaidFontSize = () => cssVar('--font-size', '16px')

    /** Build a mermaid themeVariables object from the site's CSS palette.
     *  Uses just the neutral background/foreground ramp so diagrams look
     *  like the surrounding UI; pink stays as the one accent for callouts. */
    const resolveThemeVariables = () => {
        const fg2 = resolveColor('--foreground2', '#888888')
        const fg3 = resolveColor('--foreground3', '#cccccc')
        const bg1 = resolveColor('--background1', '#f5f5f5')
        const bg2 = resolveColor('--background2', '#e5e5e5')
        const bg3 = resolveColor('--background3', '#cccccc')
        const pink = resolveColor('--pink', '#ea76cb')
        if (document.documentElement.dataset.webtuiTheme === 'pytorch') {
            const accent = resolveColor('--pt-diagram-accent', '#ee4c2c')
            const ink = resolveColor('--foreground0', '#181716')
            return {
                background: '#ffffff',
                mainBkg: '#ffffff',
                primaryColor: '#ffffff',
                primaryBorderColor: accent,
                primaryTextColor: ink,
                secondaryColor: '#ffffff',
                secondaryBorderColor: accent,
                secondaryTextColor: ink,
                tertiaryColor: '#fafafa',
                tertiaryBorderColor: ink,
                tertiaryTextColor: ink,
                lineColor: accent,
                textColor: ink,
                clusterBkg: '#fafafa',
                clusterBorder: ink,
                nodeTextColor: ink,
                nodeBorder: accent,
                edgeLabelBackground: '#ffffff',
                cScale0: accent,
                cScale1: '#181716',
                cScale2: '#ffffff',
                noteBkgColor: '#ffffff',
                noteBorderColor: accent,
                noteTextColor: ink,
            }
        }
        return {
            background: bg1,
            mainBkg: bg2,
            primaryColor: bg2,
            primaryBorderColor: fg3,
            primaryTextColor: fg2,
            secondaryColor: bg3,
            secondaryBorderColor: fg3,
            secondaryTextColor: fg2,
            tertiaryColor: bg1,
            tertiaryBorderColor: fg3,
            tertiaryTextColor: fg2,
            lineColor: fg3,
            textColor: fg2,
            // Cluster (subgraph) styling
            clusterBkg: bg1,
            clusterBorder: fg3,
            // Node text
            nodeTextColor: fg2,
            nodeBorder: fg3,
            // Edges
            edgeLabelBackground: bg1,
            // Accent (only one — keep it simple)
            cScale0: pink,
            cScale1: bg3,
            cScale2: bg2,
            // Notes
            noteBkgColor: bg2,
            noteBorderColor: fg3,
            noteTextColor: fg2,
        }
    }

    const render = async () => {
        const fontFamily = resolveMermaidFontFamily()
        await Promise.all(
            ['16px', 'bold 16px', 'italic 16px'].map((size) =>
                document.fonts.load(`${size} ${fontFamily}`),
            ),
        )
        await document.fonts.ready
        mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeVariables: resolveThemeVariables(),
            fontFamily,
            fontSize: resolveMermaidFontSize(),
            flowchart: {
                padding: 16,
            },
        })

        // Filter to visible blocks only. Hidden .mermaid blocks
        // (e.g. .cascade-mobile / .cascade-desktop CSS-toggled
        // variants) measure as 0×0 inside display:none parents,
        // which makes mermaid's layout pass produce a 0-height SVG
        // and trips the post-render stabilize → setupInteractiveViewport
        // chain (the SVG never gets its proper dimensions, controls
        // never attach). Skip them; they'll render on viewport
        // crossing the breakpoint when the resize listener fires.
        const allNodes = Array.from(
            document.querySelectorAll<HTMLElement>('.mermaid'),
        )
        const nodes = allNodes.filter(
            (n) => n.offsetParent !== null || n === document.body,
        )
        nodes.forEach((node) => {
            const source = node.dataset.mermaid
            if (!source) return
            // Re-render: drop interactive flag and existing wrapper/controls
            node.dataset.interactive = 'false'
            node.classList.remove('mermaid-interactive')
            node.removeAttribute('data-processed')
            node.textContent = source
        })

        // Wait for the body font to actually load before measuring.
        // Mermaid sizes each node's box from the text's measured width;
        // without this await, the first paint runs with the fallback
        // metrics and any subsequent swap-in of Iosevka (wider glyphs)
        // overflows the box (clipped text inside Aurora/Polaris/etc.).
        // document.fonts.ready resolves once *all* declared @font-face
        // resources finish loading, so this also covers later additions.
        try {
            if (
                document.fonts &&
                typeof document.fonts.ready?.then === 'function'
            ) {
                await document.fonts.ready
            }
        } catch {
            // FontFaceSet missing or rejected — render anyway.
        }

        // Render each node independently so one failure doesn't poison
        // the batch — if e.g. stateDiagram-v2 dynamic-chunk fetch fails
        // (vite "Outdated Optimize Dep" in dev), the flowcharts on the
        // same page still render *and* get their post-process pass.
        const logError = (error: unknown, node: HTMLElement) => {
            const err = error as { message?: string; str?: string } | undefined
            const detail =
                err?.message ??
                err?.str ??
                (typeof error === 'string' ? error : '') ??
                ''
            const fallback = (() => {
                try {
                    return JSON.stringify(error)
                } catch {
                    return String(error)
                }
            })()
            console.error('Mermaid rendering failed:', detail || fallback, {
                node,
                error,
            })
        }
        // Serial, not parallel — mermaid 11.x generates SVG IDs from a
        // per-run() counter snapshotted at call start. Two parallel run()s
        // grab the same counter value and emit colliding SVG ids, which
        // breaks downstream querySelector('svg[id^="mermaid-"]') lookups
        // (only the first match wins, the rest never get viewport/controls).
        for (const node of nodes) {
            try {
                await mermaid.run({ nodes: [node] })
            } catch (error) {
                logError(error, node)
            }
        }
        // Always run the post-render pass — partial successes still need
        // their inline-style overrides and interactive viewport wiring.
        stabilizeMermaidSvgLayout()
    }

    render()

    new MutationObserver(() => {
        render()
    }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-webtui-theme'],
    })

    // Re-render when the mobile breakpoint is crossed (e.g. user
    // resizes window or rotates device) — the previously-hidden
    // variant needs its layout pass now that it's visible.
    const mq = window.matchMedia('(max-width: 768px)')
    const onBreakpoint = () => render()
    if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', onBreakpoint)
    } else {
        // Safari < 14 fallback
        // @ts-expect-error deprecated API
        mq.addListener(onBreakpoint)
    }
}
