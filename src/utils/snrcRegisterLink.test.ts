import { describe, expect, it } from 'vitest'

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

  it('is not a link without a fragment or without a name in it', () => {
    expect(parseRegisterLink('/alice.simplex/register')).toBeUndefined()
    expect(parseRegisterLink('/register?name=alice.simplex')).toBeUndefined()
    expect(
      parseRegisterLink(`/register#simplex.contact=${encodeURIComponent(contact)}`),
    ).toBeUndefined()
    expect(parseRegisterLink('/register#name=')).toBeUndefined()
  })
})
