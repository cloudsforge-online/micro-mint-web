/**
 * The plate: a contract's constructor, set as an inscription, with the customer's values in it.
 *
 * This is the one bold thing on the surface, and it is made entirely of data that was already
 * here — the argument list comes from `src/lib/inscription.ts`, which was read off
 * `mint/src/contracts/ForgeTokens.sol`, and the values come from the draft the customer is
 * typing. Nothing about it is decorative: the catalogue renders it EMPTY, which is the offer
 * ("bring five arguments"), and the order form renders it FILLING, which is the order.
 *
 * It is not a code sample and it is not `<pre>`. A `<pre>` would be a block of text a screen
 * reader reads as one run; this is a definition list, so each slot is announced as its parameter
 * and its value, and an empty slot is announced as the words describing what belongs there rather
 * than as a dash. The two braces are outside the list — `<dl>` takes `dt`, `dd` and `div` and
 * nothing else — and are `aria-hidden`, because they are punctuation for the eye.
 */
import { CONSTRUCTOR_ARGS, type Slot } from '../lib/inscription.ts'
import type { Variant } from '../lib/mint.ts'

/** What the customer has typed so far. An absent or blank slot renders as its placeholder. */
export type PlateValues = Partial<Record<Slot, string>>

export function Plate({
  variant,
  contract,
  values = {},
  stamp = 'compiled and committed',
}: {
  variant: Variant
  /**
   * The contract's own name, from the catalogue response — never spelled out in this bundle.
   *
   * Empty when the catalogue could not be reached, and the plate then says so rather than naming
   * a file: a guessed file name on an inscription of the real constructor would be the one
   * unverified thing on a surface whose whole argument is that it is showing you the source.
   */
  contract: string
  values?: PlateValues | undefined
  stamp?: string | undefined
}) {
  const args = CONSTRUCTOR_ARGS[variant]

  return (
    <div className="mw-plate">
      <p className="mw-plate__head">
        <span className="mw-plate__file">
          {contract === '' ? 'the contract you picked' : `${contract}.sol`}
        </span>
        <span className="mw-plate__stamp">{stamp}</span>
      </p>
      <div className="mw-plate__body">
        <p className="mw-plate__brace" aria-hidden="true">
          constructor(
        </p>
        <dl className="mw-plate__args">
          {args.map((arg) => {
            const given = (values[arg.slot] ?? '').trim()
            return (
              <div className="mw-plate__arg" key={arg.name}>
                <dt className="mw-plate__param">
                  <span className="mw-plate__type">{arg.type}</span>
                  <span className="mw-plate__name">{arg.name}</span>
                </dt>
                <dd className={`mw-plate__slot${given === '' ? ' mw-plate__slot--empty' : ''}`}>
                  {given === '' ? arg.placeholder : given}
                </dd>
              </div>
            )
          })}
        </dl>
        <p className="mw-plate__brace" aria-hidden="true">
          )
        </p>
      </div>
    </div>
  )
}
