import { mockFunction, render, screen } from '@app/test-utils'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAccount, useBalance } from 'wagmi'

import { MAX_REGISTRATION_DURATION } from '@app/constants/simplex'
import { useBlockTimestamp } from '@app/hooks/chain/useBlockTimestamp'
import { useEstimateGasWithStateOverride } from '@app/hooks/chain/useEstimateGasWithStateOverride'
import { useExpiry } from '@app/hooks/ensjs/public/useExpiry'
import { usePrice } from '@app/hooks/ensjs/public/usePrice'
import { useDisputeEnd } from '@app/hooks/useDisputeEnd'
import { useEthPrice } from '@app/hooks/useEthPrice'
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
vi.mock('@app/hooks/useReferrer')
vi.mock('@app/hooks/useReservedStatus')
vi.mock('@app/hooks/useDisputeEnd')

const mockUseBlockTimestamp = mockFunction(useBlockTimestamp)
const mockUseEstimateGasWithStateOverride = mockFunction(useEstimateGasWithStateOverride)
const mockUsePrice = mockFunction(usePrice)
const mockUseAccount = mockFunction(useAccount)
const mockUseBalance = mockFunction(useBalance)
const mockUseEthPrice = mockFunction(useEthPrice)
const mockUseExpiry = mockFunction(useExpiry)
const mockUseReferrer = mockFunction(useReferrer)
const mockUseReservedNames = mockFunction(useReservedNames)
const mockUseDisputeEnd = mockFunction(useDisputeEnd)

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
  mockUseBalance.mockReturnValue({ data: { balance: 100n }, isLoading: false })
  mockUseEthPrice.mockReturnValue({ data: 100n, isLoading: false })
  mockUseExpiry.mockReturnValue({ data: { expiry: { date: new Date() } }, isLoading: false })
  mockUseBlockTimestamp.mockReturnValue({ data: undefined })
  mockUseReferrer.mockReturnValue(undefined)
  mockUseReservedNames.mockReturnValue({ reservedNames: [], isLoading: false })
  mockUseDisputeEnd.mockReturnValue({ status: 'none', isFetching: false })
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
  }
  afterEach(() => {
    mockUseExpiry.mockReturnValue({ data: { expiry: { date: new Date() } }, isLoading: false })
    mockUseBlockTimestamp.mockReturnValue({ data: undefined })
    mockUseDisputeEnd.mockReturnValue({ status: 'none', isFetching: false })
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
})
