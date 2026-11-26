import { commandBar, expect, openWith, panel, panels, run, test } from './fixtures.ts'

test.describe('command bar', () => {
  test('Enter loads into the active panel', async ({ page }) => {
    await page.goto('/')
    await run(page, 'MSFT FA')

    await expect(panel(page, 'FA', 'MSFT')).toBeVisible()
    await expect(panel(page, 'DES')).toHaveCount(0)
    await expect(panels(page)).toHaveCount(2)
    await expect(commandBar(page)).toHaveValue('')
  })

  test('Shift+Enter opens new panels, up to four', async ({ page }) => {
    await page.goto('/')
    await run(page, 'MSFT N', { newPanel: true })
    await run(page, 'TSLA CF', { newPanel: true })
    await expect(panels(page)).toHaveCount(4)
    await expect(panels(page).nth(3)).toHaveClass(/active/)

    await run(page, 'JPM FA', { newPanel: true })
    await expect(page.getByRole('alert').filter({ hasText: 'up to 4 panels' })).toBeVisible()
    await expect(panels(page)).toHaveCount(4)
  })

  test('suggests every function after a ticker, and clicking one runs it', async ({ page }) => {
    await page.goto('/')
    await commandBar(page).fill('AAPL ')

    const options = page.getByRole('option')
    await expect(options).toHaveCount(5)
    for (const fn of ['DES', 'GP', 'FA', 'N', 'CF']) await expect(options.filter({ hasText: fn }).first()).toBeVisible()

    await options.filter({ hasText: 'SEC Filings' }).click()
    await expect(panel(page, 'CF', 'AAPL')).toBeVisible()
  })

  test('a company name opens the best search match', async ({ page }) => {
    await page.goto('/')
    await commandBar(page).fill('tesla')
    await expect(page.getByRole('option').filter({ hasText: 'TSLA' })).toBeVisible()
    await commandBar(page).press('Enter')

    await expect(panel(page, 'DES', 'TSLA')).toContainText('Tesla, Inc.')
  })

  test('ignores Bloomberg-style market sector words', async ({ page }) => {
    await page.goto('/')
    await run(page, 'msft us equity fa')
    await expect(panel(page, 'FA', 'MSFT')).toBeVisible()
  })

  test('shows inline errors for unknown functions and bad arguments', async ({ page }) => {
    await page.goto('/')

    await run(page, 'AAPL XYZ')
    await expect(page.getByRole('alert').filter({ hasText: 'Unknown function "XYZ"' })).toBeVisible()

    await run(page, 'AAPL FA 1Y')
    await expect(page.getByRole('alert').filter({ hasText: 'Unknown period "1Y"' })).toBeVisible()

    await run(page, 'AAPL GP 7X')
    await expect(page.getByRole('alert').filter({ hasText: 'Unknown range "7X"' })).toBeVisible()
    await expect(panels(page)).toHaveCount(2) // nothing changed
  })

  test('ArrowUp walks back through history', async ({ page }) => {
    await page.goto('/')
    await run(page, 'MSFT FA')
    await run(page, 'TSLA N')

    await commandBar(page).press('ArrowUp')
    await expect(commandBar(page)).toHaveValue('TSLA N')
    await commandBar(page).press('ArrowUp')
    await expect(commandBar(page)).toHaveValue('MSFT FA')
  })

  test('HELP lists the commands, CLEAR closes everything', async ({ page }) => {
    await page.goto('/')
    await run(page, 'HELP')
    const help = panel(page, 'HELP')
    await expect(help).toContainText('Commands & shortcuts')
    for (const cmd of ['AAPL FA', 'AAPL FA Q', 'AAPL N', 'AAPL CF']) await expect(help.getByText(cmd, { exact: true })).toBeVisible()

    // Commands in the help panel are clickable.
    await help.getByRole('button', { name: 'AAPL N', exact: true }).click()
    await expect(panel(page, 'N', 'AAPL')).toBeVisible()

    await run(page, 'CLEAR')
    await expect(panels(page)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No panels open' })).toBeVisible()
  })

  test('the function chips switch a panel between functions for the same ticker', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'MSFT' }])
    const p = panels(page).first()

    for (const fn of ['FA', 'N', 'CF', 'GP', 'DES']) {
      await p.getByRole('button', { name: fn, exact: true }).click()
      await expect(panel(page, fn, 'MSFT')).toBeVisible()
      await expect(p.getByRole('button', { name: fn, exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
  })
})
