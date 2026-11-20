import { labelhash } from 'viem'
import { readContract } from 'viem/actions'
import { describe, expect, it, vi } from 'vitest'

import { ConfigWithEns } from '@app/types'

import { getNamesForAddressQueryFn } from './useNamesForAddress'

vi.mock('viem/actions')
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSnrcAddresses: () => ({ BaseRegistrarImplementation: REGISTRAR }),
}))

const REGISTRAR = '0x1111111111111111111111111111111111111111'
const HOLDER = '0x2222222222222222222222222222222222222222'

const mockReadContract = vi.mocked(readContract)
const config = { getClient: () => ({ chain: { id: 1337 } }) } as unknown as ConfigWithEns

describe('getNamesForAddressQueryFn', () => {
  it('lists no name whose registration was ended in its dispute period', async () => {
    const expiries: Record<string, bigint> = {
      alice: 0n,
      bob: BigInt(Math.floor(Date.now() / 1000) + 60),
    }
    const labels = Object.keys(expiries)
    mockReadContract.mockImplementation((async (
      _: unknown,
      { functionName, args }: { functionName: string; args: readonly unknown[] },
    ) => {
      if (functionName === 'balanceOf') return BigInt(labels.length)
      if (functionName === 'tokenOfOwnerByIndex') return BigInt(labelhash(labels[Number(args[1])]))
      const label = labels.find((l) => BigInt(labelhash(l)) === args[0])!
      return functionName === 'labelOf' ? label : expiries[label]
    }) as never)
    const names = await getNamesForAddressQueryFn(config)({
      queryKey: [{ address: HOLDER }, 1337],
      pageParam: [],
    } as never)
    expect(names.map(({ name }) => name)).toEqual(['bob.testing'])
  })
})
