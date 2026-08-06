/**
 * The browser journeys of `docs/ecosystem/22-browser-journeys.md`, tiers 1 and 2, for this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE. Doc 22 §3: **a browser scenario may never assert a business rule.**
 *
 * A game client once withheld four SKUs from its UI while the payment routes stayed live and
 * chargeable (14 §11); a client-side test of the hidden catalogue would have passed, green,
 * against the defect. So every scenario below asserts one of exactly three things (§3.1): what a
 * human can see relative to what the API returned in the SAME run, what the client SENT, or where
 * the browser ended up.
 *
 * ── The property this surface exists to keep ───────────────────────────────────────────────────
 *
 * **Deploy answers 202. It does not deploy.** `POST /v1/tokens/:id/deploy` authenticates, checks
 * the allowlist, runs one conditional UPDATE, enqueues a job and returns a `Location`
 * (`mint/src/server.ts`). A screen that says "deployed" because a button returned has told a
 * customer their contract exists at a moment when nothing has been broadcast. BJ-CRE-04 asserts
 * the word on the screen after the 202, and BJ-CRE-05 asserts that the truth arrives from a
 * re-read rather than from the acknowledgement.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes, type Screen } from './dom.ts'
import * as fx from './fixtures.ts'
import { DOC22_IDS, SCENARIOS } from './journeys.ts'
import { App } from '../src/app.tsx'
import { AuthProvider } from '../src/lib/auth.tsx'
import { ROUTES } from '../src/lib/routes.ts'
import { CataloguePage } from '../src/pages/catalogue.tsx'
import { LaunchPage } from '../src/pages/launch.tsx'
import { ProjectPage } from '../src/pages/project.tsx'
import { TokenPage } from '../src/pages/token.tsx'
import { TokensPage } from '../src/pages/tokens.tsx'

const ORIGIN = 'https://create.cloudsforge.online'
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element) as ReactElement)

/**
 * The token and project pages read their id with `useParams`, so they need a real matched route
 * rather than a bare element under a router — otherwise the id is `''` and every scenario would
 * silently run against the not-found branch.
 */
const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(
      AuthProvider,
      null,
      h(RouterRoutes, null, h(Route, { path: pattern, element })) as ReactElement,
    ) as ReactElement,
  )

const tokenAt = (path = `/tokens/${fx.ORDER_ID}`) =>
  atRoute('/tokens/:id', h(TokenPage), path)

