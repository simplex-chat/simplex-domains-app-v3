import { mockFunction, render, screen, userEvent } from '@app/test-utils'

import { Hex, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useClaimChecks } from '@app/hooks/useClaimChecks'
import { useNameOffer } from '@app/hooks/useNameOffer'
import { useAcceptedClaimTerms, useNameTerms } from '@app/hooks/useNameTerms'
import { ClaimNode, ClaimRecord } from '@app/utils/snrcClaimChecks'

import { makeMockIntersectionObserver } from '../../../../test/mock/makeMockIntersectionObserver'
import ClaimName from './ClaimName-flow'

vi.mock('@app/hooks/useClaimChecks')
vi.mock('@app/hooks/useNameOffer')
vi.mock('@app/hooks/useNameTerms')
vi.mock('@app/components/@molecules/AvatarWithIdentifier/AvatarWithIdentifier', () => ({
  AvatarWithIdentifier: ({ address }: { address: string }) => <span>{address}</span>,
}))

const mockUseNameTerms = mockFunction(useNameTerms)
const mockUseAcceptedClaimTerms = mockFunction(useAcceptedClaimTerms)
const mockUseClaimChecks = mockFunction(useClaimChecks)
const mockUseNameOffer = mockFunction(useNameOffer)
const mockDispatch = vi.fn()

const HOLDER = '0x2222222222222222222222222222222222222222'
const OTHER_HOLDER = '0x4444444444444444444444444444444444444444'
const RECIPIENT = '0x3333333333333333333333333333333333333333'
const RESOLVER = '0x5555555555555555555555555555555555555555'
const CUSTOM_RESOLVER = '0x6666666666666666666666666666666666666666'
const TERMS = '0x7777777777777777777777777777777777777777777777777777777777777777'

const record = (key: string, value: string, extra: Partial<ClaimRecord> = {}): ClaimRecord => ({
  id: key,
  key,
  value,
  resolver: RESOLVER,
  inEffect: true,
  ...extra,
})

const root: ClaimNode = {
  node: '0x01',
  status: 'tracked',
  name: 'alice.testing',
  owner: HOLDER,
  recordsUnreadable: false,
  records: [record('text simplex.contact', 'link')],
}

type QueryState = { isFetching?: boolean; isError?: boolean }

const checks = (
  state: QueryState & { digest?: string; complete?: boolean; nodes?: ClaimNode[] } = {},
) => {
  const { digest = '0xaa', complete = true, nodes = [root], ...query } = state
  return {
    data: { nodes, complete, digest },
    isLoading: false,
    isError: false,
    isFetching: false,
    ...query,
  } as unknown as ReturnType<typeof useClaimChecks>
}

const offer = (state: QueryState & { holder?: string; isRecipient?: boolean } = {}) => {
  const { holder = HOLDER, isRecipient = true, ...query } = state
  return {
    data: { holder, recipient: RECIPIENT, offerNumber: 3n, isHolder: false, isRecipient },
    isLoading: false,
    isError: false,
    isFetching: false,
    ...query,
  } as unknown as ReturnType<typeof useNameOffer>
}

const nameTerms = (state: Partial<ReturnType<typeof useNameTerms>> = {}) =>
  ({
    required: false,
    kind: undefined,
    hash: undefined,
    readerUrl: undefined,
    text: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    retry: () => {},
    ...state,
  }) as ReturnType<typeof useNameTerms>

const claimTerms = (data?: string, isLoading = false) =>
  ({ data, isLoading }) as unknown as ReturnType<typeof useAcceptedClaimTerms>

makeMockIntersectionObserver()

const claimName = () => (
  <ClaimName data={{ name: 'alice.testing' }} dispatch={mockDispatch} onDismiss={() => {}} />
)

