/**
 * One launch: what state it is in, what it cost, what reached a chain, and the two buttons.
 *
 * Routes used, each read out of `mint/src/server.ts`:
 *
 *   GET  /v1/tokens/:id         — server.ts:465   the order and every deploy attempt
 *   POST /v1/tokens/:id/pay     — server.ts:489   201 fresh, 200 replayed
 *   POST /v1/tokens/:id/deploy  — server.ts:526   **202 and a status URL**
 *   PUT  /v1/tokens/:id/page    — server.ts:581   the project page document
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * **DEPLOY ANSWERS 202. IT DOES NOT DEPLOY.**
 *
 * The handler authenticates, checks the mainnet allowlist, runs one conditional UPDATE, enqueues a
 * job and returns a `Location` — the file header at `mint/src/server.ts:8-23` explains at length
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
 * `awaiting_payment` for pay (`mint/src/tokens.ts:332`) and `CLAIMABLE` for deploy
 * (`mint/src/tokens.ts:68-73`). A button that will answer 409 is a button that has told the
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
    'This launch could not be loaded.',
    [id],
  )

  const reload = order.reload

  const pay = useMutation(() => payForOrder(id), 'The payment did not go through.')
  const deploy = useMutation(() => deployOrder(id), 'The deploy was not accepted.')

  const onPay = useCallback(async () => {
    if (await pay.run()) reload()
  }, [pay, reload])

  const onDeploy = useCallback(async () => {
    // Re-read either way. The 202 says the job was queued, and the order's status has already
    // moved; the screen must show the row rather than the acknowledgement.
    if (await deploy.run()) reload()
  }, [deploy, reload])

  if (order.state === 'loading') return <Loading label="Reading this launch" />
  if (order.error) {
    return (
      <Failed
        notice={order.error}
        onRetry={order.reload}
        title={
          // 404 covers both "no such launch" and "not yours" — `ownedToken` answers them the same
          // way on purpose (mint/src/server.ts:633-638) so that ids cannot be enumerated. The copy
          // must not claim to know which one it was.
          order.error.message.toLowerCase().includes('no such token')
            ? 'No launch at this address'
            : 'This launch did not load'
        }
      />
    )
  }
  if (!order.data) return <Loading label="Reading this launch" />

  const token = order.data.token
  const tone = statusTone(token.status)
  const payable = token.status === 'awaiting_payment'
  const deployable = (CLAIMABLE_STATUSES as readonly string[]).includes(token.status)

  return (
    <>
      <header className="mw-head">
        <p className="mw-head__eyebrow">
          <Link to="/tokens">Your launches</Link>
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
          The order
        </h2>
        <dl className="mw-facts">
          <Fact label="Chain">
            {chainName(token.chain)} · {token.network}
          </Fact>
          <Fact label="Contract standard">
            <span className="cf-num">{token.standard}</span>
          </Fact>
          <Fact label="Features">
            {token.features.length === 0 ? 'none — fixed supply' : token.features.join(', ')}
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
              <span className="mw-absent">no cap — this contract has none</span>
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
            payment (mint/src/migrations.ts:294-302 argues why the row records both plus the rate),
            so neither number can be derived from the other on this page. `usd()` and `charge()`
            both return null rather than a zero when the service sent nothing — see
            src/lib/format.ts — and both nulls are rendered as an absence, never as an amount.
          */}
          <Fact label="Price">
            {usd(token.priceUsdCents) === null ? (
              <span className="mw-absent">no price on this order</span>
            ) : (
              <span className="cf-num">{usd(token.priceUsdCents)}</span>
            )}
          </Fact>
          <Fact label="Charged">
            {charge(token) === null ? (
              <span className="mw-absent">nothing has been charged yet</span>
            ) : (
              <span className="cf-num">{charge(token)}</span>
            )}
          </Fact>
          <Fact label="Opened">{timestamp(token.createdAt)}</Fact>
        </dl>
      </section>

      <section className="mw-panel" aria-labelledby="pay">
        <h2 className="mw-panel__title" id="pay">
          Payment
        </h2>
        {token.paidJournalEntryId ? (
          <p className="mw-panel__note">
            Paid. The ledger entry is{' '}
            <code className="cf-num" title={token.paidJournalEntryId}>
              {shortHash(token.paidJournalEntryId)}
            </code>
            . The debit and the state change happened in one transaction
            (mint/src/server.ts:488).
          </p>
        ) : (
          <p className="mw-panel__note">
            Nothing has been charged for this launch yet.
          </p>
        )}

        {pay.error && <Failed notice={pay.error} title="The payment did not go through" />}
        {pay.result && (
          // 200 versus 201 is a real difference and the service exposes it deliberately
          // (mint/src/server.ts:509-514). "Already paid" and "just paid" are different facts about
          // somebody's money and this screen does not flatten them.
          <p className="mw-note" role="status">
            <span className="mw-note__icon" aria-hidden="true">
              ✓
            </span>
            {/*
              The amount comes from the RESPONSE, not from a constant. This line used to read
              "Paid. The Shards have been debited", which named a currency the page had not been
              told anything about and which the estate retired underneath it
              (contracts/packages/chain/src/index.ts:58). `pay.result.token` is the row the service
              just wrote, so `charge()` reports what actually left the balance — and reports null,
              rather than a plausible figure, if the service sent no charge back.
            */}
            {pay.result.replayed
              ? 'This launch was already paid for. Nothing was charged a second time.'
              : charge(pay.result.token) === null
                ? 'Paid. The charge has been debited.'
                : `Paid. ${charge(pay.result.token)} has been debited.`}
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
              {pay.busy ? 'Paying…' : usd(token.priceUsdCents) === null ? 'Pay' : `Pay ${usd(token.priceUsdCents)}`}
            </button>
            <span className="mw-actions__note">
              {/*
                This sentence used to promise that "the service answers the second attempt with the
                original result rather than charging again", and that is not what mint does.
                `payForDeploy` re-reads the row `for update` and refuses anything that is not
                `awaiting_payment` (mint/src/orders.ts:105-116), so a second attempt after the
                first one committed answers 409 `order_state` (mint/src/server.ts:291-295) — not a
                replay. Nobody is charged twice either way, which is the half a customer needs; but
                a page that promises a friendly replay and then shows a red refusal has taught its
                reader that the site is unreliable at the exact moment their money moved.
              */}
              This debits your wallet, once. If the answer is lost on the way back, reload this page
              rather than pressing again: the charge and the state change happen in one transaction,
              so this page is where you find out whether it went through.
            </span>
          </div>
        )}
      </section>

      <section className="mw-panel" aria-labelledby="deploy">
        <h2 className="mw-panel__title" id="deploy">
          Deployment
        </h2>

        <dl className="mw-facts">
          <Fact label="Contract address">
            <Maybe value={token.contractAddress} missing="not deployed yet" />
          </Fact>
          <Fact label="Transaction">
            <span title={token.deployTxHash ?? undefined}>
              <Maybe value={shortHashOrNull(token.deployTxHash)} missing="nothing broadcast yet" />
            </span>
          </Fact>
          <Fact label="Deployer">
            <Maybe value={shortHashOrNull(token.deployerAddress)} missing="not provisioned yet" />
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

        {deploy.error && <Failed notice={deploy.error} title="The deploy was not accepted" />}
        {deploy.result && (
          <p className="mw-note" role="status">
            <span className="mw-note__icon" aria-hidden="true">
              ➤
            </span>
            {/* ACCEPTED. Not deployed. See the header of this file. */}
            Accepted, and queued. Nothing has reached a chain yet — this page is the status address
            the service returned, and it updates as the job records each step below.
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
              {deploy.busy ? 'Sending…' : 'Deploy'}
            </button>
            <span className="mw-actions__note">
              The deploy is accepted immediately and runs as a job. Pressing this twice produces one
              run, not two.
            </span>
          </div>
        ) : (
          <p className="mw-panel__note">{whyNotDeployable(token)}</p>
        )}

        <h3 className="mw-panel__subtitle">Attempts</h3>
        {order.data.attempts.length === 0 ? (
          <p className="mw-panel__note">
            No attempt has been recorded. Every signature, broadcast and confirmation appears here
            in the order it happened, so “did this ever reach a chain” is answered by the row rather
            than by a log search (mint/src/server.ts:474-475).
          </p>
        ) : (
          <div className="mw-tablewrap">
            <table className="mw-table">
              <caption className="mw-table__caption">
                Oldest first, as the service returns them (mint/src/tokens.ts:733).
              </caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Family</th>
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
          This page reaches no chain, so refreshing it cannot slow a deploy down
          (mint/src/server.ts:461-464).
        </p>
      </section>

      <ProjectPageEditor tokenId={token.id} deployed={token.status === 'deployed'} />
    </>
  )
}

