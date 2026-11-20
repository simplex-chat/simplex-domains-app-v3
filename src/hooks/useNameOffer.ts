import { QueryFunctionContext, queryOptions } from '@tanstack/react-query'
import { Address, namehash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'

import { getSnrcAddresses } from '@app/constants/chains'
import { ConfigWithEns, CreateQueryKey } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'
import { getSnrcTokenId, readOwnerOf, registrarOfferAbi } from '@app/utils/snrcOffers'

import { useQueryOptions } from './useQueryOptions'

type UseNameOfferParameters = {
  name: string
}

type QueryKey = CreateQueryKey<UseNameOfferParameters, 'getNameOffer', 'standard'>

export const getNameOfferQueryFn =
  (config: ConfigWithEns) =>
  async ({ queryKey: [{ name }, chainId, address] }: QueryFunctionContext<QueryKey>) => {
    const tokenId = getSnrcTokenId(name)
    const registrar = getSnrcAddresses(chainId).BaseRegistrarImplementation as Address | undefined
    if (tokenId === undefined || !registrar || registrar === zeroAddress) return null

    const client = config.getClient({ chainId })
    const target = { address: registrar, abi: registrarOfferAbi, args: [tokenId] } as const

    // `ownerOf` reverts for an unregistered or lapsed name, which has no holder.
    const holder = await readOwnerOf(client, registrar, tokenId)
    if (!holder) return null
    const [baseNode, approved, offerNumber] = await Promise.all([
      readContract(client, {
        address: registrar,
        abi: registrarOfferAbi,
        functionName: 'baseNode',
      }),
      readContract(client, { ...target, functionName: 'getApproved' }),
      readContract(client, { ...target, functionName: 'offers' }),
    ])
    if (baseNode !== namehash(name.split('.')[1])) return null
    const recipient = approved === zeroAddress ? undefined : approved
    return {
      holder,
      recipient,
      offerNumber,
      isHolder: !!address && holder.toLowerCase() === address.toLowerCase(),
      isRecipient: !!address && recipient?.toLowerCase() === address.toLowerCase(),
    }
  }

export const useNameOffer = ({ name }: UseNameOfferParameters) => {
  const initialOptions = useQueryOptions({
    params: { name },
    functionName: 'getNameOffer',
    queryDependencyType: 'standard',
    queryFn: getNameOfferQueryFn,
  })

  const preparedOptions = queryOptions({
    queryKey: initialOptions.queryKey,
    queryFn: initialOptions.queryFn,
  })

  return useQuery(preparedOptions)
}
