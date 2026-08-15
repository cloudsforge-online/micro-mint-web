/**
 * Two events in ONE tick, on every control in this app that spends or commits something.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THESE SCENARIOS ARE NOT THE ONES ALREADY IN `journeys.test.ts`
 *
 * `BJ-ADV-04-H1` and `BJ-ADV-05-H1` already double-press the launch and pay controls. Both do it
 * like this:
 *
 *     s.clickNoFlush(button)
 *     await s.settle(0)                 // ← a render commits here
 *     assert.ok(button.hasAttribute('disabled'))
 *     s.clickNoFlush(button)
 *
 * That `settle(0)` is the whole difference. It lets React re-render, which is what puts `disabled`
 * on the DOM node and what makes the hook's `busy` visible to the next handler. So those scenarios
 * prove a real and useful property — a control does not stay live across a round trip — but they
 * cannot see the failure this file exists for, because they never put two events in the same tick.
 *
 * A real double click DOES put two events in the same tick. A trackpad, a stuck mouse button, an
 * assistive technology that re-sends an activation, a customer pressing Enter twice on a focused
 * button: in every one of those the second event is dispatched before the browser has had a chance
 * to paint, so:
 *
 *   - `disabled={busy}` is not yet on the node, because a render has not committed. The attribute
 *     is a description of a state React has been ASKED to move to, not one it is in.
 *   - `if (busy) return null` inside the handler reads `busy` out of the RENDER CLOSURE it was
 *     created in, and that closure is the one from before the first click. Both handlers read
 *     `false` and both proceed.
 *
 * The same class was found in `micro-tessera-web` (Fire, list and claim each produced two
 * requests) and in `micro-hub-web` (two 24-hour key-export ceremonies). Both were fixed the same
 * way: a latch on a ref, taken before the first `await` and released in a `finally`.
 *
 * ── What the server does with the duplicate, so this file does not overclaim ───────────────────
 *
 * Mint reads NO inbound `Idempotency-Key` on any route — `grep "'idempotency-key'" mint/src/` is
 * empty, and the `idempotencyKey` occurrences in `mint/src/ledgerclient.ts` and
 * `mint/src/custodyclient.ts` are keys mint SENDS DOWNSTREAM, derived as
 * `mint:order:<tokenId>`. So this client cannot send one, and the client-side latch is the only
 * client-side lever there is.
 *
 * Mint is nonetheless safe against the duplicate, and it is worth writing down exactly how,
 * because "safe" here does not mean "quiet":
 *
 *   - PAY. `payForDeploy` re-reads the row `for update` (`mint/src/orders.ts`) and refuses
 *     anything that is not `awaiting_payment` (`mint/src/orders.ts`). A second concurrent
 *     request BLOCKS on the row lock, and when the first commits it wakes up, sees `paid`, and
 *     throws `OrderStateError` — which is a **409**, not a replay (`mint/src/server.ts`).
 *     The customer is charged once. But the second request's 409 lands in `useMutation`'s error
 *     state, so this screen renders "The payment did not go through" BESIDE "Paid. 500,000,000
 *     Sparks has been debited." One click, two truths, and the alarming one is wrong.
 *   - DEPLOY. The enqueue is `onConflict: 'keep'` (`mint/src/server.ts`), so two accepted
 *     requests produce one job. Both answer 202. Nothing is deployed twice.
 *   - CREATE. `POST /v1/tokens` has no such guard at all: it is a plain `insert`
 *     (`mint/src/tokens.ts`). Two requests open TWO ORDERS. Neither is charged for by
 *     itself — payment is a separate action — but the customer navigates to one of them and the
 *     other is left in `awaiting_payment` forever, in a list capped at 100 rows.
 *
 * So on this surface the latch is a correctness fix for create, a defect fix for the 409 the pay
 * screen renders, and load reduction for deploy. It is not the thing standing between a customer
 * and a double debit — mint's row lock is. Saying so is the point; a guard sold as the last line
 * of defence is a guard nobody re-checks.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes, type Screen } from './dom.ts'
import * as fx from './fixtures.ts'
import { AuthProvider } from '../src/lib/auth.tsx'
import { LaunchPage } from '../src/pages/launch.tsx'
import { TokenPage } from '../src/pages/token.tsx'

const ORIGIN = 'https://create.cloudsforge.online'

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element) as ReactElement)

const tokenAt = (path = `/tokens/${fx.ORDER_ID}`): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(
      AuthProvider,
      null,
      h(RouterRoutes, null, h(Route, { path: '/tokens/:id', element: h(TokenPage) })) as ReactElement,
    ) as ReactElement,
  )

const orderRoutes = (over: Routes = {}): Routes => ({
  'GET /auth/me': { body: fx.ME },
  [`GET /v1/tokens/${fx.ORDER_ID}`]: { body: { token: fx.order(), attempts: [] } },
  ...over,
})

/**
 * The pay control, addressed by its accessible name.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS MATCHER WAS `/Pay .* Shards/`, AND IT WAS PART OF THE DEFECT.
 *
 * Four scenarios in this file found the button by a pattern containing the name of a currency the
 * estate retired on 2026-08-04 (`contracts/packages/chain/src/index.ts`). They were green
 * BECAUSE the retired word was on the screen: to take Shards off Forge Create, somebody had to
 * edit this line first. `test/retired-currency.test.ts` names the shape — a suite made only of
 * forward assertions cannot notice retired vocabulary, it pins it in place — and this is one of
 * the four it names.
 *
 * The replacement anchors on the CURRENCY-FREE part of the label and asserts the shape of the
 * amount rather than its unit, so the next re-denomination fails on the format check in
 * `test/format.test.ts` (which is a test of a function) instead of quietly here.
 *
 * `^Pay ` with the space is load-bearing. The busy label is `Paying…` and it is the SAME element,
 * so a matcher of `/^Pay/` would match both and `byRole` — which requires exactly one hit — would
 * still pass while addressing whichever the render happened to produce. The `$` anchors out any
 * future suffix for the same reason.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
const PAY_BUTTON = /^Pay \$[\d,]+\.\d\d$/

/**
 * Both mountings, every time.
 *
 * The app renders under `<StrictMode>` (`src/main.tsx:...`) and this harness does not. A ref latch
 * lives across renders, and StrictMode double-invokes render and remounts every effect — so it is
 * exactly the mode in which a ref-based guard can behave differently from the way a test saw it.
 * Running each scenario twice costs a second and closes that gap.
 */
