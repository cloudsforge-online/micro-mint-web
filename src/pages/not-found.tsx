/**
 * The unknown-path page.
 *
 * It is rendered under an HTTP 404, not a 200 — nginx.conf enumerates the app's real routes and
 * lets everything else fall through to `error_page 404 /index.html`, which serves this bundle
 * while KEEPING the status. An app that answers 200 for every address in existence serves its
 * "page not found" screen as a success: crawlers index it, monitors call it healthy, and a deploy
 * that drops a route looks exactly like a deploy that did not.
 *
 * That matters here in a way it does not on an operator console. A project page address is
 * shared outward — pasted into a chat, posted, indexed — and a mistyped one answering 200 is a
 * page a prospective buyer can be sent to and believe.
 */
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="wt-state wt-state--empty" role="status">
      <span className="wt-state__icon" aria-hidden="true">
        ◇
      </span>
      <p className="wt-state__title">Forge Create has no page at this address</p>
      <p className="wt-state__hint">
        Either the link has aged out or a character went missing on the way here. The server agreed
        with this page and answered with a 404 status, so whatever produced the link can be corrected
        at its source.
      </p>
      <div className="wt-state__action">
        <Link className="cf-btn" to="/">
          See what you can launch
        </Link>
      </div>
    </div>
  )
}
