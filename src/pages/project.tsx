/**
 * The public project page. `GET /v1/tokens/:id/page` — `mint/src/server.ts`.
 *
 * **No `authenticate()` call.** Fetched with `auth: false` and rendered to anybody with the
 * address, because "a project page nobody can read without an account is a project page that
 * cannot do the one job it has" (`mint/src/server.ts`).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE INVARIANT THIS SCREEN EXISTS TO KEEP — 04-domain-model §5.3, implemented at
 * `mint/src/projectpages.ts`:
 *
 *   Supply, authorities, network and contract address come from the INDEXER, never from the order
 *   record. The order says what the customer asked for at the moment they paid. The chain says
 *   what is true now. They agree at the instant of deployment and diverge immediately afterwards.
 *
 * So `onchain: null` renders as an absence WITH ITS REASON (`onchainUnavailable`), and is never
 * filled in from `token`. The order's numbers are not shown on this page at all — not even greyed
 * out, not even labelled "requested" — because a figure on the screen is a figure a reader will
 * quote, and the whole point of §5.3 is that a buyer must not be able to mistake an intent for an
 * observation.
 *
 * The risk indicators are three-state for the same reason (`format.ts:riskLines`): null is "not
 * observed", which is not "no".
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useParams } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { Fact, Maybe, StateBadge } from '../components/tone.tsx'
import { useResource } from '../lib/resource.ts'
import { getProjectPage, type RenderedPage, type TokenStatus } from '../lib/mint.ts'
import { chainName, riskLines, shortHash, statusTone } from '../lib/format.ts'
import { group } from '../lib/launch.ts'

export function ProjectPage() {
  const { id = '' } = useParams()

  const page = useResource<RenderedPage>(
    (signal) => getProjectPage(id, signal),
    () => 1,
    'This project page could not be fetched.',
    [id],
  )

  if (page.state === 'loading') return <Loading label="Fetching this project" />
  if (page.error) {
    return (
      <Failed
        notice={page.error}
        onRetry={page.reload}
        title="Nothing is published at this address"
      />
    )
  }
  if (!page.data) return <Loading label="Fetching this project" />

  const { token, page: doc, onchain, risk, onchainUnavailable } = page.data

  return (
    <>
      <header className="mw-head">
        <h1 className="mw-head__title">
          {token.name} <span className="cf-num mw-head__symbol">{token.symbol}</span>
        </h1>
        <p className="mw-head__state">
          <StateBadge tone={statusTone(token.status as TokenStatus)} />
          <span className="mw-head__meaning">
            {chainName(token.chain)} · {token.network}
          </span>
        </p>
      </header>

      <section className="mw-panel" aria-labelledby="chain">
        <h2 className="mw-panel__title" id="chain">
          Measured on chain
        </h2>
        {onchain === null ? (
          // The absence names its cause. An absence with no explanation reads as a bug, and this
          // one is frequently not a bug at all: an unindexed contract and an indexer outage are
          // both legitimate and the reader is entitled to know which.
          <p className="mw-absent mw-absent--block">
            {onchainUnavailable ?? 'No reading has been taken from a chain for this token.'}
          </p>
        ) : (
          <>
            <dl className="mw-facts">
              <Fact label="Contract">
                <span className="cf-num" title={onchain.contractAddress}>
                  {shortHash(onchain.contractAddress)}
                </span>
              </Fact>
              <Fact label="Tokens in existence">
                <Maybe
                  value={onchain.totalSupply === null ? null : group(onchain.totalSupply)}
                  missing="not observed"
                />
                {onchain.decimals !== null && (
                  <span className="mw-fact__sub">{onchain.decimals} decimals, as the contract reports them</span>
                )}
              </Fact>
              <Fact label="Cap">
                <Maybe
                  value={onchain.cap === null ? null : group(onchain.cap)}
                  missing="none observed"
                />
              </Fact>
              <Fact label="Owner">
                <Maybe value={onchain.owner === null ? null : shortHash(onchain.owner)} missing="not observed" />
              </Fact>
              <Fact label="Observed at block">
                <Maybe
                  value={onchain.observedAtBlock === null ? null : String(onchain.observedAtBlock)}
                  missing="unknown"
                />
              </Fact>
            </dl>
            <p className="mw-panel__note">
              Each number here was taken from the contract itself. None of it comes from what the
              launcher requested. Those two match on the day of deployment and are free to part
              company from the next block onwards, which is why only one of them is shown to you.
            </p>
          </>
        )}
      </section>

      <section className="mw-panel" aria-labelledby="risk">
        <h2 className="mw-panel__title" id="risk">
          What the contract permits
        </h2>
        <p className="mw-panel__note">
          Worked out from the contract, never supplied by the people behind it. Where a line says
          nothing was observed, treat it as a gap in the reading rather than as reassurance.
        </p>
        <ul className="mw-risks">
          {riskLines(risk).map((r) => (
            <li key={r.label} className={`mw-risk mw-risk--${r.state}`}>
              <span className="mw-risk__glyph" aria-hidden="true">
                {r.state === 'good' ? '✓' : r.state === 'bad' ? '▲' : '?'}
              </span>
              <span className="mw-risk__label">{r.label}</span>
              <span className="mw-risk__text">{r.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mw-panel" aria-labelledby="about">
        <h2 className="mw-panel__title" id="about">
          In their own words
        </h2>
        {doc === null ? (
          <p className="mw-absent mw-absent--block">
            Nobody has written anything here about this token.
          </p>
        ) : (
          <>
            <p className="mw-panel__note">
              Supplied by whoever launched this token and not checked by CloudsForge. Weigh it as
              you would any other claim made by a seller. Verification status:{' '}
              <code className="cf-num">{doc.verificationStatus}</code>.
            </p>
            {doc.description.length > 0 ? (
              <p className="mw-prose">{doc.description}</p>
            ) : (
              <p className="mw-absent mw-absent--block">Left blank.</p>
            )}
            <h3 className="mw-panel__subtitle">Risks they have declared</h3>
            {doc.riskDisclosures.length > 0 ? (
              <p className="mw-prose">{doc.riskDisclosures}</p>
            ) : (
              <p className="mw-absent mw-absent--block">None declared.</p>
            )}
          </>
        )}
      </section>
    </>
  )
}
