import type { TFunction } from 'react-i18next'
import { Address, encodeFunctionData } from 'viem'

import { getNamePolicyAddress } from '@app/constants/chains'
import { Transaction, TransactionDisplayItem, TransactionFunctionParameters } from '@app/types'
import { namePolicyTermsAbi, Terms } from '@app/utils/snrcNameTerms'
import { getSnrcTokenId } from '@app/utils/snrcOffers'

type Data = { name: string; holder: Address; offerNumber: bigint; terms: Terms }

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
    value: t('transaction.description.acceptClaimTerms'),
  },
]

const transaction = ({ client, data }: TransactionFunctionParameters<Data>) => ({
  to: getNamePolicyAddress(client.chain.id)!,
  data: encodeFunctionData({
    abi: namePolicyTermsAbi,
    functionName:
      data.terms.kind === 'community'
        ? 'acceptCommunityTermsForClaim'
        : 'acceptGeneralTermsForClaim',
    args: [getSnrcTokenId(data.name)!, data.holder, data.offerNumber, data.terms.hash],
  }),
})

export default { displayItems, transaction, backToInput: true } satisfies Transaction<Data>
