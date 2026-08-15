/**
 * The plate must inscribe the constructor the service would actually call.
 *
 * `src/lib/inscription.ts` is a hand-copy of `mint/src/contracts/ForgeTokens.sol`, and a hand-copy
 * is a second source of truth. This app cannot compile Solidity, so what CAN be proven here is
 * that the copy does not contradict the OTHER copy already in this bundle — `capRuleFor` in
 * `src/lib/launch.ts`, which mirrors `mint/src/catalogue.ts`.
 *
 * Both directions, because either alone passes on a broken table: a `cap_` line on a contract with
 * no cap rule promises a field the service will refuse, and a missing one hides the field on the
 * only contract that requires it. That is the exact defect this product already shipped once, when
 * a pausable order with no cap was accepted, payable and then unbuildable.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CAPABILITIES, CONSTRUCTOR_ARGS, type Slot } from '../src/lib/inscription.ts'
import { capRuleFor } from '../src/lib/launch.ts'
import { type Feature, type Variant } from '../src/lib/mint.ts'

const VARIANTS: readonly Variant[] = ['fixed', 'mintable', 'foundry']

/** What the catalogue reports for each contract — `mint/src/catalogue.ts`. */
const FEATURES: Readonly<Record<Variant, readonly Feature[]>> = {
  fixed: [],
  mintable: ['mintable', 'burnable'],
  foundry: ['mintable', 'burnable', 'pausable'],
}

describe('the inscribed constructor agrees with the cap rule', () => {
  for (const variant of VARIANTS) {
    const args = CONSTRUCTOR_ARGS[variant]
    const slots = args.map((a) => a.slot)

    it(`${variant} inscribes a cap_ line exactly when the cap is required`, () => {
      const hasCapLine = slots.includes('cap')
      assert.equal(
        hasCapLine,
        capRuleFor(variant) === 'required',
        hasCapLine
          ? `${variant} shows a cap_ argument the service forbids`
          : `${variant} requires a cap and the plate never shows one`,
      )
    })

    it(`${variant} takes the four arguments every ForgeToken takes`, () => {
      for (const slot of ['name', 'symbol', 'decimals', 'supply'] as Slot[]) {
        assert.ok(slots.includes(slot), `${variant} does not inscribe ${slot}`)
      }
    })

    it(`${variant} ends with the address argument, as the source does`, () => {
      // `recipient_` on the fixed contract, `owner_` on the other two — and last in both, so the
      // plate can be read against ForgeTokens.sol line for line.
      assert.equal(slots[slots.length - 1], 'owner', `${variant}'s address argument is not last`)
    })

    it(`${variant} names its parameters the way the contract does`, () => {
      // Trailing underscores included. A plate that renamed them would be showing a constructor
      // nobody could find in the source it claims to be quoting.
      for (const arg of args) {
        assert.match(arg.name, /_$/, `${arg.name} is not the contract's own parameter name`)
        assert.notEqual(arg.type, '', `${arg.name} has no Solidity type`)
        assert.notEqual(arg.placeholder.trim(), '', `${arg.name} has no placeholder`)
      }
    })
  }

  it('the fixed contract takes a recipient, not an owner, because it is not Ownable', () => {
    const fixed = CONSTRUCTOR_ARGS.fixed.find((a) => a.slot === 'owner')
    assert.equal(fixed?.name, 'recipient_')
    for (const variant of ['mintable', 'foundry'] as const) {
      assert.equal(CONSTRUCTOR_ARGS[variant].find((a) => a.slot === 'owner')?.name, 'owner_')
    }
  })

  it('exactly one contract is capped, so the plate has something to teach', () => {
    const capped = VARIANTS.filter((v) => CONSTRUCTOR_ARGS[v].some((a) => a.slot === 'cap'))
    assert.deepEqual(capped, ['foundry'])
  })
})

describe('every capability answers with a word, never with a colour alone', () => {
  it('has enough axes to be a comparison rather than a list', () => {
    assert.ok(CAPABILITIES.length >= 4, `only ${CAPABILITIES.length} axes`)
  })

  for (const variant of VARIANTS) {
    it(`${variant} gets a non-empty word on every axis`, () => {
      for (const capability of CAPABILITIES) {
        const answer = capability.answer(FEATURES[variant], capRuleFor(variant))
        assert.notEqual(
          answer.word.trim(),
          '',
          `${capability.axis} answers ${variant} with a glyph and no word`,
        )
      }
    })
  }

  it('the cap axis reads off the cap rule rather than the feature list', () => {
    // The rule the whole plate is built on: `pausable` and `capped` are not the same fact, even
    // though exactly one contract happens to be both today.
    const axis = CAPABILITIES.find((c) => /cap/i.test(c.axis))
    assert.ok(axis, 'no axis mentions the cap at all')
    assert.equal(axis.answer([], 'required').yes, true)
    assert.equal(axis.answer(['mintable', 'burnable', 'pausable'], 'forbidden').yes, false)
  })

  it('the axes distinguish the three contracts from one another', () => {
    // A comparison whose columns agree is a list with extra rules. Asserted so a later edit that
    // flattens the axes fails here rather than shipping a table nobody can choose from.
    const columns = VARIANTS.map((v) =>
      CAPABILITIES.map((c) => c.answer(FEATURES[v], capRuleFor(v)).word).join('|'),
    )
    assert.equal(new Set(columns).size, VARIANTS.length, 'two contracts read identically')
  })
})
