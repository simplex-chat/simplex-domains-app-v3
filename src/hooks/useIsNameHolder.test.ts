import { Address, ContractFunctionRevertedError, HttpRequestError, labelhash } from 'viem'
import { readContract } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigWithEns } from '@app/types'

import { getIsNameHolderQueryFn } from './useIsNameHolder'

vi.mock('viem/actions')
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSnrcAddresses: () => ({ BaseRegistrarImplementation: REGISTRAR }),
}))

const REGISTRAR = '0x1111111111111111111111111111111111111111'
const HOLDER = '0x2222222222222222222222222222222222222222'
const OTHER = '0x3333333333333333333333333333333333333333'

const mockReadContract = vi.mocked(readContract)
const config = { getClient: () => ({}) } as unknown as ConfigWithEns

const isNameHolder = (name: string, address?: Address) =>
  getIsNameHolderQueryFn(config)({
    queryKey: [{ name }, 1337, address, undefined, 'getIsNameHolder'],
  } as never)

const holding = (owner: Address | undefined, ...labels: string[]) =>
  mockReadContract.mockImplementation((async (
    _: unknown,
    { functionName, args }: { functionName: string; args: [Address, bigint?] },
  ) => {
    if (functionName === 'ownerOf') {
      if (owner) return owner
      throw new ContractFunctionRevertedError({ abi: [], functionName: 'ownerOf', data: '0x' })
    }
    return functionName === 'balanceOf'
      ? BigInt(labels.length)
      : BigInt(labelhash(labels[Number(args[1])]))
  }) as never)

const read = (functionName: string, args: unknown[]) =>
  expect.objectContaining({ address: REGISTRAR, functionName, args })

describe('getIsNameHolderQueryFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the holder of a live name with ownerOf alone, as the name policy does', async () => {
    holding(HOLDER)
    expect(await isNameHolder('alice.testing', HOLDER)).toBe(true)
    expect(mockReadContract.mock.calls.map(([, call]) => call)).toEqual([
      read('ownerOf', [BigInt(labelhash('alice'))]),
    ])
  })

  it('reports another holder of a live name', async () => {
    holding(OTHER, 'alice')
    expect(await isNameHolder('alice.testing', HOLDER)).toBe(false)
  })

  it("finds the name among the address's tokens, as the name policy does in the grace period", async () => {
    holding(undefined, 'bob', 'alice')
    expect(await isNameHolder('alice.testing', HOLDER)).toBe(true)
    expect(mockReadContract.mock.calls.map(([, call]) => call)).toEqual([
      read('ownerOf', [BigInt(labelhash('alice'))]),
      read('balanceOf', [HOLDER]),
      read('tokenOfOwnerByIndex', [HOLDER, 0n]),
      read('tokenOfOwnerByIndex', [HOLDER, 1n]),
    ])
  })

  it('reports a name the address does not hold', async () => {
    holding(undefined, 'bob')
    expect(await isNameHolder('alice.testing', HOLDER)).toBe(false)
  })

  it('rethrows a failed request instead of reporting no holder', async () => {
    mockReadContract.mockRejectedValueOnce(new HttpRequestError({ url: 'http://rpc' }))
    await expect(isNameHolder('alice.testing', HOLDER)).rejects.toThrow(HttpRequestError)
  })

  it('reads nothing without an address, for a subname or for another TLD', async () => {
    expect(await isNameHolder('alice.testing')).toBe(false)
    expect(await isNameHolder('mobile.alice.testing', HOLDER)).toBe(false)
    expect(await isNameHolder('alice.simplex', HOLDER)).toBe(false)
    expect(mockReadContract).not.toHaveBeenCalled()
  })
})
