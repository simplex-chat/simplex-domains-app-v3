import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Address } from 'viem'
import { useBytecode } from 'wagmi'

import { Button, Dialog, Helper, Typography } from '@ensdomains/thorin'

import { AvatarWithIdentifier } from '@app/components/@molecules/AvatarWithIdentifier/AvatarWithIdentifier'
import { useIntentSigner } from '@app/hooks/useIntentSigner'
import { useConnectedHolder } from '@app/hooks/useNameOffer'
import { createTransactionItem } from '@app/transaction-flow/transaction'
import { TransactionDialogPassthrough } from '@app/transaction-flow/types'
import { addressNoteStyle, SignedIntent, signingErrorMessage } from '@app/utils/snrcIntents'

import { SearchView } from '../SendName/views/SearchView/SearchView'

const EIP7702_DELEGATION_PREFIX = '0xef0100'

type Data = {
  name: string
}

export type Props = {
  data: Data
} & TransactionDialogPassthrough

const OfferName = ({ data: { name }, dispatch, onDismiss }: Props) => {
  const { t } = useTranslation('transactionFlow')
  const { offer, connectedHolder } = useConnectedHolder({ name })
  const form = useForm<{ query: string }>({ defaultValues: { query: '' } })
  const [recipient, setRecipient] = useState<Address>()
  const {
    data: recipientCode,
    isSuccess: isCodeRead,
    isError: isCodeError,
  } = useBytecode({ address: recipient })
  const { signApproveName } = useIntentSigner()

  const offerTo = (to: Address, intent?: SignedIntent) => {
    dispatch({
      name: 'setTransactions',
      payload: [createTransactionItem('offerName', { name, recipient: to, intent })],
    })
    dispatch({ name: 'setFlowStage', payload: 'transaction' })
  }

  const holderSignature = useMutation({ mutationFn: signApproveName })

  if (!recipient)
    return (
      <FormProvider {...form}>
        <SearchView
          name={name}
          senderRole="owner"
          title={t('input.offerName.title', { name })}
          subtitle={t('input.offerName.recipient')}
          onSelect={setRecipient}
          onCancel={onDismiss}
        />
      </FormProvider>
    )

  const replaced = offer.data?.recipient

  const onConfirm = () => {
    if (connectedHolder?.kind === 'relayed')
      holderSignature.mutate(
        { name, holder: connectedHolder.account, recipient },
        { onSuccess: (intent) => offerTo(recipient, intent) },
      )
    else offerTo(recipient)
  }

  return (
    <>
      <Dialog.Heading title={t('input.offerName.title', { name })} />
      <Dialog.Content data-testid="offer-name-confirm-view">
        <Typography>{t('input.offerName.description', { name })}</Typography>
        <AvatarWithIdentifier address={recipient} shortenAddressAsTitle={false} />
        {(offer.isError || isCodeError) && (
          <Helper alert="error">{t('input.offerName.failed')}</Helper>
        )}
        {!!recipientCode && !recipientCode.startsWith(EIP7702_DELEGATION_PREFIX) && (
          <Helper alert="warning">{t('input.offerName.contract')}</Helper>
        )}
        {!!replaced && replaced.toLowerCase() !== recipient.toLowerCase() && (
          <Helper alert="info" style={addressNoteStyle}>
            {t('input.offerName.replaces', { recipient: replaced })}
          </Helper>
        )}
        {connectedHolder?.kind === 'relayed' && (
          <Helper alert="info" style={addressNoteStyle}>
            {t('input.offerName.relayed', { holder: connectedHolder.account })}
          </Helper>
        )}
        {holderSignature.error && (
          <Helper alert="error" style={addressNoteStyle}>
            {signingErrorMessage(holderSignature.error)}
          </Helper>
        )}
      </Dialog.Content>
      <Dialog.Footer
        leading={
          <Button colorStyle="accentSecondary" onClick={() => setRecipient(undefined)}>
            {t('action.back', { ns: 'common' })}
          </Button>
        }
        trailing={
          <Button
            data-testid="offer-name-confirm"
            disabled={!offer.data || offer.isError || !isCodeRead || holderSignature.isPending}
            loading={holderSignature.isPending}
            onClick={onConfirm}
          >
            {t('action.next', { ns: 'common' })}
          </Button>
        }
      />
    </>
  )
}

export default OfferName
