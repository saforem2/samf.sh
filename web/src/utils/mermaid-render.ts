import { PeleError, renderAsync as renderPele } from 'pele/lazy'

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
    svgClone.style.removeProperty('transform')
    svgClone.style.removeProperty('transform-origin')
    svgClone.style.removeProperty('cursor')
    svgClone.style.removeProperty('transition')
    const diagram = svg.closest<HTMLElement>('.mermaid')
    if (diagram) {
        const computedStyle = getComputedStyle(diagram)
        for (const name of [
            '--pele-bg',
            '--pele-fg',
            '--pele-muted',
            '--pele-line',
            '--pele-surface',
            '--pele-surface-alt',
            '--pele-border',
            '--pele-accent',
            '--pele-series-1',
            '--pele-series-2',
            '--pele-series-3',
            '--pele-series-4',
            '--pele-series-5',
            '--pele-series-6',
            '--pele-series-7',
            '--pele-series-8',
            '--pele-font',
            '--pele-font-mono',
            '--pele-radius',
        ]) {
            const value = computedStyle.getPropertyValue(name).trim()
            if (value) svgClone.style.setProperty(name, value)
        }
    }
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

    const svg = block.querySelector('svg:not(.pele-icon)')
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
    const mermaidSvgs = document.querySelectorAll(
        '.mermaid svg:not(.pele-icon)',
    )

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
    const mermaidBlocks = Array.from(
        document.querySelectorAll<HTMLElement>('.mermaid'),
    )
    if (mermaidBlocks.length === 0) return

    // Keep default diagrams close to the page surface. The previous
    // background2/foreground3 mapping made light-theme nodes look like gray
    // cards with washed-out connectors; use readable neutral strokes while
    // leaving semantic classes free to use the theme accent and series colors.
    const peleTheme = {
        '--pele-bg': 'var(--background0, #ffffff)',
        '--pele-fg': 'var(--foreground0, #1f1f1f)',
        '--pele-muted': 'var(--foreground2, #6e6e6e)',
        '--pele-line': 'var(--foreground2, #6e6e6e)',
        '--pele-surface': 'var(--background0, #ffffff)',
        '--pele-surface-alt': 'var(--background1, #f3f3f3)',
        '--pele-border': 'var(--foreground1, #8a8a8a)',
        '--pele-accent':
            'var(--pt-diagram-accent, var(--accent, var(--pink, #5b7bd5)))',
        '--pele-series-1': 'var(--pt-diagram-accent, var(--blue, #5b7bd5))',
        '--pele-series-2': 'var(--green, #4f9d69)',
        '--pele-series-3': 'var(--orange, #ee8f24)',
        '--pele-series-4': 'var(--pink, #ea76cb)',
        '--pele-series-5': 'var(--purple, #9b72cf)',
        '--pele-series-6': 'var(--cyan, #118cc2)',
        '--pele-series-7': 'var(--yellow, #d7a500)',
        '--pele-series-8': 'var(--red, #ee4c2c)',
        '--pele-font': 'var(--font-family, sans-serif)',
        '--pele-font-mono': 'var(--code-font-family, monospace)',
        '--pele-radius': '0',
    } as const

    let diagramSequence = 0
    const observedWidths = new WeakMap<HTMLElement, number>()
    let renderQueued = false
    let rendering = false
    let rerenderAfterCurrent = false

    const render = async () => {
        if (rendering) {
            rerenderAfterCurrent = true
            return
        }
        rendering = true
        try {
            const allNodes = Array.from(
                document.querySelectorAll<HTMLElement>('.mermaid'),
            )
            const nodes = allNodes.filter((node) => node.offsetParent !== null)
            nodes.forEach((node) => {
                const source = node.dataset.mermaid ?? node.textContent ?? ''
                if (!source.trim()) return
                node.dataset.mermaid = source
                node.dataset.interactive = 'false'
                node.classList.remove('mermaid-interactive')
                node.textContent = source
                observedWidths.set(node, node.clientWidth)
                for (const [name, value] of Object.entries(peleTheme)) {
                    node.style.setProperty(name, value)
                }
            })

            try {
                await document.fonts.ready
            } catch {
                // FontFaceSet missing or rejected — render with fallback metrics.
            }

            window.dispatchEvent(new CustomEvent('mermaid:render-start'))
            for (const node of nodes) {
                const source = node.dataset.mermaid ?? ''
                if (!source.trim()) continue
                const computedStyle = getComputedStyle(node)
                try {
                    const result = await renderPele(source, {
                        fontFamily: computedStyle.fontFamily,
                        fontFamilyMono: computedStyle.fontFamily,
                        fontSize:
                            Number.parseFloat(computedStyle.fontSize) || 16,
                        maxWidth: Math.max(node.clientWidth, 1),
                        autoDirection: true,
                        idPrefix: `pele-${++diagramSequence}`,
                    })
                    node.innerHTML = result.svg
                } catch (error) {
                    const detail =
                        error instanceof PeleError
                            ? error.message
                            : error instanceof Error
                              ? error.message
                              : String(error)
                    console.error('Pele rendering failed:', detail, {
                        node,
                        error,
                    })
                    node.textContent = `Diagram could not be rendered: ${detail}`
                }
            }
            stabilizeMermaidSvgLayout()
            window.dispatchEvent(new CustomEvent('mermaid:rendered'))
        } finally {
            rendering = false
            if (rerenderAfterCurrent) {
                rerenderAfterCurrent = false
                scheduleRender()
            }
        }
    }

    const scheduleRender = () => {
        if (renderQueued) return
        renderQueued = true
        requestAnimationFrame(() => {
            renderQueued = false
            void render()
        })
    }

    const resizeObserver = new ResizeObserver((entries) => {
        const changed = entries.some(({ target }) => {
            if (!(target instanceof HTMLElement)) return false
            const width = target.clientWidth
            const previous = observedWidths.get(target)
            observedWidths.set(target, width)
            return previous !== undefined && Math.abs(width - previous) > 1
        })
        if (changed) scheduleRender()
    })
    mermaidBlocks.forEach((block) => resizeObserver.observe(block))

    void render()

    new MutationObserver(() => scheduleRender()).observe(
        document.documentElement,
        {
            attributes: true,
            attributeFilter: ['data-webtui-theme', 'data-code-font'],
        },
    )
}
