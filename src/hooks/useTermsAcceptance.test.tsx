import { act, renderHook } from '@app/test-utils'

import { describe, expect, it } from 'vitest'

import { Terms } from '@app/utils/snrcNameTerms'

import { useTermsAcceptance } from './useTermsAcceptance'

const TERMS: Terms = { kind: 'general', hash: `0x${'77'.repeat(32)}` }
const NEW_TERMS: Terms = { kind: 'general', hash: `0x${'88'.repeat(32)}` }
const COMMUNITY_TERMS: Terms = { kind: 'community', hash: TERMS.hash }

describe('useTermsAcceptance', () => {
  it('keeps an acceptance only for the terms it was given for', () => {
    const { result, rerender } = renderHook(({ terms }) => useTermsAcceptance(terms, TERMS), {
      initialProps: { terms: TERMS },
    })
    expect(result.current.acceptedTerms).toEqual(TERMS)
    rerender({ terms: NEW_TERMS })
    expect(result.current.acceptedTerms).toBeUndefined()
    act(() => result.current.setAccepted(true))
    expect(result.current.acceptedTerms).toEqual(NEW_TERMS)
    act(() => result.current.setAccepted(false))
    expect(result.current.acceptedTerms).toBeUndefined()
  })

  it('drops an acceptance when the kind of the same hash changes', () => {
    const { result, rerender } = renderHook(({ terms }) => useTermsAcceptance(terms, TERMS), {
      initialProps: { terms: TERMS },
    })
    rerender({ terms: COMMUNITY_TERMS })
    expect(result.current.acceptedTerms).toBeUndefined()
  })

  it('accepts nothing before the terms are known', () => {
    const { result } = renderHook(() => useTermsAcceptance({}))
    act(() => result.current.setAccepted(true))
    expect(result.current.acceptedTerms).toBeUndefined()
  })
})
