import { describe, expect, it } from 'vitest'

import { SIMPLEX_LINK_SEPARATOR, SIMPLEX_MAX_LINKS } from '@app/constants/simplex'

import { parseRegisterLink } from './snrcRegisterLink'

const contact = 'https://smp16.simplex.im/a#Q_abc?h=smp.example.com'
const channel = 'https://smp16.simplex.im/c#Q_def'

describe('parseRegisterLink', () => {
  it('reads the name and both SimpleX links from the fragment', () => {
    const fragment = `name=alice.simplex&simplex.channel=${encodeURIComponent(
      channel,
    )}&simplex.contact=${encodeURIComponent(contact)}`
    expect(parseRegisterLink(`/register#${fragment}`)).toEqual({
      name: 'alice.simplex',
      records: [
        { key: 'simplex.contact', group: 'simplex', type: 'text', value: contact },
        { key: 'simplex.channel', group: 'simplex', type: 'text', value: channel },
      ],
    })
  })

  it('keeps a link whose own fragment is not encoded', () => {
    expect(parseRegisterLink(`/register#name=alice.simplex&simplex.channel=${channel}`)).toEqual({
      name: 'alice.simplex',
      records: [{ key: 'simplex.channel', group: 'simplex', type: 'text', value: channel }],
    })
  })

  it('drops missing and empty links', () => {
    expect(parseRegisterLink('/register#name=alice.simplex&simplex.contact=')).toEqual({
      name: 'alice.simplex',
      records: [],
    })
  })

  it('drops links that are not https or simplex', () => {
    const links = ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'http://x']
    for (const link of links) {
      expect(
        parseRegisterLink(
          `/register#name=alice.simplex&simplex.contact=${encodeURIComponent(link)}`,
        ),
      ).toEqual({ name: 'alice.simplex', records: [] })
    }
    const simplexLink = 'simplex:/a#Q_abc'
    expect(
      parseRegisterLink(
        `/register#name=alice.simplex&simplex.contact=${encodeURIComponent(simplexLink)}`,
      ),
    ).toEqual({
      name: 'alice.simplex',
      records: [{ key: 'simplex.contact', group: 'simplex', type: 'text', value: simplexLink }],
    })
  })

  it('keeps at most SIMPLEX_MAX_LINKS links of the allowed schemes', () => {
    const value = ['javascript:alert(1)', contact, channel].join(SIMPLEX_LINK_SEPARATOR)
    expect(
      parseRegisterLink(
        `/register#name=alice.simplex&simplex.contact=${encodeURIComponent(value)}`,
      ),
    ).toEqual({
      name: 'alice.simplex',
      records: [
        {
          key: 'simplex.contact',
          group: 'simplex',
          type: 'text',
          value: [contact, channel].slice(0, SIMPLEX_MAX_LINKS).join(SIMPLEX_LINK_SEPARATOR),
        },
      ],
    })
  })

  it('is not a link without a fragment or without a name in it', () => {
    expect(parseRegisterLink('/alice.simplex/register')).toBeUndefined()
    expect(parseRegisterLink('/register?name=alice.simplex')).toBeUndefined()
    expect(
      parseRegisterLink(`/register#simplex.contact=${encodeURIComponent(contact)}`),
    ).toBeUndefined()
    expect(parseRegisterLink('/register#name=')).toBeUndefined()
  })
})
