import { mockFunction, render, screen, userEvent } from '@app/test-utils'

import { encodeErrorResult, parseAbi, parseEther, RpcRequestError } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAccount, useBalance } from 'wagmi'

import { MAX_REGISTRATION_DURATION } from '@app/constants/simplex'
import { useBlockTimestamp } from '@app/hooks/chain/useBlockTimestamp'
import { useEstimateGasWithStateOverride } from '@app/hooks/chain/useEstimateGasWithStateOverride'
import { useExpiry } from '@app/hooks/ensjs/public/useExpiry'
import { usePrice } from '@app/hooks/ensjs/public/usePrice'
import { acceptedRenewalTermsOverride } from '@app/hooks/gasEstimation/calculateTransactions'
import { useDisputeEnd } from '@app/hooks/useDisputeEnd'
import { useEthPrice } from '@app/hooks/useEthPrice'
import { useAcceptedRenewalTerms, useNameTerms } from '@app/hooks/useNameTerms'
import { useReferrer } from '@app/hooks/useReferrer'
import { useReservedNames } from '@app/hooks/useReservedStatus'
import { ONE_DAY, ONE_YEAR } from '@app/utils/time'

import { makeMockIntersectionObserver } from '../../../../test/mock/makeMockIntersectionObserver'
import ExtendNames from './ExtendNames-flow'

vi.mock('@app/hooks/chain/useBlockTimestamp')
vi.mock('@app/hooks/chain/useEstimateGasWithStateOverride')
vi.mock('@app/hooks/ensjs/public/usePrice')
vi.mock('wagmi')
vi.mock('@app/hooks/ensjs/public/useExpiry')
vi.mock('@app/hooks/useEthPrice')
vi.mock('@app/hooks/useNameTerms')
vi.mock('@app/hooks/useReferrer')
vi.mock('@app/hooks/useReservedStatus')
vi.mock('@app/hooks/useDisputeEnd')
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNamePolicyAddress: () => NAME_POLICY,
}))

const mockUseBlockTimestamp = mockFunction(useBlockTimestamp)
const mockUseEstimateGasWithStateOverride = mockFunction(useEstimateGasWithStateOverride)
const mockUsePrice = mockFunction(usePrice)
const mockUseAccount = mockFunction(useAccount)
const mockUseBalance = mockFunction(useBalance)
const mockUseEthPrice = mockFunction(useEthPrice)
const mockUseExpiry = mockFunction(useExpiry)
const mockUseNameTerms = mockFunction(useNameTerms)
const mockUseAcceptedRenewalTerms = mockFunction(useAcceptedRenewalTerms)
const mockUseReferrer = mockFunction(useReferrer)
const mockUseReservedNames = mockFunction(useReservedNames)
const mockUseDisputeEnd = mockFunction(useDisputeEnd)

const NAME_POLICY = '0x4444444444444444444444444444444444444444'
const TERMS = `0x${'77'.repeat(32)}` as const

const nameTerms = (state: Partial<ReturnType<typeof useNameTerms>> = {}) => ({
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
})

vi.mock('@ensdomains/thorin', async () => {
  const originalModule = await vi.importActual('@ensdomains/thorin')
  return {
    ...originalModule,
    ScrollBox: vi.fn(({ children }) => children),
  }
})
vi.mock('@app/components/@atoms/Invoice/Invoice', async () => {
  const originalModule = await vi.importActual('@app/components/@atoms/Invoice/Invoice')
  return {
    ...originalModule,
    Invoice: vi.fn(() => <div>Invoice</div>),
  }
})

makeMockIntersectionObserver()

