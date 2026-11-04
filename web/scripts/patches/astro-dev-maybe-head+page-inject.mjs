#!/usr/bin/env node
/**
 * patch:astro-dev-maybe-head+page-inject — idempotent postinstall patch
 *
 * Bug: MDX/TSX pages with a frontmatter `layout:` (so the MDX wrapper's
 * Content defers to the layout's <head>) lose all dev CSS under
 * `astro dev`. Affected: web/src/pages/posts/index.mdx, web/src/pages/about/index.mdx
 *
 * Root cause (astro 6.4.8):
 *   - `@astrojs/mdx` sets `Content[needsHeadRendering] = !Boolean(frontmatter.layout)`
 *     so MDX-with-layout gets `false`.
 *   - `renderComponentToString` only captured the pre-render head (`maybeRenderHead`)
 *     when `nonAstroPageNeedsHeadInjection(Component)` was true, so for
 *     MDX-with-layout `head` stayed "".
 *   - The in-slot `maybe-head` flush still fired with `css.size=12`, but on
 *     this code path that output is concatenated into the body string via
 *     `renderChild` → `str += chunkToString(…)` after the `doctype+head`
 *     prepend gate, so it never lands in <head> and the final HTML has
 *     `data-vite-dev-id count 0`.
 *
 * Fix: capture `maybeRenderHead()` unconditionally for every `isPage` (not
 * just when `needsHeadRendering` is true). If the wrapper's styles already
 * flushed, the later layout `maybe-head` is a no-op (`hasRenderedHead`).
 *
 * Why not in `src/`? The bug is inside
 * `astro/dist/runtime/server/render/component.js` — no import in `src/`
 * reaches it. So we patch `node_modules` and reapply on `bun install`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(new URL('../', import.meta.url)))

function patch() {
    const file = join(
        ROOT,
        'node_modules/astro/dist/runtime/server/render/component.js',
    )
    let text
    try {
        text = readFileSync(file, 'utf8')
    } catch {
        console.warn(
            '[patch:astro-dev-maybe-head] skip: astro not installed (run bun install first)',
        )
        return
    }
    const sentinel = 'MDX-with-layout: inject dev CSS'
    if (
        text.includes(sentinel) ||
        text.includes('__patched_head_capture_unconditional__')
    ) {
        console.log('[patch:astro-dev-maybe-head] already patched — skipping')
        return
    }
    // Vanilla 6.4.8 has:  if (isPage && !result.partial && nonAstroPageNeedsHeadInjection(Component)) {
    // We replace that conditional with an unconditional capture.
    const vanilla =
        '  if (isPage && !result.partial && nonAstroPageNeedsHeadInjection(Component)) {\n    head += chunkToString(result, maybeRenderHead());\n  }'
    const after = [
        '  if (isPage && !result.partial) {',
        `    // ${sentinel} — patched by patch:astro-dev-maybe-head+page-inject`,
        '    // (see header comment in web/scripts/patches/astro-dev-maybe-head+page-inject.mjs)',
        '    head += chunkToString(result, maybeRenderHead());',
        '  }',
    ].join('\n')
    if (!text.includes(vanilla)) {
        console.warn(
            '[patch:astro-dev-maybe-head] vanilla needle not found — file may have been updated; skipping',
        )
        return
    }
    text = text.replace(vanilla, after)
    writeFileSync(file, text, 'utf8')
    console.log('[patch:astro-dev-maybe-head] patched component.js')
}

patch()
