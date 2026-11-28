import { decodeFunctionData, labelhash, parseAbi, zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { ClientWithEns, ConnectorClientWithEns } from '@app/types'

import withdrawOffer from './withdrawOffer'

const REGISTRAR = '0x1111111111111111111111111111111111111111'

vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSnrcAddresses: () => ({ BaseRegistrarImplementation: REGISTRAR }),
}))

const registrarAbi = parseAbi([
  'function approve(address to, uint256 tokenId)',
  'function approveWithSig(address from, address to, uint256 tokenId, uint256 nonce, uint256 deadline, bytes sig, bytes ephemeralPubKey, bytes1 viewTag)',
])

const client = { chain: { id: 1337 } } as unknown as ClientWithEns
const connectorClient = {} as ConnectorClientWithEns
const t = ((key: string) => key) as never
const intent = {
  signer: '0x2222222222222222222222222222222222222222',
  nonce: 1n,
  deadline: 1_900_000_000n,
  signature: `0x${'ab'.repeat(65)}`,
} as const

describe('withdrawOffer', () => {
  it('approves nobody on the registrar', () => {
    const tx = withdrawOffer.transaction({
      client,
      connectorClient,
      data: { name: 'alice.testing' },
    })
    expect(tx.to).toBe(REGISTRAR)
    expect(decodeFunctionData({ abi: registrarAbi, data: tx.data })).toEqual({
      functionName: 'approve',
      args: [zeroAddress, BigInt(labelhash('alice'))],
    })
  })

  it('relays the withdrawal that the holder signed, without an announcement', () => {
    const tx = withdrawOffer.transaction({
      client,
      connectorClient,
      data: { name: 'alice.testing', intent },
    })
    expect(tx.to).toBe(REGISTRAR)
    expect(decodeFunctionData({ abi: registrarAbi, data: tx.data })).toEqual({
      functionName: 'approveWithSig',
      args: [
        intent.signer,
        zeroAddress,
        BigInt(labelhash('alice')),
        intent.nonce,
        intent.deadline,
        intent.signature,
        '0x',
        '0x00',
      ],
    })
  })

  it('displays the name and the action', () => {
    expect(withdrawOffer.displayItems({ name: 'alice.testing' }, t)).toEqual([
      { label: 'name', value: 'alice.testing', type: 'name' },
      { label: 'action', value: 'transaction.description.withdrawOffer' },
    ])
    expect(withdrawOffer.helper!({ name: 'alice.testing' }, t)).toBeUndefined()
  })

  it('displays the holder and a note when the withdrawal is relayed for it', () => {
    expect(withdrawOffer.displayItems({ name: 'alice.testing', intent }, t)).toContainEqual({
      label: 'from',
      value: intent.signer,
      type: 'address',
    })
    expect(withdrawOffer.helper!({ name: 'alice.testing', intent }, t)).toEqual({
      alert: 'info',
      children: 'transaction.info.withdrawOfferRelayed',
      style: { overflowWrap: 'anywhere' },
    })
  })
})
