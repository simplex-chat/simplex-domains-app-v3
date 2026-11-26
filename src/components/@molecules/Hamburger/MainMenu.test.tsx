import { mockFunction, render, screen, userEvent } from '@app/test-utils'

import mockRouter from 'next-router-mock'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChainName } from '@app/hooks/chain/useChainName'
import { useGasPrice } from '@app/hooks/chain/useGasPrice'
import { useGraphOutOfSync } from '@app/utils/SyncProvider/SyncProvider'

import { NetworkSection } from './MainMenu'

vi.mock('next/router', async () => await vi.importActual('next-router-mock'))
vi.mock('@app/hooks/chain/useChainName')
vi.mock('@app/hooks/chain/useGasPrice')
vi.mock('@app/utils/SyncProvider/SyncProvider')

mockFunction(useChainName).mockReturnValue('mainnet')
mockFunction(useGasPrice).mockReturnValue({ data: 80000000n })
mockFunction(useGraphOutOfSync).mockReturnValue(false)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('NetworkSection', () => {
  it('the admin page is opened by a click on the TLD, shown as text between the network and the gas price', async () => {
    vi.stubEnv('NEXT_PUBLIC_SIMPLEX_TLD', 'simplex')
    mockRouter.setCurrentUrl('/')
    render(<NetworkSection />)
    const tld = screen.getByText('.simplex TLD')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('mainnet').compareDocumentPosition(tld)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(tld.compareDocumentPosition(screen.getByText(/ Gwei$/))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    await userEvent.click(tld)
    expect(mockRouter.asPath).toBe('/admin')
  })

  it('the testing TLD is shown when NEXT_PUBLIC_SIMPLEX_TLD is empty', () => {
    vi.stubEnv('NEXT_PUBLIC_SIMPLEX_TLD', '')
    render(<NetworkSection />)
    expect(screen.getByText('.testing TLD')).toBeInTheDocument()
  })
})
