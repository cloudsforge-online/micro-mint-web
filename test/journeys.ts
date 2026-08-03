/**
 * This surface's slice of `docs/ecosystem/22-browser-journeys.md`, as data.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE CATALOGUE IS DATA AND NOT JUST A LIST OF `it(...)` TITLES
 *
 * Doc 22 §3.2 makes the layer boundary mechanical rather than advisory: every scenario declares
 * one `asserts` kind, and any scenario whose outcome depends on a SERVER-SIDE rule must carry
 * `ownedBy` — "a path, resolvable by grep, in the service that enforces the rule". A meta-test
 * reads these and fails the suite when one is missing.
 *
 * The second reason is doc 22 §8: a scenario that exists and cannot run is a gap somebody can
 * close, and an absent scenario is a gap nobody can see.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

export type Asserts = 'presentation' | 'client-request' | 'navigation'
export type Tier = 'T1' | 'T2' | 'T3'

export interface Scenario {
  readonly id: string
  readonly what: string
  readonly asserts: Asserts
  readonly tier: Tier
  readonly gate?: boolean
  readonly ownedBy?: { readonly path: string; readonly grep: string }
  readonly blocked?: string
}

export const SCENARIOS: readonly Scenario[] = [
  /* ── 6.4 Group D — Forge Create ───────────────────────────────────────────────────────────── */
  {
    id: 'BJ-CRE-01',
    what: 'the catalogue renders one entry per entry in the response, with its cost, and with no sign-in prompt',
    asserts: 'presentation',
    tier: 'T2',
    gate: true,
  },
  {
    id: 'BJ-CRE-02',
    what: 'the launch form says it opens an order and charges nothing, and the sentence is ABOVE the button',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-CRE-03',
    what: 'submitting the launch form posts the draft the form held and lands on the order it created',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
    // Doc 22 puts this at T3 because it wants a real order. The half that is a property of THIS
    // CLIENT — that the body posted is the draft on screen, and that the browser then goes to the
    // id the response carried — needs nothing up and is implemented here.
  },
  {
    id: 'BJ-CRE-04',
    what: 'pressing Deploy renders "accepted", never "deployed" — the route answers 202 and a status URL',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-CRE-05',
    what: 'the truth arrives by re-reading the order, not from the button’s response',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-CRE-06',
    what: 'the buttons are offered from the order’s own state: no pay button off awaiting_payment, no deploy button off CLAIMABLE',
    asserts: 'presentation',
    tier: 'T1',
    ownedBy: { path: 'mint/src/tokens.ts', grep: 'CLAIMABLE' },
  },
  {
    id: 'BJ-CRE-07',
    what: 'paying twice replays: 200 rather than a second charge, and the page does not render replayed as an error',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-CRE-08',
    what: 'the launches list says it is capped rather than offering a next button that cannot work',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-CRE-09',
    what: 'the public project page renders for anybody with the address, with no credential attached',
    asserts: 'presentation',
    tier: 'T2',
  },
  {
    id: 'BJ-CRE-10',
    what: 'the ten-step launch flow of 05 journey 7, each step reachable from the previous one',
    asserts: 'navigation',
    tier: 'T3',
    blocked:
      'doc 22 §8.3: only five of the ten steps have UI. There is no studio-web and no mint-web ' +
      'page fetches a brand kit, so the first step of the flow does not exist and neither do the ' +
      'community and Market-publication steps at the end. A scenario written over the five that ' +
      'do exist would be claiming coverage of a journey by renaming it.',
  },
  {
    id: 'BJ-CRE-11',
    what: 'the mainnet allowlist is stated in words beside the choice rather than as a bare disabled control',
    asserts: 'presentation',
    tier: 'T1',
    ownedBy: { path: 'mint/src/server.ts', grep: 'mainnet' },
  },

  /* ── 6.19 Group S — the adversarial matrix ────────────────────────────────────────────────── */
  {
    id: 'BJ-ADV-04-H1',
    what: 'the launch order under a double-submit opens one order',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-ADV-04-H4',
    what: 'a failed launch order states the failure with its request id and keeps the draft on screen',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-ADV-04-H5',
    what: 'the session expires mid-flow on the launch form',
    asserts: 'presentation',
    tier: 'T3',
    blocked:
      'the re-authentication path is signInRedirect() into a surface that does not exist — doc ' +
      '22 §8.1, "nothing in the estate serves a sign-in page". The client half, that a failed ' +
      'refresh fires cf:auth-expired exactly once and drops the session, is already asserted by ' +
      'test/api.test.ts. The browser half needs a page to land on.',
  },
  {
    id: 'BJ-ADV-05-H1',
    what: 'pay and deploy under a double-submit: one charge and one queued run',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-05-H2',
    what: 'after a payment the pay control is gone rather than left to be pressed again',
    asserts: 'navigation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-05-H3',
    what: 'pay and deploy from two tabs',
    asserts: 'client-request',
    tier: 'T3',
    gate: true,
    blocked:
      'two browser contexts against one service. Doc 22 §4 makes that tier 3 by definition and ' +
      'puts tier 3 in micro-beacon; nothing in this repository can hold two browsers open. The ' +
      'defence is the service’s conditional UPDATE and its onConflict:keep enqueue, and both are ' +
      'micro-mint’s tests to own.',
  },
  {
    id: 'BJ-ADV-05-H4',
    what: 'a failed pay states the failure beside the control rather than in place of the page',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-05-H6',
    what: 'against a degraded service the pay and deploy controls are disabled while in flight',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-22',
    what: 'degraded not down: the page paints inside its deadline with the slow read marked pending',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-23',
    what: 'every failure state renders the request id to quote to support',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },

  /* ── 6.20 Group T — accessibility ─────────────────────────────────────────────────────────── */
  {
    id: 'BJ-A11Y-01',
    what: 'axe on every route of this surface: zero serious or critical violations',
    asserts: 'presentation',
    tier: 'T2',
    gate: true,
    blocked:
      'axe-core is not installed anywhere in the estate, and doc 22 §1 records that as true of ' +
      'all fifteen bundles. Doc 22 §7.2 makes the axe sweep estate-wide by construction ("Any PR ' +
      'in ui — every surface’s T1 axe set"), so it belongs to the shared design system rather ' +
      'than to one repository. BJ-A11Y-10 and -12 need no engine and are run.',
  },
  {
    id: 'BJ-A11Y-03',
    what: 'a degraded panel is still announced, and a failure is not colour-only',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-A11Y-10',
    what: 'colour is never the only channel: every state badge carries a word as well',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-A11Y-12',
    what: 'one main landmark, a reachable skip link, and a heading order with no level skipped',
    asserts: 'presentation',
    tier: 'T1',
  },

  /* ── 5.1 the universal per-surface property ───────────────────────────────────────────────── */
  {
    id: 'BJ-CREATE-404',
    what: 'an address this surface does not own renders the not-found screen UNDER a 404',
    asserts: 'navigation',
    tier: 'T2',
  },
]

