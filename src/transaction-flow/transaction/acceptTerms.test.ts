import { decodeFunctionData } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { ClientWithEns, ConnectorClientWithEns } from '@app/types'
import { namePolicyTermsAbi } from '@app/utils/snrcNameTerms'

import acceptTerms from './acceptTerms'

const NAME_POLICY = '0x4444444444444444444444444444444444444444'
const TERMS = `0x${'77'.repeat(32)}` as const
const COMMITMENT = `0x${'cc'.repeat(32)}` as const

vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNamePolicyAddress: () => NAME_POLICY,
}))

const client = { chain: { id: 1337 } } as unknown as ClientWithEns
const connectorClient = {} as unknown as ConnectorClientWithEns

describe('acceptTerms', () => {
  it.each([
    ['general', 'commitUnderGeneralTerms'],
    ['community', 'commitUnderCommunityTerms'],
  ] as const)('accepts the %s terms for a commitment through the name policy', (kind, call) => {
    const tx = acceptTerms.transaction({
      client,
      connectorClient,
      data: { name: 'alice.testing', commitment: COMMITMENT, terms: { kind, hash: TERMS } },
    })
    expect(tx.to).toBe(NAME_POLICY)
    expect(decodeFunctionData({ abi: namePolicyTermsAbi, data: tx.data })).toEqual({
      functionName: call,
      args: [COMMITMENT, TERMS],
    })
  })
})