const orderRoutes = (over: Routes = {}): Routes => ({
  'GET /auth/me': { body: fx.ME },
  [`GET /v1/tokens/${fx.ORDER_ID}`]: { body: { token: fx.order(), attempts: [] } },
  ...over,
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.4 Group D — Forge Create
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-CRE — Forge Create', () => {
  it('BJ-CRE-01 ★ T2: an anonymous visitor gets the catalogue, with its cost and no sign-in prompt', async () => {
    const cat = fx.catalogue()
    await withScreen(
      page(h(CataloguePage), '/'),
      { url: `${ORIGIN}/`, routes: { 'GET /v1/catalogue': { body: cat } } },
      async (s) => {
        // Presentation relative to what the API returned in this same run: one entry per variant,
        // whatever the response held.
        for (const v of cat.variants) {
          assert.ok(
            s.text().toLowerCase().includes(v.variant),
            `the ${v.variant} variant has no entry`,
          )
        }
        // With its cost, in the unit the response states it in. The price is a projection of the
        // committed contracts, not a list somebody maintains, so it comes off the response —
        // `priceUsdCents: '2500'` is $25.00 (`mint/src/server.ts`), and the settlement
        // asset is read from the body too rather than being spelled out here. Asserting the
        // FORMATTED dollar figure and not the raw integer is deliberate: `2500` on screen would
        // satisfy a bare digit check while meaning cents, Shards or nothing at all.
        assert.ok(s.text().includes('$25.00'), 'the price is not shown')
        assert.ok(s.text().includes(cat.settlementAsset), 'the screen does not say what settles it')

        // And no credential went out. "A catalogue behind a token cannot be browsed."
        for (const w of s.api.wire) {
          assert.equal(w.headers.authorization, undefined, `${w.path} carried a credential`)
        }
        assert.doesNotMatch(s.text(), /sign in to/i, 'the catalogue asks an anonymous reader to sign in')
        s.clean('BJ-CRE-01')
      },
    )
  })

  it('BJ-CRE-01 ★ T2: the cap rule is part of each tier rather than small print', async () => {
    await withScreen(
      page(h(CataloguePage), '/'),
      { url: `${ORIGIN}/`, routes: { 'GET /v1/catalogue': { body: fx.catalogue() } } },
      async (s) => {
        // `cap` is 'required' or 'forbidden' and there is no third option
        // (`mint/src/catalogue.ts`). A customer who does not learn that here learns it after
        // paying.
        assert.match(s.text(), /cap/i, 'the cap rule is not on the catalogue at all')
      },
    )
  })

  it('BJ-CRE-02 T1: the launch form says it charges nothing, and says it above the button', async () => {
    await withScreen(
      page(h(LaunchPage), '/launch'),
      {
        url: `${ORIGIN}/launch`,
        storage: fx.SIGNED_IN,
        routes: { 'GET /auth/me': { body: fx.ME }, 'GET /v1/catalogue': { body: fx.catalogue() } },
      },
      async (s) => {
        await s.settle(20)
        assert.match(
          s.text(),
          /nothing is charged|charges nothing|opens an order/i,
          'a form taking a wallet id and an owner address looks exactly like one about to spend ' +
            'money, and this one does not say otherwise',
        )
        const commit = s.allByRole('button').find((el) => /open|create|launch/i.test(s.textOf(el)))
        assert.ok(commit, 'the launch form has no commit control')
        const said = s.orderOf(/nothing is charged|charges nothing|opens an order/i)
        const button = s.orderOf(s.textOf(commit))
        assert.ok(said >= 0 && said < button, 'the sentence is below the button')
      },
    )
  })

  it('BJ-CRE-03 ★ T1: the order posted is the draft on screen, and the browser lands on it', async () => {
    await withScreen(
      page(h(LaunchPage), '/launch'),
      {
        url: `${ORIGIN}/launch`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/catalogue': { body: fx.catalogue() },
          'POST /v1/tokens': { status: 201, body: { token: fx.order() } },
        },
      },
      async (s) => {
        await s.settle(20)
        const draft = await fillLaunchForm(s)
        const commit = s.allByRole('button').find((el) => /open|create|launch/i.test(s.textOf(el)))
        assert.ok(commit)
        await s.click(commit)
        await s.settle(30)

        const posted = s.api.matching('POST /v1/tokens')[0]
        assert.ok(posted, 'the launch form sent nothing')
        const body = posted.json as Record<string, unknown>
        // The client-request assertion: what was typed is what was sent. `supply` reaches the
        // constructor UNSCALED (`ForgeTokens.sol`), so a client that rescaled it here would
        // mint a different number of tokens from the one on screen.
        assert.equal(body['name'], draft.name)
        assert.equal(body['symbol'], draft.symbol)
        assert.equal(body['supply'], draft.supply)
        assert.equal(body['ownerAddress'], draft.ownerAddress)
      },
    )
  })

  it('BJ-CRE-04 ★ T1: pressing Deploy renders "accepted", never "deployed"', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`GET /v1/tokens/${fx.ORDER_ID}`]: { body: { token: fx.order({ status: 'paid' }), attempts: [] } },
          [`POST /v1/tokens/${fx.ORDER_ID}/deploy`]: { status: 202, body: { accepted: true } },
        }),
      },
      async (s) => {
        await s.settle(20)
        await s.click(s.byRole('button', 'Deploy'))
        await s.settle(30)

        assert.match(s.text(), /put in the queue/i, 'the 202 was not reported as an acceptance')
        assert.match(s.text(), /nothing has reached a chain yet/i)
        // And the STATE the page claims is still the order's own. Asserted on the badge rather
        // than by grepping the prose, because the page legitimately contains the word "deployed"
        // in "this launch can now be deployed" — a guard that failed on correct copy is a guard
        // somebody deletes.
        const badge = s.document.querySelector('[class*="badge" i]')
        assert.ok(badge, 'the order state is not rendered as a badge')
        assert.doesNotMatch(
          s.textOf(badge),
          /deployed/i,
          'the badge said deployed because a button returned. The service answered 202 and a ' +
            'status URL; nothing has been broadcast.',
        )
        // The chain facts are still absent, because there are none yet.
        assert.match(s.text(), /nothing has been sent to a node/i)
      },
    )
  })

  it('BJ-CRE-05 T1: the truth arrives from a re-read, not from the button’s response', async () => {
    let reads = 0
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          [`GET /v1/tokens/${fx.ORDER_ID}`]: () => {
            reads += 1
            // The second read is the one after the deploy job has moved the order on.
            return reads === 1
              ? { body: { token: fx.order({ status: 'paid' }), attempts: [] } }
              : {
                  body: {
                    token: fx.order({
                      status: 'deployed',
                      contractAddress: '0x9999999999999999999999999999999999999999',
                      deployTxHash: `0x${'cd'.repeat(32)}`,
                      confirmedAt: '2026-08-01T09:10:00.000Z',
                    }),
                    attempts: [fx.attempt({ outcome: 'confirmed' })],
                  },
                }
          },
          [`POST /v1/tokens/${fx.ORDER_ID}/deploy`]: { status: 202, body: { accepted: true } },
        },
      },
      async (s) => {
        await s.settle(20)
        assert.equal(reads, 1)
        await s.click(s.byRole('button', 'Deploy'))
        await s.settle(30)
        assert.equal(reads, 2, 'the deploy did not re-read the order; the screen is the 202')
        // Now the chain facts are on screen, and they came from the read.
        assert.ok(s.text().includes('0x9999'), 'the contract address from the re-read is not shown')
        assert.match(s.text(), /confirmed/i)
      },
    )
  })

  it('BJ-CRE-06 T1: the buttons are offered from the order’s own state', async () => {
    const buttonsFor = async (status: string): Promise<string[]> => {
      let captured: string[] = []
      await withScreen(
        tokenAt(),
        {
          url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
          storage: fx.SIGNED_IN,
          routes: orderRoutes({
            [`GET /v1/tokens/${fx.ORDER_ID}`]: {
              body: { token: fx.order({ status: status as never }), attempts: [] },
            },
          }),
        },
        async (s) => {
          await s.settle(20)
          captured = s.allByRole('button').map((el) => s.textOf(el))
        },
      )
      return captured
    }

    // A button that will answer 409 has told the customer something false about what is possible.
    const awaiting = await buttonsFor('awaiting_payment')
    assert.ok(awaiting.some((b) => /pay/i.test(b)), 'an unpaid order offers no pay button')
    assert.ok(!awaiting.some((b) => /^deploy$/i.test(b)), 'an unpaid order offered a deploy button')

    const paid = await buttonsFor('paid')
    assert.ok(paid.some((b) => /^deploy$/i.test(b)), 'a CLAIMABLE order offers no deploy button')
    assert.ok(!paid.some((b) => /pay /i.test(b)), 'a paid order still offered a pay button')

    const deployed = await buttonsFor('deployed')
    assert.ok(!deployed.some((b) => /^deploy$/i.test(b)), 'a deployed order offered deploy again')
    assert.ok(!deployed.some((b) => /pay /i.test(b)), 'a deployed order offered pay')
  })

  it('BJ-CRE-07 T1: a replayed payment is not rendered as an error', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`POST /v1/tokens/${fx.ORDER_ID}/pay`]: {
            status: 200,
            body: { token: fx.order({ status: 'paid' }), replayed: true },
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        await s.click(s.byRole('button', /pay /i))
        await s.settle(30)
        // 200 versus 201 is a real difference and the service exposes it deliberately. "Already
        // paid" and "just paid" are different facts about somebody's money.
        assert.match(s.text(), /had already settled this launch/i)
        assert.match(s.text(), /no second debit was taken/i)
        const alerts = [...s.document.querySelectorAll('[role="alert"]')]
        assert.deepEqual(
          alerts.map((a) => s.textOf(a)),
          [],
          'a replay was rendered as an error',
        )
      },
    )
  })

  it('BJ-CRE-08 T1: the launches list says it is capped rather than offering a dead next button', async () => {
    const many = Array.from({ length: 100 }, (_v, i) =>
      fx.order({ id: `order-${i}`, name: `Token ${i}`, symbol: `T${i}` }),
    )
    await withScreen(
      page(h(TokensPage), '/tokens'),
      {
        url: `${ORIGIN}/tokens`,
        storage: fx.SIGNED_IN,
        routes: { 'GET /auth/me': { body: fx.ME }, 'GET /v1/tokens': { body: { tokens: many } } },
      },
      async (s) => {
        await s.settle(20)
        assert.match(s.text(), /100|cap/i, 'a full page does not say it is capped')
        const next = s.allByRole('button').find((el) => /next|more|older/i.test(s.textOf(el)))
        assert.equal(
          next,
          undefined,
          'the list offers a pagination control the route cannot serve — it takes no cursor',
        )
        const nextLink = s.allByRole('link').find((el) => /next page|load more/i.test(s.textOf(el)))
        assert.equal(nextLink, undefined, 'the list offers a pagination link that cannot work')
      },
    )
  })

  it('BJ-CRE-09 T2: the public project page renders for anybody with the address', async () => {
    await withScreen(
      atRoute('/projects/:id', h(ProjectPage), `/projects/${fx.ORDER_ID}`),
      {
        url: `${ORIGIN}/projects/${fx.ORDER_ID}`,
        routes: {
          [`GET /v1/tokens/${fx.ORDER_ID}/page`]: {
            body: {
              token: {
                id: fx.ORDER_ID,
                chain: 'ember',
                network: 'testnet',
                symbol: 'TT',
                name: 'Test Token',
                status: 'deployed',
              },
              page: fx.projectPage(),
              onchain: null,
              risk: {
                hasMintAuthority: null,
                ownershipRenounced: null,
                paused: null,
                supplyExceedsOrder: null,
              },
              onchainUnavailable: 'the indexer did not answer',
            },
          },
        },
      },
      async (s) => {
        await s.settle(20)
        assert.ok(s.text().includes('Test Token'))
        // No credential. A project page nobody can read without an account cannot do the one job
        // it has.
        for (const w of s.api.wire) {
          assert.equal(w.headers.authorization, undefined, `${w.path} carried a credential`)
        }
        // And `onchain: null` renders as an absence WITH ITS REASON — never filled in from the
        // order record. 04-domain-model §5.3: a buyer must not be able to mistake an intent for
        // an observation.
        assert.match(s.text(), /the indexer did not answer/i)
        assert.ok(
          !s.text().includes('1,000,000') && !s.text().includes('1000000'),
          'the order’s requested supply was rendered on a page whose whole point is that the ' +
            'chain, not the order, is the source of that number',
        )
      },
    )
  })

  it('BJ-CRE-11 T1: the mainnet allowlist is stated in words beside the choice', async () => {
    await withScreen(
      page(h(LaunchPage), '/launch'),
      {
        url: `${ORIGIN}/launch`,
        storage: fx.SIGNED_IN,
        routes: { 'GET /auth/me': { body: fx.ME }, 'GET /v1/catalogue': { body: fx.catalogue() } },
      },
      async (s) => {
        await s.settle(20)
        const network = s
          .allByRole('combobox')
          .find((el) => [...el.querySelectorAll('option')].some((o) => o.getAttribute('value') === 'mainnet'))
        assert.ok(network, 'the network choice does not offer mainnet at all')
        await s.type(network, 'mainnet')

        // Words, not a bare disabled control. The check happens at DEPLOY — after payment
        // (`mint/src/server.ts`) — so the only place a customer can act on it is here.
        assert.match(s.text(), /allowlisted/i, 'choosing mainnet says nothing about the allowlist')
        assert.match(s.text(), /after payment|before paying/i, 'the ORDER of the two is the point')
        assert.ok(
          !network.hasAttribute('disabled'),
          'mainnet was disabled rather than explained, which tells the customer nothing',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   An unreachable service must not read as an answer.
   `src/lib/resource.ts`: FAILURE OUTRANKS EMPTINESS.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('a service that could not be reached says so', () => {
  it('the launch form names the missing price rather than silently omitting it', async () => {
    await withScreen(
      page(h(LaunchPage), '/launch'),
      {
        url: `${ORIGIN}/launch`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/catalogue': {
            status: 503,
            body: fx.error('unavailable', 'the catalogue is temporarily unavailable'),
            requestId: 'req-cat-503',
          },
        },
      },
      async (s) => {
        await s.settle(30)
        // The price line is conditional on `catalogue.data`, so before this branch existed a 503
        // rendered as an ordinary page with no cost on it — and a page with no cost on it looks
        // exactly like a page whose product is free. The failure has to be visible.
        assert.match(s.text(), /not being reported|temporarily unavailable/i,
          'the catalogue was down and the form said nothing about it, so the absent price reads ' +
            'as the whole truth about what this costs')
        assert.match(s.text(), /req-cat-503/, 'no request id to quote for the outage')
        // And the form is still usable, deliberately: opening an order charges nothing and the
        // service sets the price itself. Blanking the page for a price lookup would be the same
        // mistake in the other direction.
        assert.ok(s.allByRole('textbox').length > 0, 'a price outage removed the form')
      },
    )
  })

  it('the launches list renders "no launches yet" only for an actual empty answer', async () => {
    await withScreen(
      page(h(TokensPage), '/tokens'),
      {
        url: `${ORIGIN}/tokens`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/tokens': { networkError: 'the connection was reset' },
        },
      },
      async (s) => {
        await s.settle(30)
        // The estate found `hasAnswer(t) ? t.data : []` making a wallet panel say "There is no
        // balance to send" during an outage. This is the same sentence in this app's vocabulary,
        // and a customer reading it about their own launches would reasonably conclude their
        // orders were gone.
        assert.doesNotMatch(
          s.text(),
          /no launches yet/i,
          'an unreachable service was rendered as an authoritative "you have nothing"',
        )
        assert.match(s.text(), /not on screen|could not be fetched/i, 'the outage is not stated')
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.19 Group S — the adversarial matrix
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-ADV — the adversarial matrix', () => {
  it('BJ-ADV-04-H1 T1: double-submitting the launch form opens one order', async () => {
    await withScreen(
      page(h(LaunchPage), '/launch'),
      {
        url: `${ORIGIN}/launch`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/catalogue': { body: fx.catalogue() },
          'POST /v1/tokens': { status: 201, body: { token: fx.order() }, delayMs: 15 },
        },
      },
      async (s) => {
        await s.settle(20)
        await fillLaunchForm(s)
        const commit = s.allByRole('button').find((el) => /open|create|launch/i.test(s.textOf(el)))
        assert.ok(commit)
        s.clickNoFlush(commit)
        await s.settle(0)
        // `useMutation` refuses to start a second run while one is in flight AND the button reads
        // the same flag, so it is DISABLED rather than merely ignored. Mint takes no
        // Idempotency-Key, so this is the only defence on the client side.
        assert.ok(commit.hasAttribute('disabled'), 'the commit stayed live while its own POST was in flight')
        s.clickNoFlush(commit)
        await s.settle(60)
        assert.equal(s.api.matching('POST /v1/tokens').length, 1, 'two presses opened two orders')
      },
    )
  })

  it('BJ-ADV-04-H4 T1: a failed launch states the failure with its request id and keeps the draft', async () => {
    await withScreen(
      page(h(LaunchPage), '/launch'),
      {
        url: `${ORIGIN}/launch`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/catalogue': { body: fx.catalogue() },
          'POST /v1/tokens': {
            status: 400,
            body: fx.error('unbuildable_order', 'a pausable contract requires a cap'),
            requestId: 'req-launch-fail',
          },
        },
      },
      async (s) => {
        await s.settle(20)
        const draft = await fillLaunchForm(s)
        const commit = s.allByRole('button').find((el) => /open|create|launch/i.test(s.textOf(el)))
        assert.ok(commit)
        await s.click(commit)
        await s.settle(30)

        assert.match(s.text(), /a pausable contract requires a cap/i)
        assert.match(s.text(), /req-launch-fail/, 'no request id to quote')
        // And the draft survives. Retyping a token name, a symbol, a supply and an owner address
        // after a refusal is how one of them changes.
        assert.ok(fieldValues(s).includes(draft.name), 'the form cleared its values on a refusal')
        assert.ok(fieldValues(s).includes(draft.ownerAddress))
      },
    )
  })

  it('BJ-ADV-05-H1 ★ T1: double-pressing Pay charges once', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
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
        const pay = s.byRole('button', /pay /i)
        s.clickNoFlush(pay)
        await s.settle(0)
        assert.ok(pay.hasAttribute('disabled'), 'the pay control stayed live while a debit was in flight')
        s.clickNoFlush(pay)
        await s.settle(60)
        assert.equal(
          s.api.matching(`POST /v1/tokens/${fx.ORDER_ID}/pay`).length,
          1,
          'two presses sent two debits. Mint takes no Idempotency-Key: the only client-side ' +
            'defence is the control disabling itself.',
        )
      },
    )
  })

  it('BJ-ADV-05-H2 ★ T1: once paid, the pay control is gone rather than left to be pressed again', async () => {
    let reads = 0
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          [`GET /v1/tokens/${fx.ORDER_ID}`]: () => {
            reads += 1
            return {
              body: {
                token:
                  reads === 1
                    ? fx.order()
                    : fx.order({ status: 'paid', paidJournalEntryId: 'journal-1' }),
                attempts: [],
              },
            }
          },
          [`POST /v1/tokens/${fx.ORDER_ID}/pay`]: {
            status: 201,
            body: { token: fx.order({ status: 'paid' }), replayed: false },
          },
        },
      },
      async (s) => {
        await s.settle(20)
        await s.click(s.byRole('button', /pay /i))
        await s.settle(40)
        // The control is offered from the order's own state, so a paid order has no pay button —
        // there is nothing a back button or a stray press could re-arm.
        assert.equal(s.queryByRole('button', /pay /i), null, 'a paid order still offers Pay')
        assert.match(s.text(), /paid/i)
        // And the confirmation survived the re-read the payment triggered.
        // The confirmation names the amount the RESPONSE reported, not a constant. It read
        // /paid\. the shards have been debited/ before Forge Create was migrated off Shards, and
        // that alternation was green because the retired word was on screen — one of the four
        // assertions that pinned the defect in place. `fx.order({ status: 'paid' })` settles
        // 500,000,000 Sparks (test/fixtures.ts), so this reads back what the fixture charged.
        assert.match(s.text(), /500,000,000 sparks has left your wallet|your receipt in the ledger is/i)
      },
    )
  })

  it('BJ-ADV-05-H4 ★ T1: a failed pay states the failure beside the control, not in place of the page', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`POST /v1/tokens/${fx.ORDER_ID}/pay`]: {
            status: 402,
            body: fx.error('insufficient_balance', 'the EMBER balance for this account may not go negative'),
            requestId: 'req-pay-402',
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        await s.click(s.byRole('button', /pay /i))
        await s.settle(30)
        assert.match(s.text(), /may not go negative/i)
        assert.match(s.text(), /req-pay-402/)
        // In place OF the control, not of the page: the order is still readable.
        assert.ok(s.text().includes('Test Token'), 'a failed payment blanked the order')
        assert.ok(s.queryByRole('button', /pay /i), 'the control was left in its busy state')
      },
    )
  })

  it('BJ-ADV-05-H6 ★ T1: a slow pay leaves the control disabled and the page painted', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`POST /v1/tokens/${fx.ORDER_ID}/pay`]: {
            status: 201,
            body: { token: fx.order({ status: 'paid' }), replayed: false },
            delayMs: 40,
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        const pay = s.byRole('button', /pay /i)
        s.clickNoFlush(pay)
        await s.settle(0)
        assert.ok(pay.hasAttribute('disabled'))
        assert.match(s.textOf(pay), /paying…/i, 'the control does not say it is working')
        assert.ok(s.text().includes('Test Token'), 'the page went away while a debit was in flight')
        await s.settle(80)
      },
    )
  })

  it('BJ-ADV-22 ★ T1: the page paints while its read is slow', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`GET /v1/tokens/${fx.ORDER_ID}`]: { body: { token: fx.order(), attempts: [] }, delayMs: 40 },
        }),
        allowEmpty: true,
      },
      async (s) => {
        assert.match(s.text(), /fetching this launch/i, 'the slow read is not marked pending')
        await s.settle(80)
        assert.ok(s.text().includes('Test Token'), 'the slow read never landed')
      },
    )
  })

  it('BJ-ADV-23 ★ T1: every failure state offers a request id', async () => {
    const cases: ReadonlyArray<{ name: string; el: () => ReactElement; url: string; routes: Routes }> = [
      {
        name: 'the catalogue read',
        el: () => page(h(CataloguePage), '/'),
        url: `${ORIGIN}/`,
        routes: {
          'GET /v1/catalogue': { status: 500, body: fx.error('internal', 'it broke'), requestId: 'req-a' },
        },
      },
      {
        name: 'the order read',
        el: () => tokenAt(),
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        routes: {
          'GET /auth/me': { body: fx.ME },
          [`GET /v1/tokens/${fx.ORDER_ID}`]: {
            status: 500,
            body: fx.error('internal', 'it broke'),
            requestId: 'req-b',
          },
        },
      },
      {
        name: 'the launches list',
        el: () => page(h(TokensPage), '/tokens'),
        url: `${ORIGIN}/tokens`,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/tokens': { status: 500, body: fx.error('internal', 'it broke'), requestId: 'req-c' },
        },
      },
    ]
    for (const c of cases) {
      await withScreen(c.el(), { url: c.url, storage: fx.SIGNED_IN, routes: c.routes }, async (s) => {
        await s.settle(20)
        assert.match(s.text(), /req-[abc]/, `${c.name} failed without the request id to quote`)
      })
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.20 Group T — accessibility
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-A11Y — accessibility', () => {
  it('BJ-A11Y-03 ★ T1: a failure is announced and is not colour-only', async () => {
    await withScreen(
      tokenAt(),
      {
        url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: orderRoutes({
          [`GET /v1/tokens/${fx.ORDER_ID}`]: {
            body: {
              token: fx.order({ status: 'failed', failureReason: 'the deployer had no funds' }),
              attempts: [fx.attempt({ outcome: 'unavailable' })],
            },
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        const alert = s.document.querySelector('[role="alert"]')
        assert.ok(alert, 'a failed launch is not a live region, so it is never announced')
        assert.match(s.textOf(alert), /the deployer had no funds/i)
      },
    )
  })

  it('BJ-A11Y-10 T1: every state badge carries a word', async () => {
    await withScreen(
      tokenAt(),
      { url: `${ORIGIN}/tokens/${fx.ORDER_ID}`, storage: fx.SIGNED_IN, routes: orderRoutes() },
      async (s) => {
        await s.settle(20)
        const badges = [...s.document.querySelectorAll('[class*="badge" i], [class*="mw-note" i]')]
        assert.ok(badges.length > 0, 'the page renders no state badges at all')
        for (const badge of badges) {
          if (badge.getAttribute('aria-hidden') === 'true') continue
          assert.ok(
            s.textOf(badge).length > 0,
            `a badge rendered with no text: ${badge.outerHTML.slice(0, 120)}`,
          )
        }
      },
    )
  })

  it('BJ-A11Y-12 T1: one main landmark, a reachable skip link, no skipped heading level', async () => {
    await withScreen(
      h(App),
      { url: `${ORIGIN}/`, routes: { 'GET /v1/catalogue': { body: fx.catalogue() } } },
      async (s) => {
        await s.settle(20)
        assert.equal(s.allByRole('main').length, 1)
        const skip = s.document.querySelector('a[href^="#"]')
        assert.ok(skip, 'no skip link')
        assert.ok(s.document.getElementById((skip.getAttribute('href') ?? '#').slice(1)))
        assert.equal(s.tabbables()[0], skip, 'the skip link is not first in the tab order')

        const levels = s.allByRole('heading').map((el) => Number(el.tagName.slice(1)))
        assert.equal(levels.filter((l) => l === 1).length, 1, 'a page has exactly one h1')
        let previous = 0
        for (const level of levels) {
          assert.ok(previous === 0 || level <= previous + 1, `heading order skips h${previous} → h${level}`)
          previous = level
        }
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   5.1 — the universal per-surface property
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-CREATE-404 — an unowned address answers 404', () => {
  const directives = readFileSync(at('nginx.conf'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

  it('BJ-CREATE-404 T2: nginx serves the shell through error_page 404, never try_files', () => {
    assert.match(directives, /error_page\s+404\s+\/index\.html/)
    assert.doesNotMatch(directives, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
  })

  it('BJ-CREATE-404 T2: the not-found screen renders inside the shell', async () => {
    await withScreen(h(App), { url: `${ORIGIN}/nothing-here`, routes: {} }, async (s) => {
      assert.match(s.text(), /not found|no page|does not exist/i)
      assert.ok(s.allByRole('link').length > 0, 'the not-found screen strands the reader')
      assert.ok(!ROUTES.map((r) => r.path).includes('nothing-here'))
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The meta-test. Doc 22 §3.2.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the catalogue and this file agree', () => {
  it('every id doc 22 assigns to this surface is accounted for exactly once', () => {
    const ids = SCENARIOS.map((s) => s.id)
    assert.deepEqual([...new Set(ids)].sort(), [...ids].sort(), 'an id appears twice')
    assert.deepEqual([...ids].sort(), [...DOC22_IDS].sort())
  })

  it('a scenario whose outcome depends on a server rule carries an ownedBy path', () => {
    const REFUSAL = /\b(refus|denie|denial|reject|allowlist|400|402|403|409|4xx)\w*/i
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      if (!REFUSAL.test(s.what)) continue
      assert.ok(
        s.ownedBy,
        `${s.id} turns on a server-side refusal and names no test that owns it. Doc 22 §3.2.`,
      )
      assert.match(s.ownedBy.path, /^[a-z-]+\/src\/[\w./-]+\.ts$/)
    }
  })

  it('no scenario is marked implemented without a test named for it', () => {
    const source = readFileSync(at('test/journeys.test.ts'), 'utf8')
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      assert.ok(
        new RegExp(`it\\('${s.id}[ ★]`).test(source),
        `${s.id} is in the catalogue as implemented and has no test named for it`,
      )
    }
  })

  it('every blocked scenario names its blocker and no blocker is a shrug', () => {
    for (const s of SCENARIOS) {
      if (!s.blocked) continue
      assert.ok(s.blocked.length > 60, `${s.id}'s blocker is too short to be a reason`)
      assert.ok(
        /doc 22|§|does not exist|no UI|tier 3|micro-beacon|not installed/i.test(s.blocked),
        `${s.id}'s blocker does not name a fact about the estate: ${s.blocked}`,
      )
    }
  })

  it('nothing here is tier 3 and implemented — tier 3 lives in micro-beacon', () => {
    for (const s of SCENARIOS) {
      if (s.tier !== 'T3') continue
      assert.ok(s.blocked, `${s.id} is tier 3 and not blocked; doc 22 §4 puts tier 3 in beacon`)
    }
  })
})

/* ── helpers ────────────────────────────────────────────────────────────────────────────────── */

interface Draft {
  name: string
  symbol: string
  supply: string
  ownerAddress: string
}

/** Fill the launch form with a valid fixed-supply draft, returning what was typed. */
async function fillLaunchForm(s: Screen): Promise<Draft> {
  const draft: Draft = {
    name: 'Journey Token',
    symbol: 'JRNY',
    supply: '1000000',
    ownerAddress: fx.OWNER,
  }
  const boxes = s.allByRole('textbox')
  const byLabel = (want: RegExp): Element | undefined => boxes.find((el) => want.test(labelFor(el)))
  const fill = async (want: RegExp, value: string): Promise<void> => {
    const el = byLabel(want)
    if (el) await s.type(el, value)
  }
  await fill(/^name$/i, draft.name)
  await fill(/symbol/i, draft.symbol)
  await fill(/initial supply/i, draft.supply)
  await fill(/owner address/i, draft.ownerAddress)
  await fill(/^decimals$/i, '18')
  await fill(/wallet/i, 'wallet-1')
  return draft
}

/**
 * The visible label of a control — the label SPAN, never the whole wrapper.
 *
 * `Field` puts the label, the control, the hint and the problem inside one `<label>`, and the
 * hints quote other fields: the Decimals hint says "it does not scale the supply below". A match
 * over the wrapper's text therefore made `/supply/i` select Decimals, which took the supply value,
 * failed validation, and left the form refusing to submit — with the scenario asserting an empty
 * form and passing nothing. Matching the label element alone is what makes the fill deterministic.
 */
function labelFor(el: Element): string {
  const wrapping = el.closest('label')
  const span = wrapping?.querySelector('.mw-field__label')
  if (span) return span.textContent ?? ''
  const id = el.getAttribute('id')
  if (id) {
    const named = el.ownerDocument.querySelector(`label[for="${id}"] .mw-field__label`)
    if (named) return named.textContent ?? ''
  }
  return wrapping?.textContent ?? el.getAttribute('name') ?? ''
}

function fieldValues(s: Screen): string {
  return [...s.document.querySelectorAll('input, textarea, select')]
    .map((el) => (el as unknown as { value?: string }).value ?? '')
    .join(' ')
}
