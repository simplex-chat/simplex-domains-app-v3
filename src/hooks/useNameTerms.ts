import { QueryFunctionContext, queryOptions } from '@tanstack/react-query'
import { Address, Hex, keccak256, sha256, stringToBytes, toHex } from 'viem'
import { readContract } from 'viem/actions'
import { localhost } from 'viem/chains'
import { useChainId } from 'wagmi'

import { getNamePolicyAddress } from '@app/constants/chains'
import { ConfigWithEns, CreateQueryKey } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'
import { namePolicyTermsAbi } from '@app/utils/snrcNameTerms'
import { getSnrcTokenId } from '@app/utils/snrcOffers'

import { useQueryOptions } from './useQueryOptions'

const TERMS_LINK =
  /^(?:https:\/\/git\.simplex\.chat\/simplex-chat\/simplex-chat\/raw\/commit\/([0-9a-f]{40})|http:\/\/127\.0\.0\.1:[0-9]{1,5})\/([A-Za-z0-9_./-]+\.md)#sha256=([0-9a-f]{64})$/
const TERMS_CONTENT_TYPE = /^text\/(?:plain|markdown)(?:;\s*charset=utf-8)?$/i
const MAX_TERMS_BYTES = 256 * 1024

export const parseTermsLink = (link: string, chainId: number) => {
  const [, commit, path, digest] = TERMS_LINK.exec(link) ?? []
  if (!path || path.split('/').some((segment) => ['', '.', '..'].includes(segment)))
    return undefined
  if (!commit && chainId !== localhost.id) return undefined
  const url = link.slice(0, link.indexOf('#'))
  return {
    hash: keccak256(stringToBytes(link)),
    textUrl: commit
      ? `https://raw.githubusercontent.com/simplex-chat/simplex-chat/${commit}/${path}`
      : url,
    readerUrl: commit ? url.replace('/raw/commit/', '/src/commit/') : undefined,
    digest: `0x${digest}` as const,
  }
}

type TermsLink = NonNullable<ReturnType<typeof parseTermsLink>>

type NameTermsQueryKey = CreateQueryKey<{ name: string }, 'getNameTerms', 'standard'>

export const getNameTermsQueryFn =
  (config: ConfigWithEns) =>
  async ({ queryKey: [{ name }, chainId] }: QueryFunctionContext<NameTermsQueryKey>) => {
    const namePolicyAddress = getNamePolicyAddress(chainId)
    const tokenId = getSnrcTokenId(name)
    if (!namePolicyAddress || tokenId === undefined) return null
    const client = config.getClient({ chainId })
    const [isListed, generalTermsLink, communityTermsLink] = await Promise.all([
      readContract(client, {
        address: namePolicyAddress,
        abi: namePolicyTermsAbi,
        functionName: 'communityNames',
        args: [toHex(tokenId, { size: 32 })],
      }),
      readContract(client, {
        address: namePolicyAddress,
        abi: namePolicyTermsAbi,
        functionName: 'generalTermsLink',
      }),
      readContract(client, {
        address: namePolicyAddress,
        abi: namePolicyTermsAbi,
        functionName: 'communityTermsLink',
      }),
    ])
    return isListed
      ? { kind: 'community' as const, link: communityTermsLink }
      : { kind: 'general' as const, link: generalTermsLink }
  }

type TermsTextQueryKey = CreateQueryKey<{ termsLink?: TermsLink }, 'getTermsText', 'independent'>

export const getTermsTextQueryFn = async ({
  queryKey: [{ termsLink }],
}: QueryFunctionContext<TermsTextQueryKey>) => {
  if (!termsLink) throw new Error('termsLink is required')
  const response = await fetch(termsLink.textUrl, { redirect: 'error' })
  if (response.status !== 200) throw new Error(`terms status ${response.status}`)
  if (!TERMS_CONTENT_TYPE.test(response.headers.get('content-type') ?? ''))
    throw new Error('terms content type')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_TERMS_BYTES) throw new Error('terms too large')
  if (sha256(bytes) !== termsLink.digest) throw new Error('terms digest mismatch')
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
}

