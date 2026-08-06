/**
 * Turning mint's facts into words, without inventing any.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TWO RULES, AND BOTH ARE ABOUT THE SAME THING: NOT LETTING AN INTENT READ AS AN OBSERVATION.
 *
 * **1. Never render a null as a zero, a false or a dash without a reason.** `RiskIndicators` is
 * null in every field when the indexer has no answer, and `mint/src/projectpages.ts` says
 * why in one line: "'We have not observed this' and 'this is false' are different statements and a
 * buyer is entitled to the difference." A page that rendered `ownershipRenounced: null` as "not
 * renounced" would be making a claim about a contract nobody has looked at.
 *
 * **2. Never colour alone.** The estate's reserved status hues sit ΔE 4.6 apart under protanopia
 * (measured in micro-ui). Every state below carries a word and a glyph, and the tone is third.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { AttemptOutcome, RiskIndicators, TokenStatus } from './mint.ts'

/* ══════════════════════════════ time ══════════════════════════════ */

/**
 * An ISO timestamp from the service, as a full local date and time.
 *
 * An unparseable value is returned VERBATIM rather than replaced with "Invalid Date": if a service
 * ever puts something unexpected on the wire, a customer seeing the actual string can report it,
 * and one seeing "Invalid Date" can only report that the site is broken.
 */
