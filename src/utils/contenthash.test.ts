import { describe, expect, it } from 'vitest'

import type { DecodedContentHash } from '@ensdomains/ensjs/utils'

import { getContentHashLink } from './contenthash'

const ipfs: DecodedContentHash = {
  protocolType: 'ipfs',
  decoded: 'bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4',
}
const ipns: DecodedContentHash = {
  protocolType: 'ipns',
  decoded: 'k51qzi5uqu5dk1h0t1ofq49oww8ykmcnsxl1h3m0d41pb58eog9f9yjjwxnnwh',
}

describe('getContentHashLink', () => {
  it.each(['brand.simplex', 'pay.brand.simplex', 'alice.testing', 'vitalik.eth'])(
    'links %s by content hash through dweb.link, never <name>.limo',
    (name) => {
      expect(getContentHashLink({ name, chainId: 1, decodedContentHash: ipfs })).toBe(
        'https://bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4.ipfs.dweb.link',
      )
      expect(getContentHashLink({ name, chainId: 1, decodedContentHash: ipns })).toBe(
        'https://k51qzi5uqu5dk1h0t1ofq49oww8ykmcnsxl1h3m0d41pb58eog9f9yjjwxnnwh.ipns.dweb.link',
      )
    },
  )
})
