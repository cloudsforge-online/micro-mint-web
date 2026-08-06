/**
 * A state, rendered as a word, a glyph and a tone — in that order of importance.
 *
 * The word is never optional and the glyph is never the only non-colour channel. The estate's
 * reserved status hues sit ΔE 4.6 apart under protanopia, measured in micro-ui, which is why
 * status-web encodes every day three times. A badge that said what it meant only by being amber
 * would say nothing at all to a reader who cannot separate it from the green one.
 */
import type { ReactNode } from 'react'
import type { Tone } from '../lib/format.ts'

export function StateBadge({ tone, title }: { tone: Tone; title?: string | undefined }) {
  return (
    <span className={`mw-badge mw-badge--${tone.tone}`} title={title ?? tone.meaning}>
      <span className="mw-badge__glyph" aria-hidden="true">
        {tone.glyph}
      </span>
      <span className="mw-badge__word">{tone.word}</span>
    </span>
  )
}

/** A label and its value, as a definition pair. The value may be a node — an address, a link. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mw-fact">
      <dt className="mw-fact__label">{label}</dt>
      <dd className="mw-fact__value">{children}</dd>
    </div>
  )
}

/**
 * A value that may be absent, where absence is a real answer rather than a rendering problem.
 *
 * `missing` is the SENTENCE, not a dash. `mint/src/projectpages.ts`: "'We have not
 * observed this' and 'this is false' are different statements and a buyer is entitled to the
 * difference."
 */
export function Maybe({ value, missing }: { value: string | null; missing: string }) {
  if (value === null || value.length === 0) {
    return <span className="mw-absent">{missing}</span>
  }
  return <span className="cf-num">{value}</span>
}
