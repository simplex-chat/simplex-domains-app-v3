import { mockFunction, renderHook } from '@app/test-utils'

import { labelhash } from 'viem'
import { readContract } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBlockTimestamp } from '@app/hooks/chain/useBlockTimestamp'
import { ConfigWithEns } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'

import { getDisputeEndQueryFn, useDisputeEnd } from './useDisputeEnd'

vi.mock('viem/actions')
vi.mock('@app/utils/query/useQuery')
vi.mock('@app/hooks/chain/useBlockTimestamp')
vi.mock('./useQueryOptions', () => ({
  useQueryOptions: ({ params, functionName }: { params: object; functionName: string }) => ({
    queryKey: [params, undefined, undefined, undefined, functionName],
    queryFn: vi.fn(),
  }),
}))
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSnrcAddresses: () => ({ BaseRegistrarImplementation: REGISTRAR }),
}))

const REGISTRAR = '0x1111111111111111111111111111111111111111'

const mockReadContract = vi.mocked(readContract)
const mockUseQuery = mockFunction(useQuery)
const mockUseBlockTimestamp = mockFunction(useBlockTimestamp)
const config = { getClient: () => ({}) } as unknown as ConfigWithEns

const getDisputeEnd = (name: string) =>
  getDisputeEndQueryFn(config)({
    queryKey: [{ name }, 1337, undefined, undefined, 'getDisputeEnd'],
  } as never)

const disputeEnd = (data: Date | null, blockTime = Date.now()) => {
  mockUseQuery.mockReturnValue({ data, isLoading: false } as never)
  mockUseBlockTimestamp.mockReturnValue({ data: BigInt(blockTime), isLoading: false } as never)
  return renderHook(() => useDisputeEnd({ name: 'alice.testing' })).result.current.data
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getDisputeEndQueryFn', () => {
  it("reads the registration's dispute end from the registrar", async () => {
    mockReadContract.mockResolvedValueOnce(2_000_000_000n)
    expect(await getDisputeEnd('alice.testing')).toEqual(new Date(2_000_000_000_000))
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: REGISTRAR,
        functionName: 'disputeUntil',
        args: [BigInt(labelhash('alice'))],
      }),
    )
  })

  it('gives no dispute end for a registration without a dispute period', async () => {
    mockReadContract.mockResolvedValueOnce(0n)
    expect(await getDisputeEnd('alice.testing')).toBeNull()
  })

  it('reads nothing for a subname or another TLD', async () => {
    expect(await getDisputeEnd('mobile.alice.testing')).toBeNull()
    expect(await getDisputeEnd('alice.simplex')).toBeNull()
    expect(mockReadContract).not.toHaveBeenCalled()
  })
})

describe('useDisputeEnd', () => {
  it('gives the dispute end while it is in the future', () => {
    const future = new Date(Date.now() + 60_000)
    expect(disputeEnd(future)).toBe(future)
  })

  it('gives no dispute end once it has passed, or without one', () => {
    expect(disputeEnd(new Date(Date.now() - 60_000))).toBeUndefined()
    expect(disputeEnd(null)).toBeUndefined()
  })

  it('compares the dispute end with the latest block, not with the clock of the device', () => {
    const end = new Date(Date.now() - 60_000)
    expect(disputeEnd(end, end.getTime() - 1000)).toBe(end)
  })

  it('gives no dispute end from the block at its end, where a renewal succeeds', () => {
    const end = new Date(Date.now() + 60_000)
    expect(disputeEnd(end, end.getTime())).toBeUndefined()
  })

  it('waits for the latest block', () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: false } as never)
    mockUseBlockTimestamp.mockReturnValue({ data: undefined, isLoading: true } as never)
    const { result } = renderHook(() => useDisputeEnd({ name: 'alice.testing' }))
    expect(result.current.isLoading).toBe(true)
  })

  it('reads neither the dispute end nor the latest block while disabled', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false } as never)
    mockUseBlockTimestamp.mockReturnValue({ data: undefined, isLoading: false } as never)
    renderHook(() => useDisputeEnd({ name: 'alice.testing', enabled: false }))
    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(mockUseBlockTimestamp).toHaveBeenCalledWith({ enabled: false })
  })
})
