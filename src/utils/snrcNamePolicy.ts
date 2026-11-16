import { parseAbi } from 'viem'

// SimplexNamePolicy.Reason; each index is the value stored on chain, so entries are only appended.
export const REASONS = ['None', 'Internal', 'Trademark', 'Community'] as const

export const namePolicyNameEvents = parseAbi([
  'event ReservedNameAdded(string name, uint8 reason)',
  'event ReservedNameReasonChanged(string name, uint8 reason)',
  'event ReservedNameRemoved(string name)',
  'event CommunityNameAdded(string name)',
  'event CommunityNameRemoved(string name)',
])
