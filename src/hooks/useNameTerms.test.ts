import { mockFunction, renderHook } from '@app/test-utils'

import { keccak256, labelhash, sha256, stringToBytes } from 'viem'
import { readContract } from 'viem/actions'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChainId } from 'wagmi'

import { ConfigWithEns } from '@app/types'
import { useQuery } from '@app/utils/query/useQuery'

import {
  getAcceptedClaimTermsQueryFn,
  getCommittedTermsQueryFn,
  getNameTermsQueryFn,
  getTermsTextQueryFn,
  parseTermsLink,
  useNameTerms,
} from './useNameTerms'

vi.mock('viem/actions')
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useChainId: vi.fn(),
}))
vi.mock('@app/utils/query/useQuery')
vi.mock('./useQueryOptions', () => ({
  useQueryOptions: ({ params, functionName }: { params: object; functionName: string }) => ({
    queryKey: [params, undefined, undefined, undefined, functionName],
    queryFn: vi.fn(),
  }),
}))
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNamePolicyAddress: () => NAME_POLICY,
}))

const NAME_POLICY = '0x4444444444444444444444444444444444444444'
const HOLDER = '0x2222222222222222222222222222222222222222'
const RECIPIENT = '0x3333333333333333333333333333333333333333'
const TERMS = `0x${'77'.repeat(32)}` as const
const COMMITMENT = `0x${'cc'.repeat(32)}` as const
const COMMIT = 'ab'.repeat(20)
const BOM = [0xef, 0xbb, 0xbf]
const BYTES = new Uint8Array([...BOM, ...Array.from('# Terms\r\n', (c) => c.charCodeAt(0))])
const DIGEST = sha256(BYTES).slice(2)
const LINK = `https://git.simplex.chat/simplex-chat/simplex-chat/raw/commit/${COMMIT}/docs/general-terms.md#sha256=${DIGEST}`
const LOOPBACK = `http://127.0.0.1:8098/terms/general-terms.md#sha256=${DIGEST}`

const mockReadContract = vi.mocked(readContract)
const mockUseChainId = vi.mocked(useChainId)
const mockUseQuery = mockFunction(useQuery)
const mockFetch = vi.fn()
const config = { getClient: () => ({}) } as unknown as ConfigWithEns

type QueryResult = {
  data?: unknown
  isLoading?: boolean
  isFetching?: boolean
  isError?: boolean
  refetch?: () => void
}
const queries = (listing: QueryResult, text: QueryResult = {}) =>
  mockUseQuery.mockImplementation(
    ({ queryKey }) =>
      ({
        isLoading: false,
        isFetching: false,
        isError: false,
        ...(queryKey[4] === 'getNameTerms' ? listing : text),
      }) as never,
  )
const nameTerms = () => renderHook(() => useNameTerms({ name: 'alice.testing' })).result.current

beforeEach(() => {
  vi.clearAllMocks()
  mockUseChainId.mockReturnValue(1)
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseTermsLink', () => {
  it('reads a commit link from the GitHub mirror, links its reader page and hashes the link', () => {
    expect(parseTermsLink(LINK, 1)).toEqual({
      hash: keccak256(stringToBytes(LINK)),
      textUrl: `https://raw.githubusercontent.com/simplex-chat/simplex-chat/${COMMIT}/docs/general-terms.md`,
      readerUrl: `https://git.simplex.chat/simplex-chat/simplex-chat/src/commit/${COMMIT}/docs/general-terms.md`,
      digest: `0x${DIGEST}`,
    })
  })

  it('reads a loopback link only on the local chain, with no reader page', () => {
    expect(parseTermsLink(LOOPBACK, 1)).toBeUndefined()
    expect(parseTermsLink(LOOPBACK, 11155111)).toBeUndefined()
    expect(parseTermsLink(LOOPBACK, 1337)).toEqual({
      hash: keccak256(stringToBytes(LOOPBACK)),
      textUrl: 'http://127.0.0.1:8098/terms/general-terms.md',
      readerUrl: undefined,
      digest: `0x${DIGEST}`,
    })
  })

  it.each([
    ['another host', LINK.replace('git.simplex.chat', 'github.com')],
    ['another repository', LINK.replace('simplex-chat/simplex-chat', 'simplex-chat/simplexmq')],
    ['a branch', LINK.replace(`commit/${COMMIT}`, 'branch/stable')],
    ['an upper-case commit', LINK.replace(COMMIT, COMMIT.toUpperCase())],
    ['an upper-case digest', LINK.replace(DIGEST, DIGEST.toUpperCase())],
    ['no digest', LINK.split('#')[0]],
    ['a short digest', LINK.slice(0, -1)],
    ['a parent segment', LINK.replace('docs/', 'docs/../')],
    ['a current segment', LINK.replace('docs/', './docs/')],
    ['an empty segment', LINK.replace('docs/', 'docs//')],
    ['an escape', LINK.replace('general-terms', 'general%2dterms')],
    ['a query', LINK.replace('.md', '.md?raw=1')],
    ['another extension', LINK.replace('.md', '.txt')],
    ['an empty link', ''],
  ])('refuses %s', (_, link) => {
    expect(parseTermsLink(link, 1337)).toBeUndefined()
  })
})

