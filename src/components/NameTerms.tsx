import Markdown from 'markdown-to-jsx'
import type { ComponentPropsWithoutRef } from 'react'
import styled, { css } from 'styled-components'
import { match, P } from 'ts-pattern'

import { Button, CheckboxRow, Helper, Typography } from '@ensdomains/thorin'

import { Outlink } from '@app/components/Outlink'
import { useNameTerms } from '@app/hooks/useNameTerms'
import { useTermsAcceptance } from '@app/hooks/useTermsAcceptance'

const TermsBox = styled.div(
  ({ theme }) => css`
    max-height: ${theme.space['64']};
    overflow-y: auto;
    padding: ${theme.space['4']} ${theme.space['5']};
    border: 1px solid ${theme.colors.border};
    border-radius: ${theme.radii.large};
    color: ${theme.colors.textPrimary};
    font-size: ${theme.fontSizes.small};
    line-height: 1.6;

    /* shadows at the top and the bottom only while more text lies beyond them */
    background:
      linear-gradient(${theme.colors.backgroundPrimary} 30%, transparent) center top,
      linear-gradient(transparent, ${theme.colors.backgroundPrimary} 70%) center bottom,
      radial-gradient(farthest-side at 50% 0, rgba(0, 0, 0, 0.12), transparent) center top,
      radial-gradient(farthest-side at 50% 100%, rgba(0, 0, 0, 0.12), transparent) center bottom;
    background-color: ${theme.colors.backgroundPrimary};
    background-repeat: no-repeat;
    background-size:
      100% ${theme.space['10']},
      100% ${theme.space['10']},
      100% ${theme.space['3']},
      100% ${theme.space['3']};
    background-attachment: local, local, scroll, scroll;
    @media (max-width: ${theme.breakpoints.sm}px) {
      padding: ${theme.space['3']} ${theme.space['4']};
    }
    &:focus-visible {
      outline: 2px solid ${theme.colors.accent};
      outline-offset: 2px;
    }
    h1,
    h2 {
      font-weight: ${theme.fontWeights.bold};
      line-height: 1.3;
    }
    h1 {
      font-size: ${theme.fontSizes.large};
      margin: 0 0 ${theme.space['3']};
    }
    h2 {
      font-size: ${theme.fontSizes.body};
      margin: ${theme.space['5']} 0 ${theme.space['2']};
    }
    p,
    ul {
      margin: 0 0 ${theme.space['3']};
    }
    ul {
      list-style: disc;
      padding-left: ${theme.space['5']};
    }
    li + li {
      margin-top: ${theme.space['1.5']};
    }
    > :last-child > :last-child {
      margin-bottom: 0;
    }
  `,
)

const Content = styled.div(
  ({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: ${theme.space['4']};
    width: 100%;
  `,
)

// The terms as fetched from their link, rendered from their markdown; HTML in them shows as text.
export const TermsText = ({
  text,
  ...props
}: { text: string } & ComponentPropsWithoutRef<'div'>) => (
  // focusable, so the terms scroll from the keyboard too
  <TermsBox tabIndex={0} aria-label="Terms" {...props}>
    <Markdown options={{ disableParsingRawHTML: true }}>{text}</Markdown>
  </TermsBox>
)

const KIND_TEXTS = {
  general: {
    title: 'SimpleX general terms',
    description: 'Registering or receiving this name requires accepting the SimpleX general terms.',
    accept: 'I accept the SimpleX general terms',
    unset: "The general terms are not available, so names can't be registered or received now.",
  },
  community: {
    title: 'Community name',
    description: 'Registering or receiving this name requires accepting the community terms.',
    accept: 'I accept the community terms',
    unset:
      "The community terms are not available, so this name can't be registered or received now.",
  },
}

type Props = {
  terms: ReturnType<typeof useNameTerms>
  acceptance: ReturnType<typeof useTermsAcceptance>
}

export const NameTerms = ({ terms, acceptance }: Props) => (
  <Helper alert="info" alignment="horizontal" data-testid="terms">
    <Content>
      {terms.kind && (
        <div>
          <Typography weight="bold">{KIND_TEXTS[terms.kind].title}</Typography>
          <Typography>{KIND_TEXTS[terms.kind].description}</Typography>
        </div>
      )}
      {match(terms)
        .with({ isLoading: true }, () => <Typography>Loading the terms…</Typography>)
        .with({ kind: P.string, text: P.string }, ({ kind, text, readerUrl }) => (
          <>
            <TermsText data-testid="terms-text" text={text} />
            {readerUrl && (
              <Outlink href={readerUrl} data-testid="terms-reader">
                View this version on git.simplex.chat
              </Outlink>
            )}
            <CheckboxRow
              data-testid="terms-accept"
              label={KIND_TEXTS[kind].accept}
              checked={!!acceptance.acceptedTerms}
              onChange={(e) => acceptance.setAccepted(e.target.checked)}
            />
          </>
        ))
        .with({ isError: true }, () => (
          <>
            <Typography color="red" data-testid="terms-load-failed">
              The terms can&apos;t be loaded now.
            </Typography>
            <div>
              <Button
                size="small"
                colorStyle="accentSecondary"
                data-testid="terms-retry"
                onClick={terms.retry}
              >
                Try again
              </Button>
            </div>
          </>
        ))
        .with({ kind: P.string }, ({ kind }) => (
          <Typography color="red" data-testid="terms-unset">
            {KIND_TEXTS[kind].unset}
          </Typography>
        ))
        .otherwise(() => null)}
    </Content>
  </Helper>
)
