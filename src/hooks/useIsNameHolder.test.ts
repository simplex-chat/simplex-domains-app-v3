import { mockFunction } from '@app/test-utils'

import { Address, labelhash } from 'viem'
import { readContract } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigWithEns } from '@app/types'

import { getIsNameHolderQueryFn } from './useIsNameHolder'

vi.mock('viem/actions')
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSnrcAddresses: () => ({ BaseRegistrarImplementation: REGISTRAR }),
}))

const mockReadContract = mockFunction(readContract)

const REGISTRAR = '0x1111111111111111111111111111111111111111'
const HOLDER = '0x2222222222222222222222222222222222222222'

const mockConfig = { getClient: () => ({}) } as unknown as ConfigWithEns

const isNameHolder = (name: string, address?: Address) =>
  getIsNameHolderQueryFn(mockConfig)({
    queryKey: [{ name }, 1337, address, undefined, 'getIsNameHolder'],
  } as never)

const holding = (...labels: string[]) =>
  mockReadContract.mockImplementation((async (
    _: unknown,
    { functionName, args }: { functionName: string; args: [Address, bigint?] },
  ) =>
    functionName === 'balanceOf'
      ? BigInt(labels.length)
      : BigInt(labelhash(labels[Number(args[1])]))) as never)

describe('getIsNameHolderQueryFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("finds the name among the address's tokens, without ownerOf, which reverts after expiry", async () => {
    holding('bob', 'alice')
    expect(await isNameHolder('alice.testing', HOLDER)).toBe(true)
    const read = (functionName: string, args: unknown[]) =>
      expect.objectContaining({ address: REGISTRAR, functionName, args })
    expect(mockReadContract.mock.calls.map(([, call]) => call)).toEqual([
      read('balanceOf', [HOLDER]),
      read('tokenOfOwnerByIndex', [HOLDER, 0n]),
      read('tokenOfOwnerByIndex', [HOLDER, 1n]),
    ])
  })

  it('reports a name the address does not hold', async () => {
    holding('bob')
    expect(await isNameHolder('alice.testing', HOLDER)).toBe(false)
  })

  it('reads nothing without an address, for a subname or for another TLD', async () => {
    expect(await isNameHolder('alice.testing')).toBe(false)
    expect(await isNameHolder('mobile.alice.testing', HOLDER)).toBe(false)
    expect(await isNameHolder('alice.simplex', HOLDER)).toBe(false)
    expect(mockReadContract).not.toHaveBeenCalled()
  })
})
