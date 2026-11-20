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

export const useDisputeEnd = ({ name, enabled = true }: { name: string; enabled?: boolean }) => {
  const initialOptions = useQueryOptions({
    params: { name },
    functionName: 'getDisputeEnd',
    queryDependencyType: 'standard',
    queryFn: getDisputeEndQueryFn,
  })
  const query = useQuery(
    queryOptions({ queryKey: initialOptions.queryKey, queryFn: initialOptions.queryFn, enabled }),
  )
  const blockTimestamp = useBlockTimestamp({ enabled })
  return {
    ...query,
    data:
      query.data &&
      blockTimestamp.data !== undefined &&
      BigInt(query.data.getTime()) > blockTimestamp.data
        ? query.data
        : undefined,
    isLoading: query.isLoading || blockTimestamp.isLoading,
    isError: query.isError || blockTimestamp.isError,
  }
}
