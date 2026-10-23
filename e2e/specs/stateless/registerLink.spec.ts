import { expect } from '@playwright/test'

import { test } from '../../../playwright'

/*
 * Registration from a link that carries the name and SimpleX links in the URL
 * fragment. Requires the .simplex stack: `SIMPLEX_TLD=simplex bash scripts/run-local.sh`.
 */
const contact = 'https://smp16.simplex.im/a#Q_contact-key?h=smp.example.com'
const channel = 'https://smp16.simplex.im/c#Q_channel-key'

const linkTo = (name: string) =>
  `/register#name=${name}&simplex.contact=${encodeURIComponent(
    contact,
  )}&simplex.channel=${encodeURIComponent(channel)}`

test('SNRC: a register link greets with its links, connecting goes on, then commit and reveal', async ({
  page,
  baseURL,
  login,
  time,
  makePageObject,
}) => {
  const label = `link${Date.now().toString(36)}`
  const name = `${label}.simplex`
  const transactionModal = makePageObject('TransactionModal')

  const leaks: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(baseURL!)) return
    const seen = `${request.url()} ${request.headers().referer ?? ''}`
    if (seen.includes(label)) leaks.push(seen)
  })

  await time.sync()
  await page.goto(linkTo(name))

  await test.step('greeting shows the name and the links before connecting', async () => {
    await expect(page.getByRole('heading', { name: `Register ${name}` })).toBeVisible({
      timeout: 90000,
    })
    await expect(page.getByTestId('social-profile-button-simplex.contact')).toHaveAttribute(
      'href',
      contact,
    )
    await expect(page.getByTestId('social-profile-button-simplex.channel')).toHaveAttribute(
      'href',
      channel,
    )
    await expect(page.getByTestId('body-connect-button')).toBeVisible()
  })

  await test.step('connecting the wallet goes on to the links, shown in full', async () => {
    await login.connect()
    await expect(page.getByTestId('multi-url-field-simplex.contact-input-0')).toHaveValue(contact, {
      timeout: 30000,
    })
    await expect(page.getByTestId('multi-url-field-simplex.channel-input-0')).toHaveValue(channel)
    await page.getByTestId('profile-submit-button').click()
    await expect(page.getByTestId('next-button')).toHaveText('Begin')
    await page.getByTestId('next-button').click()
  })

  await test.step('confirm the commit transaction', async () => {
    await expect(transactionModal.transactionModal).toBeVisible({ timeout: 30000 })
    await transactionModal.confirm()
  })

  await test.step('wait out the commit countdown', async () => {
    await time.sync()
    await expect(page.getByTestId('countdown-circle')).toBeVisible()
    await time.increaseTime({ seconds: 90 })
    await expect(page.getByTestId('finish-button')).toBeEnabled({ timeout: 30000 })
  })

  await test.step('the app server never saw the name before the reveal', async () => {
    expect(leaks).toEqual([])
  })

  await test.step('confirm the registration transaction', async () => {
    await page.getByTestId('finish-button').click()
    await transactionModal.confirm()
    await expect(page.getByText(`You are now the owner of ${name}`)).toBeVisible({
      timeout: 60000,
    })
  })

  await test.step('the profile has the links from the link', async () => {
    await page.getByTestId('view-name').click()
    await expect(page.getByTestId('social-profile-button-simplex.contact')).toHaveAttribute(
      'href',
      contact,
      { timeout: 30000 },
    )
    await expect(page.getByTestId('social-profile-button-simplex.channel')).toHaveAttribute(
      'href',
      channel,
    )
  })
})

test('SNRC: a register link opened with a connected wallet waits for Next', async ({
  page,
  login,
}) => {
  const name = `link${Date.now().toString(36)}.simplex`

  await page.goto('/')
  await login.connect()
  await page.goto(linkTo(name))

  const nextButton = page.getByTestId('next-button').filter({ hasText: 'Next' })
  await expect(nextButton).toBeEnabled({ timeout: 90000 })
  await nextButton.click()
  await expect(page.getByTestId('profile-submit-button')).toBeVisible()
})

test('SNRC: edits made in the profile step outlive going back to the greeting', async ({
  page,
  login,
}) => {
  const name = `link${Date.now().toString(36)}.simplex`
  const editedChannel = 'https://smp16.simplex.im/c#Q_edited-key'
  const channelInput = page.getByTestId('multi-url-field-simplex.channel-input-0')

  await page.goto(linkTo(name))
  await login.connect()
  await expect(channelInput).toHaveValue(channel, { timeout: 90000 })
  await channelInput.fill(editedChannel)
  await page.getByTestId('profile-submit-button').click()
  await expect(page.getByTestId('next-button')).toHaveText('Begin')

  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByTestId('profile-back-button').click()
  await page.getByTestId('next-button').filter({ hasText: 'Next' }).click()
  await expect(channelInput).toHaveValue(editedChannel)
})
