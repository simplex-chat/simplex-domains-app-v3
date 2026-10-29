import { decodeFunctionData, labelhash } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { ClientWithEns, ConnectorClientWithEns } from '@app/types'
import { namePolicyTermsAbi } from '@app/utils/snrcNameTerms'

import acceptClaimTerms from './acceptClaimTerms'

const NAME_POLICY = '0x4444444444444444444444444444444444444444'
const HOLDER = '0x2222222222222222222222222222222222222222'
const TERMS = `0x${'77'.repeat(32)}` as const

vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNamePolicyAddress: () => NAME_POLICY,
}))

const client = { chain: { id: 1337 } } as unknown as ClientWithEns
const connectorClient = {} as unknown as ConnectorClientWithEns

describe('acceptClaimTerms', () => {
  it.each([
    ['general', 'acceptGeneralTermsForClaim'],
    ['community', 'acceptCommunityTermsForClaim'],
  ] as const)('accepts the %s terms for the reviewed offer of the holder', (kind, call) => {
    const tx = acceptClaimTerms.transaction({
      client,
      connectorClient,
      data: {
        name: 'alice.testing',
        holder: HOLDER,
        offerNumber: 3n,
        terms: { kind, hash: TERMS },
      },
    })
    expect(tx.to).toBe(NAME_POLICY)
    expect(decodeFunctionData({ abi: namePolicyTermsAbi, data: tx.data })).toEqual({
      functionName: call,
      args: [BigInt(labelhash('alice')), HOLDER, 3n, TERMS],
    })
  })
})
