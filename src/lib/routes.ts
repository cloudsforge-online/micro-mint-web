/**
 * The route table, as data, in one place.
 *
 * Three files describe this app's addresses and all three have to agree:
 *
 *   1. `src/lib/routes.ts` — this file, from which the sub-navigation is derived,
 *   2. `src/app.tsx`       — which component renders at each path,
 *   3. `nginx.conf`        — which addresses are served the app shell at all.
 *
 * The third is the one that bites, and it bites late. nginx enumerates the real routes and 404s
 * everything else ON PURPOSE, so that a wrong address answers 404 rather than 200 — an app that
 * answers 200 for every address serves its "page not found" screen as a success, which crawlers
 * index and monitors call healthy. That matters more here than on the operator console: a project
 * page is a public, shareable address, and a mistyped one that answers 200 is a page a prospective
 * buyer can be sent to.
 *
 * The price of that honesty is this list, in triplicate, so `test/routes.test.ts` reads
 * `nginx.conf` and `app.tsx` and fails the build when either has drifted. "Remember to update
 * nginx.conf" is not a mechanism; a test is.
 *
 * This module deliberately imports nothing — not React, not the router — so the test that reads it
 * does not have to boot a browser to find out what the routes are.
 */

export interface AppRoute {
  /** The top-level path segment, without a leading slash. `''` is the index route. */
  readonly path: string
  /** The sub-navigation label, or null for a route that is reachable but not offered. */
  readonly label: string | null
  /** True when the route owns everything beneath it (`/tokens/<uuid>`). */
  readonly wildcard: boolean
  /**
   * True when the route renders without a session.
   *
   * Two of them do, and it is read off the SERVICE rather than chosen: `GET /v1/catalogue`
   * (`mint/src/server.ts:340`) and `GET /v1/tokens/:id/page` (`mint/src/server.ts:572`) make no
   * `authenticate()` call at all. Putting either behind the session gate would be this app
   * demanding a token the service never wanted — the same shape as the marketplace client that
   * sent a bearer to an unauthenticated route and then had to reason about a 403 that was never
   * about authorisation.
   */
  readonly public: boolean
}

export const ROUTES: readonly AppRoute[] = [
  // The catalogue is the index because it is the only screen that answers "what can I actually
  // launch, and what does it cost" — and it answers it to somebody who has not signed in, which
  // is who arrives at a product's front page.
  { path: '', label: 'Catalogue', wildcard: false, public: true },
  // The order form. Behind the gate: `POST /v1/tokens` authenticates (`mint/src/server.ts:360`).
  { path: 'launch', label: 'Launch a token', wildcard: false, public: false },
  // Wildcard: `/tokens/<uuid>` is the order's status page — the address `POST .../deploy` puts in
  // its `Location` header (`mint/src/server.ts:531-541`), which is what a customer polls.
  { path: 'tokens', label: 'Your launches', wildcard: true, public: false },
  // ────────────────────────────────────────────────────────────────────────────────────────────
  // REACHABLE AND DELIBERATELY NOT OFFERED, which is what `label: null` is for.
  //
  // `/projects/<uuid>` is the public project page. There is nothing to navigate TO without an id
  // — a nav entry would lead to a screen that can only say "pick one" — and the address is
  // arrived at from a launch's status page or from a link somebody was sent. It is enumerated in
  // nginx and covered by the route test exactly like the others; it is only absent from the bar.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  { path: 'projects', label: null, wildcard: true, public: true },
]

/** What the sub-navigation renders, with the leading slash a `NavLink` wants. */
export const NAV: ReadonlyArray<{ to: string; label: string }> = ROUTES.filter(
  (route): route is AppRoute & { label: string } => route.label !== null,
).map((route) => ({ to: `/${route.path}`, label: route.label }))

/** Every path nginx has to serve the shell for, excluding the index. */
export const NON_INDEX_PATHS: readonly string[] = ROUTES.filter((r) => r.path !== '').map(
  (r) => r.path,
)

/**
 * A route this app owns, deep enough to prove the SPA fallback works.
 *
 * Passed to CI as the deep-link probe. It must be a REAL address — a probe against a path the app
 * does not own proves only that the 404 page renders, which is the opposite of what the check is
 * for. This one is a launch status page, which is the address customers are most likely to reload.
 */
export const DEEP_LINK_PATH = '/tokens/5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
