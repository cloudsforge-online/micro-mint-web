/**
 * The sitemap and robots.txt nginx serves, regenerated and compared.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE BODIES ARE IN nginx.conf AT ALL
 *
 * A sitemap must carry ABSOLUTE URLs — the spec requires it and a crawler discards a relative
 * `<loc>` — and nothing built in this repository may name a hostname, because one image is served
 * from localhost, from a preview deployment and from `create.<apex>`. That is the same rule
 * `test/no-build-time-config.test.ts` enforces over the source tree, and a sitemap file in
 * `public/` could not obey it.
 *
 * nginx is the component that can. It has `$host` on every request, so the bodies are composed per
 * request from a config file with no hostname in it, and the artefact stays environment-free.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY THAT NEEDS THIS TEST
 *
 * A body pasted into a config file is a copy. This repository has just been bitten by exactly that
 * class of drift in the other direction: `index.html`'s meta description and og:description said
 * "pay in Shards" for two days after SHARD was retired and every RENDERED screen had been
 * corrected, because `test/retired-currency.test.ts` reads rendered text on purpose and therefore
 * never looked at the shell. The two strings a stranger reads before arriving were the last two
 * saying the wrong thing about money.
 *
 * So the block in nginx.conf is treated as GENERATED OUTPUT that happens to live in a config file:
 * robots.txt is regenerated from `@cloudsforge/ui/sitemap` and compared byte for byte, the
 * environment map is compared against the registry's own `ENV_LABELS`, and the sitemap is composed
 * from this repository's route table rather than read back to itself.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT THE ESTATE SITEMAP, WHICH `site` SERVES
 *
 * `sitemapXml()` composes every sibling surface as `<subdomain>.<host>`, which is right on the
 * apex and wrong here: `$host` is already `create.<apex>`, so it would emit
 * `foresight.create.cloudsforge.online` — a three-label name nothing serves and that Cloudflare's
 * one-label wildcard certificate cannot complete a handshake for. A sitemap of unreachable
 * addresses is worse than none, because a crawler handed dead URLs by a site's own index discounts
 * the ones that work. This surface therefore lists only its own public routes, and the assertions
 * below check both halves of that: what is present, and that no sibling subdomain crept in.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ENV_LABELS } from '@cloudsforge/ui'
import { robotsTxt } from '@cloudsforge/ui/sitemap'
import { ROUTES } from '../src/lib/routes.ts'
import { BASE, publicPath } from '../src/lib/routes.ts'

const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')

/**
 * The addresses this surface may honestly invite a crawler to.
 *
 * Read off `ROUTES` rather than typed here. A route is listed when it is PUBLIC — gated routes
 * render a sign-in redirect to a crawler — and when it is NOT a wildcard: `/projects/<uuid>` is
 * public and is the address this product exists to have read, but the set of them is unbounded and
 * known only to the service, and `/projects` itself renders the not-found page.
 */
const PUBLIC_PATHS: readonly string[] = ROUTES.filter((r) => r.public && !r.wildcard).map(
  (r) => r.path,
)

/** The single-quoted body of a `return 200 '…';` inside an exact-match location. */
function servedBody(path: string): string {
  const block = new RegExp(
    `location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`,
  ).exec(nginx)
  assert.ok(block, `nginx.conf has no exact-match location for ${path}`)
  // Anchored to a `return` at the start of its own line: `/robots.txt` also carries a CONDITIONAL
  // `if ($cf_env) { return 200 '…'; }` above it, and a regex that took the first match would read
  // the non-mainnet body and report the mainnet one as drifted.
  const body = /\n {8}return 200 '([\s\S]*?)';/.exec(block[1] ?? '')
  assert.ok(body, `the ${path} location does not return an unconditional literal body`)
  return body[1] ?? ''
}

