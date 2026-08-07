/**
 * What Forge Create can deploy, and what it costs.
 *
 * `GET /v1/catalogue` — `mint/src/server.ts`. **No `authenticate()` call**, so this screen is
 * fetched with `auth: false` and rendered to a signed-out visitor. That is not a convenience: the
 * handler's own comment says "a catalogue behind a token cannot be browsed", and a product whose
 * front page demands a session cannot answer the question people arrive with.
 *
 * The catalogue is a PROJECTION of the committed contracts rather than a price list somebody
 * maintains (`mint/src/catalogue.ts`), which is why the cap rule is rendered as part of each
 * tier rather than as small print: `cap` is `'required'` or `'forbidden'`
 * (`mint/src/catalogue.ts`) and there is no third option. A customer who does not learn that
 * here learns it after paying — see the note in src/lib/launch.ts.
 */
import { Link } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { useResource } from '../lib/resource.ts'
import { getCatalogue, type Catalogue } from '../lib/mint.ts'
import { chainName, usd } from '../lib/format.ts'
import { CHAINS } from '../lib/mint.ts'

const TIER_COPY: Record<string, { title: string; blurb: string }> = {
  fixed: {
    title: 'Fixed supply',
    blurb:
      'The whole supply is created at construction and sent to your address. The contract has no owner role at all, so there is no key to guard, none to hand over, and no path by which the number of tokens can move.',
  },
  mintable: {
    title: 'Mintable and burnable',
    blurb:
      'Your address holds a key that can issue further tokens, and holders can destroy their own. Supply is deliberately open-ended, so a buyer should read the figure on the project page — it is measured on chain rather than copied from the order.',
  },
  foundry: {
    title: 'Mintable, burnable and pausable',
    blurb:
      'Everything above, plus a switch that stops transfers across the whole token while it is on. The ceiling is fixed in the constructor and the contract arithmetic refuses to pass it.',
  },
}

