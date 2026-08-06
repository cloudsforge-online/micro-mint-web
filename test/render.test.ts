/**
 * What the screens actually put on the page, checked by reading them.
 *
 * ── Why this is a source-text test and not a rendering test ───────────────────────────────────
 *
 * There is no DOM in this suite, on purpose and in line with the rest of the estate: jsdom is a
 * second browser implementation to keep current, it disagrees with real ones exactly where it
 * matters, and a test that renders a component in it proves the component renders in jsdom.
 *
 * But several of this app's requirements ARE about rendering — "a 202 must never be shown as a
 * deploy", "a project page never shows the order's numbers", "a disabled button says why". Those
 * are not properties of a pure function; they are properties of a file. So they are asserted
 * against the file, the way `routes.test.ts` asserts the router against `app.tsx`.
 *
 * The limitation is stated plainly: this proves each component IS WIRED to the right data, not
 * that the pixels land. The logic underneath — `problemsWith`, `variantFor`, `displaySupply`,
 * `riskLines`, `statusTone` — is proven properly, as pure functions, by its own tests.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

/**
 * A source file with its comments removed.
 *
 * Needed for the checks that forbid a STRING, because the files here explain the rules they follow
 * — token.tsx quotes "deployed" in order to say why it is not rendered — and a grep over the raw
 * text therefore matches the rationale and fails a correct file. Six guards in this estate have
 * made exactly that mistake — a CI rule firing on the comment explaining it, a hostname guard
 * tripping on the file documenting the rule, an nginx guard matching its own warning. Every one of
 * them was worked around by rewording the comment, which means the rule quietly deleted its own
 * documentation. A guard that fires on its own explanation trains people to delete the
 * explanation.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

const catalogue = read('src/pages/catalogue.tsx')
const launch = read('src/pages/launch.tsx')
const tokens = read('src/pages/tokens.tsx')
const token = read('src/pages/token.tsx')
const project = read('src/pages/project.tsx')
const notFound = read('src/pages/not-found.tsx')
const shell = read('src/components/shell.tsx')

const PAGES: ReadonlyArray<[string, string]> = [
  ['catalogue', catalogue],
  ['launch', launch],
  ['tokens', tokens],
  ['token', token],
  ['project', project],
]

describe('the 202 is never rendered as a deploy', () => {
  /**
   * `POST /v1/tokens/:id/deploy` authenticates, checks the allowlist, runs one UPDATE, enqueues and
   * returns a Location (mint/src/server.ts:520-579). Rendering "deployed" from that response would
   * tell a customer their contract exists at a moment when nothing has been broadcast.
   */
  const body = withoutComments(token)

  it('the acceptance copy says accepted and queued, not deployed', () => {
    assert.match(body, /Accepted, and queued/)
    assert.match(body, /Nothing has reached a chain yet/)
  })

  it('no acceptance branch claims the contract exists', () => {
    const at = body.indexOf('deploy.result &&')
    assert.ok(at > 0, 'the deploy result is not rendered at all')
    const block = body.slice(at, at + 700)
    assert.doesNotMatch(block, /\bDeployed\b/, 'the 202 branch claims a deploy')
    assert.doesNotMatch(block, /contract is on chain/i)
  })

  it('re-reads the order after the 202 rather than trusting the response', () => {
    assert.match(body, /if \(await deploy\.run\(\)\) reload\(\)/)
  })

  it('the deployed state is decided by the ORDER’s status, never by a mutation result', () => {
    // `statusTone(token.status)` is the only thing that can print DEPLOYED.
    assert.match(body, /statusTone\(token\.status\)/)
  })
})

describe('the buttons are offered from the service’s own predicates', () => {
  const body = withoutComments(token)

  it('pay is offered only in awaiting_payment — mint/src/tokens.ts:332', () => {
    assert.match(body, /const payable = token\.status === 'awaiting_payment'/)
  })

  it('deploy is offered only for a CLAIMABLE status — mint/src/tokens.ts:68-73', () => {
    assert.match(body, /CLAIMABLE_STATUSES as readonly string\[\]\)\.includes\(token\.status\)/)
  })

  it('a hidden deploy button is replaced by the reason, not by nothing', () => {
    // A disabled control with no explanation is how a customer concludes the site is broken.
    assert.match(body, /whyNotDeployable\(token\)/)
    assert.match(body, /will not be retried automatically/)
    assert.match(body, /has not been paid for/)
  })

  it('both buttons are disabled while their request is in flight', () => {
    assert.match(body, /disabled=\{pay\.busy\}/)
    assert.match(body, /disabled=\{deploy\.busy\}/)
  })

  it('a replayed payment is reported as a replay rather than as a fresh charge', () => {
    // 200 versus 201 — mint/src/server.ts:509-514. "Already paid" and "just paid" are different
    // facts about somebody's money.
    assert.match(body, /pay\.result\.replayed/)
    assert.match(body, /already paid for/i)
  })
})

