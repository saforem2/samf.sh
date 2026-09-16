// BibTeX citation generation for posts and talks.
//
// Doc.astro renders a "Cite this post/talk" block at the end of every page
// that has both a title and a date (58 pages). Section index pages have no
// date, and slide decks render through SlideLayout, so neither is citable.

export type CitationKind = 'post' | 'talk'

export interface CitationInput {
    title: string
    /**
     * Frontmatter date, already normalized by the caller.
     *
     * Read the calendar fields with `citationDateParts`, never with
     * `getDate()` / `getUTCDate()` directly. The content collection types
     * this field as `z.coerce.date()`, so a bare `YYYY-MM-DD` arrives as UTC
     * midnight -- which is the PREVIOUS day in any behind-UTC zone. A build
     * in Chicago turned `2026-08-08` into `day = {07}`.
     */
    date: Date
    /** Path only, e.g. `/posts/2026/08/08/`. */
    pathname: string
    kind: CitationKind
}

/**
 * Calendar year/month/day for a frontmatter date, immune to build-zone drift.
 *
 * A date pinned at exactly UTC midnight came from a date-only string, so its
 * UTC fields ARE the authored calendar date and the local fields are a day
 * behind west of Greenwich. Anything else carries a real time and is read
 * locally, matching how `parseDocDate` anchors bare dates at local noon.
 */
export function citationDateParts(date: Date): {
    year: number
    month: string
    day: string
} {
    const midnightUTC =
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0 &&
        date.getUTCMilliseconds() === 0
    const y = midnightUTC ? date.getUTCFullYear() : date.getFullYear()
    const m = (midnightUTC ? date.getUTCMonth() : date.getMonth()) + 1
    const d = midnightUTC ? date.getUTCDate() : date.getDate()
    return {
        year: y,
        month: String(m).padStart(2, '0'),
        day: String(d).padStart(2, '0'),
    }
}

const SITE = 'https://samf.sh'
const AUTHOR = 'Sam Foreman'

/** BibTeX's built-in month macros, emitted unbraced so styles can format them. */
const MONTH_MACROS = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
]

/**
 * Words dropped when a citation key has to fall back to title words.
 * Only used for date-only URLs (`/posts/2026/08/08/`), where the path
 * carries no slug to key off.
 */
const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'of',
    'for',
    'to',
    'in',
    'on',
    'at',
    'with',
    'from',
    'is',
    'are',
    'my',
    'your',
    'our',
    'how',
    'why',
    'what',
    'using',
])

/**
 * Strip emoji, private-use glyphs and inline markdown from a title.
 *
 * 31 of the titles on this site lead with an emoji ("🔥 Building PyTorch
 * 2.6 …") and several carry backticks or math (`` `pbs-tui` ``, `$U(1)$`).
 * None of that belongs in a citation key or a rendered BibTeX title.
 */
