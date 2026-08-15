/**
 * The order form. `POST /v1/tokens` — `mint/src/server.ts`.
 *
 * It opens an order and does nothing else: "Nothing is charged and nothing is deployed"
 * (`mint/src/server.ts`). The screen says so above the button, because a form that takes a
 * wallet id and an owner address looks exactly like one that is about to spend money.
 *
 * ── The plate is the layout ───────────────────────────────────────────────────────────────────
 *
 * The catalogue's argument is that the bytecode was compiled before anyone ordered, so an order is
 * a constructor call. This page is where that stops being a claim: the fields on the left write
 * into the constructor on the right, live, argument by argument
 * (`src/components/plate.tsx`, off `mint/src/contracts/ForgeTokens.sol`).
 *
 * The aside is SIZED BY ITS CONTENT and sticks below the sub-navigation. That is deliberate and it
 * is the second attempt: a full-height right column that stretches to the bottom of the page is
 * the exact defect this estate has already shipped once on Foresight, where it buried the one
 * control the page existed for. Below 62rem the grid collapses and the aside stops sticking —
 * it follows the form in the source, so it follows the form on a narrow screen. Nothing is
 * reordered with `order`, because a visual order that disagrees with the tab order is a worse
 * defect than a preview a phone has to scroll to.
 *
 * ── Nothing here is stricter than the service any more ────────────────────────────────────────
 *
 * Every rule this form applies mirrors one the service enforces (see src/lib/launch.ts, which
 * carries the citation for each). The cap rules used to be the exception: `POST /v1/tokens`
 * validated the FEATURE SET and never read the cap, so a pausable order with no cap was accepted,
 * payable, and then unbuildable. Mint refuses it at the order route now — `assertBuildable`
 * (`mint/src/catalogue.ts`, called at `mint/src/server.ts`) answers 400 `unbuildable_order`
 * naming the field (`mint/src/server.ts`).
 *
 * The cap check stays here for the reason every other mirror does: the customer reads the message
 * beside the input instead of after a round trip. It is no longer the only copy, which means it is
 * now capable of disagreeing with the service — so the rule that no check here may be STRICTER
 * than mint is load-bearing rather than theoretical.
 *
 * ── The supply unit ───────────────────────────────────────────────────────────────────────────
 *
 * `supply` reaches the constructor UNSCALED (`_mint(recipient_, initialSupply_)`,
 * ForgeTokens.sol). The preview under the field is shown for every draft rather than only the
 * surprising ones: a hint that appears only when something looks wrong is read as an error rather
 * than as the unit.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { Plate } from '../components/plate.tsx'
import { useMutation } from '../lib/mutation.ts'
import { useResource } from '../lib/resource.ts'
import {
  createOrder,
  getCatalogue,
  CHAINS,
  NETWORKS,
  type Catalogue,
  type ChainId,
  type Feature,
  type Network,
} from '../lib/mint.ts'
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
import { TIER_COPY } from '../lib/inscription.ts'
import { chainName, usd } from '../lib/format.ts'

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

  /*
   * The plate's contract name comes off the catalogue, or is not claimed at all. `variantFor`
   * returns null when the ticked set matches nothing, which cannot happen from these controls —
   * they are radios over `OFFERED_FEATURE_SETS` — but the fallback is `fixed` rather than a
   * crash, because the plate is a preview and a preview may not be the thing that breaks.
   */
  const plateVariant = variant ?? 'fixed'
  const contract = catalogue.data?.variants.find((v) => v.variant === plateVariant)?.contract ?? ''

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
        <p className="mw-eyebrow">Step one of three</p>
        <h1 className="mw-head__title">Fill in the constructor</h1>
        <p className="mw-head__lede">
          Nothing is charged by this form and no contract exists until you pay on the next screen
          and press deploy.
        </p>
      </header>

      {catalogue.state === 'loading' && <Loading label="Fetching the price" />}
      {/*
        An unreachable catalogue used to render as NOTHING: the price line is `{catalogue.data &&
        ...}` and there was no other branch, so a 503 left a customer filling in a form that never
        mentioned a cost — indistinguishable from a page that simply has no price. `src/lib/
        resource.ts` states the rule this violated in one line: FAILURE OUTRANKS EMPTINESS. An
        upstream that could not be reached must not read as an authoritative answer, and "no price
        is shown" is an answer.

        The form stays usable, because it is honest to leave it usable: opening an order charges
        nothing (`mint/src/server.ts`) and the price is set by the service at order time from
        its own catalogue, not from anything this page holds. What the customer must not do is
        reach the PAY screen having never been told a number, so the absence is named here.
      */}
      {(catalogue.state === 'failed' || catalogue.state === 'forbidden') && catalogue.error && (
        <Failed
          notice={catalogue.error}
          onRetry={catalogue.reload}
          title="The price is not on screen"
        />
      )}

      <div className="mw-launch">
        <form className="mw-launch__form mw-form" onSubmit={submit} noValidate>
          <fieldset className="mw-fieldset">
            <legend>Where</legend>

            <label className="mw-field mw-field--mid">
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

            <label className="mw-field mw-field--mid">
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
                The mainnet allowlist is checked at DEPLOY, not here: `server.ts` refuses a
                mainnet deploy from a subject that is not allowlisted, after the order is paid.
                Saying so beside the choice is the only place a customer can act on it.
              */}
              {draft.network === 'mainnet' && (
                <span className="mw-field__hint mw-field__hint--warn">
                  Only allowlisted accounts may deploy to mainnet, and the test runs at the deploy
                  step — after payment. Check that your account is on the list before paying.
                </span>
              )}
            </label>
          </fieldset>

          <fieldset className="mw-fieldset">
            <legend>The token</legend>

            <Field
              label="Name"
              hint={`What wallets display. Up to ${MAX_NAME} characters.`}
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
              hint="The ticker shown beside a balance. Two to twelve upper-case letters or digits."
              size="mid"
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
              hint={`Display only, 0 to ${MAX_DECIMALS}. Eighteen is the Ethereum habit.`}
              size="short"
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
              hint="A whole number, passed to the constructor untouched."
              problem={showProblems ? problemFor('supply')?.message : undefined}
              /*
                Always rendered, never only on suspicion. The number typed here goes to the
                constructor unchanged, so with 18 decimals "1000000" is a millionth of a millionth
                of a token — permanently, on a contract that may never mint again.

                It comes AFTER the hint rather than before it, which is the order the two are read
                in: the hint says what the field takes, the preview says what this particular entry
                would mean. Reversed, the preview answered a question the reader had not been asked
                yet.
              */
              preview={
                <>
                  A wallet will show this as{' '}
                  <span className="cf-num">
                    {displaySupply(draft.supply, Number.isInteger(decimals) ? decimals : 0)}
                  </span>{' '}
                  {draft.symbol || 'tokens'}.
                  {scaled !== null && scaled !== draft.supply && (
                    <>
                      {' '}
                      <button type="button" className="cf-btn mw-inline-btn" onClick={() => set('supply', scaled)}>
                        I meant {draft.supply} whole tokens
                      </button>
                    </>
                  )}
                </>
              }
            >
              <input
                className="cf-input cf-num"
                inputMode="numeric"
                value={draft.supply}
                onChange={(e) => set('supply', e.target.value.trim())}
              />
            </Field>
          </fieldset>

          <fieldset className="mw-fieldset">
            <legend>The contract</legend>
            <p className="mw-fieldset__note">
              Pick one. Your selection has to match a committed contract exactly — nothing is
              rounded up to the nearest one.
            </p>
            <div className="mw-choices" role="radiogroup" aria-label="Contract">
              {OFFERED_FEATURE_SETS.map((set_) => {
                const selected = variant === set_.variant
                return (
                  <label key={set_.variant} className={`mw-choice${selected ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="features"
                      checked={selected}
                      onChange={() => set('features', set_.features as Feature[])}
                    />
                    {/*
                      The name the catalogue taught, from the one table both screens read
                      (`src/lib/inscription.ts`). This used to be `features.join(' + ')`, so a
                      customer who compared "Foundry" against the other two on the previous screen
                      arrived here to choose between `mintable + burnable + pausable` and two
                      strings that looked just like it, with nothing saying which was which.
                    */}
                    <span className="mw-choice__title">{TIER_COPY[set_.variant].title}</span>
                    <span className="mw-choice__note">
                      {/* The wire's own words, second — this is literally what `features` carries
                          to `POST /v1/tokens`, so it is worth showing, just not as the name. */}
                      <span className="cf-num">
                        {set_.features.length === 0 ? 'no features' : set_.features.join(' + ')}
                      </span>{' '}
                      · {capRuleFor(set_.variant) === 'required' ? 'takes a cap' : 'takes no cap'}
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
                hint="The hard limit the arithmetic will not cross. Initial supply or more."
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
              hint="Receives the whole supply and holds the owner role. Unchangeable afterwards — one wrong character is a token you cannot reach."
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
              hint={`Which of your CloudsForge wallets the ${
                catalogue.data?.settlementAsset ?? 'settlement asset'
              } comes out of. Payment only — it has nothing to do with who owns the token.`}
              problem={showProblems ? problemFor('ownerWalletId')?.message : undefined}
            >
              <input
                className="cf-input cf-num"
                value={draft.ownerWalletId}
                onChange={(e) => set('ownerWalletId', e.target.value.trim())}
              />
            </Field>
          </fieldset>

          {create.error && <Failed notice={create.error} title="The draft was not saved" />}

          <div className="mw-actions">
            <button type="submit" className="cf-btn cf-btn--ember" disabled={create.busy}>
              {create.busy ? 'Opening…' : 'Open the order'}
            </button>
            <span className="mw-actions__note">
              This writes down what you asked for and takes you to the page where you pay and then
              deploy.
            </span>
          </div>
        </form>

        {/*
          The aside comes AFTER the form in the DOM and is placed beside it by the grid. That order
          is the accessible one — a keyboard reaches the controls before the preview of them — and
          it is also what keeps the "nothing is charged" sentence ahead of the button it describes.
        */}
        <aside className="mw-launch__aside" aria-label="What your order says">
          <Plate
            variant={plateVariant}
            contract={contract}
            stamp={variant === null ? 'no contract matches' : 'compiled and committed'}
            values={{
              name: draft.name,
              symbol: draft.symbol,
              decimals: draft.decimals,
              supply: draft.supply,
              cap: draft.cap,
              owner: draft.ownerAddress,
            }}
          />

          <p className="mw-aside__note" role="status">
            {catalogue.data === null || catalogue.data === undefined ? (
              'The price is not on screen right now. Opening a draft costs nothing either way — read the figure on the payment screen before you agree to it.'
            ) : usd(catalogue.data.priceUsdCents) === null ? (
              /* A catalogue that answered without a readable price is not a free deploy, and the
                 rule three comments up applies to this narrower absence too: the customer must not
                 reach the pay screen having never been told a number. `usd()` returns null rather
                 than "$0.00" precisely so this branch is reachable — see src/lib/format.ts. */
              <>
                The price is not being reported right now. Opening a draft order still costs
                nothing, but read the figure on the payment screen before you agree to it.
              </>
            ) : (
              <>
                A deploy is <span className="cf-num">{usd(catalogue.data.priceUsdCents)}</span>,
                taken from your wallet in{' '}
                <span className="cf-num">{catalogue.data.settlementAsset}</span> at the moment you
                agree to it. Gas is on us.
              </>
            )}
          </p>
        </aside>
      </div>
    </>
  )
}

/**
 * One labelled control, its hint, and its objection.
 *
 * `size` sets how wide the input may grow, because an input's width is a claim about what goes in
 * it: a box the width of the column in front of a field that accepts `0 to 18` invites a sentence.
 * It is a hint rather than a limit — `maxLength` and `problemsWith` are what actually hold — so it
 * is expressed as a `max-width` the column can still shrink below on a phone.
 */
function Field({
  label,
  hint,
  problem,
  size,
  preview,
  children,
}: {
  label: string
  hint?: string | undefined
  problem?: string | undefined
  size?: 'short' | 'mid' | undefined
  /** What this entry would mean, said back to the customer. Below the hint; see the call site. */
  preview?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className={`mw-field${size === undefined ? '' : ` mw-field--${size}`}`}>
      <span className="mw-field__label">{label}</span>
      {children}
      {hint && <span className="mw-field__hint">{hint}</span>}
      {preview && <span className="mw-field__preview">{preview}</span>}
      {problem && (
        <span className="mw-field__problem" role="alert">
          {problem}
        </span>
      )}
    </label>
  )
}
