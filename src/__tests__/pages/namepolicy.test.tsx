import { mockFunction, render, screen, userEvent } from '@app/test-utils'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePolicyNames } from '@app/hooks/usePolicyNames'

import Page from '../../pages/namepolicy'

vi.mock('@app/hooks/usePolicyNames')
vi.mock('@app/constants/chains', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getNamePolicyAddress: () => NAME_POLICY,
}))

const NAME_POLICY = '0x4444444444444444444444444444444444444444'

const mockUsePolicyNames = mockFunction(usePolicyNames)

const names = {
  reserved: [
    { name: 'apple', reason: 2 },
    { name: 'simplex', reason: 1 },
    { name: 'uganda', reason: 3 },
  ],
  community: ['berlin', 'paris'],
}

const shown = (testId: string) =>
  Array.from(screen.getByTestId(testId).querySelectorAll('li'), (li) => li.textContent)

describe('name policy page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePolicyNames.mockReturnValue({ data: names, isLoading: false, isError: false })
  })

  it('lists every reserved name with its reason and every community name', () => {
    render(<Page />)
    expect(shown('name-policy-reserved')).toEqual([
      'apple.testingTrademark',
      'simplex.testingInternal',
      'uganda.testingReserved for a community',
    ])
    expect(shown('name-policy-community')).toEqual(['berlin.testing', 'paris.testing'])
    expect(screen.getByTestId('name-policy-reserved-count')).toHaveTextContent(/^3$/)
    expect(screen.getByTestId('name-policy-community-count')).toHaveTextContent(/^2$/)
  })

  it('says when the network has no name policy', () => {
    mockUsePolicyNames.mockReturnValue({ data: null, isLoading: false, isError: false })
    render(<Page />)
    expect(screen.getByTestId('name-policy-none')).toBeVisible()
    expect(screen.queryByTestId('name-policy-reserved')).not.toBeInTheDocument()
  })

  it('filters both lists by the search, in any letter case and by the full name', async () => {
    render(<Page />)
    const search = screen.getByTestId('name-policy-search')
    await userEvent.type(search, 'PL')
    expect(shown('name-policy-reserved')).toEqual([
      'apple.testingTrademark',
      'simplex.testingInternal',
    ])
    expect(shown('name-policy-community')).toEqual([])
    expect(screen.getByTestId('name-policy-reserved-count')).toHaveTextContent(/^2 of 3$/)
    expect(screen.getByTestId('name-policy-community-count')).toHaveTextContent(/^0 of 2$/)

    await userEvent.clear(search)
    await userEvent.type(search, 'paris.testing')
    expect(shown('name-policy-community')).toEqual(['paris.testing'])
    expect(shown('name-policy-reserved')).toEqual([])
  })

  it('offers a retry when the names cannot be read', async () => {
    const refetch = vi.fn()
    mockUsePolicyNames.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    })
    render(<Page />)
    expect(screen.getByTestId('name-policy-load-failed')).toBeVisible()
    await userEvent.click(screen.getByText('Try again'))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