describe('the sitemap nginx serves', () => {
  it('names no hostname — every address is composed from $host', () => {
    /*
     * THE ASSERTION THAT KEEPS THE ARTEFACT ENVIRONMENT-FREE, and the reason this arrangement is
     * allowed at all. A single literal apex here would make the image wrong on a preview
     * deployment and on testnet, silently, in the one document a crawler treats as authoritative.
     */
    const xml = servedBody(`${BASE}/sitemap.xml`)
    assert.ok(!xml.includes('cloudsforge.online'), 'the sitemap names the production apex')
    assert.ok(!xml.includes('localhost'), 'the sitemap names localhost')
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '')
    assert.ok(locs.length > 0, 'the sitemap contains no addresses at all')
    for (const loc of locs) {
      assert.match(loc, /^https:\/\/\$host/, `a <loc> is not composed from $host: ${loc}`)
    }
  })

  it('is exactly this surface’s own public routes, composed', () => {
    // ── `https` IS A LITERAL AND THE MOUNT IS PART OF THE ADDRESS ────────────────────────────
    //
    // `$scheme` was a live defect: TLS ends at Cloudflare and every hop after it is plaintext, so
    // `$scheme` is `http` for a reader who arrived over `https` and every `<loc>` advertised an
    // address that 301s. `$host` stays a variable — the host really does differ per request.
    // And the surface is `<apex>/create` now, so `publicPath()` composes the public address.
    const expected = PUBLIC_PATHS.map((path) => {
      const canonical = path === '' ? '/' : `/${path}`
      return `  <url><loc>https://$host${publicPath(canonical)}</loc></url>`
    }).join('\n')
    assert.equal(
      servedBody(`${BASE}/sitemap.xml`),
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `${expected}\n` +
        `</urlset>`,
    )
  })

  it('lists the catalogue, which is the one address a stranger arrives at', () => {
    // Stated separately from the equality above so the failure message says WHICH route went
    // missing rather than printing two documents and leaving the reader to diff them.
    assert.deepEqual([...PUBLIC_PATHS], [''], 'the set of listable public routes has changed')
    assert.match(servedBody(`${BASE}/sitemap.xml`), /<loc>\$scheme:\/\/\$host<\/loc>/)
  })

  it('invites a crawler to no gated route', () => {
    // The mirror of the `noindex` that `DocumentMeta` sends for the same three. A sitemap is an
    // invitation and a robots directive is an instruction; the two must not disagree.
    const xml = servedBody(`${BASE}/sitemap.xml`)
    for (const route of ROUTES) {
      if (route.public || route.path === '') continue
      assert.ok(!xml.includes(`/${route.path}`), `${route.path} is gated and is in the sitemap`)
    }
  })

  it('is this surface only, never the estate — no sibling subdomain is composed', () => {
    // `site` serves the estate sitemap because its `$host` IS the apex. Here `$host` is already
    // `create.<apex>`, so `<subdomain>.$host` would be a three-label name nothing serves and no
    // wildcard certificate covers. Anything before `$host` is that mistake.
    const xml = servedBody(`${BASE}/sitemap.xml`)
    assert.doesNotMatch(xml, /<loc>\$scheme:\/\/[a-z0-9-]+\.\$host/, 'a sibling surface is listed')
  })

  it('is served as XML, because a sitemap sent as text/html is a sitemap nobody reads', () => {
    // `types { }` as well as `default_type`: without emptying the table for this location, nginx
    // maps the `.xml` in the URI to `text/xml` from its own mime types and `default_type` never
    // applies.
    assert.match(
      nginx,
      new RegExp(`location = /create/sitemap\\.xml \\{[\\s\\S]*?types \\{ \\}[\\s\\S]*?default_type application/xml;`),
    )
  })
})

describe('an environment that is not mainnet', () => {
  /** The alternation of environment labels inside the `$cf_env` map. */
  function alternation(): string[] {
    const map = /map \$host \$cf_env \{[\s\S]*?~\^[^\n]*?\(\?:([^)]*)\)\\\./.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing from nginx.conf')
    return (map[1] ?? '').split('|')
  }

  it('recognises exactly the labels the registry reserves', () => {
    /*
     * ENV_LABELS is the estate's single list — `deploy/scripts/check-apex-prefix.py` reads the
     * same export. An alternation here that had drifted from it would either miss an environment
     * (and index it) or refuse a surface (and de-index a real one), and both fail silently.
     */
    assert.deepEqual(alternation().sort(), [...ENV_LABELS].sort())
  })

  it('refuses every crawler and serves no sitemap', () => {
    // Both halves matter and neither is sufficient: robots.txt stops the fetch, and a 404 on the
    // sitemap stops the invitation. A testnet project page indexed beside a real one is a support
    // problem before it is an SEO problem.
    assert.match(nginx, /if \(\$cf_env\) \{ return 200 'User-agent: \*\\nDisallow: \/\\n'; \}/)
    assert.match(nginx, new RegExp(`location = /create/sitemap\\.xml \\{[\\s\\S]*?if \\(\\$cf_env\\) \\{ return 404; \\}`))
  })

  it('matches a suffixed subdomain as well as a bare environment apex', () => {
    // This surface's non-mainnet name is `create-testnet.<apex>` — the environment is a SUFFIX on
    // the first label — while the apex surface on the same estate is `testnet.<apex>`, because it
    // has no subdomain to suffix. Both shapes resolve, so the pattern has to catch both or half
    // the estate stays indexable on testnet.
    const map = /map \$host \$cf_env \{[\s\S]*?\n\}/.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing')
    assert.match(map[0], /\(\?:\[\^\.\]\+-\)\?/, 'the map does not allow a suffixed subdomain')
  })
})

describe('robots.txt', () => {
  it('is not served by this image at all, because the origin root is micro-site\'s', () => {
    /*
     * ── THE BLOCK THAT WAS HERE IS GONE, AND SO IS THE ONE IN nginx.conf ────────────────────────
     *
     * It asserted that `location = /robots.txt` regenerated `robotsTxt()` and carried an absolute
     * `Sitemap:` line. Both were right while this surface was a hostname.
     *
     * A crawler reads robots.txt at the ORIGIN ROOT and nowhere else. Now the surface is
     * `<apex>/create`, `/create/robots.txt` is a file nothing would fetch — so the rules were not
     * relocated, they STOPPED BEING THIS BUNDLE'S TO MAKE. micro-site owns `/robots.txt` on this
     * origin, and its own suite asserts a `Sitemap:` line for every consolidated surface.
     *
     * The absence is asserted BOTH ways: no location in nginx.conf, and no static file either. An
     * unreachable config file is not a safety net — it is a thing a future reader finds, believes,
     * and reasons from.
     */
    // Comments stripped: the deleted block left one saying so, which necessarily contains the
    // words `location = /robots.txt` — a raw search finds its own explanation.
    const directives = nginx.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
    assert.ok(
      !/location = \/(?:create\/)?robots\.txt/.test(directives),
      'this image serves a robots.txt again; the origin root is micro-site\'s',
    )
    assert.equal(
      existsSync(new URL('../public/robots.txt', import.meta.url)),
      false,
      'public/robots.txt is back, and nothing on this origin would fetch it',
    )
  })
})
