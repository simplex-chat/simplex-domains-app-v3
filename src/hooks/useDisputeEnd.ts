import { QueryFunctionContext, queryOptions } from '@tanstack/react-query'
import { Address, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'

import { getSnrcAddresses } from '@app/constants/chains'
import { useBlockTimestamp } from '@app/hooks/chain/useBlockTimestamp'
import { ConfigWithEns, CreateQueryKey } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'
import { getSnrcTokenId, registrarOfferAbi } from '@app/utils/snrcOffers'

import { useQueryOptions } from './useQueryOptions'

type QueryKey = CreateQueryKey<{ name: string }, 'getDisputeEnd', 'standard'>

export const getDisputeEndQueryFn =
  (config: ConfigWithEns) =>
  async ({ queryKey: [{ name }, chainId] }: QueryFunctionContext<QueryKey>) => {
    const tokenId = getSnrcTokenId(name)
    const registrar = getSnrcAddresses(chainId).BaseRegistrarImplementation as Address | undefined
    if (tokenId === undefined || !registrar || registrar === zeroAddress) return null
    const disputeUntil = await readContract(config.getClient({ chainId }), {
      address: registrar,
      abi: registrarOfferAbi,
      functionName: 'disputeUntil',
      args: [tokenId],
    })
    return disputeUntil === 0n ? null : new Date(Number(disputeUntil) * 1000)
  }

export type DisputeEnd =
  | { status: 'loading' | 'unknown' | 'none'; date?: undefined }
  | { status: 'until'; date: Date }

const toDisputeEnd = (
  end: { data?: Date | null; isLoading: boolean; isError: boolean },
  blockTimestamp: { data?: bigint; isLoading: boolean },
): DisputeEnd => {
  if (end.isLoading) return { status: 'loading' }
  if (end.isError) return { status: 'unknown' }
  if (!end.data) return { status: 'none' }
  if (blockTimestamp.isLoading) return { status: 'loading' }
  if (blockTimestamp.data === undefined) return { status: 'unknown' }
  return BigInt(end.data.getTime()) > blockTimestamp.data
    ? { status: 'until', date: end.data }
    : { status: 'none' }
}

export const useDisputeEnd = ({ name, enabled = true }: { name: string; enabled?: boolean }) => {
  const initialOptions = useQueryOptions({
    params: { name },
    functionName: 'getDisputeEnd',
    queryDependencyType: 'standard',
    queryFn: getDisputeEndQueryFn,
  })
  const isRead = enabled && getSnrcTokenId(name) !== undefined
  const query = useQuery(
    queryOptions({
      queryKey: initialOptions.queryKey,
      queryFn: initialOptions.queryFn,
      enabled: isRead,
    }),
  )
  const blockTimestamp = useBlockTimestamp({ enabled: isRead && !!query.data })
  return { ...toDisputeEnd(query, blockTimestamp), isFetching: query.isFetching }
}
