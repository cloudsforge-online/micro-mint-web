/**
 * The four states, and the rule that a screen whose QUESTION changes must re-ask it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THE SECOND HALF OF THIS FILE PINS.
 *
 * `useResource` as the web template writes it re-runs its effect on `[nonce]` alone. `load` is
 * excluded on purpose — most callers recreate it every render and including it would make the
 * effect a render loop — and that is correct for a screen with one fixed question, which is every
 * screen the template was written for.
 *
 * It is wrong for a screen whose question changes. On this surface the question is a PATH
 * PARAMETER: `/tokens/:id` and `/projects/:id` reuse the same component when a customer moves from
 * one launch to another, and with `[nonce]` as the only dependency the second address would render
 * the first launch's row — its status, its contract address and its Deploy button — under the new
 * id in the address bar. That is a page telling somebody a false thing about a contract.
 *
 * The hook now takes the VALUES the question depends on. These tests assert that every page whose
 * question can change passes them, and that the pages whose question cannot do not pretend to.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { resourceState } from '../src/lib/resource.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const notice = { message: 'boom', requestId: 'req-1', forbidden: false }
const refusal = { message: 'nope', requestId: 'req-1', forbidden: true }

describe('the four states are four, and never collapse into each other', () => {
  it('is loading before anything has arrived', () => {
    assert.equal(resourceState({ loading: true, error: null, count: null }), 'loading')
  })

  it('is ok when there is something', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 3 }), 'ok')
  })

  it('is empty when the query answered with nothing', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 0 }), 'empty')
  })

  it('is failed when the query did not answer', () => {
    assert.equal(resourceState({ loading: false, error: notice, count: null }), 'failed')
  })

  it('is forbidden when it was understood and refused', () => {
    assert.equal(resourceState({ loading: false, error: refusal, count: null }), 'forbidden')
  })

  it('reports FAILURE rather than EMPTY when both could apply', () => {
    // A request that threw has told us nothing about whether data exists. Reporting "nothing
    // here" for a timeout is how an outage reads as a quiet week.
    assert.equal(resourceState({ loading: false, error: notice, count: 0 }), 'failed')
  })

  it('reports FAILURE rather than LOADING when both could apply', () => {
    assert.equal(resourceState({ loading: true, error: notice, count: null }), 'failed')
  })

  it('reports FORBIDDEN rather than a generic failure', () => {
    // The two have different remedies: one is retryable and one is never.
    assert.equal(resourceState({ loading: true, error: refusal, count: 0 }), 'forbidden')
  })

  it('stays loading on a null count even when loading is false', () => {
    // No data and no error is a request that has not resolved. Calling it empty would render
    // "nothing here" for a request still in flight.
    assert.equal(resourceState({ loading: false, error: null, count: null }), 'loading')
  })
})

describe('a screen whose question can change re-asks it', () => {
  /** The `useResource(...)` call in a page, as source text. */
  function call(page: string): string {
    const source = read(`src/pages/${page}.tsx`)
    const at = source.indexOf('useResource<')
    assert.ok(at > 0, `${page} does not call useResource`)
    return source.slice(at, source.indexOf('\n\n', at))
  }

  it('the launch status page passes the id from the address', () => {
    // Without it, navigating from one launch to another inside the same route shows the first
    // launch's status, contract address and buttons under the second launch's id.
    assert.match(call('token'), /\[id\]/)
  })

  it('the public project page passes the id from the address', () => {
    assert.match(call('project'), /\[id\]/)
  })

  it('no page passes `load` itself as a dependency', () => {
    // It is recreated every render by every caller here, so it would make the effect a render
    // loop — which is why the hook takes values rather than the closure.
    for (const page of ['catalogue', 'launch', 'tokens', 'token', 'project']) {
      assert.doesNotMatch(call(page), /,\s*\[load\]/, `${page} passes load as a dependency`)
    }
  })

  it('the pages with one fixed question pass nothing, rather than an empty array for show', () => {
    for (const page of ['catalogue', 'tokens']) {
      assert.doesNotMatch(call(page), /\[\s*\]\s*[,)]/, `${page} passes a decorative empty array`)
    }
  })

  it('the hook threads the dependencies into the effect rather than accepting and ignoring them', () => {
    // A parameter that is taken and dropped is worse than none: every call site then reads as
    // though it re-fetches.
    const source = read('src/lib/resource.ts')
    assert.match(source, /\}, \[nonce, \.\.\.deps\]\)/)
  })

  it('the hook still aborts the in-flight request when the question changes', () => {
    // The cleanup is what stops a slow answer to the old question landing after the new one.
    const source = read('src/lib/resource.ts')
    assert.match(source, /return \(\) => controller\.abort\(\)/)
  })
})