/**
 * Every id doc 22 assigns to this surface.
 *
 * §6.4 in full; §6.19's `BJ-ADV-04` row over H1 H4 H5 and `BJ-ADV-05` over H1 H2 H3 H4 H6, which
 * are the hazards those two rows declare; §6.19's two page-level rows; the Group T rows naming a
 * property this surface has; and §5.1. Doc 22 §5 keys this surface `create`.
 */
export const DOC22_IDS: readonly string[] = [
  'BJ-CRE-01',
  'BJ-CRE-02',
  'BJ-CRE-03',
  'BJ-CRE-04',
  'BJ-CRE-05',
  'BJ-CRE-06',
  'BJ-CRE-07',
  'BJ-CRE-08',
  'BJ-CRE-09',
  'BJ-CRE-10',
  'BJ-CRE-11',
  'BJ-ADV-04-H1',
  'BJ-ADV-04-H4',
  'BJ-ADV-04-H5',
  'BJ-ADV-05-H1',
  'BJ-ADV-05-H2',
  'BJ-ADV-05-H3',
  'BJ-ADV-05-H4',
  'BJ-ADV-05-H6',
  'BJ-ADV-22',
  'BJ-ADV-23',
  'BJ-A11Y-01',
  'BJ-A11Y-03',
  'BJ-A11Y-10',
  'BJ-A11Y-12',
  'BJ-CREATE-404',
]