describe('the project page shows the chain, never the order', () => {
  /**
   * 04-domain-model §5.3, implemented at mint/src/projectpages.ts:1-21. The order says what was
   * asked for; the chain says what is true. A figure on screen is a figure a reader will quote.
   */
  const body = withoutComments(project)

  it('renders the on-chain numbers from `onchain`', () => {
    assert.match(body, /onchain\.totalSupply/)
    assert.match(body, /onchain\.cap/)
    assert.match(body, /onchain\.owner/)
  })

  it('never falls back to the order record for a supply, a cap or an address', () => {
    // The failure would be `onchain?.totalSupply ?? token.supply`, which reads as helpful and is
    // a false statement about a thing being sold.
    assert.doesNotMatch(body, /token\.supply/, 'the project page reads the order’s supply')
    assert.doesNotMatch(body, /token\.cap/, 'the project page reads the order’s cap')
    assert.doesNotMatch(body, /token\.contractAddress/)
    assert.doesNotMatch(body, /token\.decimals/)
  })

  it('names the reason when there is no observation', () => {
    assert.match(body, /onchainUnavailable/)
  })

  it('renders the risk indicators through the three-state helper', () => {
    assert.match(body, /riskLines\(risk\)/)
    assert.match(body, /not been observed|Not observed|not observed/)
  })

  it('renders the project’s own words as TEXT, never as HTML', () => {
    // A description is written by whoever launched the token. dangerouslySetInnerHTML here would be
    // a stored-XSS surface on a public page anybody can be sent to.
    assert.doesNotMatch(body, /dangerouslySetInnerHTML/)
  })

  it('says the editorial half is unchecked', () => {
    assert.match(body, /not checked by CloudsForge/)
  })
})

describe('nothing in this bundle sets HTML from a value it did not author', () => {
  for (const [name, source] of PAGES) {
    it(`${name} does not use dangerouslySetInnerHTML`, () => {
      assert.doesNotMatch(withoutComments(source), /dangerouslySetInnerHTML/)
    })
  }
})

