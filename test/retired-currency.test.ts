/**
 * No retired currency may appear in anything a person can read on this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS, AND WHY THE EXISTING SUITE DID NOT CATCH IT
 *
 * The owner found Shards on Forge Create by LOOKING AT THE PRODUCT. Nineteen test files ran green
 * over the same screens on the same day. That is the defect this file is about — not the word
 * itself, which is downstream of a service (see THE HONEST BOUNDARY below), but the fact that the
 * word was renderable and no check could say so.
 *
 * The suite missed it because every assertion here is written FORWARDS: it names the thing it
 * wants and asserts the thing is present. `test/journeys.test.ts` asserted that the price renders;
 * `test/double-submit.test.ts` addressed the pay button by `/Pay .* Shards/`. Both were green
 * BECAUSE the word was there. A suite made only of forward assertions cannot notice retired
 * vocabulary; it pins it in place. Five assertions across those two files had to be edited before
 * this surface could stop saying Shards, and they are named in the commit that did it: a test
 * that must be changed to allow a fix is a test defending the defect.
 *
 * ── WHY IT READS RENDERED TEXT AND NEVER SOURCE ────────────────────────────────────────────────
 *
 * A grep over `src/` would match this file's own header, and match the comment at
 * `src/lib/format.ts:238` that explains the wire field. It would be green because of its own
 * justification, and it would STAY green if every sentence it protects were deleted. `site` states
 * the same rule at `site/test/estate-claims.test.ts:394-402` and counts five shipped instances of
 * that failure — "an nginx header quoting the directive it forbids".
 *
 * So this mounts the real pages, with the real fixtures, and reads `screen.text()`. A comment
 * cannot satisfy it and a deleted sentence cannot hide from it. It is the tier the owner's own
 * method uses, which is the point: the check should look at what the owner looked at.
 *
 * ── WHY THE WORD LIST COMES FROM `contracts` ───────────────────────────────────────────────────
 *
 * `RETIRED_ASSETS` is exported from `contracts/packages/chain/src/index.ts:58`, and every consumer
 * resolves that package by `link:` at HEAD (its header, :45-47). Hardcoding /shards?/ here would
 * make a second list to keep current, and the next asset to be wound down would be caught by
 * `contracts` and missed by this file. Retiring an asset upstream now tightens this check with no
 * edit here.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THE HONEST BOUNDARY: WHAT THIS FILE MAY NOT BE USED TO "FIX" ───────────────────────────────
 *
 * **This section is kept in the past tense rather than deleted, because the boundary it draws is
 * the reason the fix took the shape it did, and a future reader who does not know it will reach
 * for the shortcut it forbids.**
 *
 * When this file was written it was RED on four of six screens, and it was merged red. The
 * offending strings were TRUE: `micro-mint` had not migrated. It priced a deploy in Shards
 * (`MINT_DEPLOY_PRICE_SHARDS`), served that number as `priceShards`, and debited real SHARD from
 * the customer's ledger account (`mint/src/ledgerclient.ts:108-118`), while `micro-billing` and
 * `micro-contracts` moved on 2026-08-04.
 *
 * So this surface could not be made green by relabelling. Printing "EMBER" over a charge the
 * ledger records as SHARD is not a copy fix, it is a false statement about money, and it would
 * have been a WORSE defect than the one reported — the screen would have stopped matching the
 * receipt.
 *
 * It went green on 2026-08-05 because the SERVICE changed, which is the only thing that could
 * have made it go green honestly. `mint/src/migrations.ts:258` (migration 6,
 * `retire_shard_pricing`) makes an order durable in US cents and settled in EMBER — the shape
 * `billing/src/migrations.ts:543` already took — and `mint/src/server.ts:377-383` removed
 * `priceShards` from the wire rather than re-basing it. This bundle followed at `src/lib/mint.ts`
 * and `src/lib/format.ts`.
 *
 * One thing did NOT change, and it is the boundary: an order paid before the migration still
 * carries `chargeAssetCode: 'SHARD'` (`mint/src/server.ts:739-742`), and
 * `src/lib/format.ts`'s `charge()` renders that verbatim. That is a receipt for a debit that
 * really happened in SHARD, not a price anybody is being offered. The screens this file mounts are
 * the LIVE ones, quoted in USD and settled in EMBER; if a future fixture is added here that is
 * paid in a retired asset, the right answer is to leave this check red and ask why an archived
 * receipt is being presented as a live surface.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { CataloguePage } from '../src/pages/catalogue.tsx'
import { LaunchPage } from '../src/pages/launch.tsx'
import { ProjectPage } from '../src/pages/project.tsx'
import { TokenPage } from '../src/pages/token.tsx'
import { TokensPage } from '../src/pages/tokens.tsx'

const ORIGIN = 'https://create.cloudsforge.online'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/**
 * Where a micro-contracts checkout is, in the order CI and a developer's machine put it — the same
 * three candidates and the same order as `test/mint.test.ts:29-35`.
 */
