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
 * empty, and the `idempotencyKey` occurrences in `mint/src/ledgerclient.ts:79` and
 * `mint/src/custodyclient.ts:206` are keys mint SENDS DOWNSTREAM, derived as
 * `mint:order:<tokenId>`. So this client cannot send one, and the client-side latch is the only
 * client-side lever there is.
 *
 * Mint is nonetheless safe against the duplicate, and it is worth writing down exactly how,
 * because "safe" here does not mean "quiet":
 *
 *   - PAY. `payForDeploy` re-reads the row `for update` (`mint/src/orders.ts:105-110`) and refuses
 *     anything that is not `awaiting_payment` (`mint/src/orders.ts:114-116`). A second concurrent
 *     request BLOCKS on the row lock, and when the first commits it wakes up, sees `paid`, and
 *     throws `OrderStateError` — which is a **409**, not a replay (`mint/src/server.ts:287-291`).
 *     The customer is charged once. But the second request's 409 lands in `useMutation`'s error
 *     state, so this screen renders "The payment did not go through" BESIDE "Paid. The Shards have
 *     been debited." One click, two truths, and the alarming one is wrong.
 *   - DEPLOY. The enqueue is `onConflict: 'keep'` (`mint/src/server.ts:547-552`), so two accepted
 *     requests produce one job. Both answer 202. Nothing is deployed twice.
 *   - CREATE. `POST /v1/tokens` has no such guard at all: it is a plain `insert`
 *     (`mint/src/tokens.ts:315-334`). Two requests open TWO ORDERS. Neither is charged for by
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
          const pay = s.byRole('button', /Pay .* Shards/)
          // No settle between them. This is the whole scenario: the second event is dispatched
          // before React has rendered anything in response to the first.
          s.clickNoFlush(pay)
          s.clickNoFlush(pay)
          await s.settle(60)

          assert.equal(
            s.api.matching(`POST /v1/tokens/${fx.ORDER_ID}/pay`).length,
            1,
            'one double click sent two debits for the same order. Mint charges once — the second ' +
              'request blocks on the row lock and then answers 409 (mint/src/orders.ts:114) — but ' +
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
          // The service's real answer to a duplicate: 409 `order_state` — `mint/src/server.ts:291`
          // reached from `mint/src/orders.ts:114-116`. Stubbed as a function so the FIRST call
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
        const pay = s.byRole('button', /Pay .* Shards/)
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
              "onConflict: 'keep' (mint/src/server.ts:547-552) so one job runs, but the screen " +
              'promises "Pressing this twice produces one run, not two" and it must not be the ' +
              'queue alone that makes that sentence true.',
          )
        },
      )
    })
  }
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Create — the one with no server-side guard at all
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two submits in one tick — Open the order', () => {
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
          const commit = s.byRole('button', /Open the order/)
          s.clickNoFlush(commit)
          s.clickNoFlush(commit)
          await s.settle(60)

          assert.equal(
            s.api.matching('POST /v1/tokens').length,
            1,
            'one double submit opened two token orders. `POST /v1/tokens` is a plain insert ' +
              '(mint/src/tokens.ts:315-334) with no conditional update and no idempotency key, so ' +
              'nothing on the server collapses them: the customer lands on one order and the ' +
              'other sits in their launch list, awaiting_payment, forever.',
          )
        },
      )
    })
  }
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Save the project page — the same hook, the same tick
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two clicks in one tick — Save the project page', () => {
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
          const save = s.byRole('button', /Save the project page/)
          s.clickNoFlush(save)
          s.clickNoFlush(save)
          await s.settle(60)

          assert.equal(
            s.api.matching(`PUT /v1/tokens/${fx.ORDER_ID}/page`).length,
            1,
            'one double click sent two whole-document PUTs. A PUT of the whole document blanks ' +
              'every field it omits (mint/src/server.ts:574-584), so two of them racing is two ' +
              "writers for one project page and the later one wins whatever it happened to hold.",
          )
        },
      )
    })
  }
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
