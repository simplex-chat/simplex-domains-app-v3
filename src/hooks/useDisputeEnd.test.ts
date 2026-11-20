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

const disputeEnd = (
  query: { data?: Date | null; isLoading?: boolean; isError?: boolean },
  block: { data?: bigint; isLoading?: boolean } = { data: BigInt(Date.now()) },
  name = 'alice.testing',
) => {
  mockUseQuery.mockReturnValue({ isLoading: false, isError: false, ...query } as never)
  mockUseBlockTimestamp.mockReturnValue({ isLoading: false, ...block } as never)
  return renderHook(() => useDisputeEnd({ name })).result.current
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
  it('gives the dispute end while the latest block is before it', () => {
    const end = new Date(Date.now() + 60_000)
    expect(disputeEnd({ data: end })).toMatchObject({ status: 'until', date: end })
  })

  it('compares the dispute end with the latest block, not with the clock of the device', () => {
    const end = new Date(Date.now() - 60_000)
    expect(disputeEnd({ data: end }, { data: BigInt(end.getTime() - 1000) })).toMatchObject({
      status: 'until',
      date: end,
    })
  })

  it('gives no dispute period from the block at its end, where a renewal succeeds', () => {
    const end = new Date(Date.now() + 60_000)
    expect(disputeEnd({ data: end }, { data: BigInt(end.getTime()) })).toMatchObject({
      status: 'none',
    })
  })

  it('gives no dispute period for a stored 0 without reading the latest block', () => {
    expect(disputeEnd({ data: null }, { isLoading: true })).toMatchObject({ status: 'none' })
    expect(mockUseBlockTimestamp).toHaveBeenLastCalledWith({ enabled: false })
  })

  it('is loading while the dispute end, or the latest block for it, loads', () => {
    expect(disputeEnd({ isLoading: true })).toMatchObject({ status: 'loading' })
    expect(disputeEnd({ data: new Date() }, { isLoading: true })).toMatchObject({
      status: 'loading',
    })
  })

  it('is unknown when the dispute end, or the latest block for it, cannot be read', () => {
    expect(disputeEnd({ isError: true })).toMatchObject({ status: 'unknown' })
    expect(disputeEnd({ data: new Date() }, { data: undefined })).toMatchObject({
      status: 'unknown',
    })
  })

  it('reads nothing for a name that cannot have a dispute period', () => {
    expect(disputeEnd({}, {}, 'mobile.alice.testing')).toMatchObject({ status: 'none' })
    expect(mockUseQuery).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
    expect(mockUseBlockTimestamp).toHaveBeenLastCalledWith({ enabled: false })
  })

  it('reads neither the dispute end nor the latest block while disabled', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false } as never)
    mockUseBlockTimestamp.mockReturnValue({ data: undefined, isLoading: false } as never)
    renderHook(() => useDisputeEnd({ name: 'alice.testing', enabled: false }))
    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(mockUseBlockTimestamp).toHaveBeenCalledWith({ enabled: false })
  })
})
