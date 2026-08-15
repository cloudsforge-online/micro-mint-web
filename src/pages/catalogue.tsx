/**
 * What Forge Create can deploy, and what it costs.
 *
 * `GET /v1/catalogue` — `mint/src/server.ts`. **No `authenticate()` call**, so this screen is
 * fetched with `auth: false` and rendered to a signed-out visitor. That is not a convenience: the
 * handler's own comment says "a catalogue behind a token cannot be browsed", and a product whose
 * front page demands a session cannot answer the question people arrive with.
 *
 * The catalogue is a PROJECTION of the committed contracts rather than a price list somebody
 * maintains (`mint/src/catalogue.ts`), which is why the cap rule is rendered as a row of the
 * comparison rather than as small print: `cap` is `'required'` or `'forbidden'` and there is no
 * third option. A customer who does not learn that here learns it after paying.
 *
 * ── WHY THE PAGE IS SHAPED LIKE THIS ──────────────────────────────────────────────────────────
 *
 * It used to open with four paragraphs of roughly sixty words each, then three more under three
 * contract names, then two about chains — some seven hundred words of prose before a reader
 * reached a control. Every sentence was true, and together they said one thing: THE BYTECODE WAS
 * COMPILED BEFORE YOU ARRIVED, SO AN ORDER IS FIVE CONSTRUCTOR ARGUMENTS.
 *
 * So that is what the page shows, using the arguments themselves (`src/components/plate.tsx`,
 * read off `mint/src/contracts/ForgeTokens.sol`). The three contracts became a comparison,
 * because the decision they support is a comparison and prose is the worst way to make one: the
 * axes are the capabilities an owner keeps, derived from the FEATURES the response reported. What
 * survives of the prose is four claims, each with the single line that makes it checkable.
 */
import { Link } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { Plate } from '../components/plate.tsx'
import { useResource } from '../lib/resource.ts'
import { getCatalogue, CHAINS, type Catalogue } from '../lib/mint.ts'
import { CAPABILITIES, TIER_COPY } from '../lib/inscription.ts'
import { chainName, usd } from '../lib/format.ts'

/**
 * Four claims, each with the ONE fact that makes it checkable.
 *
 * These were four sentences apiece and they are now a clause apiece, for the reason this whole page
 * was rewritten: a claim is believed because of the fact under it, not because of how many words
 * surround the fact. "No admin slot, no proxy, no upgrade route" is checkable in an explorer in
 * fifteen seconds; the sentence that used to follow it — "There is nothing for us to hold" — was
 * the same claim again in a softer voice, which is the shape of copy that makes a page feel like it
 * is selling rather than stating.
 */
const PROOFS: readonly { readonly claim: string; readonly line: string }[] = [
  { claim: 'We cannot touch it', line: 'No admin slot, no proxy, no upgrade route' },
  { claim: 'Compiled before you asked', line: 'In the repository, beside a checksum of its source' },
  { claim: 'A plain ERC-20', line: 'OpenZeppelin — every wallet already reads it' },
  { claim: 'Gas is ours', line: 'You never fund an address and never sign' },
]