export const useTermsText = (link?: string) => {
  const chainId = useChainId()
  const termsLink = link ? parseTermsLink(link, chainId) : undefined
  const initialOptions = useQueryOptions({
    params: { termsLink },
    functionName: 'getTermsText',
    queryDependencyType: 'independent',
    queryFn: getTermsTextQueryFn,
  })
  const text = useQuery(
    queryOptions({
      queryKey: initialOptions.queryKey,
      queryFn: initialOptions.queryFn,
      enabled: !!termsLink,
      staleTime: Infinity,
    }),
  )
  return { termsLink, text }
}

export const useNameTerms = ({ name }: { name: string }) => {
  const initialOptions = useQueryOptions({
    params: { name },
    functionName: 'getNameTerms',
    queryDependencyType: 'standard',
    queryFn: getNameTermsQueryFn,
  })
  const listing = useQuery(
    queryOptions({ queryKey: initialOptions.queryKey, queryFn: initialOptions.queryFn }),
  )
  const { termsLink, text } = useTermsText(listing.data?.link)

  return {
    required: listing.data !== null,
    kind: listing.data?.kind,
    hash: termsLink?.hash,
    readerUrl: termsLink?.readerUrl,
    text: text.data,
    isLoading: listing.isLoading || text.isLoading,
    isFetching: listing.isFetching || text.isFetching,
    isError: listing.isError || text.isError,
    retry: () => {
      if (listing.isError) listing.refetch()
      if (text.isError) text.refetch()
    },
  }
}

type CommittedTermsQueryKey = CreateQueryKey<{ commitment: Hex }, 'getCommittedTerms', 'standard'>

export const getCommittedTermsQueryFn =
  (config: ConfigWithEns) =>
  async ({
    queryKey: [{ commitment }, chainId, acceptor],
  }: QueryFunctionContext<CommittedTermsQueryKey>) => {
    const namePolicyAddress = getNamePolicyAddress(chainId)
    if (!namePolicyAddress || !acceptor) return null
    return readContract(config.getClient({ chainId }), {
      address: namePolicyAddress,
      abi: namePolicyTermsAbi,
      functionName: 'acceptedTerms',
      args: [commitment, acceptor],
    })
  }

export const useCommittedTerms = ({
  commitment,
  enabled,
}: {
  commitment: Hex
  enabled: boolean
}) => {
  const initialOptions = useQueryOptions({
    params: { commitment },
    functionName: 'getCommittedTerms',
    queryDependencyType: 'standard',
    queryFn: getCommittedTermsQueryFn,
  })
  return useQuery(
    queryOptions({ queryKey: initialOptions.queryKey, queryFn: initialOptions.queryFn, enabled }),
  )
}

type AcceptedClaimTermsQueryKey = CreateQueryKey<
  { name: string; holder?: Address; offerNumber?: bigint },
  'getAcceptedClaimTerms',
  'standard'
>

export const getAcceptedClaimTermsQueryFn =
  (config: ConfigWithEns) =>
  async ({
    queryKey: [{ name, holder, offerNumber }, chainId, recipient],
  }: QueryFunctionContext<AcceptedClaimTermsQueryKey>) => {
    const namePolicyAddress = getNamePolicyAddress(chainId)
    const tokenId = getSnrcTokenId(name)
    if (
      !namePolicyAddress ||
      tokenId === undefined ||
      !holder ||
      offerNumber === undefined ||
      !recipient
    )
      return null
    return readContract(config.getClient({ chainId }), {
      address: namePolicyAddress,
      abi: namePolicyTermsAbi,
      functionName: 'acceptedClaimTerms',
      args: [tokenId, holder, recipient, offerNumber],
    })
  }

export const useAcceptedClaimTerms = ({
  name,
  holder,
  offerNumber,
  enabled,
}: {
  name: string
  holder?: Address
  offerNumber?: bigint
  enabled: boolean
}) => {
  const initialOptions = useQueryOptions({
    params: { name, holder, offerNumber },
    functionName: 'getAcceptedClaimTerms',
    queryDependencyType: 'standard',
    queryFn: getAcceptedClaimTermsQueryFn,
  })
  return useQuery(
    queryOptions({ queryKey: initialOptions.queryKey, queryFn: initialOptions.queryFn, enabled }),
  )
}
