import type { TFunction } from 'react-i18next'
import { encodeFunctionData, Hex } from 'viem'

import { getNamePolicyAddress } from '@app/constants/chains'
import { Transaction, TransactionDisplayItem, TransactionFunctionParameters } from '@app/types'
import { namePolicyTermsAbi, Terms } from '@app/utils/snrcNameTerms'

type Data = { name: string; commitment: Hex; terms: Terms }

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
    value: t('transaction.description.acceptTerms'),
  },
]

const transaction = ({ client, data }: TransactionFunctionParameters<Data>) => ({
  to: getNamePolicyAddress(client.chain.id)!,
  data: encodeFunctionData({
    abi: namePolicyTermsAbi,
    functionName:
      data.terms.kind === 'community' ? 'commitUnderCommunityTerms' : 'commitUnderGeneralTerms',
    args: [data.commitment, data.terms.hash],
  }),
})

export default { displayItems, transaction } satisfies Transaction<Data>
