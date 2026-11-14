import type { TFunction } from 'react-i18next'
import { encodeFunctionData } from 'viem'

import { getNamePolicyAddress } from '@app/constants/chains'
import { Transaction, TransactionDisplayItem, TransactionFunctionParameters } from '@app/types'
import { namePolicyTermsAbi, Terms } from '@app/utils/snrcNameTerms'
import { getSnrcTokenId } from '@app/utils/snrcOffers'

type Data = { name: string; expires: bigint; duration: number; terms: Terms }

const displayItems = (
  { name }: Data,
  t: TFunction<'translation', undefined>,
): TransactionDisplayItem[] => [
  {
    label: 'name',
    value: name,
    type: 'name',
  },
  {
    label: 'action',
    value: t('transaction.description.acceptRenewalTerms'),
  },
]

const transaction = ({ client, data }: TransactionFunctionParameters<Data>) => ({
  to: getNamePolicyAddress(client.chain.id)!,
  data: encodeFunctionData({
    abi: namePolicyTermsAbi,
    functionName:
      data.terms.kind === 'community'
        ? 'acceptCommunityTermsForRenewal'
        : 'acceptGeneralTermsForRenewal',
    args: [getSnrcTokenId(data.name)!, data.expires, BigInt(data.duration), data.terms.hash],
  }),
})

export default { displayItems, transaction, backToInput: true } satisfies Transaction<Data>
