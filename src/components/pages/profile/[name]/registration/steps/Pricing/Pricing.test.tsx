import { act, mockFunction, render, screen } from '@app/test-utils'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountEffect, UseAccountEffectParameters, useBalance } from 'wagmi'
import type { GetBalanceData } from 'wagmi/query'

import { ProfileRecord } from '@app/constants/profileRecordOptions'
import { useAccountSafely } from '@app/hooks/account/useAccountSafely'
import { useContractAddress } from '@app/hooks/chain/useContractAddress'
import { useEstimateFullRegistration } from '@app/hooks/gasEstimation/useEstimateRegistration'
import { useControllerLimits } from '@app/hooks/useControllerLimits'
import { useEthPrice } from '@app/hooks/useEthPrice'
import { useNftGateStatus } from '@app/hooks/useNftGateStatus'
import { useReservedStatus } from '@app/hooks/useReservedStatus'
import { yearsToSeconds } from '@app/utils/utils'

import { PaymentMethod, RegistrationReducerDataItem } from '../../types'
import Pricing, { ActionButton, ActionButtonProps, PricingProps } from './Pricing'

vi.mock('wagmi')
vi.mock('@app/hooks/account/useAccountSafely')
vi.mock('@app/hooks/chain/useContractAddress')
vi.mock('@app/hooks/gasEstimation/useEstimateRegistration')
vi.mock('@app/hooks/useControllerLimits')
vi.mock('@app/hooks/useEthPrice')
vi.mock('@app/hooks/useNftGateStatus')
vi.mock('@app/hooks/useReservedStatus')
vi.mock('@app/components/SimplexInfoPanel', () => ({ SimplexInfoPanel: () => null }))
vi.mock('@app/components/@molecules/DateSelection/DateSelection', () => ({
  DateSelection: () => null,
}))
vi.mock('@app/components/pages/profile/ProfileButton', () => ({
  SocialProfileButton: ({ value }: { value: string }) => <div>{value}</div>,
}))
vi.mock('../../FullInvoice', () => ({ default: () => null }))

const mockUseAccountSafely = mockFunction(useAccountSafely)
const mockUseAccountEffect = mockFunction(useAccountEffect)
const mockUseBalance = mockFunction(useBalance)
const mockUseContractAddress = mockFunction(useContractAddress)
const mockUseEstimateFullRegistration = mockFunction(useEstimateFullRegistration)
const mockUseControllerLimits = mockFunction(useControllerLimits)
const mockUseEthPrice = mockFunction(useEthPrice)
const mockUseNftGateStatus = mockFunction(useNftGateStatus)
const mockUseReservedStatus = mockFunction(useReservedStatus)

