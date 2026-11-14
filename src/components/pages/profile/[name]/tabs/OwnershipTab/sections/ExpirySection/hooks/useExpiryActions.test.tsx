import { mockFunction, renderHook } from '@app/test-utils'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccount } from 'wagmi'

import { useIsNameHolder } from '@app/hooks/useIsNameHolder'
import { useTransactionFlow } from '@app/transaction-flow/TransactionFlowProvider'

import { useExpiryActions } from './useExpiryActions'

vi.mock('wagmi')
vi.mock('@app/hooks/useIsNameHolder')
vi.mock('@app/transaction-flow/TransactionFlowProvider')
const mockUseAccount = mockFunction(useAccount)
const mockUseIsNameHolder = mockFunction(useIsNameHolder)
const mockUseTransactionFlow = mockFunction(useTransactionFlow)
const mockShowExtendNamesInput = vi.fn()

vi.mock('@app/hooks/abilities/useAbilities', () => ({
  useAbilities: () => ({
    data: {
      canEdit: true,
    },
    isLoading: false,
  }),
}))

describe('useExpiryActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAccount.mockReturnValue({ address: '0x123', isConnected: true })
    mockUseIsNameHolder.mockReturnValue({ data: true })
    mockUseTransactionFlow.mockReturnValue({
      usePreparedDataInput: () => mockShowExtendNamesInput,
    })
  })

  it('should render if expiryDetails contains a expiry type data with a valid expiry date', () => {
    const { result } = renderHook(() =>
      useExpiryActions({
        name: 'test.eth',
        expiryDetails: [{ type: 'expiry', date: new Date('3255803954000') }],
      }),
    )
    expect(result.current).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'extend' })]),
    )
  })

  it('should not show extend action if the connected wallet does not hold the name', () => {
    mockUseIsNameHolder.mockReturnValue({ data: false })
    const { result } = renderHook(() =>
      useExpiryActions({
        name: 'test.eth',
        expiryDetails: [{ type: 'expiry', date: new Date('3255803954000') }],
      }),
    )
    expect(result.current).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'extend' })]),
    )
    expect(result.current).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'set-reminder' })]),
    )
  })

  it('should open the extension as the holder', () => {
    const { result } = renderHook(() =>
      useExpiryActions({
        name: 'test.eth',
        expiryDetails: [{ type: 'expiry', date: new Date('3255803954000') }],
      }),
    )
    const extend = result.current?.find((action) => action.type === 'extend')
    if (extend?.type === 'extend') extend.onClick()
    expect(mockUseIsNameHolder).toHaveBeenCalledWith({ name: 'test.eth' })
    expect(mockShowExtendNamesInput).toHaveBeenCalledWith('extend-names-test.eth', {
      names: ['test.eth'],
      isSelf: true,
      hasWrapped: false,
    })
  })

  it('should render null if name is subname and if expiryDetails contains a expiry type data with a valid expiry date', () => {
    const { result } = renderHook(() =>
      useExpiryActions({
        name: 'sub.test.eth',
        expiryDetails: [{ type: 'expiry', date: new Date('3255803954000') }],
      }),
    )
    expect(result.current).toEqual(null)
  })

  it('should return null if expiryDetails contains a expiry type data but an invalid expiry date', () => {
    const { result } = renderHook(() =>
      useExpiryActions({
        name: 'test.eth',
        expiryDetails: [{ type: 'expiry', date: undefined as unknown as Date }],
      }),
    )
    expect(result.current).toEqual(null)
  })

  it('should return null if expiryDetails does not contain a expiry type data', () => {
    const { result } = renderHook(() =>
      useExpiryActions({
        name: 'test.eth',
        expiryDetails: [{ type: 'expiry', date: undefined as unknown as Date }],
      }),
    )
    expect(result.current).toEqual(null)
  })

  it('should show both extend and set-reminder actions to the holder', () => {
    const { result } = renderHook(() =>
      useExpiryActions({
        name: 'test.eth',
        expiryDetails: [{ type: 'expiry', date: new Date('3255803954000') }],
      }),
    )
    expect(result.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'extend' }),
        expect.objectContaining({ type: 'set-reminder' }),
      ]),
    )
  })
})