export function CataloguePage() {
  const catalogue = useResource<Catalogue>(
    (signal) => getCatalogue(signal),
    (data) => data.variants.length,
    'The list of contracts could not be fetched.',
  )

  return (
    <>
      <header className="mw-head">
        <h1 className="mw-head__title">Deploy an ERC-20 that answers to you alone</h1>
        <p className="mw-head__lede">
          Choose one of three Solidity contracts, name your token, and CloudsForge puts it on chain
          for a single dollar price. The address you give in the order is written into the
          constructor, so the supply and any administrative key belong to you from the first block
          the contract exists in.
        </p>
      </header>

      <section className="mw-panel" aria-labelledby="what">
        <h2 className="mw-panel__title" id="what">
          What you walk away with
        </h2>
        <ul className="mw-tiers">
          <li className="mw-tier">
            <h3 className="mw-tier__title">Authority we cannot hold</h3>
            <p className="mw-tier__blurb">
              CloudsForge is unable to issue your tokens, freeze your holders or take the owner role
              off you. That is not a promise about our conduct. The compiled contract has no
              administrator slot, no proxy behind it and no upgrade route, so there is nothing for us
              to hold in the first place — and you can read the source we compiled before you order.
            </p>
          </li>
          <li className="mw-tier">
            <h3 className="mw-tier__title">Bytecode written before you asked</h3>
            <p className="mw-tier__blurb">
              Each contract is compiled ahead of time and the resulting bytes are committed to the
              repository beside a checksum of the source. Your order supplies constructor arguments
              and nothing else. No compiler runs while you wait, and no template is stitched together
              from your input.
            </p>
          </li>
          <li className="mw-tier">
            <h3 className="mw-tier__title">An ordinary token, immediately</h3>
            <p className="mw-tier__blurb">
              What lands on chain is a plain ERC-20 built on OpenZeppelin. Every wallet, block
              explorer and client library that already speaks Ethereum reads it the moment it
              confirms. Nothing has to be taught about it and nothing about it is proprietary.
            </p>
          </li>
          <li className="mw-tier">
            <h3 className="mw-tier__title">Gas handled for you</h3>
            <p className="mw-tier__blurb">
              The deploy is signed and broadcast by an address CloudsForge provisions for your order
              alone. You never fund it, never hold native coin and never sign a transaction. The
              price below is the whole cost of the launch.
            </p>
          </li>
        </ul>
      </section>

      {catalogue.state === 'loading' && <Loading label="Fetching the contracts on offer" />}
      {(catalogue.state === 'failed' || catalogue.state === 'forbidden') && catalogue.error && (
        <Failed notice={catalogue.error} onRetry={catalogue.reload} title="The contract list is not on screen" />
      )}

      {catalogue.data && (
        <>
          <section className="mw-panel" aria-labelledby="price">
            <h2 className="mw-panel__title" id="price">
              What it costs
            </h2>
            <p className="mw-price">
              {/* The quote, and the quote alone. What it costs in EMBER is a settlement-time
                  question the catalogue cannot answer: the rate is read per payment and recorded
                  on the order that used it (mint/src/pricingclient.ts), so a figure printed
                  here would be a rate this screen never consulted. The note below says what the
                  charge will be DENOMINATED in, which is the part that is durable. */}
              {usd(catalogue.data.priceUsdCents) === null ? (
                <span className="mw-absent">the amount is not being reported</span>
              ) : (
                <>
                  <span className="cf-num mw-price__value">{usd(catalogue.data.priceUsdCents)}</span>{' '}
                  <span className="mw-price__unit">per deploy</span>
                </>
              )}
            </p>
            <p className="mw-panel__note">
              One charge, taken when you press pay, and no charge for anything else. The figure is
              held in dollars and converted to{' '}
              <code className="cf-num">{catalogue.data.settlementAsset}</code> using the exchange
              rate read inside that request, which is then written onto your order so the receipt and
              the debit can never disagree. Filling in the form and opening an order costs
              nothing.
              {/* The service's default network, which the order form pre-selects. Rendered because
                  a catalogue that does not say which network it priced is describing two
                  different products at one price. */}{' '}
              Orders default to the <code className="cf-num">{catalogue.data.network}</code> network
              here.
            </p>
          </section>

          <section className="mw-panel" aria-labelledby="tiers">
            <h2 className="mw-panel__title" id="tiers">
              The three contracts
            </h2>
            <p className="mw-panel__note">
              Ticking a feature selects a contract; the set you tick has to match one of these three
              exactly. Nothing is rounded up to the closest available option. Being handed a
              transfer-freezing switch you did not ask for is the kind of surprise a token holder
              discovers at the worst possible moment, so the service refuses the order instead.
            </p>
            <ul className="mw-tiers">
              {catalogue.data.variants.map((v) => {
                const copy = TIER_COPY[v.variant]
                return (
                  <li className="mw-tier" key={v.variant}>
                    <h3 className="mw-tier__title">{copy?.title ?? v.variant}</h3>
                    <p className="mw-tier__contract">
                      <code className="cf-num">{v.contract}</code>
                    </p>
                    <p className="mw-tier__blurb">{copy?.blurb ?? ''}</p>
                    <dl className="mw-tier__facts">
                      <div>
                        <dt>Features</dt>
                        <dd>{v.features.length === 0 ? 'none' : v.features.join(', ')}</dd>
                      </div>
                      <div>
                        <dt>Maximum supply</dt>
                        {/* 'required' or 'forbidden' — never "optional". Saying so here is what
                            stops a customer discovering it at deploy time. */}
                        <dd>
                          {v.cap === 'required'
                            ? 'you set the cap, and the contract arithmetic will not cross it'
                            : 'no cap — this contract implements none, so the field is refused'}
                        </dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="mw-panel" aria-labelledby="chains">
            <h2 className="mw-panel__title" id="chains">
              Where it goes
            </h2>
            <p className="mw-panel__note">
              An order can name {CHAINS.map(chainName).join(', ')}. Ember is the Forge Network&rsquo;s
              own chain: its execution engine was written from the ground up and is held to the
              vectors the Ethereum project publishes for state transitions, the virtual machine,
              transaction encoding, the trie and RLP — all of them passing at Shanghai. So
              &ldquo;this behaves like Ethereum&rdquo; is something you can go and check rather than
              something we ask you to believe.
            </p>
            <p className="mw-panel__note">
              Pressing deploy does not hold your browser open while a chain is written to. The
              request comes straight back with an address to watch, and the signing, broadcast and
              confirmation are recorded on that page one line at a time as they happen. Close the tab
              and come back to it; the work is not tied to your connection.
            </p>
          </section>

          <p className="mw-cta">
            <Link className="cf-btn cf-btn--primary" to="/launch">
              Name your token
            </Link>
          </p>
        </>
      )}
    </>
  )
}