/**
 * The project page document. `PUT /v1/tokens/:id/page` — `mint/src/server.ts:581`.
 *
 * It is a PUT of the WHOLE document: the handler coerces every missing field to an empty value
 * (`server.ts:585-595`), so sending a partial body silently blanks whatever was left out. This
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
        // what the handler would store for an absent value anyway (server.ts:590-592) — so the
        // behaviour is the same and the intent is visible.
        links: [],
        team: [],
        roadmap: [],
      }),
    'The project page was not saved.',
  )

  return (
    <section className="mw-panel" aria-labelledby="page">
      <h2 className="mw-panel__title" id="page">
        Project page
      </h2>
      <p className="mw-panel__note">
        Public, at <code className="cf-num">/projects/{tokenId}</code>. What you write here is the
        editorial half. The supply, the authorities and the contract address on that page are read
        from the chain by the indexer and never from this order — an intent presented as an
        observation is worse than an absence, because a reader cannot tell which they have
        (mint/src/projectpages.ts:1-21).
      </p>
      {!deployed && (
        <p className="mw-panel__note">
          Until this launch is deployed the page renders without its on-chain half and says so.
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
          Your own words. The computed indicators — mint authority, ownership, pause state — are
          derived from the chain and are not editable here.
        </span>
      </label>

      {save.error && <Failed notice={save.error} title="The project page was not saved" />}
      {save.result && (
        <p className="mw-note" role="status">
          <span className="mw-note__icon" aria-hidden="true">
            ✓
          </span>
          Saved.{' '}
          <Link to={`/projects/${tokenId}`}>View the public page</Link>
        </p>
      )}

      <div className="mw-actions">
        <button type="button" className="cf-btn" onClick={() => void save.run()} disabled={save.busy}>
          {save.busy ? 'Saving…' : 'Save the project page'}
        </button>
        <span className="mw-actions__note">
          This replaces the whole document. Anything not in this form is stored as empty.
        </span>
      </div>
    </section>
  )
}

/**
 * Why the deploy button is not there.
 *
 * Every branch is the service's own refusal, in the service's own words — `server.ts:531-542`.
 * A disabled control with no explanation is how a customer concludes the site is broken.
 */
function whyNotDeployable(token: TokenOrder): string {
  if (token.status === 'deployed') return 'This token is already deployed.'
  if (token.status === 'failed') {
    return 'This deploy failed and will not be retried automatically. A retry is an explicit action that creates a new launch, not something a background job does by itself.'
  }
  if (token.status === 'awaiting_payment' || token.status === 'draft') {
    return 'This order has not been paid for.'
  }
  return `An order in ${token.status} cannot be deployed.`
}

function shortHashOrNull(value: string | null): string | null {
  return value === null || value.length === 0 ? null : shortHash(value)
}

function nullableTimestamp(iso: string | null): string | null {
  return iso === null || iso.length === 0 ? null : timestamp(iso)
}
