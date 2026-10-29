import { mockFunction, render, screen, userEvent } from '@app/test-utils'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'

import { useNameTerms, useTermsText } from '@app/hooks/useNameTerms'

import Page from '../../pages/admin'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  usePublicClient: vi.fn(),
  useWalletClient: vi.fn(),
}))
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSnrcAddresses: () => ({ ETHRegistrarController: CONTROLLER, SimplexNamePolicy: NAME_POLICY }),
  getNamePolicyAddress: () => NAME_POLICY,
}))
vi.mock('@app/hooks/useNameTerms', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNameTerms: vi.fn(),
  useTermsText: vi.fn(),
}))

const OWNER = '0x2222222222222222222222222222222222222222'
const OTHER = '0x3333333333333333333333333333333333333333'
const CONTROLLER = '0x1111111111111111111111111111111111111111'
const NAME_POLICY = '0x4444444444444444444444444444444444444444'
const COMMIT = 'ab'.repeat(20)
const DIGEST = 'cd'.repeat(32)
const LINK = `https://git.simplex.chat/simplex-chat/simplex-chat/raw/commit/${COMMIT}/general-terms.md#sha256=${DIGEST}`

const reads: Record<string, unknown> = {
  owner: OWNER,
  minCharLength: 6,
  nftGateEnabled: false,
  generalTermsLink: '',
  generalTermsHash: `0x${'00'.repeat(32)}`,
  communityTermsLink: '',
  communityTermsHash: `0x${'00'.repeat(32)}`,
}
const writeContract = vi.fn(async () => '0xabcdef0123')

const connect = (address: `0x${string}`) => mockFunction(useAccount).mockReturnValue({ address })

describe('admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFunction(useChainId).mockReturnValue(1)
    mockFunction(usePublicClient).mockReturnValue({
      readContract: async ({ functionName }: { functionName: string }) => reads[functionName],
      getCode: async () => '0x01',
      waitForTransactionReceipt: async () => ({ logs: [] }),
    } as never)
    mockFunction(useWalletClient).mockReturnValue({ data: { writeContract } } as never)
    mockFunction(useNameTerms).mockReturnValue({ kind: 'general' })
    mockFunction(useTermsText).mockReturnValue({ text: { data: undefined } } as never)
  })

  it('renders the terms setters only to the owner', async () => {
    connect(OTHER)
    render(<Page />)
    expect(await screen.findByText('You are NOT the owner')).toBeVisible()
    expect(screen.queryByTestId('admin-general-terms-set')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-community-terms-set')).not.toBeInTheDocument()
  })

  it('shows a malformed link as an error and does not send it', async () => {
    connect(OWNER)
    render(<Page />)
    await userEvent.type(
      await screen.findByTestId('admin-general-terms-input'),
      'https://example.com/general-terms.md',
    )
    expect(screen.getByText('Not a terms link for this chain')).toBeVisible()
    expect(screen.getByTestId('admin-general-terms-set')).toBeDisabled()
  })

  it.each([
    ['admin-general-terms', 'setGeneralTerms'],
    ['admin-community-terms', 'setCommunityTerms'],
  ])('sends the link from %s with %s', async (testId, functionName) => {
    connect(OWNER)
    render(<Page />)
    await userEvent.type(await screen.findByTestId(`${testId}-input`), LINK)
    await userEvent.click(screen.getByTestId(`${testId}-set`))
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: NAME_POLICY, functionName, args: [LINK] }),
    )
  })
})
