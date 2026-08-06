/**
 * Running one write, and being honest about the three ways it can end.
 *
 * `useResource` covers reads. A write needs different answers: it is not running until somebody
 * asks, only one may be in flight at a time, and its failure belongs beside the control that
 * caused it rather than in place of the page.
 *
 * ── Why the latch is a REF, and why the comment that used to be here was wrong ────────────────
 *
 * This is the single point of failure for every write in this app: pay, deploy, save the project
 * page, open an order. What used to stand here said the opposite of the truth, and it is repeated
 * so the next person does not restore it:
 *
 *   > "Read from state rather than a ref on purpose: React batches the `setBusy(true)` below
 *   > before the next click can be processed, and a ref here would make this hook's behaviour
 *   > depend on scheduling rather than on state anybody can see."
 *
 * **React does not do that, and the belief that it does is the bug.** `setBusy(true)` SCHEDULES a
 * render; it does not change anything a handler already on the stack can observe. `busy` is read
 * out of the render closure `run` was created in, so two clicks dispatched in the SAME TICK — a
 * real double click, a stuck button, an assistive technology re-sending an activation — both run
 * their handler before any re-render, both read `busy === false`, and both proceed. The
 * `disabled={busy}` on the button has exactly the same hole: the attribute is not on the DOM node
 * until a render commits, and no render has committed.
 *
 * The same defect was found independently in `micro-tessera-web`, where Fire, list and claim each
 * produced TWO requests, and in `micro-hub-web`, where it started two 24-hour key-export
 * ceremonies. Both were fixed the way this one is: a latch on a ref, taken SYNCHRONOUSLY before
 * the first `await` and released in a `finally`.
 *
 * So the two things here do two different jobs, and neither substitutes for the other:
 *
 *   - `inFlight` (a ref) is the CORRECTNESS guarantee. It changes the instant `run` is entered, so
 *     the second call in the same tick sees it.
 *   - `busy` (state) is the VISIBLE AFFORDANCE. It is what disables the control and what changes
 *     its label, and it is what stops a SECOND, LATER press across a slow round trip.
 *
 * `test/double-submit.test.ts` proves both, under StrictMode and without it.
 *
 * ── What the services do with a duplicate, stated honestly ────────────────────────────────────
 *
 * Mint reads NO inbound `Idempotency-Key` on ANY route — unlike trade, which requires one on every
 * mutating route (`trade/src/server.ts:921-929`). The `idempotencyKey` occurrences in
 * `mint/src/ledgerclient.ts:79` and `mint/src/custodyclient.ts:206` are keys mint SENDS
 * DOWNSTREAM, derived as `mint:order:<tokenId>`. This client therefore has no key to send and no
 * convention to follow, and the latch is the only client-side lever there is.
 *
 * Mint is still safe against a duplicate, and it is safe in three different ways, which is why the
 * latch is a fix and not a safeguard:
 *
 *   - PAY. `payForDeploy` re-reads the row `for update` and refuses anything that is not
 *     `awaiting_payment` (`mint/src/orders.ts:105-116`). A concurrent second request blocks on the
 *     lock, wakes to find `paid`, and throws `OrderStateError` → **409** (`mint/src/server.ts:307-311`).
 *     Nobody is charged twice. But the 409 lands in this hook's `error`, so the screen renders "The
 *     payment did not go through" beside "Paid. … has been debited". The `replayed: true`
 *     this file used to cite is NOT that path: it comes from the LEDGER replaying its derived key
 *     (`mint/src/orders.ts:152`) and covers a rolled-back retry, not a double click.
 *   - DEPLOY. The enqueue is `onConflict: 'keep'` (`mint/src/server.ts:574-579`), so three clicks
 *     produce one run. Both requests answer 202 and nothing reaches a chain twice.
 *   - CREATE. `POST /v1/tokens` is a plain insert (`mint/src/tokens.ts:315-334`) with no
 *     conditional update and no key. Two requests open TWO ORDERS, and only the latch prevents it.
 */
import { useCallback, useRef, useState } from 'react'
import { noticeFor, type ErrorNotice } from './api.ts'

export interface Mutation<A extends unknown[], T> {
  readonly busy: boolean
  readonly error: ErrorNotice | null
  /** The last successful result, kept so a 202 acceptance can be rendered after the fact. */
  readonly result: T | null
  readonly run: (...args: A) => Promise<T | null>
  readonly reset: () => void
}

export function useMutation<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  fallbackMessage: string,
): Mutation<A, T> {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [result, setResult] = useState<T | null>(null)
  /** The latch. A ref, because it must change WITHIN the tick — see the header. */
  const inFlight = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      // Taken synchronously, before the first `await` and before any state is touched. Everything
      // between this line and the `finally` below runs with the latch held, so a second call
      // arriving in the same tick — before React has re-rendered anything — is refused here.
      if (inFlight.current) return null
      inFlight.current = true
      setBusy(true)
      setError(null)
      try {
        const value = await fn(...args)
        setResult(value)
        return value
      } catch (err) {
        setError(noticeFor(err, fallbackMessage))
        return null
      } finally {
        // In a `finally`, and released BEFORE the state, so that a throw cannot leave a control
        // permanently dead. A release moved into the success path is a failed payment that can
        // never be retried without a page reload.
        inFlight.current = false
        setBusy(false)
      }
    },
    // `busy` is deliberately NOT a dependency any more: nothing in here reads it, and leaving it
    // would rebuild `run` on every transition and with it every `useCallback` that closes over it.
    [fn, fallbackMessage],
  )

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return { busy, error, result, run, reset }
}
