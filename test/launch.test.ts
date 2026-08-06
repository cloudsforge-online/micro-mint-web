/**
 * The order form's rules, proven as pure functions.
 *
 * Two things are being checked and they are not the same:
 *
 *   1. **The mirrors.** Each field rule restates one mint enforces. The test asserts the rule AND
 *      that it is not stricter than the service — a client that refuses something the service
 *      accepts has quietly removed a feature, and nobody files a bug against a form that says no.
 *
 *   2. **The one guard that is NOT a mirror.** `capRuleFor` refuses at order time what mint only
 *      refuses at deploy time, and the sequence it prevents ends with a customer having paid for a
 *      token that can never be built. That deserves the most tests in this file, not the fewest.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_NAME,
  OFFERED_FEATURE_SETS,
  QUANTITY_PATTERN,
  ZERO_ADDRESS,
  capRuleFor,
  displaySupply,
  group,
  isSubmittable,
  problemsWith,
  scaleToSmallestUnit,
  variantFor,
  type LaunchDraft,
} from '../src/lib/launch.ts'
import type { Feature } from '../src/lib/mint.ts'

/** A draft that is valid in every field, so each test can break exactly one thing. */
const GOOD: LaunchDraft = {
  chain: 'ember',
  network: 'testnet',
  name: 'Kindling',
  symbol: 'KDL',
  decimals: '18',
  supply: '1000000000000000000000000',
  cap: '',
  features: [],
  ownerAddress: '0x52908400098527886E0F7030069857D2E4169EE7',
  ownerWalletId: 'wal_01',
}

const fieldsOf = (draft: LaunchDraft) => problemsWith(draft).map((p) => p.field)

describe('the baseline draft is accepted, so a failure below means something', () => {
  it('has no problems', () => {
    assert.deepEqual(problemsWith(GOOD), [])
    assert.equal(isSubmittable(GOOD), true)
  })
})

describe('the variant is the EXACT match or nothing — mint/src/catalogue.ts', () => {
  it('maps the three offered sets to the three committed contracts', () => {
    assert.equal(variantFor([]), 'fixed')
    assert.equal(variantFor(['mintable', 'burnable']), 'mintable')
    assert.equal(variantFor(['mintable', 'burnable', 'pausable']), 'foundry')
  })

  it('refuses a subset rather than deploying the nearest superset', () => {
    // `pausable` alone would otherwise land on the foundry contract, handing the owner a key that
    // can freeze every holder's balance — an authority nobody asked for.
    assert.equal(variantFor(['pausable']), null)
    assert.equal(variantFor(['mintable']), null)
    assert.equal(variantFor(['burnable']), null)
    assert.equal(variantFor(['burnable', 'pausable']), null)
    assert.equal(variantFor(['mintable', 'pausable']), null)
  })

  it('every set the form offers resolves to a real variant', () => {
    for (const offered of OFFERED_FEATURE_SETS) {
      assert.equal(variantFor(offered.features), offered.variant, offered.variant)
    }
  })

  it('an unmatched set is reported against the features field, naming what is available', () => {
    const draft = { ...GOOD, features: ['pausable'] as Feature[] }
    const problem = problemsWith(draft).find((p) => p.field === 'features')
    assert.ok(problem, 'an impossible feature set must be refused')
    assert.match(problem.message, /mintable \+ burnable \+ pausable/)
  })
})

