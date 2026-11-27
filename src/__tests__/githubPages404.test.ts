import { readFileSync } from 'fs'

import { describe, expect, it, vi } from 'vitest'

const redirectsOf = (url: string) => {
  const page = new DOMParser().parseFromString(
    readFileSync('.github/pages/404.html', 'utf8'),
    'text/html',
  )
  const { pathname, search, hash } = new URL(url)
  const replace = vi.fn()
  new Function('location', page.scripts[0].text)({ pathname, search, hash, replace })
  return replace.mock.calls
}

describe('404.html of GitHub Pages', () => {
  it.each([
    ['/holdername.simplex', '/profile?name=holdername.simplex'],
    ['/holdername.simplex/', '/profile?name=holdername.simplex'],
    ['/holdername.simplex?renew=31536000', '/profile?name=holdername.simplex&renew=31536000'],
    [
      '/holdername.simplex?tab=ownership#roles',
      '/profile?name=holdername.simplex&tab=ownership#roles',
    ],
    [
      '/holdername.simplex/register?referrer=0x01',
      '/register?name=holdername.simplex&referrer=0x01',
    ],
    [
      '/holdername.simplex/expired-profile?tab=more',
      '/profile?name=holdername.simplex&expired=true&tab=more',
    ],
    ['/holdername.simplex/import#top', '/import?name=holdername.simplex#top'],
    ['/tld/simplex?tab=subnames', '/profile?name=simplex&tab=subnames'],
    ['/tld/simplex/register', '/register?name=simplex'],
    [
      '/names/0x70997970C51812dc3A010C7d01b50e0d17dc79C8?page=2',
      '/my/names?address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8&page=2',
    ],
    ['/my/profile?tab=records', '/profile?connected=true&tab=records'],
    [
      '/0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      '/address?address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    ],
    [
      '/0x70997970c51812dc3a010c7d01b50e0d17dc79c8/',
      '/address?address=0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    ],
    ['/0x7099', '/'],
    ['/legacyFavourites?view=list', '/legacyfavourites?view=list'],
    ['/holdername.simplex?name=other.simplex', '/profile?name=holdername.simplex'],
    [
      '/holdername.simplex/register?name=other.simplex&referrer=0x01',
      '/register?name=holdername.simplex&referrer=0x01',
    ],
    ['/unknown/path?ref=link#top', '/'],
  ])('redirects %s to %s', (path, target) => {
    expect(redirectsOf(`https://app.simplex.domains${path}`)).toEqual([[target]])
  })
})