describe('useNameTerms', () => {
  it.each(['general', 'community'] as const)(
    'gives the %s terms with their hash, text and reader page',
    (kind) => {
      queries({ data: { kind, link: LINK } }, { data: 'the terms' })
      expect(nameTerms()).toMatchObject({
        required: true,
        kind,
        hash: keccak256(stringToBytes(LINK)),
        readerUrl: parseTermsLink(LINK, 1)!.readerUrl,
        text: 'the terms',
        isError: false,
      })
    },
  )

  it('leaves the outcome unknown after a failed listing read, and retries the read', () => {
    const refetch = vi.fn()
    queries({ isError: true, refetch })
    const terms = nameTerms()
    expect(terms).toMatchObject({ required: true, kind: undefined, hash: undefined, isError: true })
    terms.retry()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it.each(['general', 'community'] as const)(
    'shows no %s text after a failed fetch or digest check, and retries the fetch',
    (kind) => {
      const listingRefetch = vi.fn()
      const textRefetch = vi.fn()
      queries(
        { data: { kind, link: LINK }, refetch: listingRefetch },
        { isError: true, refetch: textRefetch },
      )
      const terms = nameTerms()
      expect(terms).toMatchObject({ kind, hash: keccak256(stringToBytes(LINK)), isError: true })
      expect(terms.text).toBeUndefined()
      terms.retry()
      expect(textRefetch).toHaveBeenCalledOnce()
      expect(listingRefetch).not.toHaveBeenCalled()
    },
  )

  it.each(['general', 'community'] as const)('has no %s terms to accept while unset', (kind) => {
    queries({ data: { kind, link: '' } })
    expect(nameTerms()).toMatchObject({ required: true, kind, hash: undefined, isError: false })
    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it.each(['general', 'community'] as const)(
    'fetches the %s terms from a loopback link only on the local chain',
    (kind) => {
      queries({ data: { kind, link: LOOPBACK } })
      expect(nameTerms().hash).toBeUndefined()
      mockUseChainId.mockReturnValue(1337)
      expect(nameTerms().hash).toBe(keccak256(stringToBytes(LOOPBACK)))
    },
  )

  it('requires no terms without a name policy', () => {
    queries({ data: null })
    expect(nameTerms().required).toBe(false)
  })

  it('waits for the listing and the text, and reports a refetch', () => {
    queries({ isLoading: true })
    expect(nameTerms().isLoading).toBe(true)
    queries({ data: { kind: 'general', link: LINK } }, { isLoading: true })
    expect(nameTerms().isLoading).toBe(true)
    queries({ data: { kind: 'general', link: LINK }, isFetching: true }, { data: 'the terms' })
    expect(nameTerms()).toMatchObject({ isLoading: false, isFetching: true })
  })
})

describe('getNameTermsQueryFn', () => {
  const getNameTerms = (name: string) =>
    getNameTermsQueryFn(config)({
      queryKey: [{ name }, 1337, undefined, undefined, 'getNameTerms'],
    } as never)

  it.each([
    [false, 'general', 'the general terms link'],
    [true, 'community', 'the community terms link'],
  ] as const)('gives a name listed %s the %s terms link', async (isListed, kind, link) => {
    mockReadContract
      .mockResolvedValueOnce(isListed)
      .mockResolvedValueOnce('the general terms link')
      .mockResolvedValueOnce('the community terms link')
    expect(await getNameTerms('alice.testing')).toEqual({ kind, link })
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: NAME_POLICY,
        functionName: 'communityNames',
        args: [labelhash('alice')],
      }),
    )
  })

  it('fails when the listing cannot be read, instead of taking the name for unlisted', async () => {
    mockReadContract
      .mockRejectedValueOnce(new Error('listing unreadable'))
      .mockResolvedValueOnce('the general terms link')
      .mockResolvedValueOnce('the community terms link')
    await expect(getNameTerms('alice.testing')).rejects.toThrow('listing unreadable')
  })

  it('reads nothing for a subname', async () => {
    expect(await getNameTerms('mobile.alice.testing')).toBeNull()
    expect(mockReadContract).not.toHaveBeenCalled()
  })
})

describe('getTermsTextQueryFn', () => {
  const termsLink = parseTermsLink(LINK, 1)!
  const getText = (link = termsLink) =>
    getTermsTextQueryFn({
      queryKey: [{ termsLink: link }, undefined, undefined, undefined, 'getTermsText'],
    } as never)
  const respond = (body: Uint8Array, init: ResponseInit = {}) =>
    mockFetch.mockResolvedValueOnce(
      new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' }, ...init }),
    )

  it('fetches the text from the mirror without redirects, and keeps its bytes', async () => {
    respond(BYTES)
    expect(await getText()).toBe('﻿# Terms\r\n')
    expect(mockFetch).toHaveBeenCalledWith(termsLink.textUrl, { redirect: 'error' })
  })

  it('takes markdown, with or without a charset', async () => {
    respond(BYTES, { headers: { 'content-type': 'text/markdown' } })
    expect(await getText()).toBe('﻿# Terms\r\n')
  })

  it('refuses text that does not match the digest of its link', async () => {
    respond(BYTES.slice(3))
    await expect(getText()).rejects.toThrow('terms digest mismatch')
  })

  it('refuses a failed fetch, another status and another content type or charset', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(getText()).rejects.toThrow('Failed to fetch')
    respond(BYTES, { status: 404 })
    await expect(getText()).rejects.toThrow('terms status 404')
    respond(BYTES, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    await expect(getText()).rejects.toThrow('terms content type')
    respond(BYTES, { headers: { 'content-type': 'text/plain; charset=iso-8859-1' } })
    await expect(getText()).rejects.toThrow('terms content type')
  })

  it('refuses more than 256 KB', async () => {
    respond(new Uint8Array(256 * 1024 + 1))
    await expect(getText()).rejects.toThrow('terms too large')
  })

  it('refuses bytes that are not UTF-8', async () => {
    const bytes = new Uint8Array([0x23, 0xff])
    respond(bytes)
    await expect(getText({ ...termsLink, digest: sha256(bytes) })).rejects.toThrow(TypeError)
  })
})

describe('getCommittedTermsQueryFn', () => {
  const getCommittedTerms = (acceptor?: `0x${string}`) =>
    getCommittedTermsQueryFn(config)({
      queryKey: [{ commitment: COMMITMENT }, 1337, acceptor, undefined, 'getCommittedTerms'],
    } as never)

  it("reads the connected account's acceptance for the commitment", async () => {
    mockReadContract.mockResolvedValueOnce(TERMS)
    expect(await getCommittedTerms(RECIPIENT)).toBe(TERMS)
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: NAME_POLICY,
        functionName: 'acceptedTerms',
        args: [COMMITMENT, RECIPIENT],
      }),
    )
  })

  it('reads nothing without a connected account', async () => {
    expect(await getCommittedTerms()).toBeNull()
    expect(mockReadContract).not.toHaveBeenCalled()
  })
})

