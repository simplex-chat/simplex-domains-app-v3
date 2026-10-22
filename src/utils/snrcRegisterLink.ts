import { ProfileRecord } from '@app/constants/profileRecordOptions'
import { SIMPLEX_LINK_SEPARATOR, SIMPLEX_MAX_LINKS } from '@app/constants/simplex'
import { supportedSimplexRecordKeys } from '@app/constants/supportedSimplexRecordKeys'
import { parseSimplexUrls } from '@app/utils/parseSimplexUrls'

export const parseRegisterLink = (asPath: string) => {
  const fragmentIndex = asPath.indexOf('#')
  if (fragmentIndex === -1) return undefined
  const params = new URLSearchParams(asPath.slice(fragmentIndex + 1))
  const name = params.get('name')
  if (!name) return undefined
  const records = supportedSimplexRecordKeys.flatMap((key): ProfileRecord[] => {
    const value = parseSimplexUrls(params.get(key) ?? undefined)
      .filter((url) => /^(https|simplex):/i.test(url))
      .slice(0, SIMPLEX_MAX_LINKS)
      .join(SIMPLEX_LINK_SEPARATOR)
    return value ? [{ key, group: 'simplex', type: 'text', value }] : []
  })
  return { name, records }
}
