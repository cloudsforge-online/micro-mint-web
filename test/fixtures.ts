/**
 * The responses the scenarios are run against.
 *
 * Every shape is one `src/lib/mint.ts` declares, which was read out of `mint/src/`. Typed against
 * the client's own declarations so a drift between them is a type error here rather than a
 * scenario quietly asserting a shape nothing produces.
 */
import type { Catalogue, DeployAttempt, ProjectPage, TokenOrder } from '../src/lib/mint.ts'

export const ORDER_ID = '33333333-4444-5555-6666-777777777777'
export const OWNER = '0x1111111111111111111111111111111111111111'

export function catalogue(over: Partial<Catalogue> = {}): Catalogue {
  return {
    priceShards: '2500',
    network: 'testnet',
    variants: [
      { variant: 'fixed', contract: 'ForgeFixed', features: [], cap: 'forbidden' },
      { variant: 'mintable', contract: 'ForgeMintable', features: ['mintable', 'burnable'], cap: 'forbidden' },
      {
        variant: 'foundry',
        contract: 'ForgeFoundry',
        features: ['mintable', 'burnable', 'pausable'],
        cap: 'required',
      },
    ],
    ...over,
  }
}

export function order(over: Partial<TokenOrder> = {}): TokenOrder {
  return {
    id: ORDER_ID,
    ownerSubject: 'user:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ownerAddress: OWNER,
    chain: 'ember',
    network: 'testnet',
    standard: 'ForgeFixed',
    name: 'Test Token',
    symbol: 'TT',
    decimals: 18,
    supply: '1000000',
    cap: null,
    features: [],
    status: 'awaiting_payment',
    priceShards: '2500',
    paidJournalEntryId: null,
    deployerAddress: null,
    contractAddress: null,
    deployTxHash: null,
    broadcastAt: null,
    confirmedAt: null,
    failureReason: null,
    deployAttempts: 0,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

export function attempt(over: Partial<DeployAttempt> = {}): DeployAttempt {
  return {
    attempt: 1,
    family: 'evm',
    outcome: 'broadcast',
    txHash: `0x${'ab'.repeat(32)}`,
    detail: 'broadcast to the ember testnet',
    at: '2026-08-01T09:05:00.000Z',
    ...over,
  }
}

export function projectPage(over: Partial<ProjectPage> = {}): ProjectPage {
  return {
    id: 'page-1',
    tokenId: ORDER_ID,
    description: 'A token for testing the browser journeys.',
    links: [],
    team: [],
    roadmap: [],
    riskDisclosures: 'Nothing here is advice.',
    verificationStatus: 'unverified',
    communityId: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

/** The estate's error envelope — nested, as `errorReply()` builds it in every service. */
export function error(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}

/** The two `cf.*` keys a signed-in browser holds. `src/lib/api.ts` reads exactly these. */
export const SIGNED_IN = {
  'cf.accessToken': 'access-token-stub',
  'cf.refreshToken': 'refresh-token-stub',
}

/** `GET /auth/me` as `identity/src/server.ts:895-902` returns it: the profile is nested. */
export const ME = {
  user: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', handle: 'creator', roles: ['customer'] },
  session: { id: 'session-1' },
  organisations: [],
}
