/**
 * The route table.
 *
 * Two facts about it are enforced elsewhere and must stay in agreement with it: `ROUTES` in
 * lib/routes.ts is the declaration the navigation is derived from, and nginx.conf enumerates the
 * same paths so that an address which is NOT here answers 404 rather than 200.
 *
 * ── Which routes are gated is read off the SERVICE, not chosen ────────────────────────────────
 *
 * Two of the four are public because mint made them public: `GET /v1/catalogue`
 * (`mint/src/server.ts:358`) and `GET /v1/tokens/:id/page` (`mint/src/server.ts:607`) make no
 * `authenticate()` call at all, and both carry a comment saying why — a catalogue behind a token
 * cannot be browsed, and a project page nobody can read without an account cannot do its one job.
 * Putting either behind `ProtectedRoute` would send a customer to sign in for a page the service
 * would have served them, which is the same class of mistake as sending a bearer token to a route
 * that never wanted one.
 *
 * The other two authenticate, so they are gated. The gate is NOT the security boundary — mint
 * verifies the bearer itself and `ownedToken` answers 404 for another customer's order
 * (`mint/src/server.ts:633-650`).
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell.tsx'
import { AuthProvider, ProtectedRoute } from './lib/auth.tsx'
import { placementIsKnown } from './lib/hosts.ts'
import { CataloguePage } from './pages/catalogue.tsx'
import { LaunchPage } from './pages/launch.tsx'
import { NotFoundPage } from './pages/not-found.tsx'
import { ProjectPage } from './pages/project.tsx'
import { TokenPage } from './pages/token.tsx'
import { TokensPage } from './pages/tokens.tsx'

export function App() {
  const unregistered = !placementIsKnown()

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell unregistered={unregistered} />}>
            {/* Public: the catalogue is what an unsigned-in visitor arrived to read. */}
            <Route index element={<CataloguePage />} />
            <Route
              path="launch"
              element={
                <ProtectedRoute>
                  <LaunchPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="tokens"
              element={
                <ProtectedRoute>
                  <TokensPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="tokens/:id"
              element={
                <ProtectedRoute>
                  <TokenPage />
                </ProtectedRoute>
              }
            />
            {/* Public, deliberately: this is the address a project shares outward. */}
            <Route path="projects/:id" element={<ProjectPage />} />
            {/* Unknown paths render inside the shell, so the reader keeps the navigation they need
                to get back out — under a real 404, which nginx.conf preserves. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
