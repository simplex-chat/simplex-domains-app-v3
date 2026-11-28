import type { TFunction } from 'react-i18next'
import { Address, zeroAddress } from 'viem'

import { getSnrcAddresses } from '@app/constants/chains'
import {
  HelperProps,
  Transaction,
  TransactionDisplayItem,
  TransactionFunctionParameters,
} from '@app/types'
import { addressNoteStyle, encodeApproveName, SignedIntent } from '@app/utils/snrcIntents'

type Data = {
  name: string
  intent?: SignedIntent
}

const displayItems = (
  { name, intent }: Data,
  t: TFunction<'translation', undefined>,
): TransactionDisplayItem[] => [
  {
    label: 'name',
    value: name,
    type: 'name',
  },
  {
    label: 'action',
    value: t('transaction.description.withdrawOffer'),
  },
  ...(intent ? [{ label: 'from', value: intent.signer, type: 'address' } as const] : []),
]

const helper = (
  { intent }: Data,
  t: TFunction<'translation', undefined>,
): HelperProps | undefined =>
  intent && {
    alert: 'info',
    children: t('transaction.info.withdrawOfferRelayed', { holder: intent.signer }),
    style: addressNoteStyle,
  }

const transaction = ({ client, data }: TransactionFunctionParameters<Data>) => ({
  to: getSnrcAddresses(client.chain.id).BaseRegistrarImplementation as Address,
  data: encodeApproveName({ name: data.name, to: zeroAddress, intent: data.intent }),
})

export default { displayItems, helper, transaction } satisfies Transaction<Data>
