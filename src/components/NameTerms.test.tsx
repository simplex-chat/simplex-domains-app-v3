import { render, screen, userEvent } from '@app/test-utils'

import { describe, expect, it, vi } from 'vitest'

import { useNameTerms } from '@app/hooks/useNameTerms'

import { NameTerms, TermsText } from './NameTerms'

const TERMS = `0x${'77'.repeat(32)}` as const
const COMMIT = 'ab'.repeat(20)
const READER = `https://git.simplex.chat/simplex-chat/simplex-chat/src/commit/${COMMIT}/terms.md`

const nameTerms = (
  state: Partial<ReturnType<typeof useNameTerms>> = {},
): ReturnType<typeof useNameTerms> => ({
  required: true,
  kind: 'general',
  hash: TERMS,
  readerUrl: READER,
  text: '# Terms',
  isLoading: false,
  isFetching: false,
  isError: false,
  retry: vi.fn(),
  ...state,
})

const acceptance = () => ({ acceptedTerms: undefined, setAccepted: vi.fn() })

describe('TermsText', () => {
  it('renders the markdown of the terms, and HTML in them as text', () => {
    const { container } = render(
      <TermsText text={'# Terms\n\n## Use\n\n- one\n- two\n\n<script>alert(1)</script>'} />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Use' })).toBeVisible()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['one', 'two'])
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })
})

describe('NameTerms', () => {
  it.each([
    ['general', 'SimpleX general terms', 'I accept the SimpleX general terms'],
    ['community', 'Community name', 'I accept the community terms'],
  ] as const)('asks to accept the %s terms, linking their commit', async (kind, title, label) => {
    const accept = acceptance()
    render(<NameTerms terms={nameTerms({ kind })} acceptance={accept} />)
    expect(screen.getByText(title)).toBeVisible()
    expect(screen.getByTestId('terms-text')).toHaveTextContent('Terms')
    expect(screen.getByTestId('terms-reader')).toHaveAttribute('href', READER)
    expect(screen.getByText(label)).toBeVisible()
    await userEvent.click(screen.getByTestId('terms-accept'))
    expect(accept.setAccepted).toHaveBeenCalledWith(true)
  })

  it('links no commit page for a loopback link', () => {
    render(<NameTerms terms={nameTerms({ readerUrl: undefined })} acceptance={acceptance()} />)
    expect(screen.getByTestId('terms-text')).toBeVisible()
    expect(screen.queryByTestId('terms-reader')).not.toBeInTheDocument()
  })

  it('offers a retry when the terms cannot be loaded, apart from terms that are not set', async () => {
    const terms = nameTerms({ text: undefined, isError: true })
    const { unmount } = render(<NameTerms terms={terms} acceptance={acceptance()} />)
    expect(screen.getByTestId('terms-load-failed')).toBeVisible()
    expect(screen.queryByTestId('terms-unset')).not.toBeInTheDocument()
    expect(screen.queryByTestId('terms-accept')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('terms-retry'))
    expect(terms.retry).toHaveBeenCalledOnce()
    unmount()

    const unset = nameTerms({ hash: undefined, text: undefined })
    render(<NameTerms terms={unset} acceptance={acceptance()} />)
    expect(screen.getByTestId('terms-unset')).toHaveTextContent(
      "names can't be registered or received now",
    )
    expect(screen.queryByTestId('terms-retry')).not.toBeInTheDocument()
  })

  it('offers a retry when the listing cannot be read', () => {
    render(
      <NameTerms
        terms={nameTerms({ kind: undefined, hash: undefined, text: undefined, isError: true })}
        acceptance={acceptance()}
      />,
    )
    expect(screen.getByTestId('terms-load-failed')).toBeVisible()
    expect(screen.getByTestId('terms-retry')).toBeVisible()
  })
})
