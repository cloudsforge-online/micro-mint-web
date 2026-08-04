/**
 * The `mint` surface, as this app is allowed to use it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY ROUTE BELOW WAS READ OUT OF `mint/src/server.ts`, ONE AT A TIME, AND CARRIES THE LINE IT
 * WAS READ FROM.
 *
 * Not inferred from a sibling client, and not copied from `@cloudsforge/sdk` — that table is a
 * second reading of the same source and agreeing with it is evidence, not a shortcut. Seven
 * clients in this estate were built against a surface somebody imagined; one of them made every
 * on-chain escrow activation fail with a false diagnosis, and one sent a bearer token to a route
 * with no `authenticate()` call and then had to explain a 403 that was never about authorisation.
 *
 * `mint` registers its routes through one `define(method, path, handler)` list
 * (`mint/src/server.ts:324-613`), so the surface is enumerable and the citations are stable.
 *
 * | Method | Path                    | Authenticates | Verified at              |
 * | ------ | ----------------------- | ------------- | ------------------------ |
 * | GET    | /v1/catalogue           | **no**        | mint/src/server.ts:358   |
 * | POST   | /v1/tokens              | yes           | mint/src/server.ts:384   |
 * | GET    | /v1/tokens              | yes           | mint/src/server.ts:452   |
 * | GET    | /v1/tokens/:id          | yes           | mint/src/server.ts:465   |
 * | POST   | /v1/tokens/:id/pay      | yes           | mint/src/server.ts:489   |
 * | POST   | /v1/tokens/:id/deploy   | yes           | mint/src/server.ts:526   |
 * | PUT    | /v1/tokens/:id/page     | yes           | mint/src/server.ts:581   |
 * | GET    | /v1/tokens/:id/page     | **no**        | mint/src/server.ts:607   |
 *
 * The service serves `/livez`, `/readyz` and `/metrics` as well (`server.ts:332`, `:334`, `:342`).
 * They are not called from a browser and are not wrapped here.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── No Idempotency-Key on any of them, and that is a fact rather than an omission ──────────────
 *
 * Four wallet routes and five market mutations in this estate answer **400** without an
 * `Idempotency-Key` header. None of mint's do: there is no `withIdempotentRoute` wrapper and no
 * header read anywhere in `mint/src/server.ts`. Mint gets the same protection from STATE instead —
 * `payForDeploy` runs one conditional UPDATE guarded by `and status = 'awaiting_payment'`
 * (`mint/src/tokens.ts:326-332`) and answers 200 with `replayed: true` when it finds the work
 * already done (`mint/src/server.ts:509-514`), and `deploy` enqueues with `onConflict: 'keep'`
 * (`mint/src/server.ts:558-563`) so three clicks before the first job runs produce one run.
 *
 * So this client sends no such header. Sending one would be harmless and would also be this app
 * asserting something about the service that is not true.
 */
import { api } from './api.ts'

/* ══════════════════════════════ the wire shapes ══════════════════════════════ */

/** `mint/src/tokens.ts:38-49`. Eight states, and the app must render all of them. */
export const TOKEN_STATUSES = [
  'draft',
  'awaiting_payment',
  'paid',
  'provisioning',
  'awaiting_funds',
  'deploying',
  'deployed',
  'failed',
] as const

export type TokenStatus = (typeof TOKEN_STATUSES)[number]

/** `mint/src/tokens.ts:52` — nothing moves a row out of one of these. */
export const TERMINAL_STATUSES: readonly TokenStatus[] = ['deployed', 'failed']

/**
 * The states a deploy may start from — `mint/src/tokens.ts:68-73`.
 *
 * `failed` is deliberately absent upstream, and the reason is worth carrying into the UI rather
 * than leaving as a silent "the button is off": a broadcast that lost its confirmation race writes
 * `failed`, and re-claiming it immediately is what makes a double mint reachable in one step. So a
 * failed launch is terminal here and the screen says so instead of offering a retry that would 409.
 */
export const CLAIMABLE_STATUSES: readonly TokenStatus[] = [
  'paid',
  'provisioning',
  'awaiting_funds',
  'deploying',
]

/** `mint/src/catalogue.ts:20-22`. */
export const FEATURES = ['mintable', 'burnable', 'pausable'] as const
export type Feature = (typeof FEATURES)[number]

/** `mint/src/catalogue.ts:28`. */
export type Variant = 'fixed' | 'mintable' | 'foundry'

/** `mint/src/chains.ts`, as the order form offers them (`mint/src/server.ts:391`). */
export const CHAINS = ['ember', 'eth', 'sol'] as const
export type ChainId = (typeof CHAINS)[number]

export const NETWORKS = ['mainnet', 'testnet'] as const
export type Network = (typeof NETWORKS)[number]

