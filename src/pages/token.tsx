/**
 * One launch: what state it is in, what it cost, what reached a chain, and the two buttons.
 *
 * Routes used, each read out of `mint/src/server.ts`:
 *
 *   GET  /v1/tokens/:id         — server.ts   the order and every deploy attempt
 *   POST /v1/tokens/:id/pay     — server.ts   201 fresh, 200 replayed
 *   POST /v1/tokens/:id/deploy  — server.ts   **202 and a status URL**
 *   PUT  /v1/tokens/:id/page    — server.ts   the project page document
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * **DEPLOY ANSWERS 202. IT DOES NOT DEPLOY.**
 *
 * The handler authenticates, checks the mainnet allowlist, runs one conditional UPDATE, enqueues a
 * job and returns a `Location` — the file header at `mint/src/server.ts` explains at length
 * why the work cannot live inside the request (a rolling deploy, a 100-second origin timeout, and
 * a client that gives up, any of which can land between the broadcast and the write that records
 * the hash, orphaning a real contract and deploying a second one).
 *
 * So this screen must never render "deployed" because a button returned successfully. It renders
 * "accepted", and the truth comes from re-reading the order. Getting this wrong is not cosmetic:
 * it would tell a customer their contract exists at a moment when nothing has been broadcast.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The two buttons are OFFERED from the order's own state, using the service's own predicates —
 * `awaiting_payment` for pay (`mint/src/tokens.ts`) and `CLAIMABLE` for deploy
 * (`mint/src/tokens.ts`). A button that will answer 409 is a button that has told the
 * customer something false about what is possible.
 */
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { Fact, Maybe, StateBadge } from '../components/tone.tsx'
import { useMutation } from '../lib/mutation.ts'
import { useResource } from '../lib/resource.ts'
import {
  CLAIMABLE_STATUSES,
  deployOrder,
  getOrder,
  payForOrder,
  putProjectPage,
  type DeployAttempt,
  type TokenOrder,
} from '../lib/mint.ts'
import { chainName, charge, outcomeTone, shortHash, statusTone, timestamp, usd } from '../lib/format.ts'
import { displaySupply } from '../lib/launch.ts'

interface OrderView {
  token: TokenOrder
  attempts: readonly DeployAttempt[]
}

