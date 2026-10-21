import { describe, expect, it, vi } from 'vitest'

import { wagmiConfig } from './wagmi'

vi.mock('./wallets', () => ({ rainbowKitConnectors: [] }))

describe('wagmiConfig', () => {
  it('never follows CCIP-Read, so a name resolver cannot make the browser fetch its URL', () => {
    for (const chain of wagmiConfig.chains) {
      expect(wagmiConfig.getClient({ chainId: chain.id }).ccipRead).toBe(false)
    }
  })
})
