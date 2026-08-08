/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests.
 * That is the whole problem: a test that asserts "the client calls /v1/tokens" is a test that the
 * client agrees with itself. So this file does not assert paths in the abstract — it reads
 * `mint/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is REGISTERED there — found by SEARCHING for its `define(`, never by citing a line.
 *
 * ── NOTHING IN HERE NAMES A POSITION IN A FILE THIS REPOSITORY DOES NOT OWN ───────────────────
 *
 * Not a line, and not a byte offset either — an offset is the same defect in a different unit.
 * Every route is located by its `define(` and every slice is bounded by the bracket that CLOSES the
 * construct, so a handler that grows takes its boundary with it. `test/service-source.ts` carries
 * the reasoning; micro-org#235 carries the receipts, and the worst of them was written from this
 * file: a handler body sliced from a recorded line landed in the previous handler and reported that
 * `POST /v1/tokens` makes no `authenticate()` call. It does, as its first statement. The suite
 * accused this frontend of a defect that did not exist. `micro-contracts@e0f226d`, "refactor: cite
 * the file, never the line", is the estate rule this file is now an instance of rather than an
 * exception to.
 *
 * The matcher is not taken on trust: the last `describe` in this file exercises it against fixtures
 * — a handler that grows, a route quoted in a comment, a LAST route with helpers below it, a route
 * that is absent — because an assertion about somebody else's repository is worth exactly what the
 * slice behind it is worth.
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
import { readServiceSource } from './service-source.ts'

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

  /**
   * The service, PARSED rather than sliced. See `test/service-source.ts` for why every anchor below
   * is a construct and never a position — it is the whole of micro-org#235, and the false
   * accusation in that issue was made from this file.
   */
  const service = readServiceSource(mintServer, readFileSync(mintServer, 'utf8'))

  /**
   * A handler's body: the whole `define(…)` call, bounded by the parenthesis that CLOSES it.
   *
   * The boundary is the fix. This used to run from the registration to the next `define(`, and
   * `POST /v1/events` is the LAST route micro-mint registers — so the webhook's body was every line
   * from its registration to the end of the file: `ownedToken`, `authenticate` and two hundred and
   * fifty lines of helpers. It happens to have passed, because none of those helpers spell the call
   * the way the assertion does; one edit in micro-mint would have turned that into a red run
   * reading "mint-web is wrong about the webhook". A terminator that can run off the end of the
   * construct is not a boundary, it is a longer window.
   */
  const bodyOf = (method: string, path: string): string => service.routeBody(method, path)

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    assert.ok(
      service.registrations.length >= 8,
      `expected mint's route list, found ${service.registrations.length} registrations`,
    )
  })

  for (const route of [...SURFACE, ...DECLINED]) {
    it(`${route.method} ${route.path} is registered in mint/src/server.ts`, () => {
      // `routeBody` THROWS when the route is absent — naming the route, the resolved file and every
      // route the file does register — rather than handing back an empty string for the rest of
      // this suite to assert over. `assert.doesNotMatch('', /authenticate\(/)` passes for ever.
      assert.ok(bodyOf(route.method, route.path).length > 0)
    })
  }

  it('this bundle calls nothing mint does not serve, and knows about everything it does', () => {
    // Both directions. A route the service grew that this table has never heard of is not a
    // failure of the app, but it IS the moment somebody should look — the citations are only
    // trustworthy while somebody is re-reading them.
    //
    // Read from the PARSED registrations, so a `define('GET', '/v1/…'` that micro-mint quoted in a
    // comment — which sources in this estate do on purpose, this file included — cannot be counted
    // as a route the service serves and fail this check naming something imaginary.
    const registered = service.registrations
      .map((r) => `${r.method} ${r.path}`)
      .filter((r) => r.includes('/v1/'))
    // DECLINED is data like SURFACE, so it is held to the same bar — an unverified exemption list
    // is just a way to silence this check. Each entry is looked up, not cited.
    for (const route of DECLINED) {
      assert.ok(
        registered.includes(`${route.method} ${route.path}`),
        `${route.method} ${route.path} is declined here but mint does not register it at all`,
      )
    }
    // And the stated reason is the real one: the webhook declines on a bad MAC, not on a bearer.
    // This used to read a hardcoded `lines.slice(643, 660)`, which is the same defect one layer
    // down — a window into another repository's file, silently pointing at the wrong seventeen
    // lines the moment anything above them moved. The handler is now the `define(…)` call itself.
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
    //
    // ── THIS IS THE TEST micro-org#235 IS ABOUT ────────────────────────────────────────────────
    //
    // It ran in both directions off a RECORDED LINE, and when micro-mint's erasure webhook moved
    // its route table the recorded 384 stopped being `define('POST', '/v1/tokens'` and became the
    // tail of the handler above it. So the check read a body that was never this route's, found no
    // `authenticate()` in it, and failed reporting that `POST /v1/tokens` is unauthenticated while
    // this client sends it a bearer. The service has `const principal = await authenticate(ctx,
    // deps)` as the FIRST STATEMENT of that handler. The client was right; the test was wrong; and
    // the test was the thing that would have been believed.
    //
    // The body now comes from the `define(…)` call itself, bounded by the parenthesis that closes
    // it. There is no offset left to drift, so the only way this can fail again is the way it
    // should: micro-mint really changing how a route authenticates.
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
    //
    // Read from the CODE, with comments stripped. The claim is about what micro-mint's handlers
    // do, not about what its prose mentions — and a `doesNotMatch` over raw text is the one shape
    // where the estate's habit of quoting deleted code in comments turns into a false accusation.
    // A sentence in micro-mint reading "no route here requires an Idempotency-Key" would have
    // failed this and told the reader the exact opposite of what it said.
    assert.doesNotMatch(service.code, /idempotency-key/i, 'mint now reads an Idempotency-Key header')
    assert.doesNotMatch(service.code, /withIdempotentRoute/, 'mint now wraps a route for idempotency')
  })
})