describe('THE CAP GUARD, which mint now applies at the order route too', () => {
  /**
   * This used to be the only cap check anywhere: `POST /v1/tokens` called `variantFor(features)`
   * and never read the cap, and `constructorArgs` — the first thing that did — ran inside the
   * deploy job, after payment. Mint closed that at the order route with `assertBuildable`
   * (mint/src/catalogue.ts, called at mint/src/server.ts), which answers 400
   * `unbuildable_order` naming the field.
   *
   * These cases are kept and are now a MIRROR test rather than a workaround test: each one must
   * agree with what mint refuses, and none may refuse more. `mint/src/unit.test.ts` asserts the
   * same matrix on the service's side.
   */
  it('the capped contract is the only one that takes a cap', () => {
    assert.equal(capRuleFor('foundry'), 'required')
    assert.equal(capRuleFor('fixed'), 'forbidden')
    assert.equal(capRuleFor('mintable'), 'forbidden')
  })

  it('refuses a pausable order with no cap — the paid-and-unbuildable case', () => {
    const draft = { ...GOOD, features: ['mintable', 'burnable', 'pausable'] as Feature[], cap: '' }
    assert.deepEqual(fieldsOf(draft), ['cap'])
  })

  it('refuses a cap on a contract that takes none, in both uncapped variants', () => {
    for (const features of [[], ['mintable', 'burnable']] as Feature[][]) {
      const draft = { ...GOOD, features, cap: '2000' }
      assert.deepEqual(fieldsOf(draft), ['cap'], features.join('+') || 'fixed')
    }
  })

  it('refuses a cap below the initial supply', () => {
    const draft = {
      ...GOOD,
      features: ['mintable', 'burnable', 'pausable'] as Feature[],
      supply: '1000',
      cap: '999',
    }
    assert.deepEqual(fieldsOf(draft), ['cap'])
  })

  it('accepts a cap equal to the supply, because the contract does', () => {
    // `constructorArgs` refuses only `cap < supply` (catalogue.ts). Refusing equality here
    // would be this form being stricter than the chain, which is the failure mode named at the top.
    const draft = {
      ...GOOD,
      features: ['mintable', 'burnable', 'pausable'] as Feature[],
      supply: '1000',
      cap: '1000',
    }
    assert.deepEqual(problemsWith(draft), [])
  })
})

describe('the field rules mirror the service and are no stricter', () => {
  it('accepts a name of exactly MAX_NAME and refuses one longer — server.ts', () => {
    assert.deepEqual(problemsWith({ ...GOOD, name: 'x'.repeat(MAX_NAME) }), [])
    assert.deepEqual(fieldsOf({ ...GOOD, name: 'x'.repeat(MAX_NAME + 1) }), ['name'])
  })

  it('refuses an empty name, which the service would take as a missing field', () => {
    assert.deepEqual(fieldsOf({ ...GOOD, name: '   ' }), ['name'])
  })

  it('accepts the symbol boundaries and refuses outside them — server.ts', () => {
    for (const symbol of ['AB', 'A1', 'ABCDEFGHIJKL', 'X9Z']) {
      assert.deepEqual(problemsWith({ ...GOOD, symbol }), [], symbol)
    }
    for (const symbol of ['A', 'ABCDEFGHIJKLM', 'abc', 'A-B', 'A B', '']) {
      assert.deepEqual(fieldsOf({ ...GOOD, symbol }), ['symbol'], symbol)
    }
  })

  it('accepts 0 and 18 decimals and refuses outside — server.ts', () => {
    for (const decimals of ['0', '6', '18']) {
      assert.deepEqual(problemsWith({ ...GOOD, decimals, supply: '1000' }), [], decimals)
    }
    // The empty string is in this list deliberately: `Number('')` is 0, so a form that coerced
    // before checking would submit a blank field as a valid zero-decimal token.
    for (const decimals of ['-1', '19', '2.5', '', ' ', 'x', '1e1']) {
      assert.deepEqual(fieldsOf({ ...GOOD, decimals }), ['decimals'], decimals)
    }
  })

  it('accepts the supply pattern the service accepts, and nothing else — server.ts', () => {
    for (const supply of ['1', '9'.repeat(78)]) {
      assert.ok(QUANTITY_PATTERN.test(supply), supply.slice(0, 8))
      assert.deepEqual(problemsWith({ ...GOOD, supply }), [], supply.slice(0, 8))
    }
    for (const supply of ['0', '01', '', '-1', '1.5', '9'.repeat(79), '1e18']) {
      assert.deepEqual(fieldsOf({ ...GOOD, supply }), ['supply'], supply.slice(0, 10))
    }
  })

  it('refuses the zero address, which canonicaliseEvm refuses — server.ts', () => {
    assert.deepEqual(fieldsOf({ ...GOOD, ownerAddress: ZERO_ADDRESS }), ['ownerAddress'])
  })

  it('accepts a mixed-case address without demanding a correct checksum', () => {
    // `canonicaliseEvm` CHECKSUMS the input rather than requiring one, so demanding EIP-55 here
    // would refuse an address the service would have accepted and fixed.
    assert.deepEqual(problemsWith({ ...GOOD, ownerAddress: '0x' + 'ab'.repeat(20) }), [])
    assert.deepEqual(problemsWith({ ...GOOD, ownerAddress: '0x' + 'AB'.repeat(20) }), [])
  })

  it('refuses an address of the wrong length or with no 0x', () => {
    for (const address of ['0x1234', 'ab'.repeat(20), '0x' + 'ab'.repeat(21), '']) {
      assert.deepEqual(fieldsOf({ ...GOOD, ownerAddress: address }), ['ownerAddress'], address.slice(0, 8))
    }
  })

  it('requires the wallet the charge comes from — server.ts', () => {
    assert.deepEqual(fieldsOf({ ...GOOD, ownerWalletId: '  ' }), ['ownerWalletId'])
  })

  it('refuses a chain or network the service does not know — server.ts', () => {
    assert.deepEqual(fieldsOf({ ...GOOD, chain: 'btc' }), ['chain'])
    assert.deepEqual(fieldsOf({ ...GOOD, network: 'devnet' }), ['network'])
  })

  it('reports every problem at once rather than the first', () => {
    // A form that reveals its objections one at a time makes somebody submit five times to learn
    // five things, and each submission of this form is an order row.
    const draft = { ...GOOD, name: '', symbol: 'a', decimals: '99', supply: '0' }
    assert.deepEqual(fieldsOf(draft), ['name', 'symbol', 'decimals', 'supply'])
  })
})

