/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests.
 * That is the whole problem: a test that asserts "the client calls /v1/tokens" is a test that the
 * client agrees with itself. So this file does not assert paths in the abstract — it reads
 * `mint/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is REGISTERED there — found by SEARCHING for its `define(`, never by citing a line.
 *
 * ── What happens without the sibling ──────────────────────────────────────────────────────────
 *
 * The service is a private repository. `pnpm test` must pass for somebody who has cloned only this
 * one, so a missing checkout SKIPS the cross-repository half — and, because a skipped test is an
 * unmeasured one, CI is where absence becomes a failure: the `check` job checks micro-mint out and
 * the workflow asserts the cross-check REALLY RAN by requiring the count in the output. Neither
 * half can go quiet on its own.
 *
 * (This is the same split `micro-sdk/tools/drift.ts` draws for the contracts package, and the same
 * one whose absence made micro-sdk run 30691403652 red.)
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/** Where a micro-mint checkout is, in the order CI and a developer's machine put it. */
const MINT_CANDIDATES = [
  process.env['CLOUDSFORGE_MINT_DIR'],
  here('../mint/src/server.ts'),
  here('.mint/src/server.ts'),
].filter((v): v is string => Boolean(v))

const mintServer = MINT_CANDIDATES.find((p) => existsSync(p))

/**
 * The surface this bundle uses.
 *
 * Written down here as DATA so the check below can be mechanical. If one of these routes is not
 * registered by the service, the test fails and names it — which is the property a comment does
 * not have.
 *
 * It used to carry the LINE each route was read from, and that line is why this repository kept
 * going red for edits made in a different one. micro-mint gained an erasure webhook and its routes
 * moved by anywhere from +1 to +81 depending on where they sat; every entry here was then wrong
 * while nothing in this bundle was. Nothing runs this suite when that service changes, so it
 * surfaced during a release rather than at the edit that caused it.
 */
const SURFACE: ReadonlyArray<{ method: string; path: string; authenticates: boolean }> = [
  { method: 'GET', path: '/v1/catalogue', authenticates: false },
  { method: 'POST', path: '/v1/tokens', authenticates: true },
  { method: 'GET', path: '/v1/tokens', authenticates: true },
  { method: 'GET', path: '/v1/tokens/:id', authenticates: true },
  { method: 'POST', path: '/v1/tokens/:id/pay', authenticates: true },
  { method: 'POST', path: '/v1/tokens/:id/deploy', authenticates: true },
  { method: 'PUT', path: '/v1/tokens/:id/page', authenticates: true },
  { method: 'GET', path: '/v1/tokens/:id/page', authenticates: false },
]

/**
 * Routes mint serves that this bundle deliberately does NOT call, each with the reason.
 *
 * Enumerated rather than ignored, so the "knows about everything it does" check below stays exact
 * in both directions: a route nobody has read should make somebody look, and a route somebody has
 * read and declined should not.
 */
const DECLINED: ReadonlyArray<{ method: string; path: string; why: string }> = [
  {
    method: 'POST',
    path: '/v1/events',
    why: 'HMAC webhook — the credential is the MAC, and a browser holds no signing secret',
  },
]

const client = readFileSync(here('src/lib/mint.ts'), 'utf8')

describe('the client calls only routes it has cited', () => {
  it('every path in the client appears in the documented surface', () => {
    // Template literals in the client are `/v1/tokens/${…}/pay`; reduce them to the `:id` spelling
    // the surface table uses so the two are comparable.
    const called = [...client.matchAll(/['"`](\/v1\/[^'"`]*)['"`]/g)]
      .map((m) => (m[1] ?? '').replace(/\$\{[^}]*\}/g, ':id'))
      .filter((p) => !p.includes('$'))
    assert.ok(called.length >= 6, `expected the call sites, found ${called.length}`)
    for (const path of new Set(called)) {
      assert.ok(
        SURFACE.some((r) => r.path === path),
        `src/lib/mint.ts calls ${path}, which is not in the verified surface`,
      )
    }
  })

  it('says where it read the surface from', () => {
    // The FILE, not a line in it. A line number here was a promise this repository could not keep:
    // it names a position in a file micro-mint is free to edit, and the erasure webhook moved every
    // route below it. What is worth asserting is that the client points a reader at the source of
    // truth; the suite below proves the routes are really there.
    assert.ok(
      client.includes('mint/src/server.ts'),
      'src/lib/mint.ts no longer says which service source it was read from',
    )
  })
})

