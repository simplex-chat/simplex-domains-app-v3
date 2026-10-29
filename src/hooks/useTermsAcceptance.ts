import { useState } from 'react'

import { Terms } from '@app/utils/snrcNameTerms'

export const useTermsAcceptance = (
  { kind, hash }: Partial<Terms>,
  initialAcceptedTerms?: Terms,
) => {
  const [acceptedTerms, setAcceptedTerms] = useState(initialAcceptedTerms)
  return {
    acceptedTerms:
      acceptedTerms?.kind === kind && acceptedTerms?.hash === hash ? acceptedTerms : undefined,
    setAccepted: (accepted: boolean) =>
      setAcceptedTerms(accepted && kind && hash ? { kind, hash } : undefined),
  }
}
