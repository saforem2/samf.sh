# Cloudflare Pages — setup

Source of truth for the dashboard-only build settings (Cloudflare Pages
doesn't read a `pages.toml` or similar; settings live in the project
dashboard at https://dash.cloudflare.com → Workers & Pages → sam-onl →
Settings → Build).

Mirrors what `netlify.toml` used to encode.

## Project settings

| Setting                | Value                                            |
| ---------------------- | ------------------------------------------------ |
| **Production branch**  | `main`                                           |
| **Build command**      | `bun install --frozen-lockfile && npx playwright install chromium && bun run build` |
| **Build output**       | `web/dist`                                       |
| **Root directory**     | (project root, leave blank)                      |
| **Framework preset**   | None (auto-detect picks Astro, also fine)        |

> **Note:** the explicit `bun install --frozen-lockfile` at the front of
> the build command is required. Unlike Netlify, Cloudflare Pages does
> NOT auto-run `bun install` before invoking the build command —
> without it, `turbo` (a devDependency) is not on PATH and the build
> fails with `turbo: command not found`.

## Environment variables

| Name                          | Value | Notes                                      |
| ----------------------------- | ----- | ------------------------------------------ |
| `NODE_VERSION`                | `22`  | match local                                |
| `NODE_OPTIONS`                | `--max-old-space-size=4096` | bigger heap for mermaid+sharp |
| `PLAYWRIGHT_BROWSERS_PATH`    | `0`   | install Chromium into node_modules so CF's build cache catches it |

## Headers / redirects

- **Headers** live in `web/public/_headers` — copied verbatim into
  `web/dist/_headers` by Astro's build. CF Pages reads it natively.
- **No redirects** currently; if needed, add `web/public/_redirects`.

## Scrape Shield — Email Obfuscation (render-blocking script)

Cloudflare's **Email Address Obfuscation** (Scrape Shield) rewrites any
`mailto:` in the HTML into an encoded blob and injects
`/cdn-cgi/scripts/.../email-decode.min.js` to decode it client-side. That
script is **render-blocking** and shows up in Lighthouse's render-blocking
list (~1.2 KiB, ~150ms on Slow 4G) even though it is not in this repo — CF
adds it at the edge. The site has one `mailto:` (`sf@omg.lol`, in
`about/index.mdx`), which is what triggers it.

To remove it from the critical path, turn the feature off:
**dashboard → the zone (sam.onl) → Scrape Shield → Email Address
Obfuscation → Off.** (It is a zone/Scrape-Shield setting, not a Pages
build setting, so there is no file to change — it must be toggled in the
dashboard.) Trade-off: the raw `mailto:` address becomes scrapeable by
bots again. Low stakes for a single `omg.lol` alias; leave it on if you'd
rather keep the obfuscation and eat the ~150ms.

## Skip-build keyword

Netlify recognized `[skip netlify]`. **Cloudflare uses `[CI Skip]`** (or
`[Skip CI]`, `[CI-Skip]`, `[Skip-CI]`, `[skip-ci]`, case-insensitive).
Commit message convention going forward:

    style(prose): tweak callout border [CI Skip]

Multiple back-to-back skip commits still skip — CF doesn't try to batch.

## DNS cutover

DNS is already on Cloudflare (per project memory). To cut over:

1. In the Pages project, add `sam.onl` (and `www.sam.onl`) as custom
   domains. Cloudflare will offer to add the DNS records automatically
   since the zone is in the same account.
2. Wait for the SSL cert to provision (~minutes).
3. Confirm `https://sam.onl` resolves to CF Pages.
4. Delete the site in Netlify (or leave it — it'll just stop receiving
   traffic).

## Preview deploys

CF Pages opens a preview deploy per PR by default; URL pattern:
`https://<commit-sha>.sam-onl.pages.dev` (or `<branch>.sam-onl.pages.dev`
for branch deploys). GitHub PR check posts a link automatically.

### Why the previews still say `sam-onl`

The project was created as `sam-onl` during the Netlify cutover, before
the domain became `samf.sh`. The `*.pages.dev` subdomain is derived from
the **project name**, which is fixed at creation: Cloudflare's known
issues page states that "`*.pages.dev` subdomains currently cannot be
changed," and the only workaround offered is to delete the project and
create a new one. There is no dashboard setting and no API field.

