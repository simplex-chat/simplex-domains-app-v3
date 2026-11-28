import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import styled, { css } from 'styled-components'

import { makeCommitment } from '@ensdomains/ensjs/utils'
import { Button, Heading, Helper, Typography } from '@ensdomains/thorin'

import MobileFullWidth from '@app/components/@atoms/MobileFullWidth'
import { Card } from '@app/components/Card'
import { useAccountSafely } from '@app/hooks/account/useAccountSafely'
import { useEstimateFullRegistration } from '@app/hooks/gasEstimation/useEstimateRegistration'
import { useIntentSigner, useSigningState } from '@app/hooks/useIntentSigner'
import { useRegistrarAllowance } from '@app/hooks/useRegistrarAllowance'
import useRegistrationParams from '@app/hooks/useRegistrationParams'
import { addressNoteStyle, signingErrorMessage } from '@app/utils/snrcIntents'
import { isSignedFor } from '@app/utils/snrcSponsor'

import AllowanceInvoice from '../AllowanceInvoice'
import AllowanceTooLowButton from '../AllowanceTooLowButton'
import FullInvoice from '../FullInvoice'
import { BackObj, RegistrationReducerDataItem, RegistrationStepData } from '../types'

const StyledCard = styled(Card)(
  ({ theme }) => css`
    max-width: 780px;
    margin: 0 auto;
    flex-direction: column;
    gap: ${theme.space['4']};
    padding: ${theme.space['4']};

    @media (min-width: ${theme.breakpoints.sm}px) {
      padding: ${theme.space['6']} ${theme.space['18']};
      gap: ${theme.space['6']};
    }
  `,
)

const InfoItems = styled.div(
  ({ theme }) => css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: ${theme.space['4']};

    @media (min-width: ${theme.breakpoints.sm}px) {
      flex-direction: row;
      align-items: stretch;
    }
  `,
)

const InfoItem = styled.div(
  ({ theme }) => css`
    width: 100%;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${theme.space['4']};

    padding: ${theme.space['4']};
    border: 1px solid ${theme.colors.border};
    border-radius: ${theme.radii.large};
    text-align: center;

    & > div:first-of-type {
      width: ${theme.space['10']};
      height: ${theme.space['10']};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${theme.fontSizes.extraLarge};
      font-weight: ${theme.fontWeights.bold};
      color: ${theme.colors.backgroundPrimary};
      background: ${theme.colors.accentPrimary};
      border-radius: ${theme.radii.full};
    }

    & > div:last-of-type {
      flex-grow: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
)

const ButtonContainer = styled.div(
  ({ theme }) => css`
    width: ${theme.space.full};
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: ${theme.space['2']};
  `,
)

const ProfileButton = styled.button(
  () => css`
    cursor: pointer;
  `,
)

const infoItemArr = Array.from({ length: 3 }, (_, i) => `steps.info.ethItems.${i}`)

type Props = {
  registrationData: RegistrationReducerDataItem
  name: string
  callback: (data: BackObj & RegistrationStepData['info']) => void
  onProfileClick: () => void
}

const Info = ({ registrationData, name, callback, onProfileClick }: Props) => {
  const { t } = useTranslation('register')

  const estimate = useEstimateFullRegistration({
    name,
    registrationData,
  })
  const { allowance, price, covers } = useRegistrarAllowance({
    name,
    seconds: registrationData.seconds,
  })
  const readsAllowance = !!registrationData.credit && covers === undefined

  const { address } = useAccountSafely()
  const { credit, terms } = registrationData
  const temporaryOwner = credit && credit.owner !== address ? credit : undefined
  const registrationParams = useRegistrationParams({
    name,
    owner: credit?.owner ?? address!,
    registrationData,
  })
  const { signCredit } = useIntentSigner()
  const signatures = useMutation({ mutationFn: signCredit })
  const signingState = useSigningState(temporaryOwner?.owner)
  const readsSigningState = !!temporaryOwner && !signingState
  const asksSignatures =
    !!temporaryOwner &&
    !(
      signingState &&
      isSignedFor(temporaryOwner, {
        commitment: makeCommitment(registrationParams),
        terms,
        onChain: signingState,
      })
    )

  const begin = () => {
    if (asksSignatures)
      signatures.mutate(
        { registrationParams, terms },
        { onSuccess: (signedCredit) => callback({ back: false, credit: signedCredit }) },
      )
    else callback({ back: false })
  }

  return (
    <StyledCard>
      <Heading>{t('steps.info.heading')}</Heading>
      <Typography>{t('steps.info.subheading')}</Typography>
      <InfoItems>
        {infoItemArr.map((item, inx) => (
          <InfoItem key={item}>
            <Typography>{inx + 1}</Typography>
            <Typography>{t(item)}</Typography>
          </InfoItem>
        ))}
      </InfoItems>
      {registrationData.credit ? (
        <AllowanceInvoice
          seconds={registrationData.seconds}
          allowance={allowance}
          price={price}
          estimatedGasFee={estimate.estimatedGasLoading ? undefined : estimate.estimatedGasFee}
        />
      ) : (
        <FullInvoice {...estimate} />
      )}
      {temporaryOwner && asksSignatures && (
        <Helper alert="info" style={addressNoteStyle}>
          {t('steps.info.temporaryOwner', { owner: temporaryOwner.owner })}
        </Helper>
      )}
      {signatures.error && (
        <Helper alert="error" style={addressNoteStyle}>
          {signingErrorMessage(signatures.error)}
        </Helper>
      )}
      {!registrationData.queue.includes('profile') && (
        <ProfileButton data-testid="setup-profile-button" onClick={onProfileClick}>
          <Typography weight="bold" color="accent">
            {t('steps.info.setupProfile')}
          </Typography>
        </ProfileButton>
      )}
      <ButtonContainer>
        <MobileFullWidth>
          <Button colorStyle="accentSecondary" onClick={() => callback({ back: true })}>
            {t('action.back', { ns: 'common' })}
          </Button>
        </MobileFullWidth>
        <MobileFullWidth>
          {registrationData.credit && covers === false ? (
            <AllowanceTooLowButton />
          ) : (
            <Button
              data-testid="next-button"
              loading={readsAllowance || readsSigningState || signatures.isPending}
              disabled={readsAllowance || readsSigningState || signatures.isPending}
              onClick={begin}
            >
              {t('action.begin', { ns: 'common' })}
            </Button>
          )}
        </MobileFullWidth>
      </ButtonContainer>
    </StyledCard>
  )
}

export default Info
