import { QueryFunctionContext, queryOptions } from '@tanstack/react-query'
import { Address, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'

import { getSnrcAddresses } from '@app/constants/chains'
import { ConfigWithEns, CreateQueryKey } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'
import { getSnrcTokenId, registrarTokensAbi } from '@app/utils/snrcOffers'

import { useQueryOptions } from './useQueryOptions'

type QueryKey = CreateQueryKey<{ name: string }, 'getIsNameHolder', 'standard'>

export const getIsNameHolderQueryFn =
  (config: ConfigWithEns) =>
  async ({ queryKey: [{ name }, chainId, address] }: QueryFunctionContext<QueryKey>) => {
    const tokenId = getSnrcTokenId(name)
    const registrar = getSnrcAddresses(chainId).BaseRegistrarImplementation as Address | undefined
    if (tokenId === undefined || !registrar || registrar === zeroAddress || !address) return false

    const client = config.getClient({ chainId })
    const target = { address: registrar, abi: registrarTokensAbi } as const
    const balance = await readContract(client, {
      ...target,
      functionName: 'balanceOf',
      args: [address],
    })
    const tokenIds = await Promise.all(
      Array.from({ length: Number(balance) }, (_, i) =>
        readContract(client, {
          ...target,
          functionName: 'tokenOfOwnerByIndex',
          args: [address, BigInt(i)],
        }),
      ),
    )
    return tokenIds.includes(tokenId)
  }

export const useIsNameHolder = ({ name, enabled = true }: { name: string; enabled?: boolean }) => {
  const initialOptions = useQueryOptions({
    params: { name },
    functionName: 'getIsNameHolder',
    queryDependencyType: 'standard',
    queryFn: getIsNameHolderQueryFn,
  })
  return useQuery(
    queryOptions({ queryKey: initialOptions.queryKey, queryFn: initialOptions.queryFn, enabled }),
  )
}
