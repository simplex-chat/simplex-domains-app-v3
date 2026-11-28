import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { zeroAddress } from 'viem'

import { Banner, Helper } from '@ensdomains/thorin'

import { BannerMessageWithAction } from '@app/components/@atoms/BannerMessageWithAction/BannerMessageWithAction'
import { useIntentSigner } from '@app/hooks/useIntentSigner'
import { useConnectedHolder } from '@app/hooks/useNameOffer'
import { createTransactionItem } from '@app/transaction-flow/transaction'
import { useTransactionFlow } from '@app/transaction-flow/TransactionFlowProvider'
import { addressNoteStyle, SignedIntent, signingErrorMessage } from '@app/utils/snrcIntents'

export const NameOfferBanner = ({ name }: { name: string }) => {
  const { t } = useTranslation('profile')
  const { offer, connectedHolder } = useConnectedHolder({ name })
  const { usePreparedDataInput, createTransactionFlow } = useTransactionFlow()
  const showClaimNameInput = usePreparedDataInput('ClaimName')
  const { signApproveName } = useIntentSigner()
  const holderSignature = useMutation({ mutationFn: signApproveName })

  if (!offer.data?.recipient) return null
  const { holder, recipient, isRecipient } = offer.data

  if (isRecipient)
    return (
      <Banner
        alert="info"
        title={t('banner.offer.recipient.title', { name })}
        style={addressNoteStyle}
      >
        <BannerMessageWithAction
          content={t('banner.offer.recipient.description', { holder })}
          button={{
            children: t('banner.offer.recipient.action'),
            onClick: () => showClaimNameInput(`claim-name-${name}`, { name }),
          }}
        />
      </Banner>
    )

  const withdraw = (intent?: SignedIntent) =>
    createTransactionFlow(`withdraw-offer-${name}`, {
      transactions: [createTransactionItem('withdrawOffer', { name, intent })],
    })

  if (connectedHolder)
    return (
      <Banner alert="info" title={t('banner.offer.holder.title')} style={addressNoteStyle}>
        <BannerMessageWithAction
          content={t('banner.offer.holder.description', { recipient })}
          button={{
            children: t('banner.offer.holder.action'),
            colorStyle: 'accentSecondary',
            disabled: holderSignature.isPending,
            onClick: () =>
              connectedHolder.kind === 'relayed'
                ? holderSignature.mutate(
                    { name, holder: connectedHolder.account, recipient: zeroAddress },
                    { onSuccess: withdraw },
                  )
                : withdraw(),
          }}
        />
        {holderSignature.error && (
          <Helper alert="error">{signingErrorMessage(holderSignature.error)}</Helper>
        )}
      </Banner>
    )

  return null
}
