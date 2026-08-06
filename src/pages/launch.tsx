/**
 * The order form. `POST /v1/tokens` — `mint/src/server.ts:384`.
 *
 * It opens an order and does nothing else: "Nothing is charged and nothing is deployed"
 * (`mint/src/server.ts:383`). The screen says so above the button, because a form that takes a
 * wallet id and an owner address looks exactly like one that is about to spend money.
 *
 * ── Nothing here is stricter than the service any more ────────────────────────────────────────
 *
 * Every rule this form applies mirrors one the service enforces (see src/lib/launch.ts, which
 * carries the citation for each). The cap rules used to be the exception: `POST /v1/tokens`
 * validated the FEATURE SET and never read the cap, so a pausable order with no cap was accepted,
 * payable, and then unbuildable. Mint refuses it at the order route now — `assertBuildable`
 * (`mint/src/catalogue.ts:179`, called at `mint/src/server.ts:423`) answers 400 `unbuildable_order`
 * naming the field (`mint/src/server.ts:303`).
 *
 * The cap check stays here for the reason every other mirror does: the customer reads the message
 * beside the input instead of after a round trip. It is no longer the only copy, which means it is
 * now capable of disagreeing with the service — so the rule that no check here may be STRICTER
 * than mint is load-bearing rather than theoretical.
 *
 * ── The supply unit ───────────────────────────────────────────────────────────────────────────
 *
 * `supply` reaches the constructor UNSCALED (`_mint(recipient_, initialSupply_)`,
 * ForgeTokens.sol:38). The preview under the field is shown for every draft rather than only the
 * surprising ones: a hint that appears only when something looks wrong is read as an error rather
 * than as the unit.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { useMutation } from '../lib/mutation.ts'
import { useResource } from '../lib/resource.ts'
import { createOrder, getCatalogue, type Catalogue, type ChainId, type Feature, type Network } from '../lib/mint.ts'
import {
  MAX_DECIMALS,
  MAX_NAME,
  OFFERED_FEATURE_SETS,
  capRuleFor,
  displaySupply,
  problemsWith,
  scaleToSmallestUnit,
  variantFor,
  type LaunchDraft,
} from '../lib/launch.ts'
import { chainName, usd } from '../lib/format.ts'
import { CHAINS, NETWORKS } from '../lib/mint.ts'

const EMPTY: LaunchDraft = {
  chain: 'ember',
  network: 'testnet',
  name: '',
  symbol: '',
  decimals: '18',
  supply: '',
  cap: '',
  features: [],
  ownerAddress: '',
  ownerWalletId: '',
}

export function LaunchPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<LaunchDraft>(EMPTY)
  const [showProblems, setShowProblems] = useState(false)

  const catalogue = useResource<Catalogue>(
    (signal) => getCatalogue(signal),
    (data) => data.variants.length,
    'The catalogue could not be loaded.',
  )

  const problems = useMemo(() => problemsWith(draft), [draft])
  const problemFor = (field: keyof LaunchDraft) => problems.find((p) => p.field === field)

  const create = useMutation(
    () =>
      createOrder({
        chain: draft.chain as ChainId,
        network: draft.network as Network,
        name: draft.name,
        symbol: draft.symbol,
        decimals: Number(draft.decimals),
        supply: draft.supply,
        cap: draft.cap.trim().length > 0 ? draft.cap : null,
        features: draft.features,
        ownerAddress: draft.ownerAddress,
        ownerWalletId: draft.ownerWalletId,
      }),
    'The order could not be opened.',
  )

  const set = <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const decimals = Number(draft.decimals)
  const variant = variantFor(draft.features)
  const scaled = Number.isInteger(decimals) ? scaleToSmallestUnit(draft.supply, decimals) : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setShowProblems(true)
    if (problems.length > 0) return
    const created = await create.run()
    // Straight to the status page. It is the address the rest of the flow happens at, and it is
    // the one a customer should have in their history rather than the form they filled in.
    if (created) navigate(`/tokens/${created.token.id}`)
  }

  return (
    <>
      <header className="mw-head">
        <h1 className="mw-head__title">Launch a token</h1>
        <p className="mw-head__lede">
          This opens an order. Nothing is charged and nothing is deployed until you pay for it on
          the next screen.
        </p>
      </header>

      {catalogue.state === 'loading' && <Loading label="Reading the catalogue" />}
      {/*
        An unreachable catalogue used to render as NOTHING: the price line is `{catalogue.data &&
        ...}` and there was no other branch, so a 503 left a customer filling in a form that never
        mentioned a cost — indistinguishable from a page that simply has no price. `src/lib/
        resource.ts` states the rule this violated in one line: FAILURE OUTRANKS EMPTINESS. An
        upstream that could not be reached must not read as an authoritative answer, and "no price
        is shown" is an answer.

        The form stays usable, because it is honest to leave it usable: opening an order charges
        nothing (`mint/src/server.ts:383`) and the price is set by the service at order time from
        its own catalogue, not from anything this page holds. What the customer must not do is
        reach the PAY screen having never been told a number, so the absence is named here.
      */}
      {(catalogue.state === 'failed' || catalogue.state === 'forbidden') && catalogue.error && (
        <Failed
          notice={catalogue.error}
          onRetry={catalogue.reload}
          title="The price could not be read"
        />
      )}
      {catalogue.data && (
        <p className="mw-note" role="status">
          <span className="mw-note__icon" aria-hidden="true">
            ✦
          </span>
          {usd(catalogue.data.priceUsdCents) === null ? (
            /* A catalogue that answered without a readable price is not a free deploy, and the
               rule three comments up applies to this narrower absence too: the customer must not
               reach the pay screen having never been told a number. `usd()` returns null rather
               than "$0.00" precisely so this branch is reachable — see src/lib/format.ts. */
            <>The price could not be read. Opening an order still charges nothing.</>
          ) : (
            <>
              Deploying costs <span className="cf-num">{usd(catalogue.data.priceUsdCents)}</span>,
              charged in <span className="cf-num">{catalogue.data.settlementAsset}</span> when you
              pay.
            </>
          )}
        </p>
      )}

      <form className="mw-form" onSubmit={submit} noValidate>
        <fieldset className="mw-fieldset">
          <legend>Where</legend>

          <label className="mw-field">
            <span className="mw-field__label">Chain</span>
            <select
              className="cf-input"
              value={draft.chain}
              onChange={(e) => set('chain', e.target.value)}
            >
              {CHAINS.map((c) => (
                <option key={c} value={c}>
                  {chainName(c)}
                </option>
              ))}
            </select>
          </label>

          <label className="mw-field">
            <span className="mw-field__label">Network</span>
            <select
              className="cf-input"
              value={draft.network}
              onChange={(e) => set('network', e.target.value)}
            >
              {NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {/*
              The mainnet allowlist is checked at DEPLOY, not here: `server.ts:544-553` refuses a
              mainnet deploy from a subject that is not allowlisted, after the order is paid.
              Saying so beside the choice is the only place a customer can act on it.
            */}
            {draft.network === 'mainnet' && (
              <span className="mw-field__hint mw-field__hint--warn">
                Mainnet deploys are limited to allowlisted accounts. The check happens when you
                deploy — after payment — so confirm you are on the list before paying.
              </span>
            )}
          </label>
        </fieldset>

        <fieldset className="mw-fieldset">
          <legend>The token</legend>

          <Field
            label="Name"
            hint={`Up to ${MAX_NAME} characters.`}
            problem={showProblems ? problemFor('name')?.message : undefined}
          >
            <input
              className="cf-input"
              value={draft.name}
              maxLength={MAX_NAME}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field
            label="Symbol"
            hint="Two to twelve upper-case letters or digits."
            problem={showProblems ? problemFor('symbol')?.message : undefined}
          >
            <input
              className="cf-input cf-num"
              value={draft.symbol}
              maxLength={12}
              onChange={(e) => set('symbol', e.target.value.toUpperCase())}
            />
          </Field>

          <Field
            label="Decimals"
            hint={`0 to ${MAX_DECIMALS}. This changes how wallets DISPLAY a balance; it does not scale the supply below.`}
            problem={showProblems ? problemFor('decimals')?.message : undefined}
          >
            <input
              className="cf-input cf-num"
              inputMode="numeric"
              value={draft.decimals}
              onChange={(e) => set('decimals', e.target.value)}
            />
          </Field>

          <Field
            label="Initial supply, in the smallest unit"
            hint="A whole number. This is the exact number of base units minted to the owner address."
            problem={showProblems ? problemFor('supply')?.message : undefined}
          >
            <input
              className="cf-input cf-num"
              inputMode="numeric"
              value={draft.supply}
              onChange={(e) => set('supply', e.target.value.trim())}
            />
            {/*
              Always rendered, never only on suspicion. The number typed here goes to the
              constructor unchanged, so with 18 decimals "1000000" is a millionth of a millionth of
              a token — permanently, on a contract that may never mint again.
            */}
            <span className="mw-field__preview">
              A wallet will show this as{' '}
              <span className="cf-num">{displaySupply(draft.supply, Number.isInteger(decimals) ? decimals : 0)}</span>{' '}
              {draft.symbol || 'tokens'}.
              {scaled !== null && scaled !== draft.supply && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="cf-btn cf-btn--ghost mw-inline-btn"
                    onClick={() => set('supply', scaled)}
                  >
                    Use {draft.supply} whole tokens instead
                  </button>
                </>
              )}
            </span>
          </Field>
        </fieldset>

        <fieldset className="mw-fieldset">
          <legend>The contract</legend>
          <p className="mw-fieldset__note">
            Only an exact match is deployed. There is no nearest fit.
          </p>
          <div className="mw-choices" role="radiogroup" aria-label="Contract">
            {OFFERED_FEATURE_SETS.map((set_) => {
              const selected = variant === set_.variant
              return (
                <label
                  key={set_.variant}
                  className={`mw-choice${selected ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="features"
                    checked={selected}
                    onChange={() => set('features', set_.features as Feature[])}
                  />
                  <span className="mw-choice__title">
                    {set_.features.length === 0 ? 'Fixed supply' : set_.features.join(' + ')}
                  </span>
                  <span className="mw-choice__note">
                    {capRuleFor(set_.variant) === 'required'
                      ? 'Needs a maximum supply'
                      : 'Takes no maximum supply'}
                  </span>
                </label>
              )
            })}
          </div>
          {showProblems && problemFor('features') && (
            <p className="mw-field__problem" role="alert">
              {problemFor('features')?.message}
            </p>
          )}

          {variant !== null && capRuleFor(variant) === 'required' && (
            <Field
              label="Maximum supply, in the smallest unit"
              hint="The contract can never exceed this. It must be at least the initial supply."
              problem={showProblems ? problemFor('cap')?.message : undefined}
            >
              <input
                className="cf-input cf-num"
                inputMode="numeric"
                value={draft.cap}
                onChange={(e) => set('cap', e.target.value.trim())}
              />
            </Field>
          )}
        </fieldset>

        <fieldset className="mw-fieldset">
          <legend>Who owns it</legend>

          <Field
            label="Owner address"
            hint="The address that receives the supply and holds any owner key. A mistyped character here is a token nobody can control."
            problem={showProblems ? problemFor('ownerAddress')?.message : undefined}
          >
            <input
              className="cf-input cf-num"
              value={draft.ownerAddress}
              onChange={(e) => set('ownerAddress', e.target.value.trim())}
            />
          </Field>

          <Field
            label="Wallet id"
            // Named from the catalogue rather than typed here. The hint used to say "the Shards
            // are debited from", and a hard-coded currency in a hint is exactly how the retired
            // one survived its own retirement; when there is no catalogue there is no asset to
            // name, so it says the generic thing rather than guessing at EMBER.
            hint={`The CloudsForge wallet the ${
              catalogue.data?.settlementAsset ?? 'settlement asset'
            } is debited from when you pay.`}
            problem={showProblems ? problemFor('ownerWalletId')?.message : undefined}
          >
            <input
              className="cf-input cf-num"
              value={draft.ownerWalletId}
              onChange={(e) => set('ownerWalletId', e.target.value.trim())}
            />
          </Field>
        </fieldset>

        {create.error && (
          <Failed notice={create.error} title="The order was not opened" />
        )}

        <div className="mw-actions">
          <button type="submit" className="cf-btn cf-btn--primary" disabled={create.busy}>
            {create.busy ? 'Opening the order…' : 'Open the order'}
          </button>
          <span className="mw-actions__note">
            Nothing is charged by this button. You pay on the next screen.
          </span>
        </div>
      </form>
    </>
  )
}

function Field({
  label,
  hint,
  problem,
  children,
}: {
  label: string
  hint?: string | undefined
  problem?: string | undefined
  children: React.ReactNode
}) {
  return (
    <label className="mw-field">
      <span className="mw-field__label">{label}</span>
      {children}
      {hint && <span className="mw-field__hint">{hint}</span>}
      {problem && (
        <span className="mw-field__problem" role="alert">
          {problem}
        </span>
      )}
    </label>
  )
}
