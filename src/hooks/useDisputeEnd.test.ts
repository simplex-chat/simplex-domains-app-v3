import { mockFunction, renderHook } from '@app/test-utils'

import { labelhash } from 'viem'
import { readContract } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigWithEns } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'

import { getDisputeEndQueryFn, useDisputeEnd } from './useDisputeEnd'

vi.mock('viem/actions')
vi.mock('@app/utils/query/useQuery')
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
const config = { getClient: () => ({}) } as unknown as ConfigWithEns

const getDisputeEnd = (name: string) =>
  getDisputeEndQueryFn(config)({
    queryKey: [{ name }, 1337, undefined, undefined, 'getDisputeEnd'],
  } as never)

const disputeEnd = (data: Date | null) => {
  mockUseQuery.mockReturnValue({ data, isLoading: false } as never)
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
})