Purely cosmetic. `samf.sh` serves 200 from Pages, `sam.onl` 301s to it,
and `Layout.astro` already emits a canonical `samf.sh` URL on every page
so the preview hosts are not split-indexed. Recreating the project would
mean re-adding both custom domains and all five env vars, and would open
a window where `samf.sh` has no origin (a custom domain cannot point at
two Pages projects at once). Not worth it for a string in a preview URL.

### Putting a preview on `samf.sh` (not currently set up)

If a stable preview hostname is ever wanted, Pages supports pointing a
custom domain at **one branch**, via
https://developers.cloudflare.com/pages/how-to/custom-branch-aliases/:

1. Push a successful deployment on the branch first: the alias does not
   exist until then.
2. Pages project → **Custom domains** → **Setup a custom domain** →
   `preview.samf.sh` → Continue → Activate.
3. In the **samf.sh** zone's DNS, edit the CNAME Pages just created,
   retargeting it from `sam-onl.pages.dev` to
   `<branch-alias>.sam-onl.pages.dev`. Branch aliases are lowercased with
   non-alphanumerics replaced by hyphens, so `fix/api` is `fix-api`.

What this does **not** buy, all verified against the docs:

- **No wildcard.** "It is currently not possible to add a custom domain
  with a wildcard, for example, `*.domain.com`." One hostname plus one
  CNAME per branch, capped at 100 custom domains per project on Free.
  Note this prohibition lives only on the known-issues page, not on the
  custom-domains page where you would look for it.
- **Per-commit hash URLs stay on `pages.dev`.** Only branch aliases can
  be retargeted, so `<sha>.sam-onl.pages.dev` is unaffected. A custom
  preview domain is an additional surface, not a replacement.
- **The record must be proxied (orange cloud).** With an unproxied
  record or an external DNS provider, the setup does not error: it
  silently serves the *production* branch on the preview hostname.

Gotchas if it is ever set up:

- **Access does not cover it.** The Pages "Enable access policy" toggle
  protects only the generated `*.pages.dev` preview URLs;
  `preview.samf.sh` would be public unless a separate self-hosted Access
  application is created in Zero Trust. Ordering matters: Pages refuses
  to add a custom domain that *already* has an Access policy, so add the
  domain first, then the policy.
- **`noindex` should already be there.** Cloudflare adds
  `X-Robots-Tag: noindex` to every preview deployment by default, and
  the docs attach it to the deployment rather than the hostname, so it
  ought to follow onto the custom domain. No doc confirms this for
  custom domains specifically, so verify with `curl -I` and only add a
  `_headers` rule if it is genuinely missing.
- **Cookie scope changes.** `preview.samf.sh` shares a registrable
  domain with `samf.sh`, so a `Domain=.samf.sh` cookie reaches both.
  (Today's previews are *not* isolated from each other either: only bare
  `pages.dev` is on the Public Suffix List, so every preview is a
  subdomain of `sam-onl.pages.dev` and shares its jar. The PSL entry
  buys cross-tenant isolation, not preview-vs-production isolation.)
- **Zone rules now apply.** A proxied record inside the zone inherits
  its Cache Rules and security stack; Cloudflare warns custom caching on
  a Pages domain can serve stale assets.
