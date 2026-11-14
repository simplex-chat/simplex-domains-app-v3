import { Address, parseEther, toHex } from 'viem'

import { makeCommitment, RegistrationParameters } from '@ensdomains/ensjs/utils'

import type { TransactionData } from '@app/transaction-flow/transaction'
import { Terms } from '@app/utils/snrcNameTerms'
import { getSnrcTokenId } from '@app/utils/snrcOffers'

import { useEstimateGasWithStateOverride } from '../chain/useEstimateGasWithStateOverride'

type ReturnType = null | Parameters<typeof useEstimateGasWithStateOverride>[0]['transactions']

const COMMITMENTS_SLOT = 160
const ACCEPTED_TERMS_SLOT = 2
const ACCEPTED_RENEWAL_TERMS_SLOT = 109

export const acceptedRenewalTermsOverride = ({
  namePolicyAddress,
  holder,
  renewal: { name, expires, duration, terms },
}: {
  namePolicyAddress: Address
  holder: Address
  renewal: TransactionData<'acceptRenewalTerms'>
}) => ({
  address: namePolicyAddress,
  stateDiff: [
    {
      slot: ACCEPTED_RENEWAL_TERMS_SLOT,
      keys: [toHex(getSnrcTokenId(name)!), holder, toHex(expires), toHex(duration)],
      value: terms.hash,
    },
  ],
})

export const calculateTransactions = ({
  registrationParams,
  terms,
  ethRegistrarControllerAddress,
  namePolicyAddress,
  fiveMinutesAgoInSeconds,
  price,
}: {
  registrationParams?: RegistrationParameters
  terms?: Terms
  ethRegistrarControllerAddress: unknown
  namePolicyAddress?: Address
  fiveMinutesAgoInSeconds: number
  price?: { base: bigint; premium: bigint }
}): ReturnType => {
  if (!registrationParams || !ethRegistrarControllerAddress || !price) return null
  const commitment = makeCommitment(registrationParams)

  const registrationStateOverride = {
    address: ethRegistrarControllerAddress as Address,
    stateDiff: [
      {
        slot: COMMITMENTS_SLOT,
        keys: [commitment],
        value: BigInt(fiveMinutesAgoInSeconds),
      },
    ],
  }
  const termsStateOverride =
    terms && namePolicyAddress
      ? [
          {
            address: namePolicyAddress,
            stateDiff: [
              {
                slot: ACCEPTED_TERMS_SLOT,
                keys: [commitment, registrationParams.owner],
                value: terms.hash,
              },
            ],
          },
        ]
      : []

  return [
    {
      name: 'commitName',
      data: { ...registrationParams, terms },
    },
    {
      name: 'registerName',
      data: registrationParams,
      stateOverride: [
        registrationStateOverride,
        ...termsStateOverride,
        {
          address: registrationParams.owner,
          balance: price ? (price.base + price.premium) * 2n + parseEther('1000000') : undefined,
        },
      ],
    },
  ] as const
}