describe('the order form tells the truth about what its button does', () => {
  const body = withoutComments(launch)

  it('says nothing is charged, beside the button that opens the order', () => {
    // `POST /v1/tokens` charges nothing and deploys nothing — mint/src/server.ts:383. A form that
    // takes a wallet id and an owner address looks exactly like one that is about to spend money.
    assert.match(body, /Nothing is charged/)
  })

  it('shows the supply preview for every draft rather than only a suspicious one', () => {
    // A hint that appears only when something looks wrong is read as an error rather than as the
    // unit — and the unit is the whole point.
    assert.match(body, /displaySupply\(draft\.supply/)
    assert.match(body, /A wallet will show this as/)
  })

  it('warns about the mainnet allowlist beside the network choice', () => {
    // Checked at deploy, after payment — mint/src/server.ts:544-553. Beside the choice is the only
    // place a customer can act on it.
    assert.match(body, /allowlisted accounts/)
  })

  it('renders the cap field only for the variant that takes one', () => {
    assert.match(body, /capRuleFor\(variant\) === 'required'/)
  })

  it('reports every field problem rather than only the first', () => {
    assert.match(body, /problemsWith\(draft\)/)
    assert.match(body, /problems\.find\(\(p\) => p\.field === field\)/)
  })

  it('navigates to the status page after opening an order', () => {
    assert.match(body, /navigate\(`\/tokens\/\$\{created\.token\.id\}`\)/)
  })
})

describe('every screen renders all four states rather than a spinner and a hope', () => {
  for (const [name, source] of [
    ['catalogue', catalogue],
    ['tokens', tokens],
  ] as const) {
    it(`${name} renders loading, failure and (where it can be) empty`, () => {
      const body = withoutComments(source)
      assert.match(body, /<Loading/, `${name} has no loading state`)
      assert.match(body, /<Failed/, `${name} has no failure state`)
    })
  }

  it('the launch list has an empty state with something to DO in it', () => {
    const body = withoutComments(tokens)
    assert.match(body, /<Empty/)
    assert.match(body, /to="\/launch"/)
  })

  it('the launch list says when it has hit the service’s limit', () => {
    // `listTokens(..., 100)` — mint/src/server.ts:457 — and there is no cursor. A list that
    // quietly stops at a round number is a list a customer trusts.
    assert.match(withoutComments(tokens), /SERVICE_LIMIT/)
    assert.match(tokens, /mint\/src\/server\.ts:457/)
  })
})

describe('state is never colour alone', () => {
  it('every badge carries a word as well as a glyph', () => {
    const tone = read('src/components/tone.tsx')
    assert.match(tone, /mw-badge__word/)
    assert.match(tone, /mw-badge__glyph/)
    assert.match(tone, /aria-hidden="true"/)
  })

  it('the risk list renders a glyph and a label beside the tint', () => {
    assert.match(withoutComments(project), /mw-risk__glyph/)
    assert.match(withoutComments(project), /mw-risk__label/)
  })

  it('the stylesheet tints the badge but never carries its meaning', () => {
    // The word is in the markup; the class only adds a border colour. Asserted so a later
    // "simplification" to a colour-only badge fails here rather than in an accessibility audit.
    const styles = read('src/styles.css')
    assert.match(styles, /\.mw-badge__word/)
    assert.match(styles, /\.mw-risk--unknown/)
  })
})

describe('the shell and the 404', () => {
  it('the shell passes this surface to the company bar rather than reimplementing it', () => {
    assert.match(shell, /<CloudsForgeBar/)
    assert.match(shell, /current=\{PRODUCT\}/)
  })

  it('the shell derives its navigation from the route table', () => {
    assert.match(shell, /NAV\.map/)
  })

  /*
   * Comment-stripped, and this is not tidiness. The shell's own prose NAMES the two things these
   * assertions forbid — the retired `.mw-skip` anchor and the hand-rolled `<main id="main">` — in
   * order to explain why they went. A grep over the raw text would match the explanation and fail
   * a correct file, which is the "a guard that fires on its own explanation trains people to
   * delete the explanation" failure this file's own header counts six of in this estate.
   */
  const shellBody = withoutComments(shell)

  it('the shell offers the SHARED skip link before anything else', () => {
    // `<SkipLink />` from @cloudsforge/ui, not the local anchor this test used to look for. The
    // local one targeted a `<main>` with no `tabIndex`, which is not focusable: the fragment
    // scrolled the page and focus stayed on the link, so the next Tab went back into the bar.
    const skip = shellBody.indexOf('<SkipLink')
    const bar = shellBody.indexOf('<CloudsForgeBar')
    assert.ok(skip > 0 && skip < bar, 'the skip link must come first in the DOM')
    assert.doesNotMatch(shellBody, /mw-skip/, 'the local skip link is back beside the shared one')
  })

  it('the page sits in the shared main region, which is what the skip link can focus', () => {
    assert.match(shellBody, /<MainRegion/)
    assert.doesNotMatch(shellBody, /<main\b/, 'a hand-rolled main element is back, without tabIndex')
  })

  it('the consent banner is last in the shell, and therefore last in the tab order', () => {
    // Not modal, and not first: a reader who arrived to read a project page must be able to read
    // it and answer afterwards. Ordering is the whole assertion — the component itself is
    // micro-ui's.
    const banner = shellBody.indexOf('<CookieBanner')
    assert.ok(banner > 0, 'the shell renders no consent banner')
    assert.ok(banner > shellBody.indexOf('<CloudsForgeFooter'), 'the banner precedes the footer')
    assert.ok(banner > shellBody.indexOf('<Outlet'), 'the banner precedes the page')
  })

  it('the shell keeps the head in step with the address', () => {
    // Every page of this app was titled "Forge Create" before this, including the launch status
    // page a customer keeps open. The tags themselves are micro-ui's pure function; what is
    // asserted here is that this shell calls it, once, on navigation.
    assert.match(shellBody, /applyHead\(surfaceMeta\(PRODUCT/)
    assert.match(shellBody, /useLocation\(\)/)
  })

  it('the 404 page explains that the status really is 404', () => {
    // The phrase is line-wrapped in the JSX, so the whitespace is matched rather than assumed.
    assert.match(withoutComments(notFound), /404\s+status/)
  })
})
