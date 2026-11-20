export interface ReplayFrame {
    state: string
    message: string
    duration: number
}

export function mountReplay<Frame extends ReplayFrame>(
    replay: HTMLElement,
    frames: readonly Frame[],
    update?: (frame: Frame) => void,
) {
    if (frames.length === 0) return
    const example = replay.querySelector<HTMLElement>('[data-replay-footer]')
    const controls = replay.querySelector<HTMLElement>('[data-replay-controls]')
    const previous = replay.querySelector<HTMLButtonElement>('[data-prev]')
    const play = replay.querySelector<HTMLButtonElement>('[data-play]')
    const next = replay.querySelector<HTMLButtonElement>('[data-next]')
    const message = replay.querySelector<HTMLElement>('[data-message]')
    const position = replay.querySelector<HTMLElement>('[data-position]')
    if (
        !example ||
        !controls ||
        !previous ||
        !play ||
        !next ||
        !message ||
        !position
    )
        return

    const slide = replay.closest('[is-~="slide"]')
    const deck = replay.closest('[is-~="presentation"]')
    const isCurrent = () =>
        slide?.hasAttribute('data-current') &&
        deck?.getAttribute('data-mode') === 'deck'
    const last = frames.length - 1
    let index = 0
    let playing = false
    let timer: number | undefined

    const render = () => {
        const frame = frames[index]
        replay.dataset.state = frame.state
        replay.dataset.playing = String(playing)
        update?.(frame)
        message.textContent = frame.message
        position.textContent = `${index + 1}/${frames.length}`
        previous.setAttribute('aria-disabled', String(index === 0))
        next.setAttribute('aria-disabled', String(index === last))
        play.textContent = playing
            ? 'Pause'
            : index === last
              ? 'Replay'
              : index === 0
                ? 'Play replay'
                : 'Continue'
    }

    function tick() {
        if (index === last) playing = false
        render()
        if (playing) {
            timer = window.setTimeout(() => {
                index++
                tick()
            }, frames[index].duration)
        }
    }

    function step(direction: number) {
        const target = index + direction
        if (target < 0 || target > last) return
        window.clearTimeout(timer)
        playing = false
        index = target
        render()
    }

    play.addEventListener('click', () => {
        window.clearTimeout(timer)
        playing = !playing
        if (playing && index === last) index = 0
        tick()
    })
    previous.addEventListener('click', () => step(-1))
    next.addEventListener('click', () => step(1))
    controls.addEventListener('keydown', (event) => {
        if (!isCurrent()) return
        // The deck handles Space and arrows globally.
        if (event.key === ' ') event.stopPropagation()
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.stopPropagation()
        step(event.key === 'ArrowRight' ? 1 : -1)
    })

    const pauseWhenHidden = new MutationObserver(() => {
        if (isCurrent() || !playing) return
        window.clearTimeout(timer)
        playing = false
        render()
    })
    if (slide)
        pauseWhenHidden.observe(slide, {
            attributeFilter: ['data-current'],
        })
    if (deck) pauseWhenHidden.observe(deck, { attributeFilter: ['data-mode'] })

    render()
    example.hidden = false
}