function stripDecoration(title: string): string {
    const noEmoji = [...title]
        .filter((ch) => {
            const cp = ch.codePointAt(0) ?? 0
            // Variation selectors and ZWJ never carry meaning here.
            if (cp === 0xfe0f || cp === 0x200d) return false
            // U+2192 is kept so escapeBibtex can map it to $\rightarrow$.
            if (cp === 0x2192) return true
            // Match pictographs by Unicode property rather than a codepoint
            // cut. An earlier `cp < 0x2500` looked safe but let everything in
            // U+2190..U+24FF through, and "⏱ Comparing Launchers on Aurora"
            // shipped a literal U+23F1 into a title field, which halts a
            // pdflatex run with "Unicode character not set up for use with
            // LaTeX". Latin-1 (µ, é) is unaffected and still passes.
            if (/\p{Extended_Pictographic}/u.test(ch)) return false
            return cp < 0x2500
        })
        .join('')
    // Inline-markdown delimiters only. `_` is deliberately NOT stripped here:
    // it is legitimate inside identifiers (`50_000`, `torch_dtype`), and
    // escapeBibtex escapes it properly. Stripping it would silently corrupt
    // the text.
    return noEmoji.replace(/[`*$]/g, '').trim()
}

/** First `n` significant words of a title, hyphen-joined. */
function titleWords(title: string, n: number): string {
    const all =
        stripDecoration(title)
            .toLowerCase()
            .match(/[a-z0-9]+/g) ?? []
    const kept = all.filter((w) => !STOP_WORDS.has(w))
    return (kept.length ? kept : all).slice(0, n).join('-')
}

/**
 * Stable, human-readable citation key: `foreman<year>-<stem>`.
 *
 * The stem is the URL path minus its kind prefix and any pure-numeric date
 * segments (`/talks/openskai25/training/` -> `openskai25-training`). For
 * date-only URLs there is nothing left, so it falls back to the first three
 * significant title words.
 *
 * That is unique for 47 of 54 pages. The rest are genuine repeats (the same
 * talk given three times, two "Building PyTorch from Source" posts, and one
 * post/talk pair that share a title), so `disambiguateKeys` appends MMDD to
 * every member of a colliding group.
 */
export function citationKeyBase(input: CitationInput): string {
    const segments = input.pathname.split('/').filter(Boolean)
    // segments[0] is the kind ("posts" / "talks").
    const stemParts = segments.slice(1).filter((s) => !/^\d+$/.test(s))
    const stem = stemParts.length
        ? stemParts.join('-').toLowerCase()
        : titleWords(input.title, 3)
    const { year } = citationDateParts(input.date)
    return `foreman${year}-${stem}`.replace(/[^a-z0-9-]/g, '')
}

/**
 * Resolve a key for one page given every citable page on the site.
 *
 * Suffixing is applied per-group rather than per-index so a key never
 * changes because an unrelated page was added: a page's key depends only on
 * its own path/title/date and whether some other page shares its base.
 */
export function resolveCitationKey(
    input: CitationInput,
    allBases: readonly string[],
): string {
    const base = citationKeyBase(input)
    const shared = allBases.filter((b) => b === base).length > 1
    if (!shared) return base
    const { month, day } = citationDateParts(input.date)
    return `${base}-${month}${day}`
}

/**
 * Escape a string for a BibTeX field value.
 *
 * BibTeX treats `& % $ # _ { } ~ ^ \` as special; unescaped they either
 * break the parse or silently render wrong (`$U(1)$` flips into math mode,
 * a backtick becomes a left quote). Emoji are removed rather than escaped
 * because most LaTeX toolchains cannot typeset them at all.
 */
export function escapeBibtex(value: string): string {
    return (
        stripDecoration(value)
            // Markdown escapes in frontmatter (`numpy \> 2`) are for the MDX
            // renderer, not for us. Drop the backslash and keep the character,
            // otherwise it becomes \textbackslash{}> which is nonsense.
            .replace(/\\([<>|[\]()*_#`])/g, '$1')
            // One pass, not two. Escaping backslashes first and braces second
            // made the second pass escape the braces the first pass had just
            // emitted, turning a lone `\` into `\textbackslash\{\}`. A single
            // replace never rescans its own replacement text.
            .replace(/[&%$#_{}\\]/g, (m) =>
                m === '\\' ? '\\textbackslash{}' : `\\${m}`,
            )
            .replace(/~/g, '\\textasciitilde{}')
            .replace(/\^/g, '\\textasciicircum{}')
            .replace(/→/g, '$\\rightarrow$')
            .replace(/[—–]/g, '---')
            .replace(/[“”]/g, "''")
            .replace(/[‘’]/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
    )
}

/**
 * Build the BibTeX entry.
 *
 * Posts are `@misc` too in spirit, but `@article` with `journal` is what
 * blog-citation convention has settled on and renders sensibly in most
 * styles. Talks are `@misc` with `howpublished`, since a talk has no
 * journal.
 */
export function buildBibtex(input: CitationInput, key: string): string {
    const url = `${SITE}${input.pathname}`
    const { year, month, day } = citationDateParts(input.date)
    const title = escapeBibtex(input.title)

    const entryType = input.kind === 'talk' ? 'misc' : 'article'
    const fields: Array<[string, string]> = [
        ['author', `{${AUTHOR}}`],
        // Double braces, not single. Many .bst styles (plain, unsrt, abbrv)
        // run change.case$ on the title and would lowercase everything after
        // the first word: "Pre-Training LLMs on ALCF" -> "Pre-training llms
        // on alcf". The extra group marks the whole title as protected, so
        // acronyms (ALCF, LLM, HPC, GPU) survive verbatim.
        ['title', `{{${title}}}`],
        ['year', `{${year}}`],
        // Unbraced three-letter macro, the BibTeX convention for months. A
        // braced "{08}" renders as a literal 08 instead of "August"/"Aug"
        // per the style.
        ['month', MONTH_MACROS[Number(month) - 1] ?? `{${month}}`],
        ['day', `{${day}}`],
    ]

    // No \url{}: that macro is defined by hyperref/url, and an entry that
    // assumes it breaks any document without those packages loaded with
    // "Undefined control sequence". A bare URL is universally safe, and the
    // dedicated `url` field below is what modern styles actually read.
    if (input.kind === 'talk') {
        fields.push(['howpublished', `{Talk, ${url}}`])
    } else {
        // Straight apostrophe: a curly one would need a Unicode-aware engine.
        fields.push(['journal', `{${AUTHOR}'s Blog}`])
        fields.push(['howpublished', `{${SITE}}`])
    }
    fields.push(['url', `{${url}}`])

    const body = fields.map(([k, v]) => `    ${k} = ${v},`).join('\n')
    return `@${entryType}{${key},\n${body}\n}`
}