/**
 * One order, as `toWire` puts it on the wire (`mint/src/server.ts:652-695`).
 *
 * `supply`, `cap` and every money field are STRINGS. The service says why in one line at
 * `server.ts:663`: "A supply of 10^24 is an ordinary token and does not survive a JSON number."
 * Nothing in this bundle parses any of them with `Number`; they are `bigint` or text, everywhere.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `priceShards` IS GONE, AND IT WAS REMOVED RATHER THAN RENAMED.
 *
 * SHARD was retired on 2026-08-04 (`contracts/packages/chain/src/index.ts:58`) and micro-mint
 * migrated on 2026-08-05: an order is now durable in US CENTS and settled in EMBER, the shape
 * `billing/src/migrations.ts:543` already took. `mint/src/migrations.ts:258` — migration 6,
 * `retire_shard_pricing` — argues the whole thing, including why the stored integer does not move
 * (SHARD has `decimals: 0` and the peg is 100 Shards to the dollar, so one Shard is exactly one
 * cent and the backfill is the identity).
 *
 * The service DELETED the field instead of re-basing it, and this declaration follows: a client
 * still reading `priceShards` now gets `undefined`, which is a thing a screen can notice, whereas
 * a silently re-based field would have had this bundle print cents under a Shards label. The
 * service says the same at `mint/src/server.ts:361-366`.
 *
 * ── WHY THERE ARE THREE MONEY FIELDS AND NOT ONE ──────────────────────────────────────────────
 *
 * `priceUsdCents` is what the customer was QUOTED. `chargeAmount` is what actually left their
 * balance, in the smallest unit of `chargeAssetCode`. Neither can be derived from the other
 * without a rate, and the rate belongs to micro-pricing — so `rateUsdScaled` records the figure
 * the conversion actually used, at `RATE_SCALE`. A refund must return the EMBER that was TAKEN
 * rather than whatever today's administered rate says $25.00 is worth
 * (`mint/src/migrations.ts:294-302`), and a screen that showed only the quote could not tell a
 * rate change from a bug.
 *
 * **`chargeAssetCode` is `'SHARD'` on an order paid before the migration, and this bundle renders
 * that verbatim.** It is a receipt, not a price: the alternative is printing EMBER over a charge
 * micro-ledger records as SHARD, which is a false statement about somebody's money and a worse
 * defect than the retired word (`mint/src/server.ts:670-673` says the same from the other side).
 * `test/retired-currency.test.ts` polices the LIVE surface, which is priced and settled in
 * neither.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface TokenOrder {
  readonly id: string
  readonly ownerSubject: string
  readonly ownerAddress: string
  readonly chain: string
  readonly network: string
  readonly standard: string
  readonly name: string
  readonly symbol: string
  readonly decimals: number
  readonly supply: string
  readonly cap: string | null
  readonly features: readonly Feature[]
  readonly status: TokenStatus
  /** The quote, in US cents. Null only on a row a pre-migration-6 build wrote. */
  readonly priceUsdCents: string | null
  /** What was taken. `'EMBER'` on a new order, `'SHARD'` on an old one, null until paid. */
  readonly chargeAssetCode: string | null
  /** The charge in smallest units — wei for EMBER. Null until paid. */
  readonly chargeAmount: string | null
  /**
   * The same charge in Sparks, when it is a whole number of them, and null when it is not.
   *
   * A Spark is 10⁻⁶ EMBER — a DISPLAY denomination of one asset and never a second asset code
   * (`contracts/packages/chain/src/index.ts:363-364` states the rule the whole estate follows). The service
   * computes it rather than this bundle, at `mint/src/server.ts:676-681`, and returns null instead
   * of rounding, "because printing a rounded figure would show a price that is not the price"
   * (`mint/src/pricingclient.ts:74-84`). Nothing here may fill that null in.
   */
  readonly chargeAmountSparks: string | null
  /** The rate the conversion used, at `RATE_SCALE`, so the two amounts above can be checked. */
  readonly rateUsdScaled: string | null
  readonly paidJournalEntryId: string | null
  readonly deployerAddress: string | null
  readonly contractAddress: string | null
  readonly deployTxHash: string | null
  readonly broadcastAt: string | null
  readonly confirmedAt: string | null
  readonly failureReason: string | null
  readonly deployAttempts: number
  readonly createdAt: string
  readonly updatedAt: string
}

/** `mint/src/tokens.ts:670-677`, as rendered at `mint/src/server.ts:476-483`. */
export type AttemptOutcome =
  | 'signed'
  | 'broadcast'
  | 'confirmed'
  | 'reverted'
  | 'refused'
  | 'unavailable'
  | 'not_implemented'

