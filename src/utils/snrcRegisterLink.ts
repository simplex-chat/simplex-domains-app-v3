import { ProfileRecord } from '@app/constants/profileRecordOptions'
import { supportedSimplexRecordKeys } from '@app/constants/supportedSimplexRecordKeys'

export const parseRegisterLink = (asPath: string) => {
  const fragmentIndex = asPath.indexOf('#')
  if (fragmentIndex === -1) return undefined
  const params = new URLSearchParams(asPath.slice(fragmentIndex + 1))
  const name = params.get('name')
  if (!name) return undefined
  const records = supportedSimplexRecordKeys.flatMap((key): ProfileRecord[] => {
    const value = params.get(key)
    return value ? [{ key, group: 'simplex', type: 'text', value }] : []
  })
  return { name, records }
}
