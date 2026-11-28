import { renderHook, waitFor } from '@app/test-utils'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDnsImportData } from '@app/hooks/ensjs/dns/useDnsImportData'
import { useDnsOffchainData } from '@app/hooks/ensjs/dns/useDnsOffchainData'
import { useDnsOwner } from '@app/hooks/ensjs/dns/useDnsOwner'
import { useSupportsTLD } from '@app/hooks/useSupportsTLD'

describe('DNS lookups', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['the TLD of a name', () => useSupportsTLD('alice.testing').fetchStatus],
    ['a searched label', () => useSupportsTLD('freshname').fetchStatus],
    ['the DNS owner of a name', () => useDnsOwner({ name: 'example.com' }).fetchStatus],
    [
      'the offchain resolver of a name',
      () => useDnsOffchainData({ name: 'example.com' }).fetchStatus,
    ],
    ['the import proof of a name', () => useDnsImportData({ name: 'example.com' }).fetchStatus],
  ])('are not requested for %s', async (_, useFetchStatus) => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ Status: 3 })))
    const { result } = renderHook(useFetchStatus)
    await waitFor(() =>
      expect(fetchSpy.mock.calls.length > 0 || result.current === 'idle').toBe(true),
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
