/**
 * The constructor each committed contract actually takes.
 *
 * Read out of `mint/src/contracts/ForgeTokens.sol`, one contract at a time, and it is the
 * whole argument this product makes: the bytecode was compiled and committed before anybody
 * ordered, so an order is not a specification — it is five or six constructor arguments. The
 * catalogue and the order form both render this list, which is why it lives here rather than
 * being written out twice.
 *
 * THE SHAPE TEACHES THE CAP RULE BETTER THAN A SENTENCE DOES. `FoundryToken` takes `cap_` and
 * the other two do not (`ForgeTokens.sol`), which is the same fact `capRuleFor` states in
 * `src/lib/launch.ts` and the same one `assertBuildable` enforces in `mint/src/catalogue.ts`.
 * A reader who picks the pausable contract watches a sixth line appear; a reader who picks
 * either other one watches it go. Nobody has to be told that a cap is "required" or "forbidden"
 * in the abstract.
 *
 * `test/inscription.test.ts` checks this table against `capRuleFor` in both directions, so the
 * two cannot drift into disagreeing about which contract is capped.
 */
import type { Variant } from './mint.ts'

/** Which value in the customer's draft fills a slot. */
export type Slot = 'name' | 'symbol' | 'decimals' | 'supply' | 'cap' | 'owner'

export interface ConstructorArg {
  /** The Solidity type, as written in the contract. */
  readonly type: string
  /** The parameter name, as written in the contract — trailing underscore and all. */
  readonly name: string
  readonly slot: Slot
  /** What goes here, in the fewest words that are still true. Shown while the slot is empty. */
  readonly placeholder: string
}

const NAME: ConstructorArg = { type: 'string', name: 'name_', slot: 'name', placeholder: 'what wallets display' }
const SYMBOL: ConstructorArg = { type: 'string', name: 'symbol_', slot: 'symbol', placeholder: '2–12 characters' }
const DECIMALS: ConstructorArg = { type: 'uint8', name: 'decimals_', slot: 'decimals', placeholder: '0 to 18' }
const SUPPLY: ConstructorArg = {
  type: 'uint256',
  name: 'initialSupply_',
  slot: 'supply',
  placeholder: 'base units, minted at birth',
}
const CAP: ConstructorArg = { type: 'uint256', name: 'cap_', slot: 'cap', placeholder: 'the ceiling you set' }

/*
 * `recipient_` on the fixed contract and `owner_` on the other two, because that is what the
 * source calls them — and the difference is the product. `FixedSupplyToken` is not `Ownable`, so
 * the address it takes only ever RECEIVES; there is no role to hold. Flattening both to "owner"
 * here would quietly promise an authority one of the three contracts does not have.
 */
const RECIPIENT: ConstructorArg = { type: 'address', name: 'recipient_', slot: 'owner', placeholder: 'your address' }
const OWNER: ConstructorArg = { type: 'address', name: 'owner_', slot: 'owner', placeholder: 'your address' }

export const CONSTRUCTOR_ARGS: Readonly<Record<Variant, readonly ConstructorArg[]>> = Object.freeze({
  fixed: Object.freeze([NAME, SYMBOL, DECIMALS, SUPPLY, RECIPIENT]),
  mintable: Object.freeze([NAME, SYMBOL, DECIMALS, SUPPLY, OWNER]),
  // `cap_` sits where the contract puts it — between the supply and the owner — so the plate can
  // be read against the source line for line.
  foundry: Object.freeze([NAME, SYMBOL, DECIMALS, SUPPLY, CAP, OWNER]),
})

/**
 * What a person calls each contract, and the one sentence that distinguishes it.
 *
 * ONE NAME PER CONTRACT, EVERYWHERE. The catalogue compares the three under these names and the
 * order form offers them under these names, because a customer who chose "Foundry" and then meets
 * a radio labelled `mintable + burnable + pausable` has to work out for themselves that the two
 * are the same thing. `mintable`, `burnable` and `pausable` are the wire's vocabulary — they are
 * what `features` carries to `POST /v1/tokens` — and they still appear on the form, but as the
 * SECOND line, where they read as detail rather than as the name of the thing.
 *
 * The variant key (`fixed`, `mintable`, `foundry`) is the service's own word and appears on the
 * comparison too: it is what an order row and any support conversation will use.
 */
export const TIER_COPY: Readonly<Record<Variant, { readonly title: string; readonly line: string }>> =
  Object.freeze({
    fixed: {
      title: 'Fixed supply',
      line: 'Every token exists from the first block. No owner role is compiled in, so there is no key to lose.',
    },
    mintable: {
      title: 'Mint and burn',
      line: 'You hold a key that can issue more. Holders can destroy their own.',
    },
    foundry: {
      title: 'Foundry',
      line: 'Mint and burn, a switch that stops every transfer, and a ceiling the arithmetic will not cross.',
    },
  })

/**
 * What each contract can be made to do after it exists, as short answers.
 *
 * Derived from the FEATURES the catalogue reports rather than hard-coded per variant, so a
 * contract gaining or losing a capability upstream changes this row rather than contradicting it.
 * Every answer carries a word; the glyph and the tint beside it in the table are reinforcement,
 * never the meaning (see the head of src/styles.css).
 */
export interface Capability {
  readonly axis: string
  /** True where the contract CAN do the thing — which is not always the reassuring answer. */
  readonly answer: (features: readonly string[], cap: 'required' | 'forbidden') => {
    readonly yes: boolean
    readonly word: string
  }
}

export const CAPABILITIES: readonly Capability[] = Object.freeze([
  {
    axis: 'Owner role',
    answer: (features) =>
      features.length === 0
        ? { yes: false, word: 'none exists' }
        : { yes: true, word: 'your address' },
  },
  {
    axis: 'More can be issued',
    answer: (features) =>
      features.includes('mintable') ? { yes: true, word: 'by the owner' } : { yes: false, word: 'never' },
  },
  {
    axis: 'Holders can burn',
    answer: (features) => (features.includes('burnable') ? { yes: true, word: 'yes' } : { yes: false, word: 'no' }),
  },
  {
    axis: 'Transfers can be frozen',
    answer: (features) =>
      features.includes('pausable') ? { yes: true, word: 'by the owner' } : { yes: false, word: 'no' },
  },
  /*
   * The word "cap" is the service's own (`mint/src/catalogue.ts`) and the word a customer will
   * meet again on the order form, in the refusal if they get it wrong, and on the order row. So
   * the axis is not softened into "ceiling": one vocabulary, all the way through.
   */
  {
    axis: 'Supply cap',
    answer: (_features, cap) =>
      cap === 'required'
        ? { yes: true, word: 'required — you set it' }
        : { yes: false, word: 'forbidden — none exists' },
  },
])
