import { Address, concat, encodeFunctionData, Hex, parseAbi, size, slice, toHex } from 'viem'

import { makeRegistrationCallData, RegistrationParameters } from '@ensdomains/ensjs/utils'

import { MIN_DISPUTE_DAYS } from '@app/constants/simplex'

import type { Terms } from './snrcNameTerms'
import { getSnrcTokenId, registrarOfferAbi } from './snrcOffers'
import { ONE_DAY } from './time'

export type Intent = { nonce: bigint; deadline: bigint; signature: Hex }

export type SignedIntent = Intent & { signer: Address }

export const noncesAbi = parseAbi(['function nonces(address signer) view returns (uint256)'])

export const NO_ANNOUNCEMENT = { ephemeralPubKey: '0x', viewTag: '0x00' } as const

export const intentDeadline = () => BigInt(Math.floor(Date.now() / 1000) + 2 * ONE_DAY)

export const normalizeSignature = (signature: Hex) => {
  if (size(signature) !== 65) return signature
  const v = Number(slice(signature, 64))
  return v < 27 ? concat([slice(signature, 0, 64), toHex(v + 27, { size: 1 })]) : signature
}

export const signingErrorMessage = (error: Error) =>
  'shortMessage' in error && typeof error.shortMessage === 'string'
    ? error.shortMessage
    : error.message

export const addressNoteStyle = { overflowWrap: 'anywhere' } as const

const acceptTermsFields = [
  { name: 'commitment', type: 'bytes32' },
  { name: 'termsHash', type: 'bytes32' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
] as const

const acceptTermsTypes = {
  general: { AcceptGeneralTerms: acceptTermsFields },
  community: { AcceptCommunityTerms: acceptTermsFields },
} as const

const acceptTermsPrimaryType = {
  general: 'AcceptGeneralTerms',
  community: 'AcceptCommunityTerms',
} as const

export const makeAcceptTermsTypedData = ({
  chainId,
  namePolicy,
  commitment,
  terms,
  nonce,
  deadline,
}: {
  chainId: number
  namePolicy: Address
  commitment: Hex
  terms: Terms
  nonce: bigint
  deadline: bigint
}) =>
  ({
    domain: { name: 'SimplexNamePolicy', version: '1', chainId, verifyingContract: namePolicy },
    types: acceptTermsTypes[terms.kind],
    primaryType: acceptTermsPrimaryType[terms.kind],
    message: { commitment, termsHash: terms.hash, nonce, deadline },
  }) as const

export const makeRegisterNameTypedData = ({
  chainId,
  sponsor,
  registrationParams,
  nonce,
  deadline,
}: {
  chainId: number
  sponsor: Address
  registrationParams: RegistrationParameters
  nonce: bigint
  deadline: bigint
}) => {
  const { label, owner, duration, resolver, data } = makeRegistrationCallData(registrationParams)
  return {
    domain: { name: 'SimplexSponsor', version: '1', chainId, verifyingContract: sponsor },
    types: {
      RegisterName: [
        { name: 'label', type: 'string' },
        { name: 'owner', type: 'address' },
        { name: 'duration', type: 'uint256' },
        { name: 'resolver', type: 'address' },
        { name: 'data', type: 'bytes[]' },
        { name: 'disputeDays', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'RegisterName',
    message: {
      label,
      owner,
      duration,
      resolver,
      data,
      disputeDays: BigInt(MIN_DISPUTE_DAYS),
      nonce,
      deadline,
    },
  } as const
}

export const makeApproveNameTypedData = ({
  chainId,
  registrar,
  from,
  to,
  tokenId,
  nonce,
  deadline,
}: {
  chainId: number
  registrar: Address
  from: Address
  to: Address
  tokenId: bigint
  nonce: bigint
  deadline: bigint
}) =>
  ({
    domain: { name: 'SimplexNames', version: '1', chainId, verifyingContract: registrar },
    types: {
      ApproveName: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'ephemeralPubKey', type: 'bytes' },
        { name: 'viewTag', type: 'bytes1' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'ApproveName',
    message: { from, to, tokenId, ...NO_ANNOUNCEMENT, nonce, deadline },
  }) as const

export const encodeApproveName = ({
  name,
  to,
  intent,
}: {
  name: string
  to: Address
  intent?: SignedIntent
}) => {
  const tokenId = getSnrcTokenId(name)!
  return intent
    ? encodeFunctionData({
        abi: registrarOfferAbi,
        functionName: 'approveWithSig',
        args: [
          intent.signer,
          to,
          tokenId,
          intent.nonce,
          intent.deadline,
          intent.signature,
          NO_ANNOUNCEMENT.ephemeralPubKey,
          NO_ANNOUNCEMENT.viewTag,
        ],
      })
    : encodeFunctionData({ abi: registrarOfferAbi, functionName: 'approve', args: [to, tokenId] })
}