const CONTRACTS_CANDIDATES = [
  process.env['CLOUDSFORGE_CONTRACTS_DIR'],
  here('../contracts/packages/chain/src/index.ts'),
  here('.contracts/packages/chain/src/index.ts'),
].filter((v): v is string => Boolean(v))

const chainSource = CONTRACTS_CANDIDATES.find((p) => existsSync(p))

/**
 * `RETIRED_ASSETS`, read out of the contract package rather than restated here.
 *
 * ── WHY THIS IS READ AND NOT IMPORTED ──────────────────────────────────────────────────────────
 *
 * The direct expression of this is `import { RETIRED_ASSETS } from '@cloudsforge/contracts-chain'`,
 * with `link:../contracts/packages/chain` in package.json. That was written, and reverted, for a
 * reason worth recording so it is not re-attempted:
 *
 *   `Dockerfile:32` runs `pnpm install --frozen-lockfile`, and a `link:` specifier must resolve at
 *   IMAGE BUILD TIME whether or not anything in `src/` imports it. Adding the dependency therefore
 *   requires a second named build context (`COPY --from=chainpkg`, mirroring `uipkg` at :24), a new
 *   `--build-context` argument in the `image:` job, and the same in every local build command — so
 *   that the PRODUCTION IMAGE gains a build input for the sake of one test file. That is a large
 *   blast radius, and a deploy that fails because a test needed a constant is a bad trade.
 *
 * Reading the source is the same source of truth with none of that. It is also exactly the pattern
 * this repository already uses to check its route citations against the real service
 * (`test/mint.test.ts:29-35`), including the skip-with-a-name below.
 *
 * The parse is deliberately narrow: it matches the ONE declaration and fails loudly rather than
 * falling back to a default, because a silent fallback here is a check that verifies nothing.
 */
function readRetiredAssets(source: string): readonly string[] {
  const decl = /export const RETIRED_ASSETS[^=]*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(source)
  assert.ok(
    decl?.[1] !== undefined,
    'RETIRED_ASSETS could not be read from the contract package — its shape changed, and this ' +
      'check must be updated rather than left to pass over a list it cannot see',
  )
  return [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
}

/**
 * One pattern per retired asset, derived from the code rather than typed.
 *
 * `SHARD` becomes /\bSHARD/i — a LEADING boundary and no trailing one.
 *
 * ── THE TRAILING `\b` IS A BUG, AND THIS CHECK SHIPPED WITH IT FOR ONE DRAFT ───────────────────
 *
 * The obvious pattern is /\bSHARDs?\b/i. Written that way, this file went green on the single most
 * important screen in the flow — the order awaiting payment, the one with `Pay 2,500 Shards` on
 * it — while `text.includes('Shard')` was true and the price was on screen.
 *
 * The reason is `textContent`, which is what `Screen.text()` returns. It concatenates adjacent
 * nodes with NO separator, so `<span>2,500</span> Shards` followed by a `Opened` label renders as
 * the single string `…Price2,500 ShardsOpened…`. There is no word boundary between the `s` of
 * Shards and the `O` of Opened, so the trailing `\b` failed; `s?` then backtracked to empty and
 * failed between `d` and `s` for the same reason. A word-boundary assertion is only as good as the
 * whitespace in the DOM, and rendered text has none it can rely on.
 *
 * Dropping the trailing anchor makes the match a PREFIX, which is the right shape for a deny list:
 * "Shard", "Shards", "SHARDS" and any future compound all trip it. The leading `\b` is kept and
 * does real work — it is what stops a `TOKEN:0xSHARD…` address being read as the retired asset,
 * because there is no boundary between `x` and `S`.
 */
const RETIRED = (chainSource === undefined
  ? []
  : readRetiredAssets(readFileSync(chainSource, 'utf8'))
).map((code) => ({
  code,
  pattern: new RegExp(`\\b${code}`, 'i'),
}))

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, element)

const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(RouterRoutes, null, h(Route, { path: pattern, element })) as ReactElement,
  )

/**
 * The screens a customer of Forge Create actually passes through, in order: the catalogue they
 * land on, the form they fill in, the order they pay, the list they come back to, and the public
 * project page a buyer is sent.
 *
 * Every one is mounted with the response that makes it render its FULL state — an order that is
 * `awaiting_payment` renders the pay button, and the pay button is where the price is. A fixture
 * that renders an empty page would make this file green by rendering nothing, which is the
 * failure mode the length assertion below exists to refuse.
 */