const BOTH_MOUNTINGS: readonly { readonly label: string; readonly strict: boolean }[] = [
  { label: 'as this suite mounts it', strict: false },
  { label: 'under StrictMode, as the browser mounts it', strict: true },
]

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The harness option this file leans on, checked before anything leans on it
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the strict mounting is really strict', () => {
  it('mounts effects twice, which is what makes the strict half of every proof below mean anything', async () => {
    const routes = orderRoutes()
    let plain = 0
    let strict = 0
    await withScreen(
      tokenAt(),
      { url: `${ORIGIN}/tokens/${fx.ORDER_ID}`, storage: fx.SIGNED_IN, routes },
      async (s) => {
        await s.settle(20)
        plain = s.api.matching(`GET /v1/tokens/${fx.ORDER_ID}`).length
      },
    )
    await withScreen(
      tokenAt(),
      { url: `${ORIGIN}/tokens/${fx.ORDER_ID}`, storage: fx.SIGNED_IN, routes, strict: true },
      async (s) => {
        await s.settle(20)
        strict = s.api.matching(`GET /v1/tokens/${fx.ORDER_ID}`).length
      },
    )

    // StrictMode mounts, unmounts and re-mounts every effect, so `useResource` asks twice. If this
    // ever stops being true the option has become a no-op and every "under StrictMode" test in
    // this file is silently running the ordinary mounting twice — the shape of green that proves
    // nothing.
    assert.equal(plain, 1, 'the ordinary mounting ran its read more than once')
    assert.equal(strict, 2, 'the strict mounting did not double-mount effects: `strict` is a no-op')
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Pay — the one that moves money
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two clicks in one tick — Pay', () => {
  for (const mounting of BOTH_MOUNTINGS) {
    it(`sends exactly one debit, ${mounting.label}`, async () => {
      await withScreen(
        tokenAt(),
        {
          url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
          storage: fx.SIGNED_IN,
          strict: mounting.strict,
          routes: orderRoutes({
            [`POST /v1/tokens/${fx.ORDER_ID}/pay`]: {
              status: 201,
              body: { token: fx.order({ status: 'paid' }), replayed: false },
              delayMs: 15,
            },
          }),
        },
        async (s) => {
          await s.settle(20)
          const pay = s.byRole('button', PAY_BUTTON)
          // No settle between them. This is the whole scenario: the second event is dispatched
          // before React has rendered anything in response to the first.
          s.clickNoFlush(pay)
          s.clickNoFlush(pay)
          await s.settle(60)

          assert.equal(
            s.api.matching(`POST /v1/tokens/${fx.ORDER_ID}/pay`).length,
            1,
            'one double click sent two debits for the same order. Mint charges once — the second ' +
              'request blocks on the row lock and then answers 409 (mint/src/orders.ts) — but ' +
              'the 409 is what this screen renders, so the customer is told their payment failed ' +
              'underneath a confirmation that it succeeded.',
          )
        },
      )
    })
  }

  it('renders no payment failure after a double click, because there was no second request', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          // The service's real answer to a duplicate: 409 `order_state` — `mint/src/server.ts`
          // reached from `mint/src/orders.ts`. Stubbed as a function so the FIRST call
          // succeeds and only a SECOND one is refused, which is what the row lock produces.
          [`POST /v1/tokens/${fx.ORDER_ID}/pay`]: (_wire, n) =>
            n === 1
              ? {
                  status: 201,
                  body: { token: fx.order({ status: 'paid' }), replayed: false },
                  delayMs: 15,
                }
              : {
                  status: 409,
                  body: fx.error('order_state', 'an order in paid cannot be paid'),
                  requestId: 'req-pay-409',
                },
        }),
      },
      async (s) => {
        await s.settle(20)
        const pay = s.byRole('button', PAY_BUTTON)
        s.clickNoFlush(pay)
        s.clickNoFlush(pay)
        await s.settle(60)

        // The visible half of the defect, asserted as presentation rather than as a rule: a
        // customer whose money left their wallet is being shown a failure notice about it.
        assert.doesNotMatch(
          s.text(),
          /an order in paid cannot be paid/i,
          "the screen quoted mint's 409 for a payment that went through, which is what a second " +
            'request in the same tick earns',
        )
        assert.doesNotMatch(
          s.text(),
          /the payment did not go through/i,
          'a successful payment was reported as a failure, because the duplicate request the ' +
            'guard should have refused came back 409',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The other half of a latch: it has to be RELEASED
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the latch is released on every ending, not only the happy one', () => {
  it('a refused payment can be tried again', async () => {
    let attempts = 0
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`POST /v1/tokens/${fx.ORDER_ID}/pay`]: () => {
            attempts += 1
            return attempts === 1
              ? {
                  status: 402,
                  body: fx.error('insufficient_balance', 'the EMBER balance for this account may not go negative'),
                  requestId: 'req-pay-402',
                }
              : { status: 201, body: { token: fx.order({ status: 'paid' }), replayed: false } }
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        await s.click(s.byRole('button', PAY_BUTTON))
        await s.settle(30)
        assert.match(s.text(), /may not go negative/i, 'the refusal never landed')

        // Top up in another tab, come back, press again. This is the ONLY thing standing between a
        // ref latch and a control that is dead for the rest of the session: the release has to be
        // in a `finally`. A release on the success path alone leaves `inFlight` true forever after
        // any failure, and the button then looks perfectly live and does nothing at all — which is
        // strictly worse than the double submit it was added to prevent.
        await s.click(s.byRole('button', PAY_BUTTON))
        await s.settle(30)

        assert.equal(
          s.api.matching(`POST /v1/tokens/${fx.ORDER_ID}/pay`).length,
          2,
          'the second press sent nothing. The latch was never released after the 402, so the pay ' +
            'control is now permanently inert and only a page reload can clear it.',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Deploy — the one that puts a contract on a chain
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two clicks in one tick — Deploy', () => {
  for (const mounting of BOTH_MOUNTINGS) {
    it(`queues exactly one deploy, ${mounting.label}`, async () => {
      await withScreen(
        tokenAt(),
        {
          url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
          storage: fx.SIGNED_IN,
          strict: mounting.strict,
          routes: orderRoutes({
            [`GET /v1/tokens/${fx.ORDER_ID}`]: {
              body: { token: fx.order({ status: 'paid' }), attempts: [] },
            },
            [`POST /v1/tokens/${fx.ORDER_ID}/deploy`]: {
              status: 202,
              body: { accepted: true, tokenId: fx.ORDER_ID, status: 'paid', statusUrl: '/v1/tokens/x' },
              delayMs: 15,
            },
          }),
        },
        async (s) => {
          await s.settle(20)
          const deploy = s.byRole('button', 'Deploy')
          s.clickNoFlush(deploy)
          s.clickNoFlush(deploy)
          await s.settle(60)

          assert.equal(
            s.api.matching(`POST /v1/tokens/${fx.ORDER_ID}/deploy`).length,
            1,
            'one double click asked twice for a contract to be put on a chain. The enqueue is ' +
              "onConflict: 'keep' (mint/src/server.ts) so one job runs, but the screen " +
              'promises "Pressing this twice produces one run, not two" and it must not be the ' +
              'queue alone that makes that sentence true.',
          )
        },
      )
    })
  }

  it('the control is disabled across the round trip, not merely ignoring presses', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`GET /v1/tokens/${fx.ORDER_ID}`]: {
            body: { token: fx.order({ status: 'paid' }), attempts: [] },
          },
          [`POST /v1/tokens/${fx.ORDER_ID}/deploy`]: { status: 202, body: { accepted: true }, delayMs: 40 },
        }),
      },
      async (s) => {
        await s.settle(20)
        const deploy = s.byRole('button', 'Deploy')
        s.clickNoFlush(deploy)
        await s.settle(0)
        // The ref refuses the second call; the attribute is what tells a person the first one is
        // still happening. A control that silently swallows presses is a control people press
        // harder.
        assert.ok(
          deploy.hasAttribute('disabled'),
          'the deploy control stayed live while its own 202 was in flight',
        )
        await s.settle(80)
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Create — the one with no server-side guard at all
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two submits in one tick — the commit button on the order form', () => {
  for (const mounting of BOTH_MOUNTINGS) {
    it(`opens exactly one order, ${mounting.label}`, async () => {
      await withScreen(
        page(h(LaunchPage), '/launch'),
        {
          url: `${ORIGIN}/launch`,
          storage: fx.SIGNED_IN,
          strict: mounting.strict,
          routes: {
            'GET /auth/me': { body: fx.ME },
            'GET /v1/catalogue': { body: fx.catalogue() },
            'POST /v1/tokens': { status: 201, body: { token: fx.order() }, delayMs: 15 },
          },
        },
        async (s) => {
          await s.settle(20)
          await fillLaunchForm(s)
          // Matched on the COMMIT VERB, not on the exact label. This assertion was
          // `/Create this launch/` and went red the day the button was relabelled — a
          // double-submit guard that a copy edit can break is a guard that gets deleted rather
          // than fixed. `test/journeys.test.ts` pins the same family for the same reason. The
          // anchor keeps it off the "I meant N whole tokens" button beside the supply field.
          const commit = s.byRole('button', /^(open|create)/i)
          s.clickNoFlush(commit)
          s.clickNoFlush(commit)
          await s.settle(60)

          assert.equal(
            s.api.matching('POST /v1/tokens').length,
            1,
            'one double submit opened two token orders. `POST /v1/tokens` is a plain insert ' +
              '(mint/src/tokens.ts) with no conditional update and no idempotency key, so ' +
              'nothing on the server collapses them: the customer lands on one order and the ' +
              'other sits in their launch list, awaiting_payment, forever.',
          )
        },
      )
    })
  }
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Publish this — the same hook, the same tick
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two clicks in one tick — Publish this', () => {
  for (const mounting of BOTH_MOUNTINGS) {
    it(`sends exactly one PUT, ${mounting.label}`, async () => {
      await withScreen(
        tokenAt(),
        {
          url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
          storage: fx.SIGNED_IN,
          strict: mounting.strict,
          routes: orderRoutes({
            [`PUT /v1/tokens/${fx.ORDER_ID}/page`]: {
              status: 200,
              body: { page: fx.projectPage() },
              delayMs: 15,
            },
          }),
        },
        async (s) => {
          await s.settle(20)
          const save = s.byRole('button', /Publish this/)
          s.clickNoFlush(save)
          s.clickNoFlush(save)
          await s.settle(60)

          assert.equal(
            s.api.matching(`PUT /v1/tokens/${fx.ORDER_ID}/page`).length,
            1,
            'one double click sent two whole-document PUTs. A PUT of the whole document blanks ' +
              'every field it omits (mint/src/server.ts), so two of them racing is two ' +
              "writers for one project page and the later one wins whatever it happened to hold.",
          )
        },
      )
    })
  }

  it('the control is disabled across the round trip, not merely ignoring presses', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`PUT /v1/tokens/${fx.ORDER_ID}/page`]: {
            status: 200,
            body: { page: fx.projectPage() },
            delayMs: 40,
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        const save = s.byRole('button', /Publish this/)
        s.clickNoFlush(save)
        await s.settle(0)
        assert.ok(
          save.hasAttribute('disabled'),
          'the save control stayed live while its own PUT was in flight',
        )
        await s.settle(80)
      },
    )
  })
})

/* ── helpers ────────────────────────────────────────────────────────────────────────────────── */

/** Fill the launch form with a valid fixed-supply draft. Kept in step with `journeys.test.ts`. */
async function fillLaunchForm(s: Screen): Promise<void> {
  const boxes = s.allByRole('textbox')
  const fill = async (want: RegExp, value: string): Promise<void> => {
    const el = boxes.find((box) => want.test(labelFor(box)))
    if (el) await s.type(el, value)
  }
  await fill(/^name$/i, 'Journey Token')
  await fill(/symbol/i, 'JRNY')
  await fill(/initial supply/i, '1000000')
  await fill(/owner address/i, fx.OWNER)
  await fill(/^decimals$/i, '18')
  await fill(/wallet/i, 'wallet-1')
}

/** The label SPAN, never the whole wrapper — see the long note in `journeys.test.ts`. */
function labelFor(el: Element): string {
  const wrapping = el.closest('label')
  const span = wrapping?.querySelector('.mw-field__label')
  if (span) return span.textContent ?? ''
  return wrapping?.textContent ?? el.getAttribute('name') ?? ''
}
