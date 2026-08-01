/**
 * Running one write, and being honest about the three ways it can end.
 *
 * `useResource` covers reads. A write needs different answers: it is not running until somebody
 * asks, only one may be in flight at a time, and its failure belongs beside the control that
 * caused it rather than in place of the page.
 *
 * ── Why `busy` is not merely cosmetic here ────────────────────────────────────────────────────
 *
 * The two writes this app makes both spend or commit something that cannot be taken back:
 * `POST /v1/tokens/:id/pay` debits a customer's Shards through the ledger in one transaction
 * (`mint/src/server.ts:478-507`), and `POST /v1/tokens/:id/deploy` queues a job that puts a
 * contract on a chain (`mint/src/server.ts:515-568`).
 *
 * Neither takes an `Idempotency-Key` — mint has none — so the safety net is the service's own
 * state machine: `payForDeploy` updates `where status = 'awaiting_payment'` and answers 200 with
 * `replayed: true` if it finds the work done (`mint/src/tokens.ts:326-332`), and `deploy` enqueues
 * with `onConflict: 'keep'` so three clicks produce one run (`mint/src/server.ts:547-552`). Those
 * make a double click survivable; they are not a reason to cause one. So the hook refuses to start
 * a second run while one is in flight, and the buttons read the same flag so they are DISABLED
 * rather than merely ignored.
 */
import { useCallback, useState } from 'react'
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

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      // Read from state rather than a ref on purpose: React batches the `setBusy(true)` below
      // before the next click can be processed, and a ref here would make this hook's behaviour
      // depend on scheduling rather than on state anybody can see.
      if (busy) return null
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
        setBusy(false)
      }
    },
    [busy, fn, fallbackMessage],
  )

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return { busy, error, result, run, reset }
}