describe('ClaimName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseNameOffer.mockReturnValue(offer())
    mockUseClaimChecks.mockReturnValue(checks())
    mockUseNameTerms.mockReturnValue(nameTerms())
    mockUseAcceptedClaimTerms.mockReturnValue(claimTerms())
  })

  it('shows None and asks for no acknowledgement for a name without records or subnames', () => {
    mockUseClaimChecks.mockReturnValue(checks({ nodes: [{ ...root, records: [] }] }))
    render(claimName())
    expect(screen.getAllByText('input.claimName.none')).toHaveLength(2)
    expect(screen.queryByText('input.claimName.afterwards')).not.toBeInTheDocument()
    expect(screen.queryByTestId('claim-name-acknowledge')).not.toBeInTheDocument()
    expect(screen.getByTestId('claim-name-confirm')).toBeEnabled()
  })

  it('dispatches the reviewed claim only after the review is acknowledged', async () => {
    render(claimName())
    expect(screen.getByTestId('claim-name-records')).toHaveTextContent('text simplex.contactlink')
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
    expect(screen.queryByTestId('claim-name-accept-incomplete')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('claim-name-acknowledge'))
    await userEvent.click(screen.getByTestId('claim-name-confirm'))

    expect(mockDispatch).toHaveBeenCalledWith({
      name: 'setTransactions',
      payload: [
        { name: 'claimName', data: { name: 'alice.testing', holder: HOLDER, digest: '0xaa' } },
      ],
    })
  })

  it('clears the records on the name after the claim when asked to, with nothing left to accept', async () => {
    render(claimName())
    await userEvent.click(screen.getByTestId('claim-name-clear-records'))
    expect(screen.queryByTestId('claim-name-acknowledge')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('claim-name-confirm'))

    expect(mockDispatch).toHaveBeenCalledWith({
      name: 'setTransactions',
      payload: [
        { name: 'claimName', data: { name: 'alice.testing', holder: HOLDER, digest: '0xaa' } },
        { name: 'resetProfile', data: { name: 'alice.testing', resolverAddress: RESOLVER } },
      ],
    })
  })

  it('offers no clearing without records in effect on a default resolver', () => {
    mockUseClaimChecks.mockReturnValue(checks({ nodes: [{ ...root, records: [] }] }))
    const { unmount } = render(claimName())
    expect(screen.queryByTestId('claim-name-clear-records')).not.toBeInTheDocument()
    unmount()

    mockUseClaimChecks.mockReturnValue(
      checks({
        nodes: [
          {
            ...root,
            customResolver: CUSTOM_RESOLVER,
            records: [record('text url', 'x', { resolver: CUSTOM_RESOLVER })],
          },
        ],
      }),
    )
    render(claimName())
    expect(screen.queryByTestId('claim-name-clear-records')).not.toBeInTheDocument()
  })

  it('keeps the review as first read, and clears the acknowledgement when the holder changes', async () => {
    const { rerender } = render(claimName())
    await userEvent.click(screen.getByTestId('claim-name-acknowledge'))
    expect(screen.getByTestId('claim-name-confirm')).toBeEnabled()

    mockUseClaimChecks.mockReturnValue(
      checks({ digest: '0xbb', nodes: [{ ...root, records: [record('text url', 'evil')] }] }),
    )
    rerender(claimName())
    expect(screen.getByTestId('claim-name-records')).toHaveTextContent('text simplex.contactlink')
    expect(screen.getByTestId('claim-name-acknowledge')).toBeChecked()
    await userEvent.click(screen.getByTestId('claim-name-confirm'))
    expect(mockDispatch).toHaveBeenCalledWith({
      name: 'setTransactions',
      payload: [
        { name: 'claimName', data: { name: 'alice.testing', holder: HOLDER, digest: '0xaa' } },
      ],
    })

    mockUseNameOffer.mockReturnValue(offer({ holder: OTHER_HOLDER }))
    rerender(claimName())
    expect(screen.getByTestId('claim-name-acknowledge')).not.toBeChecked()
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
  })

  it('disables Claim while the checks or the offer refetch, or the offer cannot be read', async () => {
    const { rerender } = render(claimName())
    await userEvent.click(screen.getByTestId('claim-name-acknowledge'))

    mockUseClaimChecks.mockReturnValue(checks({ isFetching: true }))
    rerender(claimName())
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()

    mockUseClaimChecks.mockReturnValue(checks())
    mockUseNameOffer.mockReturnValue(offer({ isFetching: true }))
    rerender(claimName())
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()

    mockUseNameOffer.mockReturnValue(offer({ isError: true }))
    rerender(claimName())
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
    expect(screen.getByText('input.claimName.offerFailed')).toBeVisible()
    expect(screen.queryByText(HOLDER)).not.toBeInTheDocument()
  })

  it('disables Claim for a wallet the name is not offered to', () => {
    mockUseNameOffer.mockReturnValue(offer({ isRecipient: false }))
    render(claimName())
    expect(screen.getByText('input.claimName.notOffered')).toBeVisible()
    expect(screen.queryByText(HOLDER)).not.toBeInTheDocument()
    expect(screen.getByTestId('claim-name-acknowledge')).toBeDisabled()
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
  })

  it('lets an incomplete review be claimed once the unchecked subnodes are accepted too', async () => {
    mockUseClaimChecks.mockReturnValue(checks({ complete: false }))
    render(claimName())
    expect(screen.getByText('input.claimName.incomplete')).toBeVisible()
    expect(screen.queryByText('input.claimName.none')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('claim-name-acknowledge'))
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
    await userEvent.click(screen.getByTestId('claim-name-accept-incomplete'))
    expect(screen.getByTestId('claim-name-confirm')).toBeEnabled()
  })

  it('hides the review after a failed refetch', () => {
    const { rerender } = render(claimName())
    expect(screen.getByTestId('claim-name-records')).toBeVisible()

    mockUseClaimChecks.mockReturnValue(checks({ isError: true }))
    rerender(claimName())
    expect(screen.getByText('input.claimName.failed')).toBeVisible()
    expect(screen.queryByTestId('claim-name-records')).not.toBeInTheDocument()
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
  })

  it('labels each kind of subnode and flags what it cannot show as it is', () => {
    const subnode = (node: Hex, fields: Partial<ClaimNode>): ClaimNode => ({
      node,
      status: 'untracked',
      owner: OTHER_HOLDER,
      recordsUnreadable: false,
      records: [],
      ...fields,
    })
    mockUseClaimChecks.mockReturnValue(
      checks({
        nodes: [
          { ...root, customResolver: CUSTOM_RESOLVER, recordsUnreadable: true, records: [] },
          subnode('0x02', {
            status: 'tracked',
            name: 'mobile.alice.testing',
            records: [record('text 0x00', 'x', { keyAsBytes: true })],
          }),
          subnode('0x03', { status: 'registrar' }),
          subnode('0x04', {
            status: 'ownerless',
            owner: zeroAddress,
            records: [record('text kept', '0x00', { inEffect: false, valueAsBytes: true })],
          }),
          subnode('0x05', { records: [record('ABI 1', '', { valueUnread: true })] }),
        ],
      }),
    )
    render(claimName())
    expect(screen.queryByText('input.claimName.none')).not.toBeInTheDocument()
    expect(screen.getByText('input.claimName.resolver')).toBeVisible()
    expect(screen.getByText('input.claimName.unreadable')).toBeVisible()
    const subnodes = screen.getByTestId('claim-name-subnodes')
    for (const text of [
      'mobile.alice.testing',
      'input.claimName.registrar',
      'input.claimName.ownerless',
      'input.claimName.untracked',
      'input.claimName.notPlainText',
      'input.claimName.notInEffect',
      'input.claimName.notRead',
    ])
      expect(subnodes).toHaveTextContent(text)
    expect(screen.getAllByText('input.claimName.notPlainText')).toHaveLength(2)
    expect(screen.getByText('input.claimName.untrackedWarning')).toBeVisible()
    expect(screen.getByText('input.claimName.afterwards')).toBeVisible()
    expect(screen.getByTestId('claim-name-acknowledge')).toBeVisible()
  })

  it.each(['general', 'community'] as const)(
    'queues the acceptance of the shown %s terms before the claim',
    async (kind) => {
      mockUseClaimChecks.mockReturnValue(checks({ nodes: [{ ...root, records: [] }] }))
      mockUseNameTerms.mockReturnValue(
        nameTerms({ required: true, kind, hash: TERMS, text: 'the terms' }),
      )
      render(claimName())
      expect(screen.getByTestId('terms-text')).toHaveTextContent('the terms')
      expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()

      await userEvent.click(screen.getByTestId('terms-accept'))
      await userEvent.click(screen.getByTestId('claim-name-confirm'))

      expect(mockDispatch).toHaveBeenCalledWith({
        name: 'setTransactions',
        payload: [
          {
            name: 'acceptClaimTerms',
            data: {
              name: 'alice.testing',
              holder: HOLDER,
              offerNumber: 3n,
              terms: { kind, hash: TERMS },
            },
          },
          { name: 'claimName', data: { name: 'alice.testing', holder: HOLDER, digest: '0xaa' } },
        ],
      })
    },
  )

  it('offers no acceptance before the terms are set or while they cannot be read', () => {
    mockUseClaimChecks.mockReturnValue(checks({ nodes: [{ ...root, records: [] }] }))
    for (const [terms, shown] of [
      [nameTerms({ required: true, kind: 'community' }), 'terms-unset'],
      [nameTerms({ required: true, isError: true }), 'terms-load-failed'],
    ] as const) {
      mockUseNameTerms.mockReturnValue(terms)
      const { unmount } = render(claimName())
      expect(screen.getByTestId(shown)).toBeVisible()
      expect(screen.queryByTestId('terms-accept')).not.toBeInTheDocument()
      expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
      unmount()
    }
  })

  it('claims a name without a second acceptance when this offer already has one', async () => {
    mockUseClaimChecks.mockReturnValue(checks({ nodes: [{ ...root, records: [] }] }))
    mockUseNameTerms.mockReturnValue(
      nameTerms({ required: true, kind: 'general', hash: TERMS, text: 'the terms' }),
    )
    mockUseAcceptedClaimTerms.mockReturnValue(claimTerms(TERMS))
    render(claimName())
    expect(screen.queryByTestId('terms')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('claim-name-confirm'))
    expect(mockDispatch).toHaveBeenCalledWith({
      name: 'setTransactions',
      payload: [
        { name: 'claimName', data: { name: 'alice.testing', holder: HOLDER, digest: '0xaa' } },
      ],
    })
  })

  it('waits for the listing, the terms and an earlier acceptance', () => {
    for (const [terms, accepted] of [
      [nameTerms({ required: true, isLoading: true }), claimTerms()],
      [nameTerms({ required: true, kind: 'general', hash: TERMS }), claimTerms(undefined, true)],
    ] as const) {
      mockUseNameTerms.mockReturnValue(terms)
      mockUseAcceptedClaimTerms.mockReturnValue(accepted)
      const { unmount } = render(claimName())
      expect(screen.queryByTestId('claim-name-view')).not.toBeInTheDocument()
      unmount()
    }
  })

  it("reads the recipient's acceptance for the holder's offer and disables Claim while it refreshes", () => {
    mockUseClaimChecks.mockReturnValue(checks({ nodes: [{ ...root, records: [] }] }))
    mockUseNameTerms.mockReturnValue(
      nameTerms({ required: true, kind: 'general', hash: TERMS, text: 'the terms' }),
    )
    mockUseAcceptedClaimTerms.mockReturnValue({
      data: TERMS,
      isLoading: false,
      isFetching: true,
    } as never)
    render(claimName())
    expect(mockUseAcceptedClaimTerms).toHaveBeenCalledWith({
      name: 'alice.testing',
      holder: HOLDER,
      offerNumber: 3n,
      enabled: true,
    })
    expect(screen.getByTestId('claim-name-confirm')).toBeDisabled()
  })

  it('reads no earlier acceptance for a name without terms', () => {
    render(claimName())
    expect(mockUseAcceptedClaimTerms).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })
})
