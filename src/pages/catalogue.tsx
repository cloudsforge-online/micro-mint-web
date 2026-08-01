/**
 * What Forge Create can deploy, and what it costs.
 *
 * `GET /v1/catalogue` — `mint/src/server.ts:340`. **No `authenticate()` call**, so this screen is
 * fetched with `auth: false` and rendered to a signed-out visitor. That is not a convenience: the
 * handler's own comment says "a catalogue behind a token cannot be browsed", and a product whose
 * front page demands a session cannot answer the question people arrive with.
 *
 * The catalogue is a PROJECTION of the committed contracts rather than a price list somebody
 * maintains (`mint/src/catalogue.ts:1-9`), which is why the cap rule is rendered as part of each
 * tier rather than as small print: `cap` is `'required'` or `'forbidden'`
 * (`mint/src/catalogue.ts:36`) and there is no third option. A customer who does not learn that
 * here learns it after paying — see the note in src/lib/launch.ts.
 */
import { Link } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { useResource } from '../lib/resource.ts'
import { getCatalogue, type Catalogue } from '../lib/mint.ts'
import { chainName, shards } from '../lib/format.ts'
import { CHAINS } from '../lib/mint.ts'

const TIER_COPY: Record<string, { title: string; blurb: string }> = {
  fixed: {
    title: 'Fixed supply',
    blurb:
      'Everything is minted once, to the owner address, and nothing can ever mint again. There is no owner key, so there is nothing to renounce and nothing to lose.',
  },
  mintable: {
    title: 'Mintable and burnable',
    blurb:
      'An owner key can mint more and holders can burn. Uncapped by design — a project page shows the live supply from the chain, so a buyer sees what was actually minted.',
  },
  foundry: {
    title: 'Mintable, burnable and pausable',
    blurb:
      'The owner key can also freeze every transfer. This is the capped contract: it takes a maximum supply at construction and cannot exceed it.',
  },
}

export function CataloguePage() {
  const catalogue = useResource<Catalogue>(
    (signal) => getCatalogue(signal),
    (data) => data.variants.length,
    'The catalogue could not be loaded.',
  )

  return (
    <>
      <header className="mw-head">
        <h1 className="mw-head__title">Launch a token, cross-chain</h1>
        <p className="mw-head__lede">
          Pick a contract, pay in Shards, and deploy to Ember, Ethereum or Solana. Every launch gets
          a project page whose supply and authorities are read from the chain rather than from your
          order.
        </p>
      </header>

      {catalogue.state === 'loading' && <Loading label="Reading the catalogue" />}
      {(catalogue.state === 'failed' || catalogue.state === 'forbidden') && catalogue.error && (
        <Failed notice={catalogue.error} onRetry={catalogue.reload} title="The catalogue did not load" />
      )}

      {catalogue.data && (
        <>
          <section className="mw-panel" aria-labelledby="price">
            <h2 className="mw-panel__title" id="price">
              Price
            </h2>
            <p className="mw-price">
              <span className="cf-num mw-price__value">{shards(catalogue.data.priceShards)}</span>{' '}
              <span className="mw-price__unit">Shards per deploy</span>
            </p>
            <p className="mw-panel__note">
              Charged once, when you pay for an order. Opening an order charges nothing
              (<code className="cf-num">POST /v1/tokens</code>, mint/src/server.ts:358).
              {/* The service's default network, which the order form pre-selects. Rendered because
                  a catalogue that does not say which network it priced is describing two
                  different products at one price. */}{' '}
              This deployment serves <code className="cf-num">{catalogue.data.network}</code> by
              default.
            </p>
          </section>

          <section className="mw-panel" aria-labelledby="tiers">
            <h2 className="mw-panel__title" id="tiers">
              The three contracts
            </h2>
            <p className="mw-panel__note">
              The contract is chosen by the features you ask for, and only an EXACT match is
              deployed. There is no nearest fit: a token that turned out to be pausable because
              nothing else was close would hand its owner a key that can freeze every holder’s
              balance.
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
                            ? 'required — you set a cap the contract can never exceed'
                            : 'not accepted — this contract has no cap'}
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
              Chains
            </h2>
            <p className="mw-panel__note">
              {CHAINS.map(chainName).join(', ')}. A deploy is accepted immediately and runs as a
              job: the response is a <code className="cf-num">202</code> and a status address, never
              a contract. Nothing in a launch request reaches a chain
              (mint/src/server.ts:485-490).
            </p>
          </section>

          <p className="mw-cta">
            <Link className="cf-btn cf-btn--primary" to="/launch">
              Start a launch
            </Link>
          </p>
        </>
      )}
    </>
  )
}
