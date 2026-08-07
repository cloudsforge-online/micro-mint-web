/**
 * Your launches. `GET /v1/tokens` — `mint/src/server.ts`.
 *
 * The service returns at most 100 rows (`listTokens(deps.sql, userSubject(userId), 100)`,
 * `server.ts`) and takes NO cursor: there is no pagination to offer, and pretending otherwise
 * with a "next" button that cannot work would be worse than saying so. The list says it is capped
 * when it is full, because a customer with 100 launches would otherwise never learn that the
 * hundred-and-first is missing.
 *
 * The `userId` query parameter the handler reads (`server.ts`) is not exposed by this app;
 * see the note on `listOrders` in src/lib/mint.ts.
 */
import { Link } from 'react-router-dom'
import { Empty, Failed, Loading } from '../components/states.tsx'
import { StateBadge } from '../components/tone.tsx'
import { useResource } from '../lib/resource.ts'
import { listOrders, type TokenOrder } from '../lib/mint.ts'
import { chainName, shortId, statusTone, timestamp } from '../lib/format.ts'
import { displaySupply } from '../lib/launch.ts'

/** `mint/src/server.ts` passes 100 as the limit. */
const SERVICE_LIMIT = 100

export function TokensPage() {
  const orders = useResource<{ tokens: readonly TokenOrder[] }>(
    (signal) => listOrders(signal),
    (data) => data.tokens.length,
    'Your launches could not be fetched.',
  )

  return (
    <>
      <header className="mw-head">
        <h1 className="mw-head__title">Your launches</h1>
        <p className="mw-head__lede">
          Every token you have started here, whether it reached a chain or not. Select one to pay for
          it, send it, watch each step of the deploy, or edit the page the public reads about it.
        </p>
      </header>

      {orders.state === 'loading' && <Loading label="Fetching your launches" />}
      {(orders.state === 'failed' || orders.state === 'forbidden') && orders.error && (
        <Failed notice={orders.error} onRetry={orders.reload} title="Your launches are not on screen" />
      )}
      {orders.state === 'empty' && (
        <Empty
          title="You have not started a token"
          hint="Fill in the form and a draft appears here straight away. Your wallet stays untouched until you choose to pay for a deploy."
          action={
            <Link className="cf-btn cf-btn--primary" to="/launch">
              Launch a token
            </Link>
          }
        />
      )}

      {orders.state === 'ok' && orders.data && (
        <>
          <div className="mw-tablewrap">
            <table className="mw-table">
              <caption className="mw-table__caption">
                Most recent at the top, which is how the service hands them over
                (`order by created_at desc`, mint/src/tokens.ts). Open a row to see where it has
                got to, what it cost, and each step of its deploy.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Token</th>
                  <th scope="col">Chain</th>
                  <th scope="col">Supply</th>
                  <th scope="col">Where it is</th>
                  <th scope="col">Started</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.tokens.map((token) => (
                  <tr key={token.id}>
                    <th scope="row">
                      <Link className="mw-table__link" to={`/tokens/${token.id}`}>
                        <span className="mw-table__name">{token.name}</span>{' '}
                        <span className="cf-num mw-table__symbol">{token.symbol}</span>
                      </Link>
                      <span className="mw-table__sub cf-num" title={token.id}>
                        {shortId(token.id)}
                      </span>
                    </th>
                    <td>
                      {chainName(token.chain)}
                      <span className="mw-table__sub">{token.network}</span>
                    </td>
                    <td className="cf-num">
                      {displaySupply(token.supply, token.decimals)}
                      <span className="mw-table__sub">{token.decimals} decimals</span>
                    </td>
                    <td>
                      <StateBadge tone={statusTone(token.status)} />
                    </td>
                    <td>{timestamp(token.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {orders.data.tokens.length >= SERVICE_LIMIT && (
            // Said rather than hidden. The service takes no cursor, so this app cannot fetch the
            // rest — and a list that quietly stops at a round number is a list a customer trusts.
            <p className="mw-note mw-note--warn" role="status">
              <span className="mw-note__icon" aria-hidden="true">
                ▲
              </span>
              You are looking at your {SERVICE_LIMIT} most recent launches, which is as many as the
              service will hand over in one go (mint/src/server.ts). It accepts no paging
              instruction, so anything older is reachable only by its own address. If you kept the
              link, it still works.
            </p>
          )}
        </>
      )}
    </>
  )
}
