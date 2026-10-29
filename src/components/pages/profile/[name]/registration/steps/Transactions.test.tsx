import { mockFunction, render, screen, userEvent } from '@app/test-utils'

import { zeroAddress, zeroHash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCheckRegistered } from '@app/hooks/registration/useCheckRegistered'
import { useExistingCommitment } from '@app/hooks/registration/useExistingCommitment'
import { useSimulateRegistration } from '@app/hooks/registration/useSimulateRegistration'
import { useDurationCountdown } from '@app/hooks/time/useDurationCountdown'
import { useCommittedTerms, useNameTerms } from '@app/hooks/useNameTerms'
import { useTransactionFlow } from '@app/transaction-flow/TransactionFlowProvider'
import { TermsKind } from '@app/utils/snrcNameTerms'

import { RegistrationReducerDataItem } from '../types'
import Transactions from './Transactions'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => ({ address: OWNER }),
}))
vi.mock('@app/hooks/registration/useCheckRegistered')
vi.mock('@app/hooks/registration/useExistingCommitment')
vi.mock('@app/hooks/registration/useSimulateRegistration')
vi.mock('@app/hooks/time/useDurationCountdown')
vi.mock('@app/hooks/useNameTerms')
vi.mock('@app/transaction-flow/TransactionFlowProvider')

const OWNER = '0x2222222222222222222222222222222222222222'
const NAME = 'alicebob.simplex'
const GENERAL_TERMS = `0x${'11'.repeat(32)}` as const
const NEW_GENERAL_TERMS = `0x${'22'.repeat(32)}` as const
const COMMUNITY_TERMS = `0x${'33'.repeat(32)}` as const

const mockUseTransactionFlow = mockFunction(useTransactionFlow)
const mockUseNameTerms = mockFunction(useNameTerms)
const mockUseCommittedTerms = mockFunction(useCommittedTerms)
const mockUseExistingCommitment = mockFunction(useExistingCommitment)
const createTransactionFlow = vi.fn()

const registrationData = {
  seconds: 63072000,
  resolverAddress: zeroAddress,
  secret: zeroHash,
  records: [],
  clearRecords: false,
  reverseRecord: false,
  referrer: zeroHash,
  terms: { kind: 'general', hash: GENERAL_TERMS },
} as unknown as RegistrationReducerDataItem

const flow = (commitStage?: 'complete') =>
  mockUseTransactionFlow.mockReturnValue({
    getLatestTransaction: (key: string) =>
      commitStage && key.startsWith('commit-')
        ? { stage: commitStage, finaliseTime: Date.now() - 120_000 }
        : undefined,
    createTransactionFlow,
  } as never)
const nameTerms = (kind: TermsKind, hash: `0x${string}`) =>
  mockUseNameTerms.mockReturnValue({
    required: true,
    kind,
    hash,
    text: 'the terms',
    isLoading: false,
    isFetching: false,
    isError: false,
  })
const committed = (data?: `0x${string}`) =>
  mockUseCommittedTerms.mockReturnValue({ data, isLoading: false, isFetching: false })
const committedCommitment = () => mockUseCommittedTerms.mock.calls[0][0].commitment

const transactions = () => (
  <Transactions
    name={NAME}
    registrationData={registrationData}
    callback={vi.fn()}
    onStart={vi.fn()}
  />
)

describe('Transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFunction(useSimulateRegistration).mockReturnValue({ isSuccess: false })
    mockFunction(useCheckRegistered).mockReturnValue(false)
    mockFunction(useDurationCountdown).mockReturnValue('1 day')
    mockUseExistingCommitment.mockReturnValue({})
  })

  it.each([
    ['its terms changed', 'general', NEW_GENERAL_TERMS],
    ['it was listed', 'community', COMMUNITY_TERMS],
  ] as const)(
    'asks again after the commit when %s, and accepts the current kind',
    async (_, kind, hash) => {
      flow('complete')
      nameTerms(kind, hash)
      committed(GENERAL_TERMS)
      render(transactions())
      expect(mockUseCommittedTerms).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
      expect(screen.getByTestId('finish-button')).toBeDisabled()
      expect(screen.getByTestId('accept-terms-button')).toBeDisabled()

      await userEvent.click(screen.getByTestId('terms-accept'))
      await userEvent.click(screen.getByTestId('accept-terms-button'))

      expect(createTransactionFlow).toHaveBeenCalledWith(`acceptTerms-${NAME}-${OWNER}`, {
        transactions: [
          {
            name: 'acceptTerms',
            data: { name: NAME, commitment: committedCommitment(), terms: { kind, hash } },
          },
        ],
        autoClose: true,
      })
    },
  )

  it('lets the register go on when the commit accepted the current terms', () => {
    flow('complete')
    nameTerms('general', GENERAL_TERMS)
    committed(GENERAL_TERMS)
    render(transactions())
    expect(screen.queryByTestId('accept-terms-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('finish-button')).toBeEnabled()
  })

  it('commits with the terms accepted on the pricing step, and resumes an earlier commit', () => {
    flow()
    nameTerms('general', GENERAL_TERMS)
    committed()
    render(transactions())
    expect(createTransactionFlow).toHaveBeenCalledWith(
      `commit-${NAME}-${OWNER}`,
      expect.objectContaining({
        transactions: [
          {
            name: 'commitName',
            data: expect.objectContaining({ terms: { kind: 'general', hash: GENERAL_TERMS } }),
          },
        ],
      }),
    )
    expect(mockUseExistingCommitment).toHaveBeenCalledWith(
      expect.objectContaining({ commitment: committedCommitment(), enabled: true }),
    )
  })
})
