import { decodeFunctionData, labelhash } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { ClientWithEns, ConnectorClientWithEns } from '@app/types'
import { namePolicyTermsAbi } from '@app/utils/snrcNameTerms'

import acceptRenewalTerms from './acceptRenewalTerms'

const NAME_POLICY = '0x4444444444444444444444444444444444444444'
const TERMS = `0x${'77'.repeat(32)}` as const

vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNamePolicyAddress: () => NAME_POLICY,
}))

const client = { chain: { id: 1337 } } as unknown as ClientWithEns
const connectorClient = {} as unknown as ConnectorClientWithEns

describe('acceptRenewalTerms', () => {
  it.each([
    ['general', 'acceptGeneralTermsForRenewal'],
    ['community', 'acceptCommunityTermsForRenewal'],
  ] as const)('accepts the %s terms for a renewal from the current expiry', (kind, call) => {
    const tx = acceptRenewalTerms.transaction({
      client,
      connectorClient,
      data: {
        name: 'alice.testing',
        expires: 2_000_000_000n,
        duration: 31_536_000,
        terms: { kind, hash: TERMS },
      },
    })
    expect(tx.to).toBe(NAME_POLICY)
    expect(decodeFunctionData({ abi: namePolicyTermsAbi, data: tx.data })).toEqual({
      functionName: call,
      args: [BigInt(labelhash('alice')), 2_000_000_000n, 31_536_000n, TERMS],
    })
  })
})