export function CataloguePage() {
  const catalogue = useResource<Catalogue>(
    (signal) => getCatalogue(signal),
    (data) => data.variants.length,
    'The list of contracts could not be fetched.',
  )

  const data = catalogue.data

  return (
    <>
      <header className="mw-hero">
        <div className="mw-hero__say">
          {/* The mark from brand/assets/create: an anvil with a spark over it. It is the page's
              own thesis in one drawing — the anvil is the die, already there, and the spark is the
              single strike a person adds. Decorative, so it is out of the accessibility tree and
              the words beside it carry the meaning. */}
          <p className="mw-eyebrow">
            <img className="mw-eyebrow__mark" src="/mark-256.png" alt="" aria-hidden="true" width="22" height="22" />
            Forge Create
          </p>
          <h1 className="mw-hero__title">
            The die is already cut.
            <br />
            You bring the inscription.
          </h1>
          <p className="mw-hero__lede">
            Three ERC-20 contracts, compiled and committed before you arrived. Your order fills in
            the constructor and nothing else.
          </p>

          <div className="mw-hero__actions">
            <Link className="cf-btn cf-btn--ember" to="/launch">
              Name your token
            </Link>

            {/* The quote, and the quote alone. What it costs in EMBER is a settlement-time
                question the catalogue cannot answer: the rate is read per payment and recorded on
                the order that used it (`mint/src/pricingclient.ts`), so a figure printed here
                would be a rate this screen never consulted. The line beneath says what the charge
                is DENOMINATED in, which is the durable part. */}
            {data && (
              <p className="mw-cost">
                {usd(data.priceUsdCents) === null ? (
                  <span className="mw-absent">the amount is not being reported</span>
                ) : (
                  <>
                    <span className="cf-num mw-cost__value">{usd(data.priceUsdCents)}</span>
                    <span className="mw-cost__unit">
                      per deploy, settled in <code className="cf-num">{data.settlementAsset}</code>{' '}
                      at the rate read when you pay
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/*
          The offer, rendered as the thing being offered. `fixed` is the plate a visitor meets
          because it is the contract with nothing in it to explain — and the file name comes off
          the response rather than being written here, so the plate names the file mint would
          really deploy.
        */}
        {data && (
          <div className="mw-hero__plate">
            <Plate
              variant="fixed"
              contract={data.variants.find((v) => v.variant === 'fixed')?.contract ?? 'FixedSupplyToken'}
              stamp="already compiled"
            />
            <p className="mw-hero__caption">
              Five arguments. Everything else was decided, compiled and checked in before you opened
              this page.
            </p>
          </div>
        )}
      </header>

      {catalogue.state === 'loading' && <Loading label="Fetching the contracts on offer" />}
      {(catalogue.state === 'failed' || catalogue.state === 'forbidden') && catalogue.error && (
        <Failed
          notice={catalogue.error}
          onRetry={catalogue.reload}
          title="The contract list is not on screen"
        />
      )}

      {data && (
        <>
          <section className="mw-section" aria-labelledby="dies">
            <h2 className="mw-section__title" id="dies">
              The three dies
            </h2>
            {/* One clause, and it is the one a reader can act on: what you tick must MATCH a die,
                because a near fit is refused rather than rounded up. The paragraph that used to be
                here spent three more sentences justifying that rule with a scenario. The rule is
                the useful part; the scenario was the page arguing with itself. */}
            <p className="mw-section__note">
              What you tick has to match one of them exactly. A near fit is refused, never rounded
              up.
            </p>

            <div className="mw-scroll">
              <table className="mw-dies">
                {/* Not on screen. A caption telling a sighted reader to "read across a row to
                    compare" explains a table to someone already looking at it — the instruction is
                    the table's own shape. It stays for the screen reader, where the shape is not
                    visible and the summary is the fastest way to know what is about to be read. */}
                <caption className="cf-sr">
                  Three contracts compared across what each one allows.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="cf-sr">What the contract allows</span>
                    </th>
                    {data.variants.map((v) => (
                      <th scope="col" key={v.variant}>
                        <span className="mw-dies__name">{TIER_COPY[v.variant]?.title ?? v.variant}</span>
                        <span className="cf-num mw-dies__contract">{v.contract}</span>
                        {/* The variant key itself, because it is the word the service, the order
                            row and any support conversation all use. */}
                        <span className="cf-num mw-dies__key">{v.variant}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITIES.map((capability) => (
                    <tr key={capability.axis}>
                      <th scope="row" className="mw-dies__axis">
                        {capability.axis}
                      </th>
                      {data.variants.map((v) => {
                        const answer = capability.answer(v.features, v.cap)
                        return (
                          <td key={v.variant}>
                            {/* Glyph AND word, never the tint alone — see the head of
                                src/styles.css. */}
                            <span className="mw-dies__cell">
                              <span
                                className={`mw-dies__glyph${answer.yes ? ' mw-dies__glyph--yes' : ''}`}
                                aria-hidden="true"
                              >
                                {answer.yes ? '●' : '○'}
                              </span>
                              <span>{answer.word}</span>
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="mw-dies__axis">
                      In a sentence
                    </th>
                    {data.variants.map((v) => (
                      <td key={v.variant} className="mw-dies__line">
                        {TIER_COPY[v.variant]?.line ?? ''}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mw-section" aria-labelledby="keep">
            <h2 className="mw-section__title" id="keep">
              What you keep
            </h2>
            <ul className="mw-proofs">
              {PROOFS.map((proof) => (
                <li className="mw-proof" key={proof.claim}>
                  <h3 className="mw-proof__claim">{proof.claim}</h3>
                  <p className="mw-proof__line">{proof.line}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mw-section" aria-labelledby="where">
            <h2 className="mw-section__title" id="where">
              Where it goes
            </h2>
            {/*
              THREE DEFINITIONS, EACH ONE LINE. The paragraph that used to sit under "Chains" listed
              the Ethereum conformance suites Ember passes — state transitions, the VM, transaction
              encoding, the trie, RLP, Shanghai. All true, all verifiable, and none of it a thing a
              person naming a token needs while naming a token. It belongs on the network page,
              where somebody is asking that question. "After you press deploy" went the same way:
              the order page shows the progress it was describing, one line at a time, live.
            */}
            <dl className="mw-pairs">
              <div className="mw-pair">
                <dt>Chains</dt>
                <dd>{CHAINS.map(chainName).join(' · ')}</dd>
              </div>
              <div className="mw-pair">
                <dt>Opens on</dt>
                <dd>
                  <code className="cf-num">{data.network}</code>, and you can change it on the form
                </dd>
              </div>
              <div className="mw-pair">
                <dt>Settled in</dt>
                <dd>
                  <code className="cf-num">{data.settlementAsset}</code> from your CloudsForge
                  wallet
                </dd>
              </div>
            </dl>
          </section>

          <p className="mw-cta">
            <Link className="cf-btn cf-btn--ember" to="/launch">
              Name your token
            </Link>
          </p>
        </>
      )}
    </>
  )
}
