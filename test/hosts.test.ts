/**
 * Where this bundle talks to, and how it decides.
 *
 * The rule the whole file exists to keep: NOTHING here is a build-time constant. Every host is
 * derived from `window.location` on the call, so one image serves localhost, a preview deployment
 * and production — and the tests install four different windows to prove it rather than trusting
 * a comment.
 *
 * The second thing under test is the dev-port disagreement, asserted as a FACT rather than fixed
 * with a literal: the registry gives `create` 4004 and mint binds 4000
 * (`mint/src/env.ts`, `mint/.env.example`). See the header of src/lib/hosts.ts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { SURFACES, cloudsforgeHosts, type CloudsForgeHosts } from '@cloudsforge/ui'
import {
  APP_NAME,
  PRODUCT,
  apiBase,
  isLocal,
  isRegisteredPlacement,
  resolveApiBase,
} from '../src/lib/hosts.ts'
import { installWindow, removeWindow } from './browser-stubs.ts'

afterEach(removeWindow)

/**
 * A file in this repository, as text.
 *
 * vite.config.ts and app.tsx are READ rather than imported: the first pulls in a Vite plugin and
 * the second the whole React tree, and this suite deliberately has no DOM.
 */
const read = (file: string): string =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

/** The production host table, as `cloudsforgeHosts()` derives it from an apex hostname. */
function production(): CloudsForgeHosts {
  installWindow('https://cloudsforge.online/create/')
  const hosts = cloudsforgeHosts()
  removeWindow()
  return hosts
}

describe('the surface this app is', () => {
  it('is the create surface, which is what the switcher marks current', () => {
    assert.equal(PRODUCT, 'create')
  })

  it('is registered as a product, in the switcher, with its own subdomain', () => {
    const surface = SURFACES.find((s) => s.key === PRODUCT)
    assert.ok(surface, 'create is not in the surface registry')
    assert.equal(surface.kind, 'product')
    assert.equal(surface.inSwitcher, true)
    // ── IT IS A PATH SINCE WAVE 3b, AND THE SWITCHER STILL FINDS IT ─────────────────────
    //
    // `subdomain: 'create'` was the assertion, and what it was FOR is that the switcher can
    // navigate here. A home is an ADDRESS, and either half of (subdomain, basePath)
    // supplies one — so both are asserted rather than the empty string alone, which would
    // pass for a surface that had lost its home entirely.
    assert.equal(surface.subdomain, '')
    assert.equal(surface.basePath, '/create')
    assert.equal(surface.name, 'Forge Create')
  })

  it('reports a name to the observability ingest that names the bundle, not the product', () => {
    // Lantern groups on it, and "create" is the surface while "mint-web" is the artefact that
    // threw. An error report that cannot name the bundle cannot be pinned to a deploy.
    assert.equal(APP_NAME, 'mint-web')
  })
})

describe('the API base is an origin comparison, never a flag', () => {
  const hosts = production()

  it('is relative when the page and the API share an origin', () => {
    // Production: nginx serves this bundle and mint serves /v1 behind create.<apex>.
    // THE MOUNT, not `''`. A relative `/v1/…` from a page at `/create/anything`
    // resolves at the ORIGIN ROOT — micro-site's — which answers its SPA shell: 200, HTML
    // where JSON was expected. The gateway strips `/create` before `micro-mint` sees
    // it, so the service is unchanged (decision 4).
    assert.equal(resolveApiBase('https://cloudsforge.online', hosts, PRODUCT), '/create')
  })

  it('is absolute when they do not', () => {
    assert.equal(
      resolveApiBase('https://hub.cloudsforge.online', hosts, PRODUCT),
      hosts[PRODUCT],
    )
  })

  it('is absolute when there is no page origin at all', () => {
    // With nothing to resolve a relative URL against, the absolute form is the only right answer.
    assert.equal(resolveApiBase('', hosts, PRODUCT), hosts[PRODUCT])
  })

  it('resolves from the window on every call, so one image serves every environment', () => {
    installWindow('https://cloudsforge.online/create/tokens')
    assert.equal(apiBase(), '/create')
    removeWindow()

    installWindow('http://localhost:5184/tokens')
    // Under `pnpm dev` the page is on Vite's port and the service is on the registry's, so the
    // request goes cross-origin and absolute.
    assert.notEqual(apiBase(), '')
    assert.match(apiBase(), /^http:\/\/localhost:\d+$/)
  })
})

describe('the dev port disagreement, recorded rather than papered over', () => {
  /**
   * A hard-coded host would be a second, unversioned copy of the registry, and the copy is the one
   * that goes stale — so this app resolves 4004 and the README tells a developer to start mint on
   * it. The test pins BOTH halves so the day either moves, this fails and names the other.
   */
  it('the registry gives create devPort 4004', () => {
    assert.equal(SURFACES.find((s) => s.key === 'create')?.devPort, 4004)
  })

  it('and this app therefore calls 4004 on localhost, which is what the README explains', () => {
    installWindow('http://localhost:5184/')
    assert.equal(apiBase(), 'http://localhost:4004')
  })

  it('the vite dev port is not the registry port, and must not be confused with it', () => {
    // The registry's devPort names where the API answers; Vite's names where the bundle is served.
    // admin-web had to draw this distinction after its own entry was read as the latter.
    const vite = /server:\s*\{\s*port:\s*(\d+)/.exec(read('vite.config.ts'))
    assert.ok(vite, 'vite.config.ts declares no dev server port')
    assert.notEqual(Number(vite[1]), 4004)
  })
})

describe('local development is exempt, in exactly the four names cloudsforgeHosts() exempts', () => {
  it('treats the four as local', () => {
    for (const hostname of ['', 'localhost', '127.0.0.1', 'dev.local']) {
      assert.equal(isLocal(hostname), true, hostname)
    }
  })

  it('treats a real hostname as not local', () => {
    for (const hostname of ['cloudsforge.online', 'example.test', 'localhost.evil.test']) {
      assert.equal(isLocal(hostname), false, hostname)
    }
  })
})

describe('the placement warning', () => {
  const hosts = production()

  it('accepts this surface’s own origin', () => {
    assert.equal(isRegisteredPlacement(
      // An ORIGIN, which has no path — the mount lives in `hosts`, not here. The sweep that
      // repointed page URLs to `<apex>/create` reached this one too, and an origin carrying
      // a path is not an origin.
      'https://cloudsforge.online',
      'cloudsforge.online',
      hosts,
    ), true)
  })

  it('accepts localhost, where there is no apex to get wrong', () => {
    assert.equal(isRegisteredPlacement('http://localhost:5184', 'localhost', hosts), true)
  })

  it('flags an address the registry does not know', () => {
    // An unknown prefix is left alone, so the whole name becomes the apex and every derived host —
    // mint, the account portal — resolves one level too deep.
    assert.equal(isRegisteredPlacement('https://preview-7.example.test', 'preview-7.example.test', hosts), false)
  })

  it('flags another surface’s origin', () => {
    assert.equal(isRegisteredPlacement('https://hub.cloudsforge.online', 'hub.cloudsforge.online', hosts), false)
  })

  it('warns rather than refusing, because this surface has a public page worth serving', () => {
    // The opposite of admin-web, which refuses to render at all. Asserted so the difference stays a
    // decision: a product page that blanks itself on a preview deployment is worse than one that
    // says where it is.
    const app = read('src/app.tsx')
    assert.doesNotMatch(app, /MisplacedBundle/, 'this surface must not refuse to render')
    assert.match(app, /unregistered/, 'the placement must still be passed to the shell')
  })
})
