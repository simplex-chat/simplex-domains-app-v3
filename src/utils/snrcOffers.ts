import { labelhash, parseAbi } from 'viem'

import { ALLOWED_LABEL_REGEX } from '@app/hooks/useValidate'

import { isEthLikeTld } from './utils'

export const registrarOfferAbi = parseAbi([
  'function baseNode() view returns (bytes32)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function offers(uint256 tokenId) view returns (uint256)',
  'function approve(address to, uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
])

export const getSnrcTokenId = (name: string) => {
  const labels = name.split('.')
  if (labels.length !== 2 || !isEthLikeTld(name) || !ALLOWED_LABEL_REGEX.test(labels[0]))
    return undefined
  return BigInt(labelhash(labels[0]))
}
