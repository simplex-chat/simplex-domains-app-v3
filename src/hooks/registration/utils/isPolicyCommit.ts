import { Address, decodeFunctionData, getAbiItem, getAddress, Hex, toFunctionSelector } from 'viem'

import { namePolicyTermsAbi } from '@app/utils/snrcNameTerms'

const policyCommitSelectors = (
  ['commitUnderGeneralTerms', 'commitUnderCommunityTerms'] as const
).map((name) => toFunctionSelector(getAbiItem({ abi: namePolicyTermsAbi, name })))

export const isPolicyCommit = (
  { to, input }: { to: Address | null; input: Hex },
  { commitment, namePolicyAddress }: { commitment: Hex; namePolicyAddress?: Address },
) => {
  if (!to || !namePolicyAddress || getAddress(to) !== getAddress(namePolicyAddress)) return false
  if (!policyCommitSelectors.some((selector) => input.startsWith(selector))) return false
  const { args } = decodeFunctionData({ abi: namePolicyTermsAbi, data: input })
  return args[0] === commitment
}
