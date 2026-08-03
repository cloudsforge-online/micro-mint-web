/**
 * Rendering mint's facts without inventing any.
 *
 * The two rules under test are the ones a screen breaks silently: every one of the eight order
 * states must have a word (a fall-through to "unknown" would be telling a paying customer their
 * launch is in a state the site does not recognise), and a null risk indicator must never render
 * as a "no".
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chainName,
  outcomeTone,
  relative,
  riskLines,
  shards,
  shortHash,
  shortId,
  statusTone,
  timestamp,
} from '../src/lib/format.ts'
import { TOKEN_STATUSES, type AttemptOutcome, type RiskIndicators } from '../src/lib/mint.ts'

/** Every outcome `mint/src/tokens.ts:670-677` declares. */
const OUTCOMES: readonly AttemptOutcome[] = [
  'signed',
  'broadcast',
  'confirmed',
  'reverted',
  'refused',
  'unavailable',
  'not_implemented',
]

describe('every state has a word, a glyph and a sentence', () => {
  it('covers all eight order states — mint/src/tokens.ts:38-49', () => {
    assert.equal(TOKEN_STATUSES.length, 8)
    for (const status of TOKEN_STATUSES) {
      const tone = statusTone(status)
      assert.ok(tone.word.length > 0, status)
      assert.ok(tone.glyph.length > 0, status)
      assert.ok(tone.meaning.length > 10, `${status} has no sentence a customer can read`)
    }
  })

  it('gives each state a distinct word, so two states never read the same', () => {
    const words = TOKEN_STATUSES.map((s) => statusTone(s).word)
    assert.equal(new Set(words).size, words.length, words.join(', '))
  })

  it('covers all seven attempt outcomes', () => {
    for (const outcome of OUTCOMES) {
      const tone = outcomeTone(outcome)
      assert.ok(tone.word.length > 0, outcome)
      assert.ok(tone.glyph.length > 0, outcome)
    }
    assert.equal(new Set(OUTCOMES.map((o) => outcomeTone(o).word)).size, OUTCOMES.length)
  })

  it('says a failed launch will not be retried, in the service’s own words', () => {
    // `mint/src/server.ts:524`, and `CLAIMABLE` at `tokens.ts:68-73`. A customer told only "failed"
    // will wait for a retry that a background job deliberately never performs.
    assert.match(statusTone('failed').meaning, /will not be retried automatically/)
  })

  it('never says "deployed" for a state that has not reached a chain', () => {
    for (const status of TOKEN_STATUSES) {
      if (status === 'deployed') continue
      assert.doesNotMatch(statusTone(status).meaning, /is on chain/, status)
    }
  })
})

describe('a risk indicator has three states, and null is not "no"', () => {
  const ALL_NULL: RiskIndicators = {
    hasMintAuthority: null,
    ownershipRenounced: null,
    paused: null,
    supplyExceedsOrder: null,
  }

  it('renders every unobserved indicator as unknown, never as good or bad', () => {
    const lines = riskLines(ALL_NULL)
    assert.equal(lines.length, 4)
    for (const line of lines) {
      assert.equal(line.state, 'unknown', line.label)
      assert.match(line.text, /not observed/i, line.label)
    }
  })

  it('reads a live mint authority as the bad direction', () => {
    const lines = riskLines({ ...ALL_NULL, hasMintAuthority: true })
    assert.equal(lines[0]?.state, 'bad')
    assert.match(lines[0]?.text ?? '', /mint more/)
  })

  it('reads renounced ownership as the good direction and retained as the bad one', () => {
    assert.equal(riskLines({ ...ALL_NULL, ownershipRenounced: true })[1]?.state, 'good')
    assert.equal(riskLines({ ...ALL_NULL, ownershipRenounced: false })[1]?.state, 'bad')
  })

  it('reads a paused contract as bad', () => {
    assert.equal(riskLines({ ...ALL_NULL, paused: true })[2]?.state, 'bad')
    assert.equal(riskLines({ ...ALL_NULL, paused: false })[2]?.state, 'good')
  })

  it('reads supply beyond the order as bad', () => {
    assert.equal(riskLines({ ...ALL_NULL, supplyExceedsOrder: true })[3]?.state, 'bad')
  })

  it('mixes the three states in one answer without collapsing any of them', () => {
    const mixed = riskLines({
      hasMintAuthority: true,
      ownershipRenounced: null,
      paused: false,
      supplyExceedsOrder: null,
    })
    assert.deepEqual(
      mixed.map((l) => l.state),
      ['bad', 'unknown', 'good', 'unknown'],
    )
  })
})

