import { act, mockFunction, render, screen, userEvent, waitFor } from '@app/test-utils'

import mockRouter from 'next-router-mock'
import { describe, expect, it, vi } from 'vitest'

import { useInitial } from '@app/hooks/useInitial'
import { useBreakpoint } from '@app/utils/BreakpointProvider'
import { useGraphOutOfSync } from '@app/utils/SyncProvider/SyncProvider'

import Hamburger from './Hamburger'

vi.mock('next/router', async () => await vi.importActual('next-router-mock'))
vi.mock('@app/hooks/useInitial')
vi.mock('@app/utils/BreakpointProvider')
vi.mock('@app/utils/SyncProvider/SyncProvider')
vi.mock('./MainMenu', () => ({ default: () => <div>main menu</div> }))

mockFunction(useInitial).mockReturnValue(false)
mockFunction(useBreakpoint).mockReturnValue({ sm: false })
mockFunction(useGraphOutOfSync).mockReturnValue(false)

describe('Hamburger', () => {
  it('the menu is closed when another page of the app is opened', async () => {
    render(<Hamburger />)
    await userEvent.click(screen.getByRole('button'))
    expect(await screen.findByText('main menu')).toBeInTheDocument()
    await act(() => mockRouter.push('/admin'))
    await waitFor(() => expect(screen.queryByText('main menu')).not.toBeInTheDocument())
  })
})
