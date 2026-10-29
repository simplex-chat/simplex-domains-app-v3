import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled, { css } from 'styled-components'

import { Button, CheckboxRow, Dialog, Helper, Typography } from '@ensdomains/thorin'

import { AvatarWithIdentifier } from '@app/components/@molecules/AvatarWithIdentifier/AvatarWithIdentifier'
import { NameTerms } from '@app/components/NameTerms'
import { useClaimChecks } from '@app/hooks/useClaimChecks'
import { useNameOffer } from '@app/hooks/useNameOffer'
import { useAcceptedClaimTerms, useNameTerms } from '@app/hooks/useNameTerms'
import { useTermsAcceptance } from '@app/hooks/useTermsAcceptance'
import { DetailedSwitch } from '@app/transaction-flow/input/ProfileEditor/components/DetailedSwitch'
import { createTransactionItem } from '@app/transaction-flow/transaction'
import TransactionLoader from '@app/transaction-flow/TransactionLoader'
import { TransactionDialogPassthrough } from '@app/transaction-flow/types'
import { ClaimNode } from '@app/utils/snrcClaimChecks'

const List = styled.ul(
  ({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: ${theme.space['1']};
    width: 100%;
    word-break: break-all;
  `,
)

type Data = {
  name: string
}

export type Props = {
  data: Data
} & TransactionDialogPassthrough

const Note = ({ children }: { children: string }) => (
  <Typography fontVariant="extraSmall" color="grey">
    {children}
  </Typography>
)

const NodeRecords = ({ node, testId }: { node: ClaimNode; testId?: string }) => {
  const { t } = useTranslation('transactionFlow')
  const notPlainText = <Note>{t('input.claimName.notPlainText')}</Note>
  return (
    <>
      {node.customResolver && (
        <Helper alert="warning">
          {t('input.claimName.resolver', { resolver: node.customResolver })}
        </Helper>
      )}
      {node.recordsUnreadable && <Helper alert="warning">{t('input.claimName.unreadable')}</Helper>}
      {node.records.length > 0 && (
        <List data-testid={testId}>
          {node.records.map(
            ({ id, key, value, keyAsBytes, valueAsBytes, valueUnread, resolver, inEffect }) => (
              <li key={`${resolver} ${id}`}>
                <Typography fontVariant="smallBold">{key}</Typography>
                {keyAsBytes && notPlainText}
                <Typography fontVariant="small">{value}</Typography>
                {valueAsBytes && notPlainText}
                {valueUnread && <Note>{t('input.claimName.notRead')}</Note>}
                {!inEffect && <Note>{t('input.claimName.notInEffect', { resolver })}</Note>}
              </li>
            ),
          )}
        </List>
      )}
    </>
  )
}

const ClaimName = ({ data: { name }, dispatch, onDismiss }: Props) => {
  const { t } = useTranslation('transactionFlow')
  const offer = useNameOffer({ name })
  const checks = useClaimChecks({ name })
  const terms = useNameTerms({ name })
  const claimTerms = useAcceptedClaimTerms({
    name,
    holder: offer.data?.holder,
    offerNumber: offer.data?.offerNumber,
    enabled: terms.required,
  })
  const needsTermsAcceptance = terms.required && (!terms.hash || claimTerms.data !== terms.hash)
  const acceptance = useTermsAcceptance(terms)
  // The review stays as first read: a later change fails claimName's re-check instead of
  // replacing what the recipient is reading.
  const firstChecks = useRef(checks.data)
  firstChecks.current ??= checks.data
  const [acknowledgedReview, setAcknowledgedReview] = useState<string>()
  const [acceptedIncompleteReview, setAcceptedIncompleteReview] = useState<string>()
  const [clearRecords, setClearRecords] = useState(false)

  if (offer.isLoading || checks.isLoading || terms.isLoading || claimTerms.isLoading)
    return <TransactionLoader />

  const holder = !offer.isError && offer.data?.isRecipient ? offer.data.holder : undefined
  const review = !checks.isError ? firstChecks.current : undefined
  const [root, ...subnodes] = review?.nodes ?? []
  const reviewKey = review && holder ? `${review.digest} ${holder}` : undefined
  const acceptedIncomplete = !!reviewKey && acceptedIncompleteReview === reviewKey
  const clearResolver = root?.customResolver
    ? undefined
    : root?.records.find(({ inEffect }) => inEffect)?.resolver
  const staysAfterClaim =
    subnodes.length > 0 ||
    !!root?.customResolver ||
    !!root?.records.some(({ resolver }) => !(clearRecords && resolver === clearResolver))
  const acknowledged = !!reviewKey && (!staysAfterClaim || acknowledgedReview === reviewKey)

  const onConfirm = () => {
    if (!holder || !review) return
    dispatch({
      name: 'setTransactions',
      payload: [
        ...(needsTermsAcceptance && acceptance.acceptedTerms
          ? [
              createTransactionItem('acceptClaimTerms', {
                name,
                holder,
                offerNumber: offer.data!.offerNumber,
                terms: acceptance.acceptedTerms,
              }),
            ]
          : []),
        createTransactionItem('claimName', { name, holder, digest: review.digest }),
        ...(clearRecords && clearResolver
          ? [createTransactionItem('resetProfile', { name, resolverAddress: clearResolver })]
          : []),
      ],
    })
    dispatch({ name: 'setFlowStage', payload: 'transaction' })
  }

  return (
    <>
      <Dialog.Heading title={t('input.claimName.title', { name })} />
      <Dialog.Content data-testid="claim-name-view">
        {holder ? (
          <AvatarWithIdentifier
            address={holder}
            subtitle={t('input.claimName.offeredBy')}
            shortenAddressAsTitle={false}
          />
        ) : (
          <Helper alert="error">
            {t(offer.isError ? 'input.claimName.offerFailed' : 'input.claimName.notOffered')}
          </Helper>
        )}
        <Typography>{t('input.claimName.description', { name })}</Typography>
        {needsTermsAcceptance && holder && <NameTerms terms={terms} acceptance={acceptance} />}

        {review ? (
          <>
            <Typography fontVariant="bodyBold">{t('input.claimName.records')}</Typography>
            {root.records.length === 0 && !root.recordsUnreadable && (
              <Typography color="grey">{t('input.claimName.none')}</Typography>
            )}
            <NodeRecords node={root} testId="claim-name-records" />

            <Typography fontVariant="bodyBold">{t('input.claimName.subnodes')}</Typography>
            {subnodes.length === 0 ? (
              review.complete && <Typography color="grey">{t('input.claimName.none')}</Typography>
            ) : (
              <List data-testid="claim-name-subnodes">
                {subnodes.map((subnode) => (
                  <li key={subnode.node}>
                    <Typography fontVariant="smallBold">
                      {subnode.status === 'tracked'
                        ? subnode.name
                        : t(`input.claimName.${subnode.status}`, {
                            node: subnode.node,
                            owner: subnode.owner,
                          })}
                    </Typography>
                    <NodeRecords node={subnode} />
                  </li>
                ))}
              </List>
            )}
            {subnodes.some((subnode) => subnode.status !== 'tracked') && (
              <Helper alert="warning">{t('input.claimName.untrackedWarning')}</Helper>
            )}
            {!review.complete && <Helper alert="warning">{t('input.claimName.incomplete')}</Helper>}

            {subnodes.some((subnode) => subnode.status === 'tracked') && (
              <Helper alert="info">{t('input.claimName.afterwards')}</Helper>
            )}
            {clearResolver && (
              <DetailedSwitch
                data-testid="claim-name-clear-records"
                title={t('input.claimName.clearRecords.title')}
                description={t('input.claimName.clearRecords.description')}
                checked={clearRecords}
                disabled={!reviewKey}
                onChange={(e) => setClearRecords(e.currentTarget.checked)}
              />
            )}
            {staysAfterClaim && (
              <CheckboxRow
                data-testid="claim-name-acknowledge"
                label={t('input.claimName.acknowledge')}
                checked={acknowledged}
                disabled={!reviewKey}
                onChange={(e) => setAcknowledgedReview(e.target.checked ? reviewKey : undefined)}
              />
            )}
            {!review.complete && (
              <CheckboxRow
                data-testid="claim-name-accept-incomplete"
                label={t('input.claimName.acceptIncomplete')}
                checked={acceptedIncomplete}
                disabled={!reviewKey}
                onChange={(e) =>
                  setAcceptedIncompleteReview(e.target.checked ? reviewKey : undefined)
                }
              />
            )}
          </>
        ) : (
          <Helper alert="error">{t('input.claimName.failed')}</Helper>
        )}
      </Dialog.Content>
      <Dialog.Footer
        leading={
          <Button colorStyle="accentSecondary" onClick={onDismiss}>
            {t('action.cancel', { ns: 'common' })}
          </Button>
        }
        trailing={
          <Button
            data-testid="claim-name-confirm"
            disabled={
              !acknowledged ||
              (!review?.complete && !acceptedIncomplete) ||
              (needsTermsAcceptance && !acceptance.acceptedTerms) ||
              checks.isFetching ||
              offer.isFetching ||
              claimTerms.isFetching ||
              terms.isFetching
            }
            onClick={onConfirm}
          >
            {t('action.claim', { ns: 'common' })}
          </Button>
        }
      />
    </>
  )
}

export default ClaimName