/**
 * THE MATCHER ITSELF, CHECKED — because everything above is only as true as it is.
 *
 * Every assertion in this file now rests on `test/service-source.ts` handing back the right span of
 * somebody else's file. If that slice is wrong, the suite does not fall silent: it says a specific,
 * false thing about micro-mint, which is precisely what micro-org#235 is a report of. So the
 * matcher is exercised against FIXTURES rather than against the service — the properties below have
 * to hold for a file this repository controls, or the answers it gives about one it does not are
 * worth nothing. These run whether or not a micro-mint checkout is present.
 */
describe('the matcher reads by structure, and says so when it cannot', () => {
  /**
   * A miniature server with the three shapes that have burned this estate: a route followed by
   * another, a route quoted in a COMMENT, and a LAST route with a helper below it that
   * authenticates.
   */
  const FIXTURE = [
    `const helpText = "define('GET', '/v1/imaginary', handler) is how a route is declared"`,
    ``,
    `function buildRoutes(): Route[] {`,
    `  return [`,
    `    define('GET', '/v1/first', async (ctx, deps) => {`,
    `      const principal = await authenticate(ctx, deps)`,
    `      if (!/^[A-Z0-9]{2,12}$/.test(ctx.params['symbol'] ?? '')) throw new BadRequestError('no')`,
    `      return { status: 200, body: { marker: 'FIRST_HANDLER', who: principal } }`,
    `    }),`,
    `    define('POST', '/v1/second', async (ctx) => {`,
    `      return { status: 201, body: { marker: 'SECOND_HANDLER' } }`,
    `    }),`,
    `    // define('GET', '/v1/ghost', async () => ({ status: 200 })), — moved to micro-ledger`,
    `    define('POST', '/v1/hooks', async (ctx, deps) => {`,
    `      if (!verifyEventSignature(raw, deps.eventAcceptSecrets, presented)) {`,
    `        return errorReply(403, 'bad_signature', ctx.requestId)`,
    `      }`,
    `      return { status: 202, body: { marker: 'LAST_HANDLER' } }`,
    `    }),`,
    `  ]`,
    `}`,
    ``,
    `async function afterTheArray(ctx: RequestContext, deps: ServerDeps): Promise<{ ok: boolean }> {`,
    `  const principal = await authenticate(ctx, deps)`,
    `  return { ok: principal !== null }`,
    `}`,
  ].join('\n')

  const fixture = readServiceSource('fixture/server.ts', FIXTURE)

  it('finds the registrations, and neither a commented-out one nor one quoted in a string', () => {
    // Both exclusions are house rules rather than fussiness. Sources in this estate quote deleted
    // code in comments deliberately — micro-mint's own server does — and a raw-text scan counts
    // those as routes the service serves, which fails the "knows about everything it does" check
    // above naming a path that does not exist.
    assert.deepEqual(
      fixture.registrations.map((r) => `${r.method} ${r.path}`),
      ['GET /v1/first', 'POST /v1/second', 'POST /v1/hooks'],
    )
  })

  it('bounds a handler at its own closing parenthesis, however far it grows', () => {
    // THE REGRESSION TEST FOR THE FIX. Any boundary expressed as a COUNT — n lines after the match,
    // n characters after the match — passes on the fixture as written and fails here, because the
    // only thing that changed is how big the first handler is. That is micro-org#235 reproduced in
    // one repository: the assertion breaks on an edit that changed nothing it was asserting.
    const filler = Array.from(
      { length: 300 },
      (_, i) => `      const grown${i} = { nested: { deep: [1, 2, 3] } , tag: 'GROWN_INTO_FIRST' }`,
    ).join('\n')
    const grown = readServiceSource(
      'fixture/server.ts',
      FIXTURE.replace(
        `      const principal = await authenticate(ctx, deps)`,
        `      const principal = await authenticate(ctx, deps)\n${filler}`,
      ),
    )

    const first = grown.routeBody('GET', '/v1/first')
    const second = grown.routeBody('POST', '/v1/second')
    assert.match(first, /GROWN_INTO_FIRST/, 'the handler lost its own body')
    assert.doesNotMatch(first, /SECOND_HANDLER/, 'the first handler ran into the second')
    assert.doesNotMatch(second, /GROWN_INTO_FIRST/, 'the second handler picked up the first')
    assert.match(second, /SECOND_HANDLER/, 'the second handler lost its own body')
  })

  it('stops the LAST route at the route array rather than at the end of the file', () => {
    // THE DEFECT THIS REPOSITORY WAS SHIPPING. `bodyOf` terminated only at the NEXT `define(`, and
    // `POST /v1/events` is the last route micro-mint registers — so the webhook's "body" ran from
    // its registration to the end of the file: `ownedToken`, `authenticate` and two hundred and
    // fifty lines of helpers. It passed, which is the only reason nobody noticed; the check that
    // the webhook takes no bearer was one edit in micro-mint away from going red and reading
    // "mint-web is wrong about the webhook". This fixture puts an authenticating helper below the
    // array so that the property is asserted rather than depended on.
    const webhook = fixture.routeBody('POST', '/v1/hooks')
    assert.match(webhook, /LAST_HANDLER/)
    assert.doesNotMatch(webhook, /afterTheArray/, 'the last route swallowed the helpers below it')
    assert.doesNotMatch(webhook, /await authenticate\(ctx, deps\)/, 'and their authentication')
  })

  it('throws for a route the file does not register, naming the route and the file', () => {
    // A matcher that finds nothing and returns '' is worse than the line numbers were:
    // `assert.doesNotMatch('', /authenticate\(/)` passes, and it passes for ever. The message also
    // reports what WAS found, so a reader can tell "micro-mint dropped the route" from "the
    // matcher stopped understanding the file" without opening either.
    assert.throws(
      () => fixture.routeBody('GET', '/v1/nope'),
      (error: Error) => {
        assert.match(error.message, /GET \/v1\/nope is not registered in fixture\/server\.ts/)
        assert.match(error.message, /GET \/v1\/first/, 'it does not say what it did find')
        return true
      },
    )
  })

  it('throws for a helper the file no longer declares', () => {
    assert.throws(
      () => fixture.functionBody('ownedToken'),
      /fixture\/server\.ts no longer declares a function called ownedToken/,
    )
  })

  it('finds a registration the formatter has wrapped across lines', () => {
    // The other way a positional matcher accuses the wrong repository: micro-mint reformats, the
    // `define(` no longer sits on one line at four spaces of indent, and this suite reports that a
    // route the service still serves has been withdrawn. Nothing about a route is a fact about
    // where its arguments were broken.
    const wrapped = readServiceSource(
      'fixture/wrapped.ts',
      [
        `function buildRoutes(): Route[] {`,
        `  return [`,
        `    define(`,
        `      'PUT',`,
        `      '/v1/wrapped/:id/page',`,
        `      async (ctx, deps) => {`,
        `        const principal = await authenticate(`,
        `          ctx,`,
        `          deps,`,
        `        )`,
        `        return { status: 200, body: { principal } }`,
        `      },`,
        `    ),`,
        `  ]`,
        `}`,
      ].join('\n'),
    )
    assert.deepEqual(
      wrapped.registrations.map((r) => `${r.method} ${r.path}`),
      ['PUT /v1/wrapped/:id/page'],
    )
    // …and the needle this suite asserts with still answers, because whitespace is flattened and
    // the trailing comma a formatter adds when it wraps is undone.
    assert.match(
      wrapped.routeBody('PUT', '/v1/wrapped/:id/page'),
      /await authenticate\(ctx, deps\)/,
      'a reformatted call would have been read as an unauthenticated handler',
    )
  })

  it('reads a function to its own closing brace, past a braced return type', () => {
    // Service helpers in this estate are declared like `): Promise<{ principal: Principal; token:
    // TokenRecord }> {`. Brace-matching the first `{` after the parameters returns the TYPE, and
    // every assertion about the helper would then be made against an object type containing no code
    // at all — `doesNotMatch` passes, `match` fails, and neither answer is about the service.
    const helper = fixture.functionBody('afterTheArray')
    assert.match(helper, /await authenticate\(ctx, deps\)/, 'the return type was read as the body')
    assert.match(helper, /return \{ok: principal !== null\}/)
    assert.doesNotMatch(helper, /buildRoutes/, 'the helper ran backwards into the route table')
  })
})
