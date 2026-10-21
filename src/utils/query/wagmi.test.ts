import { encodeAbiParameters, encodeErrorResult, encodeFunctionData, parseAbi } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClientWithEns } from '@ensdomains/ensjs/contracts'
import { getSupportedInterfaces } from '@ensdomains/ensjs/public'

import { wagmiConfig } from './wagmi'

vi.mock('./wallets', () => ({ rainbowKitConnectors: [] }))

const resolver = '0x1111111111111111111111111111111111111111'
const offchainLookup = encodeErrorResult({
  abi: parseAbi([
    'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)',
  ]),
  errorName: 'OffchainLookup',
  args: [resolver, ['https://holder.example/{sender}/{data}.json'], '0x', '0x12345678', '0x'],
})
// Multicall3 result with one failed sub-call that reverted OffchainLookup.
const multicallResult = encodeAbiParameters(
  [{ type: 'tuple[]', components: [{ type: 'bool' }, { type: 'bytes' }] }],
  [[[false, offchainLookup]]],
)

afterEach(() => vi.unstubAllGlobals())

describe('wagmiConfig', () => {
  it('never fetches the URL a resolver names in OffchainLookup', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('network disabled in test')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const call = {
      to: resolver,
      data: encodeFunctionData({
        abi: parseAbi(['function supportsInterface(bytes4) view returns (bool)']),
        args: ['0xf1cb7e06'],
      }),
    } as const
    const results = await Promise.all(
      wagmiConfig.chains.map((chain) =>
        getSupportedInterfaces.decode(
          wagmiConfig.getClient({ chainId: chain.id }) as ClientWithEns,
          multicallResult,
          [call],
        ),
      ),
    )
    expect(results).toEqual(wagmiConfig.chains.map(() => [false]))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
