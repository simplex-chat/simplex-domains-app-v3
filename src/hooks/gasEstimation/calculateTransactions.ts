import { Address, parseEther } from 'viem'

import { makeCommitment, RegistrationParameters } from '@ensdomains/ensjs/utils'

import { Terms } from '@app/utils/snrcNameTerms'

import { useEstimateGasWithStateOverride } from '../chain/useEstimateGasWithStateOverride'

type ReturnType = null | Parameters<typeof useEstimateGasWithStateOverride>[0]['transactions']

const ACCEPTED_TERMS_SLOT = 103

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

  // SimplexController is UUPS-upgradeable and inherits Initializable +
  // Ownable2StepUpgradeable + UUPSUpgradeable (all OZ v4.9.3). That stack
  // consumes 251 storage slots of __gap padding + owner/initializer state
  // before any of the controller's own variables. `commitments` is the 10th
  // variable declared in SimplexController, so it lives at slot 251 + 9 =
  // 260. Upstream ENS's `ETHRegistrarController` keeps those vars as
  // immutables (no storage) and lands `commitments` at slot 1; we don't.
  // If state vars get inserted before `commitments` in SimplexController,
  // bump this constant in lockstep. Verified on mainnet via eth_getStorageAt.
  const registrationStateOverride = {
    address: ethRegistrarControllerAddress as Address,
    stateDiff: [
      {
        slot: 260,
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