const SURFACES: readonly {
  readonly name: string
  readonly element: ReactElement
  readonly url: string
  readonly routes: Routes
  readonly storage?: Record<string, string>
}[] = [
  {
    name: 'the catalogue',
    element: page(h(CataloguePage), '/'),
    url: `${ORIGIN}/`,
    routes: { 'GET /v1/catalogue': { body: fx.catalogue() } },
  },
  {
    name: 'the launch form',
    element: page(h(LaunchPage), '/launch'),
    url: `${ORIGIN}/launch`,
    storage: fx.SIGNED_IN,
    routes: { 'GET /auth/me': { body: fx.ME }, 'GET /v1/catalogue': { body: fx.catalogue() } },
  },
  {
    name: 'an order awaiting payment',
    element: atRoute('/tokens/:id', h(TokenPage), `/tokens/${fx.ORDER_ID}`),
    url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
    storage: fx.SIGNED_IN,
    routes: {
      'GET /auth/me': { body: fx.ME },
      [`GET /v1/tokens/${fx.ORDER_ID}`]: { body: { token: fx.order(), attempts: [] } },
    },
  },
  {
    name: 'an order that has been paid',
    element: atRoute('/tokens/:id', h(TokenPage), `/tokens/${fx.ORDER_ID}`),
    url: `${ORIGIN}/tokens/${fx.ORDER_ID}`,
    storage: fx.SIGNED_IN,
    routes: {
      'GET /auth/me': { body: fx.ME },
      [`GET /v1/tokens/${fx.ORDER_ID}`]: {
        body: { token: fx.order({ status: 'paid' }), attempts: [] },
      },
    },
  },
  {
    name: 'the launches list',
    element: page(h(TokensPage), '/tokens'),
    url: `${ORIGIN}/tokens`,
    storage: fx.SIGNED_IN,
    routes: {
      'GET /auth/me': { body: fx.ME },
      'GET /v1/tokens': { body: { tokens: [fx.order()] } },
    },
  },
  {
    // The address is `/projects/<id>` and the route it reads is `/v1/tokens/<id>/page`
    // (`src/lib/mint.ts:360`). They differ, and a fixture keyed on the ADDRESS renders the failure
    // branch — which is what the length guard below caught when this entry was first written.
    name: 'the public project page',
    element: atRoute('/projects/:id', h(ProjectPage), `/projects/${fx.ORDER_ID}`),
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
]

describe('retired currency never reaches a screen', () => {
  if (chainSource === undefined) {
    // NOT a silent pass. It says which check did not run, and CI makes the absence fatal — the
    // same contract `test/mint.test.ts:85` has with the workflow.
    it('SKIPPED: no micro-contracts checkout — CI checks one out and requires this to run', () => {
      assert.ok(true)
    })
    return
  }

  it('has a retired asset to look for, so every assertion below is not vacuous', () => {
    // If `RETIRED_ASSETS` is ever emptied — which is the correct end state, once the balances are
    // drained — this file stops asserting anything and must be deleted rather than left green.
    assert.ok(RETIRED.length > 0, 'RETIRED_ASSETS is empty; this file now checks nothing')
  })

  for (const surface of SURFACES) {
    it(`${surface.name} names no retired asset`, async () => {
      await withScreen(
        surface.element,
        { url: surface.url, routes: surface.routes, ...(surface.storage ? { storage: surface.storage } : {}) },
        async (s) => {
          await s.settle(30)
          const text = s.text()

          // The guard that stops this passing over a blank render. `mount()` already refuses a
          // body under forty characters, but a page that mounted its shell and failed its fetch
          // clears that bar while containing none of the copy this is meant to police.
          assert.ok(
            text.length >= 200,
            `${surface.name} rendered ${text.length} characters — too little to have been read`,
          )

          for (const { code, pattern } of RETIRED) {
            const hit = pattern.exec(text)
            assert.equal(
              hit,
              null,
              `${surface.name} renders "${hit?.[0]}" — ${code} is retired ` +
                `(contracts/packages/chain/src/index.ts:58). Forge Create quotes in US cents and ` +
                `settles in EMBER, displayed in Sparks when the service supplies them ` +
                `(mint/src/migrations.ts:258, mint/src/server.ts:745-750). Before reaching for the ` +
                `copy: check what the SERVICE sent. This screen said Shards for a day after the ` +
                `asset was retired, and it was telling the truth — the fix was migrating ` +
                `micro-mint, not editing the sentence. If the word is true again, it is true ` +
                `again, and the service is what must change.`,
            )
          }
        },
      )
    })
  }
})
