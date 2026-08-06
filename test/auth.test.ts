/**
 * Reading the customer out of `/auth/me`, in the shape identity actually answers.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A DEFECT THAT IS FIXED, AND A TEST THAT KEEPS IT FIXED.
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is NESTED
 * under `user` (`identity/src/server.ts:972-984`, body built by `toPublicUser` at
 * `identity/src/users.ts:52-63`; both re-read against the source for this repository).
 *
 * The web template once declared `interface Me { handle?, roles? }` and read both fields off the
 * TOP level, where they are not, and four frontends inherited it: `roles` was always null, `isAdmin`
 * in the shared company bar was always false, and the switcher hid every `adminOnly` entry from
 * every signed-in operator.
 *
 * **That is fixed upstream now** — `micro-web-template/src/lib/auth.tsx:26-32` declares the nested
 * shape and lines 98-99 read `me?.user?.handle` and `me?.user?.roles`, and hub-web, site,
 * foresight-web, foresight-admin-web and market-web all match. So this file is not a correction of
 * anybody; it is the assertion that stops the reading drifting BACK, plus the flat fallback the
 * template does not carry, for a proxy or an older build on the rollback path.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { readCustomer } from '../src/lib/auth.tsx'

/** What identity actually puts on the wire. */
const NESTED = {
  user: {
    id: '11111111-2222-3333-4444-555555555555',
    email: 'maker@example.test',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    handle: 'jo',
    status: 'active',
    roles: ['player'],
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: null,
  },
  session: { id: 'sess-1', amr: ['pwd'] },
  organisations: [],
}

describe('the nested shape identity answers', () => {
  it('reads the id out of `user`, not off the top level', () => {
    assert.equal(readCustomer(NESTED).principal, 'user:11111111-2222-3333-4444-555555555555')
  })

  it('reads the handle out of `user`', () => {
    assert.equal(readCustomer(NESTED).handle, 'jo')
  })

  it('reads the roles out of `user`', () => {
    assert.deepEqual(readCustomer(NESTED).roles, ['player'])
  })

  it('prefixes the principal with `user:`, which is how mint spells an owner subject', () => {
    // `userSubject(userId)` — mint/src/server.ts:444 — and `ownerSubject` on every row.
    assert.match(readCustomer(NESTED).principal ?? '', /^user:/)
  })
})

describe('the flat shape, accepted as a fallback', () => {
  // A proxy or an older build on the rollback path may still answer flat. Understanding only the
  // current estate is how a client breaks during the migration it was written for.
  const FLAT = { id: 'abc', handle: 'jo', roles: ['player'] }

  it('reads a flat id', () => {
    assert.equal(readCustomer(FLAT).principal, 'user:abc')
  })

  it('reads a flat handle and flat roles', () => {
    assert.equal(readCustomer(FLAT).handle, 'jo')
    assert.deepEqual(readCustomer(FLAT).roles, ['player'])
  })

  it('prefers the nested value when both are present', () => {
    // The nested one is what identity sends. A proxy that adds a stale top-level copy must not win.
    const both = { id: 'flat', handle: 'flat', roles: ['flat'], user: { id: 'nested', handle: 'nested', roles: ['nested'] } }
    assert.equal(readCustomer(both).principal, 'user:nested')
    assert.equal(readCustomer(both).handle, 'nested')
    assert.deepEqual(readCustomer(both).roles, ['nested'])
  })
})

describe('an answer this app cannot read', () => {
  // `principal: null` is "cannot tell", and it is deliberately not a guess: it is compared against
  // a launch's ownerSubject, and a guess there would either claim somebody else's launch or
  // disown the customer's own.
  it('returns nulls rather than throwing on a body that is not an object', () => {
    for (const body of [null, undefined, 'nope', 42, []]) {
      const read = readCustomer(body)
      assert.equal(read.principal, null)
      assert.equal(read.handle, null)
      assert.deepEqual(read.roles, [])
    }
  })

  it('returns null for an empty id rather than the string `user:`', () => {
    assert.equal(readCustomer({ user: { id: '', handle: 'jo' } }).principal, null)
  })

  it('drops non-string entries from roles instead of passing them to the bar', () => {
    assert.deepEqual(readCustomer({ user: { roles: ['player', 7, null] } }).roles, ['player'])
  })

  it('survives roles that are not an array at all', () => {
    assert.deepEqual(readCustomer({ user: { roles: 'player' } }).roles, [])
  })
})

describe('the reading is not accidentally the template’s', () => {
  /**
   * The anti-regression assertion. Every test above would still pass if somebody replaced the
   * implementation with the flat-only one AND the fixtures were flat — so this reads the source and
   * requires that the nested path is really there, with the citation that makes it checkable.
   */
  const source = readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')

  it('reads `user` before the top level', () => {
    assert.match(source, /top\.user/, 'auth.tsx does not look inside `user`')
    assert.match(source, /nested\?\.roles/, 'roles are not read from the nested profile')
  })

  it('cites where the nested shape is built, so the claim can be re-checked', () => {
    assert.match(source, /identity\/src\/server\.ts:972-984/)
    assert.match(source, /identity\/src\/users\.ts:52-63/)
  })
})