describe('the smallest-unit trap', () => {
  /**
   * `supply` reaches the constructor UNSCALED — `_mint(recipient_, initialSupply_)` in all three
   * contracts (mint/src/contracts/ForgeTokens.sol). `decimals` is a separate
   * constructor argument that only changes what a wallet displays.
   */
  it('renders base units as the amount a wallet will show', () => {
    assert.equal(displaySupply('1000000000000000000', 18), '1')
    assert.equal(displaySupply('1500000000000000000', 18), '1.5')
    assert.equal(displaySupply('1000000', 6), '1')
    assert.equal(displaySupply('1234567', 6), '1.234567')
  })

  it('shows the surprise rather than rounding it away', () => {
    // The exact case: a million typed into a field on an 18-decimal token.
    assert.equal(displaySupply('1000000', 18), '0.000000000001')
  })

  it('groups the whole part and never uses a Number', () => {
    assert.equal(displaySupply('1000000', 0), '1,000,000')
    // Past 2^53 — a value that does not survive a JSON number, which is why mint sends strings.
    assert.equal(group('12345678901234567890'), '12,345,678,901,234,567,890')
  })

  it('says nothing rather than guessing for a supply that is not a quantity', () => {
    assert.equal(displaySupply('', 18), '—')
    assert.equal(displaySupply('0', 18), '—')
    assert.equal(displaySupply('nope', 18), '—')
  })

  it('offers the scaled value as a suggestion, and only when it is representable', () => {
    assert.equal(scaleToSmallestUnit('1000000', 18), '1000000' + '0'.repeat(18))
    assert.equal(scaleToSmallestUnit('1', 0), '1')
    // 78 digits is the service's ceiling; a suggestion past it would be refused on submit.
    assert.equal(scaleToSmallestUnit('9'.repeat(61), 18), null)
    assert.equal(scaleToSmallestUnit('0', 18), null)
    assert.equal(scaleToSmallestUnit('', 18), null)
  })
})