export function timestamp(iso: string | null): string {
  if (iso === null || iso.length === 0) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return at.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** "just now", "12 seconds ago", "3 minutes ago", "in 2 hours". Never a bare number. */
export function relative(at: Date, now: Date): string {
  const ms = at.getTime() - now.getTime()
  const abs = Math.abs(ms)
  if (abs < 5_000) return 'just now'
  const [value, unit] = pick(abs)
  const plural = value === 1 ? unit : `${unit}s`
  return ms < 0 ? `${value} ${plural} ago` : `in ${value} ${plural}`
}

function pick(ms: number): [number, string] {
  const seconds = Math.round(ms / 1000)
  if (seconds < 90) return [seconds, 'second']
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return [minutes, 'minute']
  const hours = Math.round(minutes / 60)
  if (hours < 36) return [hours, 'hour']
  return [Math.round(hours / 24), 'day']
}

/* ══════════════════════════════ state, never by colour alone ══════════════════════════════ */

export interface Tone {
  readonly tone: 'good' | 'warn' | 'crit' | 'mute' | 'busy'
  readonly glyph: string
  readonly word: string
  /** What this state means for the customer, in one sentence. Rendered, not just typed. */
  readonly meaning: string
}

/**
 * The eight order states — `mint/src/tokens.ts`.
 *
 * All eight, including the two a customer rarely sees. `provisioning` and `awaiting_funds` are
 * real rows the deploy job writes, and a screen that fell through to "unknown" for either would be
 * telling a paying customer that their launch is in a state the site does not recognise.
 */
export function statusTone(status: TokenStatus): Tone {
  switch (status) {
    case 'draft':
      return { tone: 'mute', glyph: '○', word: 'DRAFT', meaning: 'Opened, not yet payable.' }
    case 'awaiting_payment':
      return {
        tone: 'warn',
        glyph: '◷',
        word: 'AWAITING PAYMENT',
        meaning: 'Nothing has been charged and nothing has been deployed.',
      }
    case 'paid':
      return {
        // No currency in this sentence, on purpose. It used to read "The Shards are debited",
        // which outlived the currency by a day; and this function is handed a `TokenStatus` and
        // nothing else, so any unit it named would be a unit it had not read. The order's own
        // `chargeAssetCode` is the thing that knows, and `charge()` renders it beside this.
        tone: 'good',
        glyph: '✓',
        word: 'PAID',
        meaning: 'The charge is debited. This launch can now be deployed.',
      }
    case 'provisioning':
      return {
        tone: 'busy',
        glyph: '◐',
        word: 'PROVISIONING',
        meaning: 'A deployer address is being prepared. Nothing has reached a chain yet.',
      }
    case 'awaiting_funds':
      return {
        tone: 'warn',
        glyph: '◷',
        word: 'AWAITING FUNDS',
        meaning: 'The deployer address needs gas before the contract can be broadcast.',
      }
    case 'deploying':
      return {
        tone: 'busy',
        glyph: '◐',
        word: 'DEPLOYING',
        meaning: 'A job holds this launch. The attempts below are the evidence.',
      }
    case 'deployed':
      return {
        tone: 'good',
        glyph: '●',
        word: 'DEPLOYED',
        meaning: 'The contract is on chain at the address below.',
      }
    case 'failed':
      // `mint/src/tokens.ts` makes this TERMINAL, and `CLAIMABLE` (`tokens.ts`) leaves it
      // out deliberately — re-claiming a failed row immediately is what makes a double mint
      // reachable. Saying "will not retry automatically" is the service's own wording
      // (`mint/src/server.ts`), and it is the honest thing to put in front of a customer.
      return {
        tone: 'crit',
        glyph: '■',
        word: 'FAILED',
        meaning: 'This deploy failed and will not be retried automatically.',
      }
  }
}

/** `mint/src/tokens.ts`. Seven outcomes, each a different fact about a chain. */
export function outcomeTone(outcome: AttemptOutcome): Tone {
  switch (outcome) {
    case 'signed':
      return { tone: 'mute', glyph: '✎', word: 'SIGNED', meaning: 'Custody signed the transaction.' }
    case 'broadcast':
      return { tone: 'busy', glyph: '➤', word: 'BROADCAST', meaning: 'Sent to the network.' }
    case 'confirmed':
      return { tone: 'good', glyph: '●', word: 'CONFIRMED', meaning: 'Included and confirmed.' }
    case 'reverted':
      return { tone: 'crit', glyph: '■', word: 'REVERTED', meaning: 'The chain rejected it.' }
    case 'refused':
      return { tone: 'crit', glyph: '⊘', word: 'REFUSED', meaning: 'A service refused to proceed.' }
    case 'unavailable':
      return { tone: 'warn', glyph: '▲', word: 'UNAVAILABLE', meaning: 'A dependency could not be reached.' }
    case 'not_implemented':
      return {
        tone: 'mute',
        glyph: '⊙',
        word: 'NOT IMPLEMENTED',
        meaning: 'This chain family has no deployer yet.',
      }
  }
}

/* ══════════════════════════════ risk, with null as a real answer ══════════════════════════════ */

/**
 * A risk indicator, as three states rather than two.
 *
 * `unknown` is not a styling choice. `mint/src/projectpages.ts` returns null in every
 * field when the indexer has no observation, and the whole point of §5.3 is that the page renders
 * the CHAIN's answer or none — never the order record standing in for it.
 */
export interface RiskLine {
  readonly label: string
  readonly state: 'good' | 'bad' | 'unknown'
  readonly text: string
}

export function riskLines(risk: RiskIndicators): readonly RiskLine[] {
  return [
    line('Mint authority', risk.hasMintAuthority, {
      // A live mint authority is the bad direction here: more can be minted.
      whenTrue: { state: 'bad', text: 'Someone can mint more of this token' },
      whenFalse: { state: 'good', text: 'No mint authority: the supply is fixed on chain' },
    }),
    line('Ownership', risk.ownershipRenounced, {
      whenTrue: { state: 'good', text: 'Renounced: the owner key is the zero address' },
      whenFalse: { state: 'bad', text: 'An owner key still controls this contract' },
    }),
    line('Transfers', risk.paused, {
      whenTrue: { state: 'bad', text: 'Paused: transfers are currently frozen' },
      whenFalse: { state: 'good', text: 'Not paused' },
    }),
    line('Supply vs the order', risk.supplyExceedsOrder, {
      whenTrue: { state: 'bad', text: 'More has been minted than the order asked for' },
      whenFalse: { state: 'good', text: 'On-chain supply matches the order' },
    }),
  ]
}

function line(
  label: string,
  value: boolean | null,
  outcomes: {
    whenTrue: { state: 'good' | 'bad'; text: string }
    whenFalse: { state: 'good' | 'bad'; text: string }
  },
): RiskLine {
  if (value === null) {
    return { label, state: 'unknown', text: 'Not observed on chain' }
  }
  const chosen = value ? outcomes.whenTrue : outcomes.whenFalse
  return { label, state: chosen.state, text: chosen.text }
}

/* ══════════════════════════════ ids, hashes and amounts ══════════════════════════════ */

/**
 * A hash or an address, shortened for a table but never silently.
 *
 * The full value is always available in a `title` and on the detail row; this is the reading form.
 * A truncated hash rendered without the ellipsis is how somebody comes to compare two prefixes and
 * conclude two different contracts are the same contract.
 */
export function shortHash(hash: string | null): string {
  if (hash === null || hash.length === 0) return '—'
  return hash.length <= 20 ? hash : `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

/** The first eight characters of a uuid — what a phrase names and what a table shows. */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

/* ══════════════════════════════ money, which is never a Number ══════════════════════════════ */

/**
 * Group a decimal string: `'1234567'` → `'1,234,567'`. String in, string out — no `Number`.
 *
 * A copy of `tessera-web/src/lib/money.ts`, not an import: `@cloudsforge/contracts-money` is
 * not a dependency any frontend in this estate carries, and adding one for four lines of regex
 * would put a build context into `Dockerfile` for the sake of a comma.
 */
function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * A price in US cents, as a dollar figure. `'2500'` → `'$25.00'`, `'5'` → `'$0.05'`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS REPLACED `shards()`, AND THE REPLACEMENT IS THE POINT RATHER THAN A RENAME.
 *
 * Forge Create priced a deploy in Shards until 2026-08-05 and this function said so. SHARD was
 * retired on 2026-08-04 (`contracts/packages/chain/src/index.ts`); micro-mint migrated a day
 * later, and an order is now quoted in US cents and settled in EMBER
 * (`mint/src/migrations.ts`, migration 6). The wire field `priceShards` was DELETED rather
 * than re-based, so there is nothing left for the old function to format — which is why this is a
 * different function with a different unit and not `shards()` with new copy on top of it.
 *
 * ── NULL IN, NULL OUT, AND NEVER A ZERO ───────────────────────────────────────────────────────
 *
 * **`BigInt('')` is `0n` and `Number('')` is `0`**, so every obvious way of formatting money turns
 * a missing value into a confident zero. That is the hazard `tessera-web/src/lib/money.ts`
 * exists for, and the one `test/format.test.ts` asserted of `shards()` before this: a button
 * offering to charge "$0.00" is the one mistake in that class a customer will act on.
 *
 * So an absent price returns `null` — not `'$0.00'`, not `'—'`, and not `''`. The caller decides
 * what an unknown price looks like, because a dash in a table and a missing pay button are
 * different answers to the same absence. This is rule 1 in the header, applied to money: null and
 * zero are different statements and a customer is entitled to the difference.
 *
 * Nothing here goes through `Number`. The cents are split with string arithmetic, so a price of
 * 10^24 cents formats exactly rather than becoming `1e+24`.
 *
 * A value that is neither absent nor decimal is returned VERBATIM, for the same reason
 * `timestamp()` returns an unparseable ISO string unchanged: a customer who can see the actual
 * value can report it, and one who sees "$NaN" can only report that the site is broken.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function usd(cents: string | null | undefined): string | null {
  if (cents === null || cents === undefined || cents.trim().length === 0) return null
  if (!/^[0-9]+$/.test(cents)) return cents
  const padded = cents.padStart(3, '0')
  return `$${groupDigits(padded.slice(0, -2))}.${padded.slice(-2)}`
}

/**
 * What was actually taken, in the unit the service says it was taken in.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE QUOTE AND THE CHARGE ARE TWO DIFFERENT FACTS, AND THIS SCREEN SHOWS BOTH.
 *
 * `usd()` above renders the QUOTE. This renders the RECEIPT, and they are deliberately not the
 * same number: a deploy is priced in dollars and settled in EMBER at the rate micro-pricing gave
 * at the moment of payment (`mint/src/pricingclient.ts`). Showing only the quote would leave
 * a customer unable to check what left their balance; showing only the charge would leave them
 * unable to check it against the advertised price.
 *
 * ── SPARKS WHEN THE SERVICE SUPPLIES THEM, WEI WHEN IT DOES NOT ───────────────────────────────
 *
 * `chargeAmountSparks` is null whenever the charge is not a whole number of Sparks, and a
 * settlement amount usually carries sub-Spark wei. **This function does not round into that
 * null.** It falls back to the exact wei figure, which is long and ugly and TRUE; a tidy "2,500
 * Sparks" over a charge of 2,500.0000004 Sparks is a price that is not the price
 * (`mint/src/pricingclient.ts`).
 *
 * ── A PRE-MIGRATION ORDER SAYS SHARD, AND THAT IS CORRECT ─────────────────────────────────────
 *
 * `chargeAssetCode` is `'SHARD'` on an order paid before 2026-08-05, so this returns "2,500 SHARD"
 * for one. `test/retired-currency.test.ts` forbids retired currency on the live surface and this
 * does not breach it: the live surface quotes USD and settles EMBER, and what this prints for an
 * archived order is a receipt for a debit micro-ledger really recorded in SHARD. Relabelling it
 * EMBER would be a false statement about money — the same trade `mint/src/server.ts`
 * refuses from the other side of the wire, and the reason the screens could not be fixed by
 * relabelling in the first place.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function charge(order: {
  readonly chargeAssetCode: string | null
  readonly chargeAmount: string | null
  readonly chargeAmountSparks: string | null
}): string | null {
  if (order.chargeAssetCode === null || order.chargeAmount === null) return null
  if (order.chargeAmountSparks !== null && /^[0-9]+$/.test(order.chargeAmountSparks)) {
    return `${groupDigits(order.chargeAmountSparks)} Sparks`
  }
  const amount = /^[0-9]+$/.test(order.chargeAmount)
    ? groupDigits(order.chargeAmount)
    : order.chargeAmount
  // The unit, spelled out. `chargeAmount` is smallest units, and wei is the smallest unit of
  // EMBER (18 decimals, `contracts/packages/chain/src/index.ts`); every other asset this can
  // carry is a retired one whose smallest unit IS the unit, so the code alone is right there.
  return order.chargeAssetCode === 'EMBER'
    ? `${amount} wei EMBER`
    : `${amount} ${order.chargeAssetCode}`
}

/** The chain, as a person names it. */
export function chainName(chain: string): string {
  if (chain === 'ember') return 'Ember'
  if (chain === 'eth') return 'Ethereum'
  if (chain === 'sol') return 'Solana'
  return chain
}