describe('every route this bundle names is really registered by the service', () => {
  if (mintServer === undefined) {
    // NOT a silent pass. It says which check did not run, and CI makes the absence fatal.
    it('SKIPPED: no micro-mint checkout — CI checks one out and requires this to run', () => {
      assert.ok(true)
    })
    return
  }

  const lines = readFileSync(mintServer, 'utf8').split('\n')

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    const defines = lines.filter((l) => /^\s{4}define\('/.test(l))
    assert.ok(defines.length >= 8, `expected mint's route list, found ${defines.length} defines`)
  })

  /**
   * Where a route is registered, found by SEARCHING for it rather than by citing a line.
   *
   * Searching costs one pass over a file already in memory and cannot go stale. What is actually
   * worth asserting is that the route EXISTS and that its handler behaves as this bundle believes;
   * neither of those is a fact about line 374. A service edit that MOVES a route can no longer
   * break this file. A service edit that REMOVES one still does, which is the property that was
   * ever worth having.
   */
  const indexOfRoute = (method: string, path: string): number => {
    const re = new RegExp(`^\\s{4}define\\('${method}',\\s*'${path.replace(/[/:]/g, '\\$&')}'`)
    return lines.findIndex((l) => re.test(l))
  }

  /** A handler's body: from its `define(` to the next one at the same indentation, or to the end. */
  const bodyOf = (method: string, path: string): string => {
    const start = indexOfRoute(method, path)
    assert.ok(start >= 0, `${method} ${path} is not registered in mint/src/server.ts`)
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s{4}define\('/.test(lines[i] ?? '')) {
        end = i
        break
      }
    }
    return lines.slice(start, end).join('\n')
  }

  for (const route of [...SURFACE, ...DECLINED]) {
    it(`${route.method} ${route.path} is registered in mint/src/server.ts`, () => {
      assert.ok(
        indexOfRoute(route.method, route.path) >= 0,
        `${route.method} ${route.path} is not registered in mint/src/server.ts at all`,
      )
    })
  }

  it('this bundle calls nothing mint does not serve, and knows about everything it does', () => {
    // Both directions. A route the service grew that this table has never heard of is not a
    // failure of the app, but it IS the moment somebody should look — the citations are only
    // trustworthy while somebody is re-reading them.
    const registered = lines
      .map((l) => /^\s{4}define\('([A-Z]+)',\s*'([^']+)'/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]} ${m[2]}`)
      .filter((r) => r.includes('/v1/'))
    // DECLINED is data like SURFACE, so it is held to the same bar — an unverified exemption list
    // is just a way to silence this check. Each entry is looked up, not cited.
    for (const route of DECLINED) {
      assert.ok(
        indexOfRoute(route.method, route.path) >= 0,
        `${route.method} ${route.path} is declined here but mint does not register it at all`,
      )
    }
    // And the stated reason is the real one: the webhook declines on a bad MAC, not on a bearer.
    // This used to read a hardcoded `lines.slice(643, 660)`, which is the same defect one layer
    // down — a window into another repository's file, silently pointing at the wrong seventeen
    // lines the moment anything above them moved. The handler is now found by its route.
    const events = bodyOf('POST', '/v1/events')
    assert.match(events, /verifyEventSignature\(raw, deps\.eventAcceptSecrets, presented\)/)
    assert.match(events, /errorReply\(403, 'bad_signature'/)
    assert.doesNotMatch(events, /await authenticate\(ctx, deps\)/, 'the webhook now takes a bearer')

    const known = [...SURFACE, ...DECLINED].map((r) => `${r.method} ${r.path}`)
    assert.deepEqual(
      registered.filter((r) => !known.includes(r)),
      [],
      'mint serves a /v1 route this app has never read. Read it, then add or decline it here.',
    )
  })

  it('the two routes called without a token really make no authenticate() call', () => {
    // The defect this asserts against is a client sending a bearer to a handler that never wanted
    // one and then reasoning about a 403 that was not about authorisation.
    for (const route of SURFACE) {
      const body = bodyOf(route.method, route.path)
      assert.equal(
        /await authenticate\(ctx, deps\)/.test(body),
        route.authenticates,
        `${route.method} ${route.path}: this app treats it as ` +
          `${route.authenticates ? 'authenticated' : 'unauthenticated'} and the handler disagrees`,
      )
    }
  })

  it('no route on mint requires an Idempotency-Key, which is why this client sends none', () => {
    // Four wallet routes and five market mutations in this estate answer 400 without the header.
    // Mint has no such wrapper, and asserting it here is what stops somebody "fixing" this client
    // by adding a header the service ignores — or, worse, concluding the reverse.
    const source = readFileSync(mintServer, 'utf8')
    assert.doesNotMatch(source, /idempotency-key/i, 'mint now reads an Idempotency-Key header')
    assert.doesNotMatch(source, /withIdempotentRoute/, 'mint now wraps a route for idempotency')
  })
})
