import { renderHook } from '@app/test-utils'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkETH2LDFromName } from '@app/utils/utils'

import { useExpiryDetails } from './useExpiryDetails'

const mockUseNameType = vi.fn()
vi.mock('@app/hooks/nameType/useNameType', () => ({
  useNameType: () => mockUseNameType(),
}))

const mockUseBasicName = vi.fn()
vi.mock('@app/hooks/useBasicName', () => ({
  useBasicName: ({ enabled }: any) => {
    return enabled ? mockUseBasicName() : { isLoading: false }
  },
}))

const mockUseRegistrationData = vi.fn().mockReturnValue({
  data: {
    registrationDate: new Date(3255803954000),
    transactionHash: '0xhash',
  },
  isLoading: false,
})
vi.mock('@app/hooks/useRegistrationData', () => ({
  default: ({ name, enabled }: any) =>
    enabled && checkETH2LDFromName(name) ? mockUseRegistrationData() : { isLoading: false },
}))

vi.mock('@app/hooks/chain/useChainName', () => ({
  useChainName: () => 'goerli',
}))

const mockUseDisputeEnd = vi.fn()
vi.mock('@app/hooks/useDisputeEnd', () => ({
  useDisputeEnd: (parameters: unknown) => mockUseDisputeEnd(parameters),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUseDisputeEnd.mockReturnValue({ status: 'none', isFetching: false })
})

describe('useExpiryDetails', () => {
  describe('eth 2lds', () => {
    ;['eth-unwrapped-2ld', 'eth-emancipated-2ld', 'eth-locked-2ld'].forEach((nameType) => {
      it(`should return expiry, grace-period and `, () => {
        mockUseNameType.mockReturnValue({
          data: nameType,
          isLoading: false,
        })
        const { result } = renderHook(() =>
          useExpiryDetails({
            name: 'test.eth',
            details: {
              expiryDate: new Date(3255803954000),
              isLoading: false,
            } as any,
          }),
        )

        expect(mockUseRegistrationData).toHaveBeenCalled()
        expect(mockUseBasicName).not.toHaveBeenCalled()
        expect(result.current.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'expiry' })]),
        )
        expect(result.current.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'grace-period' })]),
        )
        expect(result.current.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'registration' })]),
        )
      })
    })
  })

  describe('dispute period', () => {
    const expiryDetails = () =>
      renderHook(() =>
        useExpiryDetails({
          name: 'test.testing',
          details: {
            expiryDate: new Date(3255803954000),
            isLoading: false,
          } as any,
        }),
      ).result.current

    beforeEach(() => {
      mockUseNameType.mockReturnValue({
        data: 'eth-unwrapped-2ld',
        isLoading: false,
      })
    })

    it('should return the end of the dispute period while it lasts', () => {
      const disputeEnd = new Date(Date.now() + 60_000)
      mockUseDisputeEnd.mockReturnValue({ status: 'until', date: disputeEnd, isFetching: false })
      expect(expiryDetails().data).toContainEqual(
        expect.objectContaining({ type: 'dispute-period', date: disputeEnd }),
      )
    })

    it('should return no dispute period without one', () => {
      expect(expiryDetails().data?.map(({ type }) => type)).toEqual(['expiry', 'grace-period'])
    })

    it('should wait for the dispute period', () => {
      mockUseDisputeEnd.mockReturnValue({ status: 'loading', isFetching: true })
      expect(expiryDetails()).toMatchObject({ data: undefined, isLoading: true })
    })

    it('should read the dispute period only while enabled', () => {
      renderHook(() =>
        useExpiryDetails(
          { name: 'test.testing', details: { isLoading: false } as any },
          { enabled: false },
        ),
      )
      expect(mockUseDisputeEnd).toHaveBeenCalledWith({ name: 'test.testing', enabled: false })
    })
  })

  describe('pcc burned eth subnamess', () => {
    ;['eth-emancipated-subname', 'eth-locked-subname'].forEach((nameType) => {
      it(`should return expiry, grace-period and `, () => {
        mockUseNameType.mockReturnValue({
          data: nameType,
          isLoading: false,
        })
        mockUseBasicName.mockReturnValue({
          wrapperData: {
            expiry: { date: new Date(3255803954000) },
          },
          isLoading: false,
        })

        const { result } = renderHook(() =>
          useExpiryDetails({
            name: 'sub.test.eth',
            details: {
              wrapperData: {
                expiry: { date: new Date(3255803954000) },
              },
              isLoading: false,
            } as any,
          }),
        )

        expect(mockUseRegistrationData).not.toHaveBeenCalled()
        expect(mockUseBasicName).toHaveBeenCalled()
        expect(result.current.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'expiry' })]),
        )
        expect(result.current.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'parent-expiry' })]),
        )
      })
    })
  })

  describe('pcc not burned eth subnamess', () => {
    ;['eth-unwrapped-subname', 'eth-wrapped-subname', 'eth-pcc-expired-subname'].forEach(
      (nameType) => {
        it(`should return expiry, grace-period and `, () => {
          mockUseNameType.mockReturnValue({
            data: nameType,
            isLoading: false,
          })
          mockUseBasicName.mockReturnValue({
            expiryDate: new Date(3255803954000),
            isLoading: false,
          })

          const { result } = renderHook(() =>
            useExpiryDetails({
              name: 'sub.test.eth',
              details: {
                expiryDate: new Date(3255803954000),
                isLoading: false,
              } as any,
            }),
          )

          expect(mockUseRegistrationData).not.toHaveBeenCalled()
          expect(mockUseBasicName).toHaveBeenCalled()
          expect(result.current.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'parent-grace-period' })]),
          )
          expect(result.current.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'parent-expiry' })]),
          )
        })
      },
    )
  })
})
