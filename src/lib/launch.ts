/**
 * The order form's rules, as pure functions.
 *
 * Every rule below is one the SERVICE already enforces, restated here so the customer is told
 * before they submit rather than after. Client-side validation is never the boundary — mint
 * refuses the same things at `mint/src/server.ts:384-450` and would refuse them if this file were
 * deleted — so each check carries the line it mirrors, and none of them is stricter than the
 * service. A client that refuses something the service accepts is a client that has quietly
 * removed a feature.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `capRuleFor` USED TO BE THE ONLY THING ENFORCING THE CAP RULE ANYWHERE. IT IS NOT ANY MORE.
 *
 * What this comment said until the service was fixed: `POST /v1/tokens` called
 * `variantFor(features)` and nothing else, so it validated the FEATURE SET and never read the cap.
 * The cap was first checked by `constructorArgs`, inside the deploy job — after payment. A
 * customer could order a pausable token with no cap, **pay**, and then hold an order that could
 * never be built.
 *
 * Mint now refuses that at the order route: `assertBuildable`
 * (`mint/src/catalogue.ts:179`, called at `mint/src/server.ts:423`) runs the deploy path's own
 * `variantFor` and `constructorArgs` against the request and answers **400 `unbuildable_order`**
 * with the offending `field` (`mint/src/server.ts:303`). The cap rule below is therefore an
 * ordinary mirror like every other rule in this file — it exists so the customer sees the message
 * next to the input rather than after a round trip, not because it is the only copy.
 *
 * **It is still not allowed to be stricter than the service**, and that matters more now than it
 * did when it was the only guard: the two now genuinely can disagree. `test/launch.test.ts` walks
 * every variant in both directions, and the messages here must stay reachable — a combination this
 * file refuses and mint accepts is a feature this client has quietly removed.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Feature, Variant } from './mint.ts'

/* ══════════════════════════════ the field rules ══════════════════════════════ */

/** `mint/src/server.ts:144` — `MAX_NAME = 64`. */
export const MAX_NAME = 64

/** `mint/src/server.ts:145` — `MAX_SYMBOL = 12`, and the pattern at `server.ts:398`. */
export const SYMBOL_PATTERN = /^[A-Z0-9]{2,12}$/

/** `requireInteger(body, 'decimals', 0, 18)` — `mint/src/server.ts:401`. */
export const MIN_DECIMALS = 0
export const MAX_DECIMALS = 18

/**
 * `requireQuantity` — `mint/src/server.ts:739-745`.
 *
 * Positive, no leading zero, at most 78 digits. Note what it is NOT: it is not a human amount.
 * See `smallestUnitWarning`.
 */
export const QUANTITY_PATTERN = /^[1-9][0-9]{0,77}$/

/** `canonicaliseEvm` refuses anything that is not a 20-byte hex address — `mint/src/evm.ts`. */
export const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

/** The one address `canonicaliseEvm` refuses outright: nobody holds its key. */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/* ══════════════════════════════ variants ══════════════════════════════ */

/**
 * The variant a feature set deploys, or null when no committed contract provides exactly it.
 *
 * A faithful re-implementation of `variantFor` (`mint/src/catalogue.ts:98-111`), and faithful
 * specifically in refusing a SUPERSET. `pausable` alone matches nothing: the only contract that
 * pauses also mints and burns, and giving a customer an owner key that can freeze every holder's
 * balance because it was the nearest fit is worse than refusing.
 */
export function variantFor(features: readonly Feature[]): Variant | null {
  const wanted = new Set(features)
  if (wanted.size === 0) return 'fixed'
  if (wanted.size === 2 && wanted.has('mintable') && wanted.has('burnable')) return 'mintable'
  if (wanted.size === 3) return 'foundry'
  return null
}

/** `mint/src/catalogue.ts:39-64` — `cap` is `'required'` or `'forbidden'`, never optional. */
export function capRuleFor(variant: Variant): 'required' | 'forbidden' {
  return variant === 'foundry' ? 'required' : 'forbidden'
}

/** The three sets a customer may actually order, in the order the catalogue lists them. */
export const OFFERED_FEATURE_SETS: ReadonlyArray<{ variant: Variant; features: readonly Feature[] }> = [
  { variant: 'fixed', features: [] },
  { variant: 'mintable', features: ['mintable', 'burnable'] },
  { variant: 'foundry', features: ['mintable', 'burnable', 'pausable'] },
]

/* ══════════════════════════════ the draft ══════════════════════════════ */

export interface LaunchDraft {
  chain: string
  network: string
  name: string
  symbol: string
  decimals: string
  supply: string
  cap: string
  features: readonly Feature[]
  ownerAddress: string
  ownerWalletId: string
}

/** One problem with one field, in the words the customer needs. */
export interface FieldProblem {
  readonly field: keyof LaunchDraft
  readonly message: string
}

/**
 * Everything wrong with a draft, in field order.
 *
 * Returns a LIST rather than the first problem: a form that reveals its objections one at a time
 * makes the customer submit five times to learn five things, and each submission of this form is
 * an order row.
 */
