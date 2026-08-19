/**
 * THE SHARED CHROME RENDERS HERE, AND ITS HOOKS ACTUALLY RUN.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY A TEST WHOSE SUBJECT IS ANOTHER REPOSITORY'S COMPONENT
 *
 * It is not asserting what `@cloudsforge/ui` draws — micro-ui owns that. It is asserting a fact
 * about THIS repository's test process: that `@cloudsforge/ui` and this app end up sharing ONE
 * React. They do not by default. `link:../ui/packages/ui` symlinks the design system's working
 * tree, that tree has its own `react` (a devDependency it genuinely needs to test itself), and
 * Node resolves a bare specifier from the importing file's REALPATH — so the design system's
 * components reach the second copy, share no dispatcher with ours, and the first hook they call
 * throws `Cannot read properties of null (reading 'useState')`.
 *
 * `--import @cloudsforge/ui/test-loader` in the `test` script is what collapses the two. This file
 * is what notices when it stops. Delete the flag and these tests are the first to go red.
 *
 * Publishing `dist` did NOT make that unnecessary, though eight repositories predicted it would:
 * `dist/index.js` has the same realpath as `src/index.tsx`, so it finds the same second copy. What
 * publishing `dist` did fix was the OTHER workaround — the classic JSX transform, and the
 * `globalThis.React` that used to sit in `test/dom.ts`.
 *
 * ── Why it clicks rather than only mounting ───────────────────────────────────────────────────
 *
 * A mount that does not throw is weak evidence: `CloudsForgeLogo` renders perfectly well with two
 * Reacts in the process, because it calls no hook — that was measured. The dropdowns are the ones
 * that break, so each is OPENED, which requires `useState` to hold a value across a re-render and
 * `useId` to have produced the id `aria-controls` names. A second dispatcher cannot fake that.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AccountMenu,
  CloudsForgeBar,
  HUB_MINE_PATH,
  MAIN_ID,
  NOT_PAID_CLAUSE,
  ProductSwitcher,
} from '@cloudsforge/ui'
import { createElement as h } from 'react'
import { App } from '../src/app.tsx'
import { PRODUCT, hosts } from '../src/lib/hosts.ts'
import * as fx from './fixtures.ts'
import { withScreen, type Screen } from './dom.ts'

/** The address this surface is served from, so `cloudsforgeHosts()` resolves the real apex. */
const ORIGIN = 'https://cloudsforge.online/create'

/**
 * `allowEmpty` because the subject is a strip of chrome, not a page: the bar's own text is well
 * under the 40 characters `assertMounted` requires of a mounted app. Every test below then asserts
 * on named elements instead, which is a stricter check than the length heuristic it waives.
 */
const CHROME = { allowEmpty: true } as const

/** The dropdown triggers, which is how they are found without hard-coding this surface's label. */
const triggers = (s: Screen): Element[] => [...s.document.querySelectorAll('[aria-haspopup="menu"]')]

test('the company bar renders, signed out', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    assert.ok(s.document.querySelector('[role="banner"]'), 'CloudsForgeBar rendered no banner')
    s.byRole('link', 'CloudsForge home')
    s.byRole('button', 'Sign in')
    assert.equal(triggers(s).length, 1, 'signed out, the switcher is the only dropdown')
    s.clean('the bar, signed out')
  })
})

test('the product switcher opens, which means its useState held', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    const trigger = triggers(s)[0] as Element
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(s.document.querySelector('[role="menu"]'), null, 'the menu is closed to begin with')

    await s.click(trigger)

    assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'the click did not reach state')
    const menu = s.document.querySelector('[role="menu"][aria-label="CloudsForge products"]')
    assert.ok(menu, 'the switcher opened no menu')
    assert.ok(
      menu.querySelectorAll('[role="menuitem"]').length > 1,
      'an open switcher with fewer than two products is not a switcher',
    )
    // `aria-controls` names the menu by an id from `useId`, which is the other hook in play.
    assert.equal(menu.getAttribute('id'), trigger.getAttribute('aria-controls'))
    s.clean('opening the product switcher')
  })
})

