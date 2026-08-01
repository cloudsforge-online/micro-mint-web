/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests.
 * That is the whole problem: a test that asserts "the client calls /v1/tokens" is a test that the
 * client agrees with itself. So this file does not assert paths in the abstract — it reads
 * `mint/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is REGISTERED there, at the line the citation names.
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
 * The surface this bundle uses, with the line each was read from.
 *
 * Written down here as DATA so the check below can be mechanical. If one of these citations is
 * wrong, the test fails and names it — which is the property a comment does not have.
 */
const SURFACE: ReadonlyArray<{ method: string; path: string; line: number; authenticates: boolean }> = [
  { method: 'GET', path: '/v1/catalogue', line: 340, authenticates: false },
  { method: 'POST', path: '/v1/tokens', line: 359, authenticates: true },
  { method: 'GET', path: '/v1/tokens', line: 417, authenticates: true },
  { method: 'GET', path: '/v1/tokens/:id', line: 430, authenticates: true },
  { method: 'POST', path: '/v1/tokens/:id/pay', line: 454, authenticates: true },
  { method: 'POST', path: '/v1/tokens/:id/deploy', line: 491, authenticates: true },
  { method: 'PUT', path: '/v1/tokens/:id/page', line: 546, authenticates: true },
  { method: 'GET', path: '/v1/tokens/:id/page', line: 572, authenticates: false },
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

  it('cites a line for every route, in the doc comment as well as here', () => {
    for (const route of SURFACE) {
      assert.ok(
        client.includes(`mint/src/server.ts:${route.line}`),
        `${route.method} ${route.path} has no citation in src/lib/mint.ts`,
      )
    }
  })
})

describe('the cited lines are the lines that register the routes', () => {
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

  for (const route of SURFACE) {
    it(`${route.method} ${route.path} is registered at mint/src/server.ts:${route.line}`, () => {
      // 1-indexed citation, 0-indexed array.
      const line = lines[route.line - 1] ?? ''
      assert.match(
        line,
        new RegExp(`define\\('${route.method}',\\s*'${route.path.replace(/[/:]/g, '\\$&')}'`),
        `mint/src/server.ts:${route.line} is:\n  ${line.trim()}`,
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
    const known = SURFACE.map((r) => `${r.method} ${r.path}`)
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
      const start = route.line - 1
      // The handler runs to the next `define(` at the same indentation, or to the end.
      let end = lines.length
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\s{4}define\('/.test(lines[i] ?? '')) {
          end = i
          break
        }
      }
      const body = lines.slice(start, end).join('\n')
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
