import { Hex, parseAbi } from 'viem'

export type TermsKind = 'general' | 'community'

export type Terms = { kind: TermsKind; hash: Hex }

export const namePolicyTermsAbi = parseAbi([
  'function communityNames(bytes32 labelhash) view returns (bool)',
  'function generalTermsLink() view returns (string)',
  'function generalTermsHash() view returns (bytes32)',
  'function communityTermsLink() view returns (string)',
  'function communityTermsHash() view returns (bytes32)',
  'function acceptedTerms(bytes32 commitment, address acceptor) view returns (bytes32)',
  'function acceptedClaimTerms(uint256 tokenId, address from, address recipient, uint256 offer) view returns (bytes32)',
  'function commitUnderGeneralTerms(bytes32 commitment, bytes32 acceptedTermsHash)',
  'function commitUnderCommunityTerms(bytes32 commitment, bytes32 acceptedTermsHash)',
  'function acceptGeneralTermsForClaim(uint256 tokenId, address from, uint256 offer, bytes32 acceptedTermsHash)',
  'function acceptCommunityTermsForClaim(uint256 tokenId, address from, uint256 offer, bytes32 acceptedTermsHash)',
])