export interface DeployAttempt {
  readonly attempt: number
  readonly family: string
  readonly outcome: AttemptOutcome
  readonly txHash: string | null
  readonly detail: string | null
  readonly at: string
}

/** `mint/src/server.ts:358-381`. */
export interface Catalogue {
  /** The list price, in US cents. A decimal string, and `'2500'` is $25.00. */
  readonly priceUsdCents: string
  /**
   * What a deploy is charged in — `'EMBER'`.
   *
   * Read from the response rather than assumed, because the service publishes it precisely so that
   * "a client never has to assume it" (`mint/src/server.ts:96-97`). A hard-coded 'EMBER' here
   * would be a second place the settlement asset is decided, and the first defect this screen had
   * was a currency name that outlived the thing it named.
   */
  readonly settlementAsset: string
  readonly network: string
  readonly variants: ReadonlyArray<{
    readonly variant: Variant
    readonly contract: string
    readonly features: readonly Feature[]
    /** `'required'` or `'forbidden'` — `mint/src/catalogue.ts:36`. Never "optional". */
    readonly cap: 'required' | 'forbidden'
  }>
}

/** `mint/src/projectpages.ts:30-43`. */
export interface ProjectPage {
  readonly id: string
  readonly tokenId: string
  readonly description: string
  readonly links: readonly unknown[]
  readonly team: readonly unknown[]
  readonly roadmap: readonly unknown[]
  readonly riskDisclosures: string
  readonly verificationStatus: 'unverified' | 'claimed' | 'verified' | 'flagged'
  readonly communityId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** `mint/src/indexerclient.ts:74-87`. Every field nullable, because an observation may be absent. */
export interface IndexedToken {
  readonly contractAddress: string
  readonly name: string | null
  readonly symbol: string | null
  readonly decimals: number | null
  readonly totalSupply: string | null
  readonly cap: string | null
  readonly owner: string | null
  readonly mintAuthority: boolean | null
  readonly paused: boolean | null
  readonly observedAtBlock: number | null
}

/** `mint/src/projectpages.ts:151-169`. Every one may be null, and null is not false. */
export interface RiskIndicators {
  readonly hasMintAuthority: boolean | null
  readonly ownershipRenounced: boolean | null
  readonly paused: boolean | null
  readonly supplyExceedsOrder: boolean | null
}

/** `mint/src/projectpages.ts:171-189`. */
export interface RenderedPage {
  readonly token: {
    readonly id: string
    readonly chain: string
    readonly network: string
    readonly symbol: string
    readonly name: string
    readonly status: string
  }
  readonly page: ProjectPage | null
  /**
   * The CHAIN's own answer, or null. Never the order record standing in for it — the invariant
   * `mint/src/projectpages.ts:1-21` is built around, from 04-domain-model §5.3.
   */
  readonly onchain: IndexedToken | null
  readonly risk: RiskIndicators
  /** Why `onchain` is null, when it is. `mint/src/projectpages.ts:187`. */
  readonly onchainUnavailable: string | null
}

/* ══════════════════════════════ the calls ══════════════════════════════ */

/**
 * `GET /v1/catalogue` — `mint/src/server.ts:358`.
 *
 * **Makes no `authenticate()` call**: the handler is a literal body with no principal in it, and
 * the comment above it says why ("a catalogue behind a token cannot be browsed"). So this is sent
 * with `auth: false` — not because a token would be refused, but because attaching one to a route
 * that never asked for it is how a client ends up reasoning about the wrong failure.
 */
export function getCatalogue(signal?: AbortSignal): Promise<Catalogue> {
  return api<Catalogue>('/v1/catalogue', { auth: false, ...(signal ? { signal } : {}) })
}

/** `POST /v1/tokens` — `mint/src/server.ts:384`. Opens an order; charges nothing, deploys nothing. */
export interface CreateOrderInput {
  readonly chain: ChainId
  /** Optional: the service falls back to its own configured network (`server.ts:392`). */
  readonly network?: Network
  readonly name: string
  readonly symbol: string
  readonly decimals: number
  /** A positive decimal string, smallest units. `requireQuantity`, `mint/src/server.ts:739-745`. */
  readonly supply: string
  readonly cap?: string | null
  readonly features: readonly Feature[]
  /** EIP-55 checksummed and never the zero address — `canonicaliseEvm`, `mint/src/server.ts:408`. */
  readonly ownerAddress: string
  readonly ownerWalletId: string
  readonly metadataUri?: string | null
  readonly brandKitId?: string | null
}

export function createOrder(input: CreateOrderInput, signal?: AbortSignal): Promise<{ token: TokenOrder }> {
  return api<{ token: TokenOrder }>('/v1/tokens', {
    method: 'POST',
    body: input,
    ...(signal ? { signal } : {}),
  })
}

/**
 * `GET /v1/tokens` — `mint/src/server.ts:452`.
 *
 * The `userId` query parameter is deliberately NOT exposed. `server.ts:455-456` honours it only
 * for an admin principal and otherwise passes it through `subjectUserId`, which refuses a mismatch
 * — so from this bundle it can only ever be the caller's own id or a 403. Offering it would put an
 * act-as-anyone-shaped control in a customer app for no reachable behaviour.
 */
export function listOrders(signal?: AbortSignal): Promise<{ tokens: readonly TokenOrder[] }> {
  return api<{ tokens: readonly TokenOrder[] }>('/v1/tokens', { ...(signal ? { signal } : {}) })
}

/**
 * `GET /v1/tokens/:id` — `mint/src/server.ts:465`.
 *
 * The status URL a 202 points at. It reaches no chain (`server.ts:461-464`), so polling it cannot
 * make a deploy slower — which is what makes the status screen's refresh honest rather than rude.
 * A malformed or foreign id is a **404**, not a 403: `ownedToken` answers both the same way on
 * purpose (`server.ts:633-638`), so that a caller cannot enumerate order ids.
 */
export function getOrder(
  id: string,
  signal?: AbortSignal,
): Promise<{ token: TokenOrder; attempts: readonly DeployAttempt[] }> {
  return api<{ token: TokenOrder; attempts: readonly DeployAttempt[] }>(
    `/v1/tokens/${encodeURIComponent(id)}`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `POST /v1/tokens/:id/pay` — `mint/src/server.ts:489`.
 *
 * One transaction: the ledger entry and the state change together. **201 on a fresh debit, 200 on
 * a replay**, and the body carries `replayed` so a client can tell which without comparing bodies
 * (`server.ts:509-514`). This app renders the difference rather than hiding it: "already paid" and
 * "just paid" are different facts about the customer's money.
 *
 * 402 `insufficient_balance` is its own answer (`server.ts:287-290`) and is not a retryable error.
 */
export function payForOrder(id: string): Promise<{ token: TokenOrder; replayed: boolean }> {
  return api<{ token: TokenOrder; replayed: boolean }>(
    `/v1/tokens/${encodeURIComponent(id)}/pay`,
    { method: 'POST' },
  )
}

/**
 * `POST /v1/tokens/:id/deploy` — `mint/src/server.ts:526`.
 *
 * **202 AND A STATUS URL. IT REACHES NO CHAIN.** The handler authenticates, checks the mainnet
 * allowlist, runs one conditional UPDATE, enqueues, and returns a `Location`
 * (`mint/src/server.ts:520-579`; the file header at `server.ts:8-23` explains at length why the
 * work cannot live inside the request). So this client must never treat the response as "deployed"
 * — it means "accepted", and the screen says exactly that.
 */
export interface DeployAccepted {
  readonly accepted: boolean
  readonly tokenId: string
  readonly status: TokenStatus
  /** Named in the BODY as well as the header — `mint/src/server.ts:574-576`. */
  readonly statusUrl: string
}

export function deployOrder(id: string): Promise<DeployAccepted> {
  return api<DeployAccepted>(`/v1/tokens/${encodeURIComponent(id)}/deploy`, { method: 'POST' })
}

/**
 * `PUT /v1/tokens/:id/page` — `mint/src/server.ts:581`.
 *
 * Every field is coerced by the handler rather than required: a missing `description` becomes `''`
 * and a non-array `links` becomes `[]` (`server.ts:585-595`). So the client sends the whole
 * document every time — this is a PUT, and sending a partial one would silently blank the fields
 * it left out.
 */
export interface ProjectPageInput {
  readonly description: string
  readonly links: readonly unknown[]
  readonly team: readonly unknown[]
  readonly roadmap: readonly unknown[]
  readonly riskDisclosures: string
  readonly communityId?: string | null
}

export function putProjectPage(id: string, input: ProjectPageInput): Promise<{ page: ProjectPage }> {
  return api<{ page: ProjectPage }>(`/v1/tokens/${encodeURIComponent(id)}/page`, {
    method: 'PUT',
    body: input,
  })
}

/**
 * `GET /v1/tokens/:id/page` — `mint/src/server.ts:607`.
 *
 * **Makes no `authenticate()` call**, deliberately: "a project page nobody can read without an
 * account is a project page that cannot do the one job it has" (`server.ts:604-605`). Sent with
 * `auth: false` for the same reason as the catalogue.
 */
export function getProjectPage(id: string, signal?: AbortSignal): Promise<RenderedPage> {
  return api<RenderedPage>(`/v1/tokens/${encodeURIComponent(id)}/page`, {
    auth: false,
    ...(signal ? { signal } : {}),
  })
}