test('the account menu opens for a signed-in viewer, and offers sign out', async () => {
  const account = { signedIn: true, handle: 'ada' }
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account }), CHROME, async (s) => {
    const trigger = triggers(s)[1] as Element
    assert.match(s.textOf(trigger), /ada/, 'the second dropdown is not the account menu')

    await s.click(trigger)

    const menu = s.document.querySelector('[role="menu"][aria-label="Account"]')
    assert.ok(menu, 'the account menu opened nothing')
    assert.match(s.textOf(menu), /Sign out/)
    s.clean('opening the account menu')
  })
})

test('ProductSwitcher and AccountMenu also render standing alone', async () => {
  // Named directly, not only through the bar: these are the two components measured to throw
  // without deduplication, and a test that reached them only via a parent would stop covering
  // them the day the bar stopped composing them.
  await withScreen(h(ProductSwitcher, { current: PRODUCT }), CHROME, async (s) => {
    assert.equal(triggers(s).length, 1)
    s.clean('ProductSwitcher alone')
  })
  await withScreen(h(AccountMenu, { account: { signedIn: false } }), CHROME, async (s) => {
    s.byRole('button', 'Sign in')
    s.clean('AccountMenu alone')
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The 1.1 chrome the shell adds: the skip link, the main region, the consent banner and the head.

   These are asserted by MOUNTING THE APP rather than by reading src/components/shell.tsx, and the
   distinction is the whole reason they are here rather than in render.test.ts. Every one of them
   is a property that a correct-looking source file can get wrong:

     - a skip link whose target is not focusable scrolls and leaves focus behind, which is what
       this surface shipped — `<main id="main">` with no `tabIndex`, and the anchor pointing at it;
     - a head applied in a component that never mounts applies nothing;
     - a consent banner that renders where analytics cannot report is a banner asking permission
       for something that will not happen, and one that renders BEFORE the page is a focus problem.

   Source text proves none of those four. A document does.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const CATALOGUE = { 'GET /v1/catalogue': { body: fx.catalogue() } } as const

test('the skip link is first, and its target is a main region that can take focus', async () => {
  await withScreen(h(App), { url: `${ORIGIN}/`, routes: { ...CATALOGUE } }, async (s) => {
    await s.settle(20)

    const skip = s.tabbables()[0]
    assert.ok(skip, 'nothing is tabbable at all')
    assert.equal(skip.tagName, 'A', 'the first tabbable is not a link')
    assert.equal(skip.getAttribute('href'), `#${MAIN_ID}`, 'the skip link points somewhere else')

    // The half that was broken rather than merely duplicated. A <main> is not focusable by
    // default, so without this the fragment scrolls the page and the next Tab returns to the bar.
    const main = s.document.getElementById(MAIN_ID)
    assert.ok(main, `the skip link targets #${MAIN_ID}, which is not in the document`)
    assert.equal(main.tagName, 'MAIN')
    assert.equal(main.getAttribute('tabindex'), '-1', 'the main region cannot take focus')
    assert.equal(s.allByRole('main').length, 1, 'a page has exactly one main landmark')

    s.clean('the shell, at the catalogue')
  })
})

test('the head follows the address rather than staying on the shell’s title', async () => {
  await withScreen(h(App), { url: `${ORIGIN}/`, routes: { ...CATALOGUE } }, async (s) => {
    await s.settle(20)

    /*
     * The index route deliberately takes no page title, so this is the bare surface name — which
     * is byte-for-byte what index.html carries. The one drift this arrangement can produce is the
     * shell and the application disagreeing about the front page, and that is the failure `site`
     * records having shipped: a sentence the owner had asked to have removed stayed in every
     * search result and social card until somebody opened the served HTML rather than the page.
     */
    assert.equal(s.document.title, 'Forge Create')

    const content = (selector: string): string =>
      s.document.head.querySelector(selector)?.getAttribute('content') ?? ''

    // ── COMPOSED AGAINST THE SERVING ORIGIN, AND THE INDEX HAS NO TRAILING SLASH ──────────────
    //
    // These read `${ORIGIN}/` while this surface was a hostname, where `/` IS the index and the
    // only spelling of it. The index is `<apex>/create` now, and `normalisePath` in
    // `@cloudsforge/ui/seo` deliberately collapses the trailing slash: one page must not acquire
    // two addresses and split its own indexing between them.
    //
    // So the canonical and `og:url` are the bare mount — which is also what the sitemap lists and
    // what `location = /create` serves. `location = /create/` exists and answers, but it is a
    // second door rather than a second address, and nothing advertises it.
    assert.equal(
      s.document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      ORIGIN,
    )
    assert.equal(content('meta[property="og:url"]'), ORIGIN)
    // The card is a static asset in this bundle's own directory, so it keeps the slash.
    assert.equal(content('meta[property="og:image"]'), `${ORIGIN}/og-1200x630.png`)

    // Public, and invited: the catalogue is the address a stranger arrives at, and nginx.conf
    // lists exactly this one in the sitemap. The two must not disagree.
    assert.match(content('meta[name="robots"]'), /^index, follow/)

    // The description is derived from the surface registry, so it cannot name a retired asset by
    // accident. Asserted rather than assumed, because the static copy in index.html did.
    assert.doesNotMatch(content('meta[name="description"]'), /\bSHARD/i)
    assert.equal(content('meta[property="og:description"]'), content('meta[name="description"]'))

    s.clean('the head, at the catalogue')
  })
})

test('an address this app does not own is titled as such, and tells crawlers to stay away', async () => {
  // nginx answers a real 404 for it; the head should not then invite indexing of the page the
  // reader is looking at. Both halves of the same honesty.
  await withScreen(h(App), { url: `${ORIGIN}/nothing-here`, routes: {} }, async (s) => {
    await s.settle(20)
    assert.equal(s.document.title, 'Not found — Forge Create')
    assert.match(
      s.document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
      /^noindex/,
    )
  })
})

test('the consent banner does not appear where analytics cannot report', async () => {
  /*
   * `CookieBanner` renders nothing when the shell carries no measurement ID and nothing on an
   * origin analytics would not report from. This harness's document has no `cf-analytics` meta —
   * it mounts components, not index.html — which is exactly the shape of a local `pnpm dev`.
   *
   * The assertion is that no cookie dialog is drawn AND, more importantly, that nothing was
   * fetched and no analytics cookie was set. A banner is the visible half of the rule; the rule
   * is that consent precedes storage.
   */
  await withScreen(h(App), { url: `${ORIGIN}/`, routes: { ...CATALOGUE } }, async (s) => {
    await s.settle(20)
    assert.equal(s.document.querySelector('[role="dialog"]'), null, 'a banner with nothing to ask')
    assert.doesNotMatch(s.document.cookie, /_ga/, 'an analytics cookie was set without consent')
    assert.equal(
      s.document.querySelector('script[src*="googletag" i]'),
      null,
      'an analytics tag was injected without a click on Accept',
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE SECTIONS STRIP, IN A DOCUMENT.

   The fifth thing this file exists for, and it is the same argument as the four above: the strip
   used to be `.wt-subnav` in `src/styles.css`, and its defect was invisible from the source of
   this repository because the source looked deliberate. Measured 2026-08-10 across the ten
   frontends that each declared this row themselves, `.wt-subnav__inner` here was a `display: flex`
   row with no `overflow-x` and its links had no `white-space: nowrap` — so on a phone the labels
   squeezed, broke mid-word, and the ones past the edge could not be reached at all.

   A grep for `<SubNav>` in `shell.tsx` would go green on an import nothing renders. What decides
   whether a reader can reach the last section on a 360px screen is which CLASSES the elements in
   the document are wearing, because those are the ones `ui.css` gives `overflow-x: auto` and
   `white-space: nowrap` to. So it is asserted here, on the rendered tree.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

test('the sections strip on screen is the shared one, and so is every link in it', async () => {
  await withScreen(h(App), { url: `${ORIGIN}/`, routes: { ...CATALOGUE } }, async (s) => {
    await s.settle(20)

    const strip = s.document.querySelector('nav.cf-subnav')
    assert.ok(strip, 'the sections strip on screen is not the shared `.cf-subnav`')
    assert.equal(strip.getAttribute('aria-label'), 'Sections', 'the landmark lost its name')
    assert.ok(
      strip.querySelector('.cf-subnav__inner'),
      'the shared landmark has no shared scroll container inside it — this is the part that scrolls',
    )

    // EVERY link, not "at least one". A half-adopted strip is a row where some labels wrap and
    // some do not, which is harder to notice than one where none of them do.
    const links = [...strip.querySelectorAll('a')]
    assert.ok(links.length >= 3, `expected this surface's sections, found ${links.length} links`)
    const unshared = links.filter((a) => !a.classList.contains('cf-subnav__link'))
    assert.deepEqual(
      unshared.map((a) => a.textContent),
      [],
      'a section link is not wearing `cf-subnav__link`, so its label will break mid-word on a phone',
    )

    // The current section, in the SHARED modifier's spelling. The local one was `is-active`, and
    // a link still carrying that gets no underline, no weight and no ink change from `ui.css`.
    const current = links.filter((a) => a.classList.contains('cf-subnav__link--current'))
    assert.equal(current.length, 1, `expected one current section, found ${current.length}`)
    assert.equal(s.document.querySelector('[class*="wt-subnav"]'), null, 'a `wt-subnav` survived')
    assert.equal(s.document.querySelector('.is-active'), null, 'the local active modifier survived')

    s.clean('the sections strip')
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   BROWSER MINING, FROM THE BAR

   The owner's report was that starting a browser miner is "hidden deep in mining page, it should
   be easily found near the account on all pages". It is now in the shared chrome, so it is here
   on every address this surface serves — and it is asserted by mounting the app, for the same
   reason the four above are: a shell that passes the prop and a bar that drops it look identical
   in source.

   What this surface renders is the `elsewhere` state, which is a LINK. The miner is a WebSocket
   and two Web Workers on `hub.<apex>`, a different origin, so nothing in this bundle can start,
   observe or stop a session. Pressing the session itself is asserted in micro-hub-web by
   BJ-MINE-01..07, which mount the miner.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

test('the bar offers browser mining, beside the account, on an ordinary address', async () => {
  await withScreen(h(App), { url: `${ORIGIN}/`, routes: { ...CATALOGUE } }, async (s) => {
    await s.settle(20)

    const bar = s.document.querySelector('.cf-bar')
    assert.ok(bar, 'this surface no longer renders the company bar')
    const found = [...bar.querySelectorAll('.cf-mine')]
    assert.equal(found.length, 1, `expected one mining control in the bar, found ${found.length}`)
    const mine = found[0] as Element

    // An anchor, not an onClick. A destination expressed as a handler cannot be middle-clicked,
    // copied or crawled, and is invisible to every check that reads links — which is how the
    // account entry spent four months pointing at the sign-in page (micro-hub-web
    // `test/account-link.test.ts`).
    assert.equal(mine.tagName, 'A', 'the mining control is not a link')
    assert.equal(
      mine.getAttribute('href'),
      `${hosts().hub}${HUB_MINE_PATH}`,
      'the mining control does not point at Forge Hub’s mining address',
    )

    // Beside the account, asserted as TAB ORDER rather than as a CSS neighbour: a stylesheet can
    // move a box, but only document order moves this.
    const order = s.tabbables()
    const account = s.byRole('button', 'Sign in')
    assert.equal(
      order.indexOf(account) - order.indexOf(mine),
      1,
      'the mining control is no longer immediately before the account in the tab order',
    )

    // And it promises nothing the pool does not pay. `pool/src/payouts.ts` derives
    // `payoutsImplemented` and it is false today, so any surface implying settlement is a defect.
    const described = s.document.getElementById(mine.getAttribute('aria-describedby') ?? '')
    assert.ok(described, 'the mining control carries no description for a screen reader')
    assert.ok(
      (described.textContent ?? '').includes(NOT_PAID_CLAUSE),
      'the mining control does not carry the not-paid clause',
    )
    assert.doesNotMatch(
      `${mine.textContent ?? ''} ${described.textContent ?? ''}`,
      /[$€£]|\d/,
      'the mining control shows a figure, and nothing is paid',
    )

    s.clean('the bar’s mining control')
  })
})