describe('Extendnames', () => {
  mockUseEstimateGasWithStateOverride.mockReturnValue({
    data: { gasEstimate: 21000n, gasCost: 100n },
    gasPrice: 100n,
    error: null,
    isLoading: false,
  })
  mockUsePrice.mockReturnValue({
    data: {
      base: 100n,
      premium: 0n,
    },
    isLoading: false,
  })
  mockUseAccount.mockReturnValue({ address: '0x1234', isConnected: true })
  mockUseBalance.mockReturnValue({ data: { value: parseEther('1') }, isLoading: false })
  mockUseEthPrice.mockReturnValue({ data: 100n, isLoading: false })
  mockUseExpiry.mockReturnValue({ data: { expiry: { date: new Date() } }, isLoading: false })
  mockUseBlockTimestamp.mockReturnValue({ data: undefined })
  mockUseReferrer.mockReturnValue(undefined)
  mockUseReservedNames.mockReturnValue({ reservedNames: [], isLoading: false })
  mockUseDisputeEnd.mockReturnValue({ status: 'none', isFetching: false })
  mockUseNameTerms.mockReturnValue(nameTerms())
  mockUseAcceptedRenewalTerms.mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
  })
  it('should render', async () => {
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.eth'], hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
  })
  it('should have Invoice greyed out if gas limit estimation is still loading', () => {
    mockUseEstimateGasWithStateOverride.mockReturnValueOnce({
      data: { gasEstimate: 21000n, gasCost: 100n },
      gasPrice: 100n,
      error: null,
      isLoading: true,
    })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.eth'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    const optionBar = screen.getByText('Invoice')
    const { parentElement } = optionBar
    expect(parentElement).toHaveStyle('opacity: 0.5')
  })
  it('should disabled next button if the price data is loading ', () => {
    mockUsePrice.mockReturnValueOnce({
      isLoading: true,
    })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.eth'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    const trailingButton = screen.getByTestId('extend-names-confirm')
    expect(trailingButton).toHaveAttribute('disabled')
  })
  const mockExpiryAhead = (seconds: number) => {
    const now = BigInt(Date.now())
    const expiry = Number(now / 1000n) + seconds
    mockUseBlockTimestamp.mockReturnValue({ data: now })
    mockUseExpiry.mockReturnValue({
      data: { expiry: { date: new Date(expiry * 1000), value: BigInt(expiry) } },
      isLoading: false,
    })
    return BigInt(expiry)
  }
  afterEach(() => {
    mockUseExpiry.mockReturnValue({ data: { expiry: { date: new Date() } }, isLoading: false })
    mockUseBlockTimestamp.mockReturnValue({ data: undefined })
    mockUseDisputeEnd.mockReturnValue({ status: 'none', isFetching: false })
    mockUseNameTerms.mockReturnValue(nameTerms())
    mockUseAcceptedRenewalTerms.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
    })
    mockUseBalance.mockReturnValue({ data: { value: parseEther('1') }, isLoading: false })
  })
  it('should disable extending while the name is paid up close to three years ahead', () => {
    mockExpiryAhead(MAX_REGISTRATION_DURATION)
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('extend-names-too-early')).toBeVisible()
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
  })
  it('should cap the extension at three years past the current block', () => {
    mockExpiryAhead(ONE_YEAR)
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false, seconds: 2 * ONE_YEAR },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('plus-minus-control-plus')).toBeDisabled()
  })
  it('should disable extending a reserved name', () => {
    mockUseReservedNames.mockReturnValueOnce({ reservedNames: ['nick.simplex'], isLoading: false })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.simplex'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('extend-names-reserved')).toBeVisible()
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
    expect(mockUseEstimateGasWithStateOverride).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })
  it('should wait for the reservation read', () => {
    mockUseReservedNames.mockReturnValueOnce({ reservedNames: [], isLoading: true })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.simplex'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
    expect(screen.queryByText('Invoice')).not.toBeInTheDocument()
  })
  it('should disable extending until the dispute period ends', () => {
    mockUseDisputeEnd.mockReturnValue({
      status: 'until',
      date: new Date(Date.now() + 60_000),
      isFetching: false,
    })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.simplex'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(mockUseDisputeEnd).toHaveBeenLastCalledWith({ name: 'nick.simplex' })
    expect(screen.getByTestId('extend-names-dispute-period')).toBeVisible()
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
    expect(mockUseEstimateGasWithStateOverride).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })
  it('should wait for the dispute period read', () => {
    mockUseDisputeEnd.mockReturnValue({ status: 'loading', isFetching: true })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.simplex'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
    expect(screen.queryByText('Invoice')).not.toBeInTheDocument()
  })
  it('should not extend while the dispute period cannot be read', () => {
    mockUseDisputeEnd.mockReturnValue({ status: 'unknown', isFetching: false })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.simplex'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('extend-names-dispute-failed')).toBeVisible()
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
    expect(mockUseEstimateGasWithStateOverride).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })
  it('should name the earliest extension when it comes after the dispute end', () => {
    mockExpiryAhead(MAX_REGISTRATION_DURATION)
    mockUseDisputeEnd.mockReturnValue({
      status: 'until',
      date: new Date(Date.now() + 60_000),
      isFetching: false,
    })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('extend-names-too-early')).toBeVisible()
    expect(screen.queryByTestId('extend-names-dispute-period')).not.toBeInTheDocument()
  })
  it('should name the dispute end when it comes after the earliest extension', () => {
    mockExpiryAhead(MAX_REGISTRATION_DURATION - ONE_YEAR + ONE_DAY)
    mockUseDisputeEnd.mockReturnValue({
      status: 'until',
      date: new Date(Date.now() + 2 * ONE_DAY * 1000),
      isFetching: false,
    })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('extend-names-dispute-period')).toBeVisible()
    expect(screen.queryByTestId('extend-names-too-early')).not.toBeInTheDocument()
  })
  it.each(['general', 'community'] as const)(
    'should accept the shown %s terms for this renewal before extending',
    async (kind) => {
      const expires = mockExpiryAhead(ONE_YEAR)
      mockUseNameTerms.mockReturnValue(
        nameTerms({ required: true, kind, hash: TERMS, text: 'the terms' }),
      )
      const dispatch = vi.fn()
      render(
        <ExtendNames
          {...{
            data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
            dispatch,
            onDismiss: () => null,
          }}
        />,
      )
      expect(screen.getByTestId('terms-text')).toHaveTextContent('the terms')
      expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')

      await userEvent.click(screen.getByTestId('terms-accept'))
      await userEvent.click(screen.getByTestId('extend-names-confirm'))

      expect(dispatch).toHaveBeenCalledWith({
        name: 'setTransactions',
        payload: [
          {
            name: 'acceptRenewalTerms',
            data: {
              name: 'nick.testing',
              expires,
              duration: ONE_YEAR,
              terms: { kind, hash: TERMS },
            },
          },
          {
            name: 'extendNames',
            data: expect.objectContaining({ names: ['nick.testing'], duration: ONE_YEAR }),
          },
        ],
      })
    },
  )
  it('should estimate the renewal with its acceptance in effect', () => {
    const expires = mockExpiryAhead(ONE_YEAR)
    mockUseNameTerms.mockReturnValue(
      nameTerms({ required: true, kind: 'general', hash: TERMS, text: 'the terms' }),
    )
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    const renewal = {
      name: 'nick.testing',
      expires,
      duration: ONE_YEAR,
      terms: { kind: 'general', hash: TERMS },
    } as const
    expect(mockUseEstimateGasWithStateOverride).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: true,
        transactions: [
          { name: 'acceptRenewalTerms', data: renewal },
          expect.objectContaining({
            name: 'extendNames',
            stateOverride: [
              expect.objectContaining({ address: '0x1234' }),
              acceptedRenewalTermsOverride({
                namePolicyAddress: NAME_POLICY,
                holder: '0x1234',
                renewal,
              }),
            ],
          }),
        ],
      }),
    )
  })
  it('should neither estimate nor extend while the terms cannot be accepted', () => {
    mockExpiryAhead(ONE_YEAR)
    mockUseNameTerms.mockReturnValue(nameTerms({ required: true, kind: 'general' }))
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByTestId('terms-unset')).toBeVisible()
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
    expect(mockUseEstimateGasWithStateOverride).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })
  it('should extend without a second acceptance for this expiry and duration', async () => {
    const expires = mockExpiryAhead(ONE_YEAR)
    mockUseNameTerms.mockReturnValue(
      nameTerms({ required: true, kind: 'general', hash: TERMS, text: 'the terms' }),
    )
    mockUseAcceptedRenewalTerms.mockReturnValue({ data: TERMS, isFetching: false })
    const dispatch = vi.fn()
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
          dispatch,
          onDismiss: () => null,
        }}
      />,
    )
    expect(mockUseAcceptedRenewalTerms).toHaveBeenLastCalledWith({
      name: 'nick.testing',
      expires,
      duration: ONE_YEAR,
      enabled: true,
    })
    expect(screen.queryByTestId('terms')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('extend-names-confirm'))

    expect(dispatch).toHaveBeenCalledWith({
      name: 'setTransactions',
      payload: [{ name: 'extendNames', data: expect.objectContaining({ duration: ONE_YEAR }) }],
    })
  })
  it('should not extend while the expiry, the terms or the stored acceptance are refetched', () => {
    const expires = mockExpiryAhead(ONE_YEAR)
    const expiry = {
      data: { expiry: { date: new Date(Number(expires) * 1000), value: expires } },
      isLoading: false,
    }
    const terms = nameTerms({ required: true, kind: 'general', hash: TERMS, text: 'the terms' })
    for (const [expiryState, termsState, renewalTermsState] of [
      [{ ...expiry, isFetching: true }, terms, { data: TERMS, isFetching: false }],
      [expiry, { ...terms, isFetching: true }, { data: TERMS, isFetching: false }],
      [expiry, terms, { data: TERMS, isFetching: true }],
    ] as const) {
      mockUseExpiry.mockReturnValue(expiryState)
      mockUseNameTerms.mockReturnValue(termsState)
      mockUseAcceptedRenewalTerms.mockReturnValue(renewalTermsState)
      const { unmount } = render(
        <ExtendNames
          {...{
            data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
            dispatch: () => null,
            onDismiss: () => null,
          }}
        />,
      )
      expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
      unmount()
    }
  })
  it('should not extend before the wallet can pay the renewal and its gas', () => {
    for (const [value, disabled] of [
      [201n, true],
      [202n, false],
    ] as const) {
      mockUseBalance.mockReturnValue({ data: { value }, isLoading: false })
      const { unmount } = render(
        <ExtendNames
          {...{
            data: { names: ['nick.eth'], isSelf: true, hasWrapped: false },
            dispatch: () => null,
            onDismiss: () => null,
          }}
        />,
      )
      expect(screen.getByTestId('extend-names-confirm').hasAttribute('disabled')).toBe(disabled)
      expect(!!screen.queryByText('input.extendNames.gasLimitError')).toBe(disabled)
      unmount()
    }
  })
  const estimateFailure = (error: { code: number; message: string; data?: `0x${string}` }) =>
    mockUseEstimateGasWithStateOverride.mockReturnValueOnce({
      data: { gasEstimate: 0n, gasCost: 0n },
      gasPrice: 100n,
      error: new RpcRequestError({ body: {}, url: '', error } as never),
      isLoading: false,
    })
  it('should name the error of a renewal that reverts, and offer no Next for it', () => {
    const abi = parseAbi(['error TermsMismatch(bytes32 accepted, bytes32 current)'])
    estimateFailure({
      code: 3,
      message: 'execution reverted',
      data: encodeErrorResult({ abi, errorName: 'TermsMismatch', args: [TERMS, TERMS] }),
    })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.eth'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByText('TermsMismatch')).toBeVisible()
    expect(screen.queryByText('input.extendNames.gasLimitError')).not.toBeInTheDocument()
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
  })
  it('should keep Next for an estimate that fails for another reason', () => {
    estimateFailure({ code: -32000, message: 'header not found' })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.eth'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.getByText('header not found')).toBeVisible()
    expect(screen.getByTestId('extend-names-confirm')).not.toHaveAttribute('disabled')
  })
  it('should wait for a stored acceptance before showing the terms', () => {
    mockExpiryAhead(ONE_YEAR)
    mockUseNameTerms.mockReturnValue(
      nameTerms({ required: true, kind: 'general', hash: TERMS, text: 'the terms' }),
    )
    mockUseAcceptedRenewalTerms.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    })
    render(
      <ExtendNames
        {...{
          data: { names: ['nick.testing'], isSelf: true, hasWrapped: false },
          dispatch: () => null,
          onDismiss: () => null,
        }}
      />,
    )
    expect(screen.queryByTestId('terms')).not.toBeInTheDocument()
    expect(screen.getByTestId('extend-names-confirm')).toHaveAttribute('disabled')
  })
})
