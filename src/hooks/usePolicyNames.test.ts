import { mockFunction } from '@app/test-utils'

import { getLogs } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigWithEns } from '@app/types'
import { namePolicyNameEvents } from '@app/utils/snrcNamePolicy'

import { getPolicyNamesQueryFn } from './usePolicyNames'

vi.mock('viem/actions')
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNamePolicyAddress: (chainId: number) => (chainId === 1 ? NAME_POLICY : undefined),
}))

const NAME_POLICY = '0x4444444444444444444444444444444444444444'

const mockGetLogs = mockFunction(getLogs)
const mockConfig = { getClient: () => ({}) } as unknown as ConfigWithEns

const getPolicyNames = (chainId: number) =>
  getPolicyNamesQueryFn(mockConfig)({
    queryKey: [{}, chainId, undefined, undefined, 'getPolicyNames'],
  } as never)

const log = (eventName: string, name: string, reason?: number) => ({
  eventName,
  args: { name, reason },
})

describe('getPolicyNamesQueryFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("replays the policy's name events in order, from the chain's first block", async () => {
    mockGetLogs.mockResolvedValue([
      log('ReservedNameAdded', 'simplex', 1),
      log('ReservedNameAdded', 'brand', 2),
      log('ReservedNameAdded', 'released', 2),
      log('ReservedNameAdded', 'again', 2),
      log('CommunityNameAdded', 'paris'),
      log('CommunityNameAdded', 'berlin'),
      log('ReservedNameReasonChanged', 'brand', 3),
      log('ReservedNameRemoved', 'released'),
      log('ReservedNameRemoved', 'again'),
      log('ReservedNameAdded', 'again', 1),
      log('CommunityNameRemoved', 'paris'),
    ] as never)
    expect(await getPolicyNames(1)).toEqual({
      reserved: [
        { name: 'again', reason: 1 },
        { name: 'brand', reason: 3 },
        { name: 'simplex', reason: 1 },
      ],
      community: ['berlin'],
    })
    expect(mockGetLogs).toHaveBeenCalledWith(expect.anything(), {
      address: NAME_POLICY,
      events: namePolicyNameEvents,
      fromBlock: 'earliest',
      strict: true,
    })
  })

  it('reads nothing on a network without a name policy', async () => {
    expect(await getPolicyNames(5)).toBeNull()
    expect(mockGetLogs).not.toHaveBeenCalled()
  })
})