export function problemsWith(draft: LaunchDraft): readonly FieldProblem[] {
  const out: FieldProblem[] = []
  const bad = (field: keyof LaunchDraft, message: string) => out.push({ field, message })

  if (!['ember', 'eth', 'sol'].includes(draft.chain)) {
    bad('chain', 'Pick Ember, Ethereum or Solana.')
  }
  if (!['mainnet', 'testnet'].includes(draft.network)) {
    bad('network', 'Pick mainnet or testnet.')
  }

  if (draft.name.trim().length === 0) {
    bad('name', 'A token needs a name.')
  } else if (draft.name.length > MAX_NAME) {
    // Mirrors `mint/src/server.ts:396`, which counts the raw string rather than the trimmed one.
    bad('name', `At most ${MAX_NAME} characters; this is ${draft.name.length}.`)
  }

  if (!SYMBOL_PATTERN.test(draft.symbol)) {
    bad('symbol', 'Two to twelve characters, upper-case letters and digits only.')
  }

  // The digits are checked as TEXT before the coercion, because `Number('')` is 0 and `Number(' ')`
  // is 0 — so an empty decimals field would otherwise pass as a valid zero-decimal token. The
  // service never sees the empty string (`requireInteger` gets a number), which is exactly why the
  // hole exists on this side only.
  const decimals = /^[0-9]+$/.test(draft.decimals.trim()) ? Number(draft.decimals.trim()) : NaN
  if (!Number.isInteger(decimals) || decimals < MIN_DECIMALS || decimals > MAX_DECIMALS) {
    bad('decimals', `A whole number between ${MIN_DECIMALS} and ${MAX_DECIMALS}.`)
  }

  if (!QUANTITY_PATTERN.test(draft.supply)) {
    bad('supply', 'A positive whole number, no leading zero, up to 78 digits.')
  }

  const variant = variantFor(draft.features)
  if (variant === null) {
    // The refusal names what IS available, exactly as `variantFor` does upstream — a "no" with no
    // alternative is a dead end, and the customer cannot read catalogue.ts.
    bad(
      'features',
      'No committed contract provides exactly that combination. Choose none, ' +
        'mintable + burnable, or mintable + burnable + pausable.',
    )
  } else {
    const rule = capRuleFor(variant)
    if (rule === 'required' && !QUANTITY_PATTERN.test(draft.cap)) {
      bad('cap', 'A pausable token deploys the capped contract, which needs a maximum supply.')
    }
    if (rule === 'forbidden' && draft.cap.trim().length > 0) {
      bad('cap', 'This contract takes no cap. Add pausable to order the capped one, or clear it.')
    }
    if (
      rule === 'required' &&
      QUANTITY_PATTERN.test(draft.cap) &&
      QUANTITY_PATTERN.test(draft.supply) &&
      BigInt(draft.cap) < BigInt(draft.supply)
    ) {
      // `constructorArgs` throws 'cap must be at least the initial supply' — catalogue.ts:142-144.
      bad('cap', 'The cap cannot be below the initial supply.')
    }
  }

  if (!EVM_ADDRESS_PATTERN.test(draft.ownerAddress)) {
    bad('ownerAddress', 'A 20-byte address, starting 0x.')
  } else if (draft.ownerAddress.toLowerCase() === ZERO_ADDRESS) {
    bad('ownerAddress', 'The zero address is refused: nobody holds its key.')
  }

  if (draft.ownerWalletId.trim().length === 0) {
    bad('ownerWalletId', 'The wallet this launch is paid from.')
  }

  return out
}

export function isSubmittable(draft: LaunchDraft): boolean {
  return problemsWith(draft).length === 0
}

/* ══════════════════════════════ the smallest-unit trap ══════════════════════════════ */

/**
 * What the customer is actually ordering, said in the unit they are actually ordering it in.
 *
 * `supply` goes to the contract constructor UNSCALED: `_mint(recipient_, initialSupply_)` in
 * every one of the three contracts (`mint/src/contracts/ForgeTokens.sol:38`, `:58`, `:83`), from
 * `constructorArgs` (`mint/src/catalogue.ts:131`). `decimals` is a separate constructor argument
 * that only changes how a wallet DISPLAYS the balance.
 *
 * So "1000000" with 18 decimals is not a million tokens. It is 0.000000000001 of one, permanently,
 * on a fixed-supply contract that can never mint again. The form shows this line under the field
 * for every draft, not only the surprising ones — a warning that appears only when something is
 * wrong teaches people to read it as an error rather than as the unit.
 */
export function displaySupply(supply: string, decimals: number): string {
  if (!QUANTITY_PATTERN.test(supply)) return '—'
  if (decimals <= 0) return group(supply)
  if (supply.length <= decimals) {
    return `0.${supply.padStart(decimals, '0').replace(/0+$/, '') || '0'}`
  }
  const whole = supply.slice(0, supply.length - decimals)
  const fraction = supply.slice(supply.length - decimals).replace(/0+$/, '')
  return fraction.length === 0 ? group(whole) : `${group(whole)}.${fraction}`
}

/** Thousands separators, on a decimal string, without going through a Number. */
export function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * The whole-token amount the customer probably meant, as a supply value.
 *
 * Offered as a one-click correction beside the field. It is not applied automatically: this app
 * does not get to decide what somebody's token supply is, and a form that silently multiplies the
 * number typed into it by 10^18 is worse than one that explains the unit.
 */
export function scaleToSmallestUnit(whole: string, decimals: number): string | null {
  if (!/^[1-9][0-9]{0,60}$/.test(whole)) return null
  const scaled = `${whole}${'0'.repeat(decimals)}`
  return QUANTITY_PATTERN.test(scaled) ? scaled : null
}
