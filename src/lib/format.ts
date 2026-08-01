/**
 * Turning mint's facts into words, without inventing any.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TWO RULES, AND BOTH ARE ABOUT THE SAME THING: NOT LETTING AN INTENT READ AS AN OBSERVATION.
 *
 * **1. Never render a null as a zero, a false or a dash without a reason.** `RiskIndicators` is
 * null in every field when the indexer has no answer, and `mint/src/projectpages.ts:153-154` says
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
 * The eight order states — `mint/src/tokens.ts:38-49`.
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
        tone: 'good',
        glyph: '✓',
        word: 'PAID',
        meaning: 'The Shards are debited. This launch can now be deployed.',
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
      // `mint/src/tokens.ts:52` makes this TERMINAL, and `CLAIMABLE` (`tokens.ts:68-73`) leaves it
      // out deliberately — re-claiming a failed row immediately is what makes a double mint
      // reachable. Saying "will not retry automatically" is the service's own wording
      // (`mint/src/server.ts:524`), and it is the honest thing to put in front of a customer.
      return {
        tone: 'crit',
        glyph: '■',
        word: 'FAILED',
        meaning: 'This deploy failed and will not be retried automatically.',
      }
  }
}

/** `mint/src/tokens.ts:670-677`. Seven outcomes, each a different fact about a chain. */
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
 * `unknown` is not a styling choice. `mint/src/projectpages.ts:151-161` returns null in every
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

/**
 * A Shards price, as text.
 *
 * `priceShards` arrives as a decimal STRING (`mint/src/server.ts:657`) and stays one. Shards are
 * a whole-unit currency in this estate, so there is no scaling to do here — but the value is never
 * put through `Number`, because the point of the string is that some of these do not survive it.
 */
export function shards(value: string): string {
  return /^[0-9]+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : value
}

/** The chain, as a person names it. */
export function chainName(chain: string): string {
  if (chain === 'ember') return 'Ember'
  if (chain === 'eth') return 'Ethereum'
  if (chain === 'sol') return 'Solana'
  return chain
}
