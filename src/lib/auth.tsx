/**
 * Session state for the tree, and the gate in front of the routes that need one.
 *
 * Hiding a route is NOT the security boundary — `mint` verifies the bearer on every route that
 * needs one (`authenticate`, `mint/src/server.ts:671`), and `ownedToken` answers 404 for another
 * customer's order (`mint/src/server.ts:622-639`). This exists so that a signed-out customer is
 * sent to sign in instead of being shown a screen made entirely of 401s.
 *
 * **Two routes are deliberately outside the gate**, because the service put them outside it:
 * `GET /v1/catalogue` (`mint/src/server.ts:354`) and `GET /v1/tokens/:id/page`
 * (`mint/src/server.ts:596`) make no `authenticate()` call at all. See `src/lib/routes.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── The `/auth/me` shape ──────────────────────────────────────────────────────────────────────
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is
 * NESTED under `user`. The route is `identity/src/server.ts:891-903` and the body is built by
 * `toPublicUser` at `identity/src/users.ts:52-63`; both citations were re-read against the source
 * for this repository rather than carried over.
 *
 * That shape is worth stating because the estate got it wrong once, at the root: the web template
 * declared `interface Me { handle?, roles? }` and read both fields off the TOP level, where they
 * are not, and four frontends inherited it — `roles` was then always null, `isAdmin` in the shared
 * company bar was always false, and the switcher hid every `adminOnly` entry from every signed-in
 * operator.
 *
 * **It has since been fixed everywhere, and this comment says so rather than describing an estate
 * that no longer exists.** `micro-web-template/src/lib/auth.tsx:26-32` now declares the nested
 * shape and reads `me?.user?.handle` / `me?.user?.roles` (lines 98-99), and hub-web, site,
 * foresight-web, foresight-admin-web and market-web all do the same. A README that had gone on
 * claiming otherwise would be the estate's own recurring defect — a document describing something
 * other than reality — pointed at its own fix.
 *
 * What is NOT inherited from the template is the flat FALLBACK below, which is kept so that a
 * proxy or an older build on the rollback path still signs somebody in, and the nested value wins
 * when both are present. `test/auth.test.ts` proves all three cases.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { AccountState } from '@cloudsforge/ui'
import { AUTH_EXPIRED_EVENT, clearTokens, hasSession, nimbus, signIn, signOut } from './api.ts'

/** What identity answers at `/auth/me`, narrowed to what this app needs. */
export interface MeResponse {
  user?: {
    id?: string | null
    handle?: string | null
    roles?: readonly string[] | null
  } | null
  /** The flat shape a proxy or an older build may still answer. */
  handle?: string | null
  roles?: readonly string[] | null
  id?: string | null
}

export interface Customer {
  /** `user:<uuid>` — the principal mint records as `ownerSubject`. Null when unknown. */
  readonly principal: string | null
  readonly handle: string | null
  readonly roles: readonly string[]
}

/**
 * Read the customer out of an `/auth/me` body.
 *
 * A pure function so `test/auth.test.ts` can prove both shapes without a browser, and so the
 * nested-versus-flat mistake cannot be made silently a sixth time.
 *
 * `principal` is null rather than a guess when there is no id. This app compares it against a
 * launch's `ownerSubject` to say "this is yours", and a guess there would either claim somebody
 * else's launch or disown the customer's own.
 */
export function readCustomer(body: unknown): Customer {
  const empty: Customer = { principal: null, handle: null, roles: [] }
  if (typeof body !== 'object' || body === null) return empty
  const top = body as MeResponse
  const nested = typeof top.user === 'object' && top.user !== null ? top.user : undefined

  const id = str(nested?.id) ?? str(top.id)
  return {
    principal: id === undefined ? null : `user:${id}`,
    handle: str(nested?.handle) ?? str(top.handle) ?? null,
    roles: list(nested?.roles) ?? list(top.roles) ?? [],
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function list(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((v): v is string => typeof v === 'string')
}

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

export interface Session {
  status: SessionStatus
  account: AccountState
  customer: Customer
  signIn: (returnTo?: string) => void
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  // Throwing beats returning a signed-out default: a component rendered outside the provider would
  // otherwise show an anonymous UI to a signed-in customer and nobody would ever see why.
  if (!value) throw new Error('useSession must be used inside <AuthProvider>')
  return value
}

const NOBODY: Customer = { principal: null, handle: null, roles: [] }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() => (hasSession() ? 'loading' : 'anonymous'))
  const [customer, setCustomer] = useState<Customer>(NOBODY)

  useEffect(() => {
    if (!hasSession()) return
    let live = true
    // The identity call is the one request that is allowed to fail quietly: an unreachable account
    // service must not sign somebody out in the middle of a launch they have already paid for.
    nimbus<unknown>('/auth/me')
      .then((profile) => {
        if (!live) return
        setCustomer(readCustomer(profile))
        setStatus('signedIn')
      })
      .catch(() => {
        if (!live) return
        setStatus(hasSession() ? 'signedIn' : 'anonymous')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onExpired = () => {
      clearTokens()
      setCustomer(NOBODY)
      setStatus('anonymous')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const doSignOut = useCallback(() => {
    setCustomer(NOBODY)
    setStatus('anonymous')
    signOut()
  }, [])

  const value = useMemo<Session>(
    () => ({
      status,
      account: {
        signedIn: status === 'signedIn',
        handle: customer.handle,
        roles: customer.roles,
      },
      customer,
      signIn,
      signOut: doSignOut,
    }),
    [status, customer, doSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * Gate a route behind a session.
 *
 * The redirect carries the CURRENT path, search and hash, so somebody who followed a link to their
 * launch status lands back on that launch rather than on the catalogue. It is fired from an effect
 * rather than during render because a redirect during render runs twice under StrictMode, and the
 * second one would overwrite the first's return address.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, signIn: go } = useSession()
  const location = useLocation()

  useEffect(() => {
    if (status !== 'anonymous') return
    const back = `${window.location.origin}${location.pathname}${location.search}${location.hash}`
    go(back)
  }, [status, location.pathname, location.search, location.hash, go])

  if (status === 'loading') return <LoadingGate label="Checking your session" />
  if (status === 'anonymous') return <LoadingGate label="Taking you to sign in" />
  return <>{children}</>
}

function LoadingGate({ label }: { label: string }) {
  return (
    <div className="wt-state wt-state--loading" role="status">
      <span className="wt-spinner" aria-hidden="true" />
      <p className="wt-state__title">{label}</p>
    </div>
  )
}
