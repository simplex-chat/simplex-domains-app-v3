import { QueryFunctionContext, queryOptions } from '@tanstack/react-query'
import { getLogs } from 'viem/actions'

import { getNamePolicyAddress } from '@app/constants/chains'
import { ConfigWithEns, CreateQueryKey } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'
import { namePolicyNameEvents } from '@app/utils/snrcNamePolicy'

import { useQueryOptions } from './useQueryOptions'

type QueryKey = CreateQueryKey<{}, 'getPolicyNames', 'standard'>

export const getPolicyNamesQueryFn =
  (config: ConfigWithEns) =>
  async ({ queryKey: [, chainId] }: QueryFunctionContext<QueryKey>) => {
    const namePolicyAddress = getNamePolicyAddress(chainId)
    if (!namePolicyAddress) return null
    const logs = await getLogs(config.getClient({ chainId }), {
      address: namePolicyAddress,
      events: namePolicyNameEvents,
      fromBlock: 'earliest',
      strict: true,
    })
    const reserved = new Map<string, number>()
    const community = new Set<string>()
    for (const log of logs) {
      switch (log.eventName) {
        case 'ReservedNameAdded':
        case 'ReservedNameReasonChanged':
          reserved.set(log.args.name, log.args.reason)
          break
        case 'ReservedNameRemoved':
          reserved.delete(log.args.name)
          break
        case 'CommunityNameAdded':
          community.add(log.args.name)
          break
        case 'CommunityNameRemoved':
          community.delete(log.args.name)
          break
        default:
      }
    }
    return {
      reserved: [...reserved]
        .map(([name, reason]) => ({ name, reason }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      community: [...community].sort((a, b) => a.localeCompare(b)),
    }
  }

export const usePolicyNames = () => {
  const initialOptions = useQueryOptions({
    params: {},
    functionName: 'getPolicyNames',
    queryDependencyType: 'standard',
    queryFn: getPolicyNamesQueryFn,
  })
  return useQuery(
    queryOptions({ queryKey: initialOptions.queryKey, queryFn: initialOptions.queryFn }),
  )
}
