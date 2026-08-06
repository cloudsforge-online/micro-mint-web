/**
 * The responses the scenarios are run against.
 *
 * Every shape is one `src/lib/mint.ts` declares, which was read out of `mint/src/`. Typed against
 * the client's own declarations so a drift between them is a type error here rather than a
 * scenario quietly asserting a shape nothing produces.
 */
import type { Catalogue, DeployAttempt, ProjectPage, TokenOrder } from '../src/lib/mint.ts'

export const ORDER_ID = '33333333-4444-5555-6666-777777777777'
export const OWNER = '0x1111111111111111111111111111111111111111'

export function catalogue(over: Partial<Catalogue> = {}): Catalogue {
  return {
    // $25.00. The same integer the catalogue used to serve as `priceShards`, and deliberately so:
    // SHARD has `decimals: 0` and the peg was 100 Shards to the dollar, so one Shard was exactly
    // one cent and migration 6's backfill is the identity on the stored number
    // (`mint/src/migrations.ts:282-292`). Changing it here would have made this fixture disagree
    // with the rows the service actually holds.
    priceUsdCents: '2500',
    settlementAsset: 'EMBER',
    network: 'testnet',
    variants: [
      { variant: 'fixed', contract: 'ForgeFixed', features: [], cap: 'forbidden' },
      { variant: 'mintable', contract: 'ForgeMintable', features: ['mintable', 'burnable'], cap: 'forbidden' },
      {
        variant: 'foundry',
        contract: 'ForgeFoundry',
        features: ['mintable', 'burnable', 'pausable'],
        cap: 'required',
      },
    ],
    ...over,
  }
}

/**
 * $25.00 settled at an administered rate of $0.05 per EMBER, which is 500 EMBER.
 *
 * The three numbers are consistent with each other rather than plausible-looking, because a
 * fixture whose amounts do not agree teaches a screen to render an arrangement that cannot exist:
 * `coinAmountForUsdCents(2500n, 18, 50_000n)` is `2500 · 10^18 · RATE_SCALE / (50_000 · 10^2)` =
 * 5·10^20 wei (`contracts/packages/chain/src/index.ts:430-446`), and 5·10^20 / `WEI_PER_SPARK` is
 * exactly 500,000,000 Sparks — so `chargeAmountSparks` is a whole number here and the Sparks
 * display path is the one the screens exercise. `test/format.test.ts` covers the other branch,
 * where the wei do not divide and the service sends null rather than a rounded figure.
 */
const SETTLED = {
  chargeAssetCode: 'EMBER',
  chargeAmount: '500000000000000000000',
  chargeAmountSparks: '500000000',
  rateUsdScaled: '50000',
} as const

/** Nothing taken, and nothing claimed about a rate. The state every order opens in. */
const UNSETTLED = {
  chargeAssetCode: null,
  chargeAmount: null,
  chargeAmountSparks: null,
  rateUsdScaled: null,
} as const

/**
 * One order.
 *
 * ── WHY THE CHARGE IS DERIVED FROM THE STATUS RATHER THAN LISTED ONCE ─────────────────────────
 *
 * Fifteen call sites say `fx.order({ status: 'paid' })` and nothing else. Written as a flat
 * literal, that produced an order that is paid and was charged NOTHING — a row the service's own
 * database refuses: `tokens_paid_records_charge` requires a charge asset and amount on anything
 * with a journal entry (`mint/src/migrations.ts:387-392`). Every screen mounted over it would have
 * been reading the "not charged yet" branch while claiming to test the paid one, which is the
 * shape of defect this whole change exists to close.
 *
 * So the settlement fields follow the status, and an explicit `over` still wins — a test that
 * wants a pre-migration order paid in SHARD, or a charge with no whole Spark in it, says so.
 */
export function order(over: Partial<TokenOrder> = {}): TokenOrder {
  const status = over.status ?? 'awaiting_payment'
  const paid = status !== 'draft' && status !== 'awaiting_payment'
  return {
    id: ORDER_ID,
    ownerSubject: 'user:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ownerAddress: OWNER,
    chain: 'ember',
    network: 'testnet',
    standard: 'ForgeFixed',
    name: 'Test Token',
    symbol: 'TT',
    decimals: 18,
    supply: '1000000',
    cap: null,
    features: [],
    status: 'awaiting_payment',
    priceUsdCents: '2500',
    ...(paid ? SETTLED : UNSETTLED),
    paidJournalEntryId: null,
    deployerAddress: null,
    contractAddress: null,
    deployTxHash: null,
    broadcastAt: null,
    confirmedAt: null,
    failureReason: null,
    deployAttempts: 0,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

export function attempt(over: Partial<DeployAttempt> = {}): DeployAttempt {
  return {
    attempt: 1,
    family: 'evm',
    outcome: 'broadcast',
    txHash: `0x${'ab'.repeat(32)}`,
    detail: 'broadcast to the ember testnet',
    at: '2026-08-01T09:05:00.000Z',
    ...over,
  }
}

export function projectPage(over: Partial<ProjectPage> = {}): ProjectPage {
  return {
    id: 'page-1',
    tokenId: ORDER_ID,
    description: 'A token for testing the browser journeys.',
    links: [],
    team: [],
    roadmap: [],
    riskDisclosures: 'Nothing here is advice.',
    verificationStatus: 'unverified',
    communityId: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

/** The estate's error envelope — nested, as `errorReply()` builds it in every service. */
export function error(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}

/** The two `cf.*` keys a signed-in browser holds. `src/lib/api.ts` reads exactly these. */
export const SIGNED_IN = {
  'cf.accessToken': 'access-token-stub',
  'cf.refreshToken': 'refresh-token-stub',
}

/** `GET /auth/me` as `identity/src/server.ts:976-983` returns it: the profile is nested. */
export const ME = {
  user: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', handle: 'creator', roles: ['customer'] },
  session: { id: 'session-1' },
  organisations: [],
}