- **Dashboard may block step 3.** An open docs issue
  (cloudflare/cloudflare-docs#31078) reports the Pages-created CNAME is
  no longer editable in the current dashboard. There is no wrangler
  command for this, so the API may be the only path.

### Candidate workflow: `dev` as the working branch (not set up)

The natural fit for the above is one long-lived branch rather than a
domain per feature branch: `main` stays production, all work lands on
`dev`, `preview.samf.sh` always shows dev's latest build, and a
`dev` -> `main` PR ships. Checked against the docs; it holds up.

A stale `dev` already exists on origin (`c7807d9`, 2026-03-09, 777
commits behind main). Adopting it is a **reset to main, not a merge** —
a force-push, so it needs an explicit go-ahead.

Why it fits here:

- **The alias is stable.** A branch alias binds to the branch, not to a
  deployment; Pages re-points it at each new build automatically. A
  failed build leaves it serving the last good one. No expiry.
- **Build cost is a wash.** Today a change costs 2 builds (feature
  branch + merge to main); under this model it also costs 2 (push to
  dev + merge to main). It only gets worse if pushes stop being
  batched — worth watching, given the burst commit pattern (15 in a day
  on 2026-08-14).
- **It can cost *less*.** Settings > Builds > Branch control > Preview:
  pick **Custom branches**, Include = `dev`, leave Exclude **empty**
  (the docs' Example 1 pattern; their stated Excludes-then-Includes
  precedence contradicts their own Example 3, so include-only is the
  unambiguous config). Every other branch then stops building. Leave
  "Enable automatic production branch deployments" checked so `main`
  keeps deploying.
- **Env vars are a non-issue for this project.** Pages scopes variables
  separately for Preview and Production, and a mismatch is the usual
  trap. Ours are already Preview-scoped (branch previews build and
  serve 200) and all three are build-time only — no secrets, no
  bindings, no datastores. So the standard "never mirror production
  secrets into preview" warning does not bite; there is nothing
  sensitive to leak. Re-check this if a binding or secret is ever added.
- **`noindex` is already correct.** Verified live: a branch preview
  returns `x-robots-tag: noindex`, production does not.

Order of operations, if this is ever done:

1. Reset `dev` to `main` and push; wait for one **green** dev build.
   The alias does not exist until a successful deployment does.
2. Add `preview.samf.sh` as a Pages custom domain, activate it, and only
   then retarget its CNAME to `dev.sam-onl.pages.dev`.
3. Verify it serves **dev**, not production. A 200 is not proof: an
   unproxied record or a missing dev deployment both fall back to the
   production branch silently. Diff against a known dev-only string.
4. Set the branch controls above.

Two ways to break it later: excluding `dev` from preview builds (the
alias freezes and quietly serves stale content), and
`wrangler pages deployment delete --force` against dev's head, which is
the one documented way to destroy an aliased deployment. Also note that
branches skipped by branch controls produce **no GitHub check run** — if
a branch protection rule ever requires the Cloudflare check, remove it
first or those PRs will hang forever.

## Build minutes / quotas

| Tier        | Free                                            |
| ----------- | ----------------------------------------------- |
| Builds      | 500 per month (was Netlify's 300)               |
| Concurrency | 5 (was 1)                                       |
| Bandwidth   | Unlimited (was 100 GB/month)                    |
| Sites       | Unlimited                                       |

Reset at the start of each calendar month, UTC.

## Google Analytics (GA4) — dashboard steps after the samf.sh rename

The GA tag is wired in `web/src/layouts/Layout.astro` (measurement ID
`G-RD883HJ1J2`). A GA4 measurement ID is **not** domain-locked — the tag
collects from whatever host runs it, and the data-stream "website URL"
is informational (it drives the "Visit site" link and the default page
path, not an allowlist). Verified after cutover: samf.sh page_view
beacons are accepted (`dl=https://samf.sh/…` → HTTP 204). So no code
change was needed for the domain move.

Two dashboard-only cleanups remain (GA Admin at
https://analytics.google.com → Admin, for the property containing
`G-RD883HJ1J2`). Neither blocks collection; they keep the reports
labelled correctly:

1. **Rename the data stream + property** from `sam.onl` to `samf.sh`.
   Admin → Data streams → the web stream → update the stream URL/name;
   and Admin → Property details → property name. Cosmetic, but fixes the
   "Visit site" link and enhanced-measurement link decoration.
2. **Check for a hostname Data Filter.** Admin → Data settings → Data
   filters. If an "include only hostname = sam.onl" filter was ever
   added, it would silently drop samf.sh hits despite the 204. Off by
   default and rarely configured — but this is the one place a real
   domain-binding could hide, so confirm there isn't one (or update it
   to samf.sh).

> **Note:** analytics were separately broken by a `requestIdleCallback`
> loader bug (fixed in the commit that added this section) — the
> deferred gtag.js was never injected on browsers supporting
> requestIdleCallback. That was unrelated to the domain; see
> `Layout.astro`'s `scheduleIdle` helper.