describe('ids, hashes and amounts', () => {
  it('shortens a hash WITH an ellipsis, so two prefixes are never compared as equal', () => {
    const hash = `0x${'a'.repeat(64)}`
    const short = shortHash(hash)
    assert.ok(short.includes('…'), short)
    assert.ok(short.length < hash.length)
  })

  it('leaves a short value whole', () => {
    assert.equal(shortHash('0xabc'), '0xabc')
  })

  it('renders a missing hash as a dash rather than as an empty cell', () => {
    assert.equal(shortHash(null), '—')
    assert.equal(shortHash(''), '—')
  })

  it('takes eight characters of a uuid', () => {
    assert.equal(shortId('5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'), '5c1d2e3f')
  })

  it('groups a Shards price without going through a Number', () => {
    assert.equal(shards('2500'), '2,500')
    assert.equal(shards('12345678901234567890'), '12,345,678,901,234,567,890')
  })

  it('returns an unexpected price verbatim rather than mangling it', () => {
    assert.equal(shards('not-a-number'), 'not-a-number')
  })

  /**
   * An absent price prints NO DIGIT, and this is asserted rather than assumed.
   *
   * `BigInt('')` is `0n` and `Number('')` is `0`, so every obvious way of formatting money turns a
   * missing value into a confident zero. `shards` goes through neither — it is a regex over a
   * decimal string — and the label at `src/pages/token.tsx` reads
   * `Pay ${shards(token.priceShards)} Shards`, so an absent price gives "Pay Shards" and never
   * "Pay 0 Shards". `tessera-web` prints no digit for an unobtainable balance for the same reason:
   * a screen showing somebody their own money must distinguish UNKNOWN from ZERO, and a button
   * offering to charge nothing is the one mistake in that class a customer will act on.
   */
  it('prints no digit at all for an absent price, rather than a zero', () => {
    for (const absent of ['', ' ', undefined as unknown as string, null as unknown as string]) {
      assert.doesNotMatch(
        String(shards(absent) ?? ''),
        /[0-9]/,
        `an absent price rendered a digit, and "Pay 0 Shards" is a price nobody set`,
      )
    }
  })

  it('names the three chains as a person names them', () => {
    assert.equal(chainName('ember'), 'Ember')
    assert.equal(chainName('eth'), 'Ethereum')
    assert.equal(chainName('sol'), 'Solana')
  })

  it('passes an unknown chain through rather than inventing a name for it', () => {
    assert.equal(chainName('base'), 'base')
  })
})

describe('timestamps', () => {
  it('renders an absent timestamp as a dash', () => {
    assert.equal(timestamp(null), '—')
    assert.equal(timestamp(''), '—')
  })

  it('returns an unparseable value VERBATIM rather than "Invalid Date"', () => {
    // Somebody who can see the actual string can report it. Somebody who sees "Invalid Date" can
    // only report that the site is broken.
    assert.equal(timestamp('yesterday-ish'), 'yesterday-ish')
  })

  it('renders a real timestamp as something with the year in it', () => {
    assert.match(timestamp('2026-03-04T05:06:07.000Z'), /2026/)
  })

  it('says "just now" inside five seconds and counts in words after that', () => {
    const now = new Date('2026-03-04T12:00:00.000Z')
    assert.equal(relative(new Date('2026-03-04T11:59:58.000Z'), now), 'just now')
    assert.equal(relative(new Date('2026-03-04T11:59:00.000Z'), now), '60 seconds ago')
    assert.equal(relative(new Date('2026-03-04T11:00:00.000Z'), now), '60 minutes ago')
    assert.equal(relative(new Date('2026-03-04T12:30:00.000Z'), now), 'in 30 minutes')
  })

  it('uses the singular for one, and switches unit only past its own threshold', () => {
    const now = new Date('2026-03-04T12:00:00.000Z')
    // 24 hours is still counted in hours: the unit changes at 36, so an operator reading a page
    // left open overnight sees "24 hours ago" rather than a rounded "1 day".
    assert.equal(relative(new Date('2026-03-03T12:00:00.000Z'), now), '24 hours ago')
    assert.equal(relative(new Date('2026-03-02T12:00:00.000Z'), now), '2 days ago')
    assert.equal(relative(new Date('2026-03-04T11:59:59.000Z'), now), 'just now')
  })
})
