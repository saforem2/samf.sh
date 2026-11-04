// Shared per-reload exclusive shuffle for widget accents.
// Imported as a plain module (not is:inline) so it deduplicates if multiple
// widgets include it — idempotent guard on window.__wAcReady.

export type ShuffleOpts = {
    pool?: string[]
    selectors?: string[]
}

// Work's random accent: 7 primaries (minus blue/green, reserved for
// posts/talks) × 3 oklch variants each = 21 colors without new theme
// tokens. `oklch(from var(--x) ...)` tracks the active theme (custom-* /
// catppuccin via orange→peach etc aliases), so light/dark both get
// coherent variants — vivid/deep + soft/pastel per hue.
const _bases = ['red', 'orange', 'yellow', 'teal', 'aqua', 'purple', 'pink'] as const
const _oklch = (base: string, l: string, c: string, h = 'h') =>
    `oklch(from var(--${base}) ${l} ${c} ${h})`
const DEFAULT_POOL: readonly string[] = _bases.flatMap((b) => [
    `var(--${b})`,
    _oklch(b, 'calc(l * 0.88)', 'calc(c * 1.18)'),
    _oklch(b, 'calc(l * 1.14)', 'calc(c * 0.62)'),
])

const DEFAULT_SELECTORS = ['.work-widget'] as const

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

function resolvePool(explicit: string | null | undefined): string[] {
    if (explicit) {
        const p = explicit
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        if (p.length) return p
    }
    return [...DEFAULT_POOL]
}

export function initWidgetAccentShuffle(opts: ShuffleOpts = {}): void {
    const w = window as unknown as { __wAcReady?: boolean }
    if (w.__wAcReady) return
    w.__wAcReady = true

    const apply = () => {
        // Discover pools: if any widget declares data-accent-pool, use the first
        // explicit one; otherwise fall back to opts.pool or DEFAULT_POOL.
        const probe =
            document.querySelector<HTMLElement>('[data-accent-pool]') ??
            document.querySelector<HTMLElement>(opts.selectors?.[0] ?? DEFAULT_SELECTORS[0])
        const pool = resolvePool(
            (probe as HTMLElement | null)?.getAttribute('data-accent-pool') ?? (opts.pool ? opts.pool.join(',') : null),
        )
        const selectors = opts.selectors ?? [...DEFAULT_SELECTORS]

        // Collect live widget nodes in DOM order; skip opt-outs.
        const nodes: HTMLElement[] = []
        for (const sel of selectors) {
            for (const n of document.querySelectorAll<HTMLElement>(sel)) {
                if (n.getAttribute('data-random-accent') === 'false') continue
                nodes.push(n)
            }
        }
        if (!nodes.length) return

        // Exclusive assignment: shuffle a copy of the pool and deal one per node.
        // If more nodes than colors, reshuffle for the overflow (so duplicates
        // only appear after every color has been used once).
        let deck = shuffle(pool)
        let idx = 0
        const nextPick = () => {
            if (idx >= deck.length) {
                deck = shuffle(pool)
                idx = 0
            }
            return deck[idx++]
        }

        for (const node of nodes) {
            const pick = nextPick()
            const ref = pick
            node.style.setProperty('--widget-accent', ref)
            node.style.setProperty('--wbl-accent', ref)
            node.style.setProperty('--wbl-border', `color-mix(in srgb, ${ref} 45%, var(--background2))`)
        }
    }

    if (document.querySelector((opts.selectors ?? [...DEFAULT_SELECTORS]).join(','))) apply()
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply, { once: true })
    }
    document.addEventListener('astro:page-load', apply)
    document.addEventListener('astro:after-swap', apply)
}
