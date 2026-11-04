// Promoted from WidgetFrameShowcase showcase — now default on home.
// Injects .wbl-frame-badge + .wbl-about-chip per widget card.

function mountFrameBadges(root: Element) {
    const grid = root.querySelector('#widgets-grid')
    if (!grid) return
    const cards = grid.querySelectorAll<HTMLElement>(':scope > [tabindex="0"]')
    for (const card of cards) {
        if (card.querySelector(':scope > .wbl-frame-badge')) continue
        const src =
            card.querySelector<HTMLElement>(
                '.ww-title, .pw-title, .tw-title, .ip-title, .iw-about-title, h1 [is-="badge"]',
            ) ?? card.querySelector<HTMLElement>('[is-="badge"]')
        const label = (src?.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (!label) continue
        const badge = document.createElement('a')
        badge.className = 'wbl-frame-badge'
        const link = src?.querySelector<HTMLAnchorElement>('a[href]')
        if (link?.href) {
            badge.href = link.href
            if (link.target) badge.target = link.target
            if (link.rel) badge.rel = link.rel
        } else {
            badge.href = '#'
            badge.addEventListener('click', (e) => e.preventDefault())
            badge.style.cursor = 'default'
        }
        const hasInnerAnchor = !!src?.querySelector('a[href]')
        if (src && hasInnerAnchor) {
            let html = ''
            src.childNodes.forEach((n) => {
                if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'A') {
                    html += (n as HTMLElement).innerHTML.trim()
                } else if (n.nodeType === Node.ELEMENT_NODE) {
                    html += (n as HTMLElement).outerHTML
                } else if (n.nodeType === Node.TEXT_NODE) {
                    const t = (n.textContent ?? '').replace(/\s+/g, '')
                    if (t) html += t
                }
            })
            html = html.replace(/<\/u>\s+/g, '</u>')
            badge.innerHTML = html.trim()
            if (!badge.innerHTML) badge.textContent = label.replace(/\s+/g, ' ').trim()
        } else if (src?.querySelector('u')) {
            badge.innerHTML = src.innerHTML.replace(/<\/u>\s+/g, '</u>')
        } else if (label) {
            badge.textContent = label.replace(/\s+/g, ' ').trim()
        } else if (src) {
            let html = ''
            src.childNodes.forEach((n) => {
                if (n.nodeType === Node.ELEMENT_NODE) html += (n as HTMLElement).outerHTML
                else if (n.nodeType === Node.TEXT_NODE) {
                    const t = (n.textContent ?? '').replace(/\s+/g, ' ')
                    if (t.trim()) html += t
                }
            })
            badge.innerHTML = html.trim() || label
        }
        card.prepend(badge)

        if (card.id === 'intro-widget' && !card.querySelector(':scope > .wbl-about-chip')) {
            const cta = card.querySelector<HTMLAnchorElement>('.iw-title-about')
            if (cta?.href) {
                const chip = document.createElement('a')
                chip.className = 'wbl-about-chip'
                chip.href = cta.getAttribute('href') ?? '/about'
                chip.textContent = (cta.textContent ?? '[a]bout →').trim().replace(/\s+/g, ' ')
                card.prepend(chip)
            }
        }
    }
}

function wireHoverDim(grid: HTMLElement) {
    if (grid.dataset.wblHoverDim === 'true') return
    grid.dataset.wblHoverDim = 'true'
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(':scope > [tabindex="0"]'))
    const update = () => {
        const vimActive = grid.querySelector('[data-vim-focused="true"]')
        if (vimActive) {
            grid.removeAttribute('data-wbl-hover')
            return
        }
        const hovered = cards.find((c) => c.matches(':hover'))
        if (hovered) grid.setAttribute('data-wbl-hover', 'true')
        else grid.removeAttribute('data-wbl-hover')
    }
    grid.addEventListener('mouseenter', update, true)
    grid.addEventListener('mouseleave', update, true)
    grid.addEventListener('mousemove', update)
}

export function initWidgetFrame() {
    const grid = document.getElementById('widgets-grid') as HTMLElement | null
    if (!grid) return
    if (!grid.classList.contains('home-grid')) return
    mountFrameBadges(document)
    wireHoverDim(grid)
}

// Auto-init on import (Widgets.astro imports this module)
initWidgetFrame()
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidgetFrame, { once: true })
}
document.addEventListener('astro:page-load', initWidgetFrame)
document.addEventListener('astro:after-swap', initWidgetFrame)
