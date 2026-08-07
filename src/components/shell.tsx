/**
 * The app shell: the skip link, the company bar, the section navigation, the page, the footer and
 * the consent banner — in that order, which is also the tab order and is the whole point of it.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'create' — so the switcher marks Forge Create as current and leaves every other
 * product clickable.
 *
 * Four of the pieces arrived with design system 1.1 and none of them is written here: `SkipLink`,
 * `MainRegion`, `CookieBanner` and the head tags `DocumentMeta` applies. Each replaced something
 * this surface either had a private copy of or did not have at all, and the notes beside each say
 * which — because "moved into the shared package" and "this was broken" are different claims and
 * two of the four are the second one.
 *
 * `test/shared-chrome.test.ts` mounts this in a document and asserts the four as BEHAVIOUR rather
 * than as imports: the skip link's target takes focus, the head follows the address, and no
 * analytics cookie exists before anybody has agreed to one.
 */
import { useEffect } from 'react'
import {
  CloudsForgeBar,
  CloudsForgeFooter,
  CookieBanner,
  MainRegion,
  SkipLink,
} from '@cloudsforge/ui'
import { applyHead, surfaceMeta, type PageMetaInput } from '@cloudsforge/ui/seo'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { NAV, ROUTES } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/*
        The skip link is the first focusable thing in the document, and it is now the SHARED one.
        This surface had a hand-rolled `.mw-skip` anchor pointing at `#main`; sixteen other
        surfaces had nothing at all, so a keyboard reader reached the content of Forge Hub or the
        operator console by tabbing past the logo, the product switcher and the account menu on
        every navigation. Moving it into @cloudsforge/ui is the point of this phase.

        `MainRegion` below is the half that was actually broken here rather than merely duplicated:
        the old target was `<main id="main">` with NO `tabIndex`, and a `<main>` is not focusable by
        default. In Chrome and Safari the fragment therefore scrolled the page and left focus on
        the link, so the next Tab went back to the second item in the bar — the skip link looked
        like it worked and did not. `MainRegion` sets `tabIndex={-1}`, and its id is `MAIN_ID`
        (`cf-main`), which is what the shared `SkipLink` points at.
      */}
      <SkipLink />
      <DocumentMeta />
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
      />
      {/*
        The sub-nav is sticky at exactly `var(--cf-bar-h)` — the bar's own height token, not a
        number copied out of it. When the bar's height changes, this moves with it.
      */}
      <nav className="wt-subnav" aria-label="Sections">
        <div className="wt-subnav__inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `wt-subnav__link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <MainRegion className="wt-main">
        {/*
          Not fatal, so not a refusal — this app has a public page worth serving and nothing here
          is a security boundary. But not silent either. `cloudsforgeHosts()` derives the apex by
          stripping a KNOWN subdomain, so an address the registry does not know makes every estate
          URL resolve one level too deep: mint, and the account portal with it. The symptom is a
          site that cannot sign anybody in and says nothing about why.
        */}
        {unregistered && (
          <p className="mw-note mw-note--warn" role="status">
            <span className="mw-note__icon" aria-hidden="true">
              ▲
            </span>
            This page is being served from an address the CloudsForge surface registry does not
            know, so every host it resolves — including the account portal and this product’s own
            API — is derived from the wrong apex. Its home is the{' '}
            <code className="cf-num">create</code> surface.
          </p>
        )}
        <Outlet />
      </MainRegion>

      {/*
        The company footer, from @cloudsforge/ui. Not written here, and deliberately not
        `<footer>` markup of this app's own: the estate had four hand-rolled footers and nine
        surfaces with none, and the registry's `developers` row has been claiming all along that
        the developer console is "reached from the footer" — a navigation path that existed
        nowhere. Every link in it is derived from SURFACES, so a new product appears here without
        this file changing.

        `account` is passed for one reason: it decides whether the operator surfaces are offered.
        Omitting it would hide them, which is safe, but this app already knows and a signed-in
        operator should be able to reach Admin from any page.
      */}
      <CloudsForgeFooter current={PRODUCT} account={account} />

      {/*
        Last in the document, and therefore last in the tab order. That is deliberate: the banner
        is a dialog and is explicitly NOT modal, so a reader who came here to read a project page
        can read it and answer afterwards. A consent banner that traps focus is the coercion the
        regulation is about.

        It renders nothing at all until it knows the reader has not already answered, and nothing
        on an origin where analytics would not report anyway — a local `pnpm dev` therefore never
        sees it. Reject and Accept share one class with no modifier, and that symmetry is a
        compliance requirement rather than a preference; see `.cf-consent__choice` in ui.css.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * Keep `document.title`, the description, the Open Graph tags and the canonical link in step with
 * the address.
 *
 * A component in the shell rather than a hook called by each page, because the failure mode of the
 * second shape is the page that forgets to call it — and the page that forgets is the one added
 * last, which is the one nobody has bookmarked yet and therefore the one nobody notices is titled
 * with the previous page's title. Every page of this app was titled "Forge Create" before this,
 * including the launch status page a customer keeps open and reloads.
 *
 * The construction of the tags is a pure function in `@cloudsforge/ui/seo`, derived from the
 * surface registry, with its own tests upstream. This is only the part that touches the DOM, plus
 * the one thing the registry cannot know: which of THIS app's addresses is which.
 *
 * The static tags in index.html are deliberately kept. They are what a link-preview fetcher gets,
 * because those generally do not execute JavaScript — see the note at the head of that file.
 */
function DocumentMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    applyHead(surfaceMeta(PRODUCT, pageMetaFor(pathname)), window.location.origin)
  }, [pathname])
  return null
}

/**
 * What this app can say about one of its addresses that the registry cannot.
 *
 * Read off `ROUTES` rather than restated, so a route added there is titled here without anybody
 * remembering — the same rule the sub-navigation and nginx.conf already follow.
 *
 * `robots` is overridden for the two GATED routes and for the not-found address. The registry
 * knows this surface is public and indexable, which is true of the catalogue and of a project
 * page; it cannot know that `/launch` and `/tokens/<uuid>` render a sign-in redirect to anybody
 * without a session, and an indexed sign-in redirect is a search result that helps nobody. `follow`
 * is kept in both cases: the links out of those pages are ordinary and worth crawling.
 *
 * THE INDEX ROUTE DELIBERATELY TAKES NO PAGE TITLE. `surfaceMeta` then returns the bare surface
 * name, which is byte-for-byte what index.html's `<title>` and `og:title` already carry — and the
 * one drift this arrangement can produce is the shell and the application disagreeing about the
 * front page, which is the failure `site/index.html` records having shipped for as long as it took
 * somebody to open the served HTML rather than the page.
 */
function pageMetaFor(pathname: string): PageMetaInput {
  const segment = pathname.split('/')[1] ?? ''
  const route = ROUTES.find((r) => r.path === segment)
  if (route === undefined) {
    return { title: 'Not found', path: pathname, robots: 'noindex, follow' }
  }
  const title = route.path === '' ? null : route.label
  return {
    path: pathname,
    ...(title === null ? {} : { title }),
    ...(route.public ? {} : { robots: 'noindex, follow' }),
  }
}