describe('ActionButton', () => {
  const baseMockData: ActionButtonProps = {
    address: '0x123',
    hasPendingMoonpayTransaction: false,
    hasFailedMoonpayTransaction: false,
    paymentMethodChoice: '',
    reverseRecord: false,
    callback: () => null,
    initiateMoonpayRegistrationMutation: {
      mutate: () => null,
    } as any,
    seconds: yearsToSeconds(1),
    balance: { value: 100n } as any,
    totalRequiredBalance: 1n,
    estimatedTotal: 1n,
    ethPrice: 1n,
    durationType: 'years',
  }
  it('should have disabled "Next" button if no choice has been made', () => {
    render(<ActionButton {...baseMockData} />)
    expect(screen.getByText('action.next')).toBeInTheDocument()
  })
  it('should show "Insufficient balance" if balance is too low and etehreum has been chosen', () => {
    render(
      <ActionButton
        {...{
          ...baseMockData,
          paymentMethodChoice: PaymentMethod.ethereum,
          balance: { value: 0n } as any,
        }}
      />,
    )
    expect(screen.getByText('steps.pricing.insufficientBalance')).toBeInTheDocument()
  })
  it('should show "Next" if balance is too low and moonopay has been chosen', () => {
    render(
      <ActionButton
        {...{
          ...baseMockData,
          paymentMethodChoice: PaymentMethod.moonpay,
          balance: { value: 0n } as any,
        }}
      />,
    )
    expect(screen.getByText('action.next')).toBeInTheDocument()
  })
  it('should go next once by itself if autoNext is set and every check passes', () => {
    const callback = vi.fn()
    render(
      <ActionButton
        {...{
          ...baseMockData,
          paymentMethodChoice: PaymentMethod.ethereum,
          autoNext: true,
          callback,
        }}
      />,
    )
    expect(callback).toHaveBeenCalledOnce()
  })
  it('should not go next by itself if autoNext is set but balance is too low', () => {
    const callback = vi.fn()
    render(
      <ActionButton
        {...{
          ...baseMockData,
          paymentMethodChoice: PaymentMethod.ethereum,
          balance: { value: 0n } as GetBalanceData,
          autoNext: true,
          callback,
        }}
      />,
    )
    expect(screen.getByText('steps.pricing.insufficientBalance')).toBeInTheDocument()
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('Pricing', () => {
  const contact = 'https://smp16.simplex.im/a#Q_abc'
  const linkRecords: ProfileRecord[] = [
    { key: 'simplex.contact', group: 'simplex', type: 'text', value: contact },
  ]
  type OnConnect = NonNullable<UseAccountEffectParameters['onConnect']>
  let onConnect: OnConnect | undefined
  const connect = (isReconnected: boolean) =>
    act(() => onConnect?.({ isReconnected } as Parameters<OnConnect>[0]))

  const setLoaded = () => {
    mockUseAccountSafely.mockReturnValue({ address: '0x123' })
    mockUseAccountEffect.mockImplementation((parameters) => {
      onConnect = parameters?.onConnect
    })
    mockUseBalance.mockReturnValue({ data: { value: 10n ** 18n } })
    mockUseContractAddress.mockReturnValue('0x123')
    mockUseEstimateFullRegistration.mockReturnValue({
      totalDurationBasedFee: 10n,
      premiumFee: 0n,
      estimatedGasFee: 1n,
      priceLoading: false,
    })
    mockUseControllerLimits.mockReturnValue({ minCharLength: 6 })
    mockUseEthPrice.mockReturnValue({ data: 1n })
    mockUseNftGateStatus.mockReturnValue({ required: false, hasNft: undefined, loaded: true })
    mockUseReservedStatus.mockReturnValue({ isReserved: false, loaded: true })
  }

  const makeProps = (overrides: Partial<PricingProps> = {}): PricingProps => ({
    name: 'alicebob.simplex',
    beautifiedName: 'alicebob.simplex',
    gracePeriodEndDate: undefined,
    resolverExists: false,
    callback: vi.fn(),
    isPrimaryLoading: false,
    hasPrimaryName: false,
    registrationData: {
      seconds: yearsToSeconds(2),
      durationType: 'years',
      started: false,
    } as RegistrationReducerDataItem,
    initiateMoonpayRegistrationMutation: {
      mutate: () => null,
    } as unknown as PricingProps['initiateMoonpayRegistrationMutation'],
    linkRecords,
    ...overrides,
  })

  beforeEach(() => {
    onConnect = undefined
    setLoaded()
  })

  it('should show the values from the link', () => {
    render(<Pricing {...makeProps()} />)
    expect(screen.getByText(contact)).toBeInTheDocument()
  })

  it('should go next once by itself after the wallet connects', () => {
    const props = makeProps()
    render(<Pricing {...props} />)
    expect(props.callback).not.toHaveBeenCalled()
    connect(false)
    expect(props.callback).toHaveBeenCalledOnce()
  })

  it('should wait for Next after a silent reconnect', () => {
    const props = makeProps()
    render(<Pricing {...props} />)
    connect(true)
    expect(props.callback).not.toHaveBeenCalled()
    expect(screen.getByTestId('next-button')).toBeEnabled()
  })

  it('should wait for Next without a link', () => {
    const props = makeProps({ linkRecords: undefined })
    render(<Pricing {...props} />)
    connect(false)
    expect(props.callback).not.toHaveBeenCalled()
  })

  it.each([
    [
      'the reserved status',
      () => mockUseReservedStatus.mockReturnValue({ isReserved: false, loaded: false }),
    ],
    [
      'the NFT gate',
      () =>
        mockUseNftGateStatus.mockReturnValue({ required: true, hasNft: undefined, loaded: false }),
    ],
    ['the controller limits', () => mockUseControllerLimits.mockReturnValue({})],
    [
      'the price',
      () =>
        mockUseEstimateFullRegistration.mockReturnValue({
          totalDurationBasedFee: 0n,
          premiumFee: 0n,
          estimatedGasFee: 0n,
          priceLoading: true,
        }),
    ],
  ])('should wait for %s to load before going next by itself', (_, setLoading) => {
    setLoading()
    const props = makeProps()
    const { rerender } = render(<Pricing {...props} />)
    connect(false)
    expect(props.callback).not.toHaveBeenCalled()
    setLoaded()
    rerender(<Pricing {...props} />)
    expect(props.callback).toHaveBeenCalledOnce()
  })
})