export function TokenPage() {
  const { id = '' } = useParams()

  const order = useResource<OrderView>(
    (signal) => getOrder(id, signal),
    // One order is always one thing. `count` is what decides "empty", and an order that loaded is
    // never empty — a 404 arrives as a failure, which is where it belongs.
    () => 1,
    'This launch could not be fetched.',
    [id],
  )

  const reload = order.reload

  const pay = useMutation(() => payForOrder(id), 'The wallet was not debited.')
  const deploy = useMutation(() => deployOrder(id), 'The deploy was turned down.')

  const onPay = useCallback(async () => {
    if (await pay.run()) reload()
  }, [pay, reload])

  const onDeploy = useCallback(async () => {
    // Re-read either way. The 202 says the job was queued, and the order's status has already
    // moved; the screen must show the row rather than the acknowledgement.
    if (await deploy.run()) reload()
  }, [deploy, reload])

  if (order.state === 'loading') return <Loading label="Fetching this launch" />
  if (order.error) {
    return (
      <Failed
        notice={order.error}
        onRetry={order.reload}
        title={
          // 404 covers both "no such launch" and "not yours" — `ownedToken` answers them the same
          // way on purpose (mint/src/server.ts) so that ids cannot be enumerated. The copy
          // must not claim to know which one it was.
          order.error.message.toLowerCase().includes('no such token')
            ? 'Nothing of yours is filed under that address'
            : 'This launch is not on screen'
        }
      />
    )
  }
  if (!order.data) return <Loading label="Fetching this launch" />

  const token = order.data.token
  const tone = statusTone(token.status)
  const payable = token.status === 'awaiting_payment'
  const deployable = (CLAIMABLE_STATUSES as readonly string[]).includes(token.status)

  return (
    <>
      <header className="mw-head">
        <p className="mw-head__eyebrow">
          <Link to="/tokens">All your launches</Link>
        </p>
        <h1 className="mw-head__title">
          {token.name} <span className="cf-num mw-head__symbol">{token.symbol}</span>
        </h1>
        <p className="mw-head__state">
          <StateBadge tone={tone} />
          <span className="mw-head__meaning">{tone.meaning}</span>
        </p>
      </header>

      {token.status === 'failed' && token.failureReason && (
        <p className="mw-note mw-note--crit" role="alert">
          <span className="mw-note__icon" aria-hidden="true">
            ■
          </span>
          {token.failureReason}
        </p>
      )}

      <section className="mw-panel" aria-labelledby="order">
        <h2 className="mw-panel__title" id="order">
          What you asked for
        </h2>
        <dl className="mw-facts">
          <Fact label="Chain">
            {chainName(token.chain)} · {token.network}
          </Fact>
          <Fact label="Contract standard">
            <span className="cf-num">{token.standard}</span>
          </Fact>
          <Fact label="Features">
            {token.features.length === 0 ? 'none — the supply is fixed at construction' : token.features.join(', ')}
          </Fact>
          <Fact label="Initial supply">
            <span className="cf-num">{displaySupply(token.supply, token.decimals)}</span>{' '}
            {token.symbol}
            <span className="mw-fact__sub cf-num">
              {token.supply} base units · {token.decimals} decimals
            </span>
          </Fact>
          <Fact label="Maximum supply">
            {token.cap === null ? (
              <span className="mw-absent">this contract implements no ceiling</span>
            ) : (
              <>
                <span className="cf-num">{displaySupply(token.cap, token.decimals)}</span>{' '}
                {token.symbol}
              </>
            )}
          </Fact>
          <Fact label="Owner address">
            <span className="cf-num" title={token.ownerAddress}>
              {shortHash(token.ownerAddress)}
            </span>
          </Fact>
          {/*
            The QUOTE and the CHARGE, as two facts, because they are two facts. A deploy is priced
            in US cents and settled in EMBER at the rate micro-pricing gave at the moment of
            payment (mint/src/migrations.ts argues why the row records both plus the rate),
            so neither number can be derived from the other on this page. `usd()` and `charge()`
            both return null rather than a zero when the service sent nothing — see
            src/lib/format.ts — and both nulls are rendered as an absence, never as an amount.
          */}
          <Fact label="Price">
            {usd(token.priceUsdCents) === null ? (
              <span className="mw-absent">this order carries no figure</span>
            ) : (
              <span className="cf-num">{usd(token.priceUsdCents)}</span>
            )}
          </Fact>
          <Fact label="Charged">
            {charge(token) === null ? (
              <span className="mw-absent">your wallet has not been touched</span>
            ) : (
              <span className="cf-num">{charge(token)}</span>
            )}
          </Fact>
          <Fact label="Opened">{timestamp(token.createdAt)}</Fact>
        </dl>
      </section>

      <section className="mw-panel" aria-labelledby="pay">
        <h2 className="mw-panel__title" id="pay">
          Paying for it
        </h2>
        {token.paidJournalEntryId ? (
          <p className="mw-panel__note">
            Settled. Your receipt in the ledger is{' '}
            <code className="cf-num" title={token.paidJournalEntryId}>
              {shortHash(token.paidJournalEntryId)}
            </code>
            . Your balance moved and this order advanced inside a single database transaction, so
            one cannot have happened without the other
            (mint/src/server.ts).
          </p>
        ) : (
          <p className="mw-panel__note">
            No money has moved for this launch. Deploying is what costs, and it has not been paid
            for.
          </p>
        )}

        {pay.error && <Failed notice={pay.error} title="Your wallet was not debited" />}
        {pay.result && (
          // 200 versus 201 is a real difference and the service exposes it deliberately
          // (mint/src/server.ts). "Already paid" and "just paid" are different facts about
          // somebody's money and this screen does not flatten them.
          <p className="mw-note" role="status">
            <span className="mw-note__icon" aria-hidden="true">
              ✓
            </span>
            {/*
              The amount comes from the RESPONSE, not from a constant. This line used to read
              "Paid. The Shards have been debited", which named a currency the page had not been
              told anything about and which the estate retired underneath it
              (contracts/packages/chain/src/index.ts). `pay.result.token` is the row the service
              just wrote, so `charge()` reports what actually left the balance — and reports null,
              rather than a plausible figure, if the service sent no charge back.
            */}
            {pay.result.replayed
              ? 'You had already settled this launch, so no second debit was taken and your balance is unchanged.'
              : charge(pay.result.token) === null
                ? 'Settled. Your wallet has been debited.'
                : `Settled. ${charge(pay.result.token)} has left your wallet.`}
          </p>
        )}

        {payable && (
          <div className="mw-actions">
            <button type="button" className="cf-btn cf-btn--primary" onClick={onPay} disabled={pay.busy}>
              {/*
                The label carries the QUOTE, because that is the number the customer agreed to;
                what it converts to in EMBER is decided at the rate read inside this request and
                is not knowable here without inventing one. An order with no readable price gets a
                bare "Pay" — `usd()` returns null rather than "$0.00" so that this button can never
                offer to charge nothing, which test/format.test.ts asserts as a property.
              */}
              {pay.busy ? 'Paying…' : usd(token.priceUsdCents) === null ? 'Pay for this launch' : `Pay ${usd(token.priceUsdCents)}`}
            </button>
            <span className="mw-actions__note">
              {/*
                This sentence used to promise that "the service answers the second attempt with the
                original result rather than charging again", and that is not what mint does.
                `payForDeploy` re-reads the row `for update` and refuses anything that is not
                `awaiting_payment` (mint/src/orders.ts), so a second attempt after the
                first one committed answers 409 `order_state` (mint/src/server.ts) — not a
                replay. Nobody is charged twice either way, which is the half a customer needs; but
                a page that promises a friendly replay and then shows a red refusal has taught its
                reader that the site is unreliable at the exact moment their money moved.
              */}
              One debit, taken once. Should the reply go astray on the way back to you, reload this
              screen instead of pressing again — the money and the order state move together, so
              whatever this page shows after a refresh is what actually happened to your balance.
            </span>
          </div>
        )}
      </section>

      <section className="mw-panel" aria-labelledby="deploy">
        <h2 className="mw-panel__title" id="deploy">
          Getting it on chain
        </h2>

        <dl className="mw-facts">
          <Fact label="Contract address">
            <Maybe value={token.contractAddress} missing="no contract yet" />
          </Fact>
          <Fact label="Transaction">
            <span title={token.deployTxHash ?? undefined}>
              <Maybe value={shortHashOrNull(token.deployTxHash)} missing="nothing has been sent to a node" />
            </span>
          </Fact>
          <Fact label="Deployer">
            <Maybe value={shortHashOrNull(token.deployerAddress)} missing="no address issued yet" />
          </Fact>
          <Fact label="Broadcast">
            <Maybe value={nullableTimestamp(token.broadcastAt)} missing="—" />
          </Fact>
          <Fact label="Confirmed">
            <Maybe value={nullableTimestamp(token.confirmedAt)} missing="—" />
          </Fact>
          <Fact label="Attempts">
            <span className="cf-num">{token.deployAttempts}</span>
          </Fact>
        </dl>

        {deploy.error && <Failed notice={deploy.error} title="The deploy was turned down" />}
        {deploy.result && (
          <p className="mw-note" role="status">
            <span className="mw-note__icon" aria-hidden="true">
              ➤
            </span>
            {/* ACCEPTED. Not deployed. See the header of this file. */}
            Taken, and put in the queue. Nothing has reached a chain yet. This screen is the address
            the service handed back for watching, and each step the worker completes appears in the
            table below.
          </p>
        )}

        {deployable ? (
          <div className="mw-actions">
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={onDeploy}
              disabled={deploy.busy}
            >
              {deploy.busy ? 'Handing it over…' : 'Deploy'}
            </button>
            <span className="mw-actions__note">
              The work is done by a background worker, not by your browser, so you can leave. The
              contract bytes are written down before anything is broadcast, which is why pressing
              this twice still produces a single contract.
            </span>
          </div>
        ) : (
          <p className="mw-panel__note">{whyNotDeployable(token)}</p>
        )}

        <h3 className="mw-panel__subtitle">Every step, in order</h3>
        {order.data.attempts.length === 0 ? (
          <p className="mw-panel__note">
            Nothing recorded so far. As the worker signs, broadcasts and then sees a confirmation,
            each of those becomes a row here with its own timestamp. It means “did this ever touch a
            chain?” is a question you can answer by looking, without asking anyone to read a log
            (mint/src/server.ts).
          </p>
        ) : (
          <div className="mw-tablewrap">
            <table className="mw-table">
              <caption className="mw-table__caption">
                Earliest at the top, in the order the service recorded them (mint/src/tokens.ts).
              </caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Chain family</th>
                  <th scope="col">Transaction</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {order.data.attempts.map((attempt) => (
                  <tr key={`${attempt.attempt}-${attempt.outcome}`}>
                    <th scope="row" className="cf-num">
                      {attempt.attempt}
                    </th>
                    <td>
                      <StateBadge tone={outcomeTone(attempt.outcome)} />
                      {attempt.detail && <span className="mw-table__sub">{attempt.detail}</span>}
                    </td>
                    <td className="cf-num">{attempt.family}</td>
                    <td className="cf-num" title={attempt.txHash ?? undefined}>
                      {shortHash(attempt.txHash)}
                    </td>
                    <td>{timestamp(attempt.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mw-panel__note">
          <button type="button" className="cf-btn cf-btn--ghost" onClick={order.reload}>
            Refresh
          </button>{' '}
          Refreshing only re-reads this order from the database. It sends nothing to a node, so
          checking on progress cannot slow your deploy down
          (mint/src/server.ts).
        </p>
      </section>

      <ProjectPageEditor tokenId={token.id} deployed={token.status === 'deployed'} />
    </>
  )
}

/**
 * The project page document. `PUT /v1/tokens/:id/page` — `mint/src/server.ts`.
 *
 * It is a PUT of the WHOLE document: the handler coerces every missing field to an empty value
 * (`server.ts`), so sending a partial body silently blanks whatever was left out. This
 * editor therefore always sends all six fields.
 *
 * It is offered before deployment on purpose. The page renders publicly whatever the token's state,
 * and the on-chain half of it is filled in from the indexer once there is a contract to read.
 */
function ProjectPageEditor({ tokenId, deployed }: { tokenId: string; deployed: boolean }) {
  const [description, setDescription] = useState('')
  const [riskDisclosures, setRisk] = useState('')

  const save = useMutation(
    () =>
      putProjectPage(tokenId, {
        description,
        riskDisclosures,
        // Sent explicitly rather than omitted: this is a PUT, and an omitted field is a cleared
        // field. These three carry structured entries the form does not edit yet, and sending [] is
        // what the handler would store for an absent value anyway (server.ts) — so the
        // behaviour is the same and the intent is visible.
        links: [],
        team: [],
        roadmap: [],
      }),
    'Your words were not saved.',
  )

  return (
    <section className="mw-panel" aria-labelledby="page">
      <h2 className="mw-panel__title" id="page">
        Project page
      </h2>
      <p className="mw-panel__note">
        Anyone can read this, at <code className="cf-num">/projects/{tokenId}</code>, without an
        account. You write the words. The supply, the ceiling, the owner and the contract address on
        that page are measured from the chain by the CloudsForge indexer, never taken from your
        order — a plan shown as though it were a measurement is worse than no figure at all, because
        a buyer has no way to tell the two apart
        (mint/src/projectpages.ts).
      </p>
      {!deployed && (
        <p className="mw-panel__note">
          There is no contract to measure yet, so the public page carries your words and says plainly
          that the chain half is missing.
        </p>
      )}

      <label className="mw-field">
        <span className="mw-field__label">Description</span>
        <textarea
          className="cf-input mw-area"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="mw-field">
        <span className="mw-field__label">Risk disclosures</span>
        <textarea
          className="cf-input mw-area"
          rows={4}
          value={riskDisclosures}
          onChange={(e) => setRisk(e.target.value)}
        />
        <span className="mw-field__hint">
          Whatever a prospective holder deserves to hear from you. Separately, the public page works
          out for itself whether anything can still issue tokens, who holds the owner role and
          whether transfers are frozen. Those come from the contract and cannot be written here.
        </span>
      </label>

      {save.error && <Failed notice={save.error} title="Your words were not saved" />}
      {save.result && (
        <p className="mw-note" role="status">
          <span className="mw-note__icon" aria-hidden="true">
            ✓
          </span>
          Saved.{' '}
          <Link to={`/projects/${tokenId}`}>Read it as a visitor would</Link>
        </p>
      )}

      <div className="mw-actions">
        <button type="button" className="cf-btn" onClick={() => void save.run()} disabled={save.busy}>
          {save.busy ? 'Saving…' : 'Publish this'}
        </button>
        <span className="mw-actions__note">
          Saving replaces the whole document rather than merging into it, so any field this form does
          not offer is stored empty.
        </span>
      </div>
    </section>
  )
}

/**
 * Why the deploy button is not there.
 *
 * Every branch is the service's own refusal, in the service's own words — `server.ts`.
 * A disabled control with no explanation is how a customer concludes the site is broken.
 */
function whyNotDeployable(token: TokenOrder): string {
  if (token.status === 'deployed') return 'Your contract is already on chain. There is nothing left to send.'
  if (token.status === 'failed') {
    return 'This one stopped where it is and no background job will pick it up again. Trying again means opening a fresh launch, which is a decision we leave to you rather than repeating a failure on a timer.'
  }
  if (token.status === 'awaiting_payment' || token.status === 'draft') {
    return 'Settle the charge above and the deploy button appears here.'
  }
  return `An order sitting at ${token.status} is not ready to be sent.`
}

function shortHashOrNull(value: string | null): string | null {
  return value === null || value.length === 0 ? null : shortHash(value)
}

function nullableTimestamp(iso: string | null): string | null {
  return iso === null || iso.length === 0 ? null : timestamp(iso)
}