describe('getAcceptedClaimTermsQueryFn', () => {
  const getAcceptedClaimTerms = (
    holder?: `0x${string}`,
    recipient?: `0x${string}`,
    offerNumber?: bigint,
  ) =>
    getAcceptedClaimTermsQueryFn(config)({
      queryKey: [
        { name: 'alice.testing', holder, offerNumber },
        1337,
        recipient,
        undefined,
        'getAcceptedClaimTerms',
      ],
    } as never)

  it("reads the recipient's acceptance for the reviewed offer", async () => {
    mockReadContract.mockResolvedValueOnce(TERMS)
    expect(await getAcceptedClaimTerms(HOLDER, RECIPIENT, 3n)).toBe(TERMS)
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: NAME_POLICY,
        functionName: 'acceptedClaimTerms',
        args: [BigInt(labelhash('alice')), HOLDER, RECIPIENT, 3n],
      }),
    )
  })

  it('reads nothing without a holder, an offer or a connected recipient', async () => {
    expect(await getAcceptedClaimTerms(undefined, RECIPIENT, 3n)).toBeNull()
    expect(await getAcceptedClaimTerms(HOLDER, undefined, 3n)).toBeNull()
    expect(await getAcceptedClaimTerms(HOLDER, RECIPIENT)).toBeNull()
    expect(mockReadContract).not.toHaveBeenCalled()
  })
})
