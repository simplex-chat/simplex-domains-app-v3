import { encodeAbiParameters, keccak256, labelhash, pad, toHex } from 'viem'
import { describe, expect, it } from 'vitest'

import { makeCommitment } from '@ensdomains/ensjs/utils'

import { mapUserState } from '../chain/useEstimateGasWithStateOverride'
import { acceptedRenewalTermsOverride, calculateTransactions } from './calculateTransactions'

// Minimal RegistrationParameters fixture — only the fields makeCommitment
// reads matter for slot-layout assertions.
const baseParams = {
  name: 'somename.testing',
  owner: '0x000000000000000000000000000000000000beef',
  duration: 31_536_000,
  secret: '0x0000000000000000000000000000000000000000000000000000000000000001',
  resolverAddress: '0x000000000000000000000000000000000000c0de',
  records: [],
  fuses: { named: [], unnamed: [] },
  reverseRecord: false,
} as unknown as Parameters<typeof calculateTransactions>[0]['registrationParams']

describe('calculateTransactions', () => {
  it('overrides commitments[commitment] at slot 160 with the given timestamp', () => {
    const result = calculateTransactions({
      registrationParams: baseParams,
      ethRegistrarControllerAddress: '0x000000000000000000000000000000000000ca11',
      fiveMinutesAgoInSeconds: 1_700_000_000,
      price: { base: 0n, premium: 0n },
    })

    const registerTx = result!.find((t) => t.name === 'registerName')
    const commitmentKey = keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'uint256' }],
        [makeCommitment(baseParams!), 160n],
      ),
    )
    expect(mapUserState(registerTx!.stateOverride![0].stateDiff!)).toEqual({
      [commitmentKey]: pad(toHex(1_700_000_000n)),
    })
  })

  it('returns null when any required input is missing', () => {
    expect(
      calculateTransactions({
        registrationParams: undefined,
        ethRegistrarControllerAddress: '0xCA11',
        fiveMinutesAgoInSeconds: 0,
        price: { base: 0n, premium: 0n },
      }),
    ).toBeNull()
    expect(
      calculateTransactions({
        registrationParams: baseParams,
        ethRegistrarControllerAddress: undefined,
        fiveMinutesAgoInSeconds: 0,
        price: { base: 0n, premium: 0n },
      }),
    ).toBeNull()
    expect(
      calculateTransactions({
        registrationParams: baseParams,
        ethRegistrarControllerAddress: '0xCA11',
        fiveMinutesAgoInSeconds: 0,
        price: undefined,
      }),
    ).toBeNull()
  })

  it('commits through the name policy and simulates the acceptance at acceptedTerms, slot 2', () => {
    const terms = { kind: 'community', hash: `0x${'77'.repeat(32)}` } as const
    const namePolicyAddress = '0x0000000000000000000000000000000000004444'
    const result = calculateTransactions({
      registrationParams: baseParams,
      terms,
      ethRegistrarControllerAddress: '0x000000000000000000000000000000000000ca11',
      namePolicyAddress,
      fiveMinutesAgoInSeconds: 1_700_000_000,
      price: { base: 1n, premium: 0n },
    })
    expect(result![0].data).toEqual({ ...baseParams, terms })

    const policyOverride = result![1].stateOverride!.find((o) => o.address === namePolicyAddress)
    const acceptedTermsSlot = keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'uint256' }],
        [makeCommitment(baseParams!), 2n],
      ),
    )
    const acceptedTermsKey = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'bytes32' }],
        [baseParams!.owner, acceptedTermsSlot],
      ),
    )
    expect(mapUserState(policyOverride!.stateDiff!)).toEqual({ [acceptedTermsKey]: terms.hash })
  })

  it('simulates no acceptance without terms', () => {
    const result = calculateTransactions({
      registrationParams: baseParams,
      ethRegistrarControllerAddress: '0x000000000000000000000000000000000000ca11',
      namePolicyAddress: '0x0000000000000000000000000000000000004444',
      fiveMinutesAgoInSeconds: 1_700_000_000,
      price: { base: 1n, premium: 0n },
    })
    expect(result![1].stateOverride).toHaveLength(2)
  })

  it('emits the commit + register transaction pair in order', () => {
    const result = calculateTransactions({
      registrationParams: baseParams,
      ethRegistrarControllerAddress: '0x000000000000000000000000000000000000ca11',
      fiveMinutesAgoInSeconds: 1_700_000_000,
      price: { base: 1n, premium: 0n },
    })
    expect(result?.map((t) => t.name)).toEqual(['commitName', 'registerName'])
  })
})

describe('acceptedRenewalTermsOverride', () => {
  it("simulates the holder's renewal acceptance at acceptedRenewalTerms, slot 8", () => {
    const terms = { kind: 'general', hash: `0x${'77'.repeat(32)}` } as const
    const namePolicyAddress = '0x0000000000000000000000000000000000004444'
    const holder = baseParams!.owner
    const override = acceptedRenewalTermsOverride({
      namePolicyAddress,
      holder,
      renewal: { name: 'somename.testing', expires: 2_000_000_000n, duration: 31_536_000, terms },
    })

    const tokenSlot = keccak256(
      encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }],
        [BigInt(labelhash('somename')), 8n],
      ),
    )
    const holderSlot = keccak256(
      encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [holder, tokenSlot]),
    )
    const expiresSlot = keccak256(
      encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }], [2_000_000_000n, holderSlot]),
    )
    const durationSlot = keccak256(
      encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }], [31_536_000n, expiresSlot]),
    )
    expect(override.address).toBe(namePolicyAddress)
    expect(mapUserState(override.stateDiff)).toEqual({ [durationSlot]: terms.hash })
  })
})
