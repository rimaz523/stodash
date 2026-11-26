import { expect, openWith, panel, panels, run, test } from './fixtures.ts'

const MAG7 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA']

test.describe('W: watchlists', () => {
  test('W opens Main with the Magnificent 7, streaming live', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'W')
    const w = panel(page, 'W')

    await expect(w.getByRole('button', { name: /^Main 7$/ })).toHaveAttribute('aria-pressed', 'true')
    const rows = w.locator('tbody tr')
    await expect(rows).toHaveCount(7)
    expect(await rows.locator('th.sym').allTextContents()).toEqual(MAG7)
    await expect(rows.first()).toContainText('Apple Inc.')
    await expect(rows.first()).toContainText('355.58')
    await expect(w.locator('.badge.stream')).toHaveText(/Live · 7 of 7 streaming/)
    await expect(w.locator('tbody .live-dot')).toHaveCount(7)
  })

  test('live trades update the price and flash it', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'W' }])
    const aapl = panel(page, 'W').locator('tbody tr').filter({ hasText: 'AAPL' })
    await expect(aapl).toContainText('355.58')
    await expect(panel(page, 'W').locator('.badge.stream')).toHaveText(/Live/)

    mock.pushTrades([{ symbol: 'AAPL', price: 360 }])
    await expect(aapl).toContainText('360.00')
    await expect(aapl).toContainText('+1.67%') // change is recomputed from the previous close
    await expect(aapl.locator('.flash-up')).toBeVisible()

    mock.pushTrades([{ symbol: 'AAPL', price: 358.5 }])
    await expect(aapl).toContainText('358.50')
    await expect(aapl.locator('.flash-down')).toBeVisible()
  })

  test('falls back to polling when the stream is off', async ({ page, mock }) => {
    mock.streamState = 'off'
    await openWith(page, [{ kind: 'W' }])
    const w = panel(page, 'W')
    await expect(w.locator('.badge.stream')).toHaveText(/Polling every 15 s · no Finnhub key/)
    await expect(w.locator('tbody .live-dot')).toHaveCount(0)
    await expect(w.locator('tbody tr')).toHaveCount(7)
  })

  test('adds and removes symbols in the panel, with clear errors', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'W' }])
    const w = panel(page, 'W')
    const input = w.getByRole('combobox', { name: 'Add symbol' })

    await input.fill('amd')
    await w.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(w.getByRole('status')).toHaveText('Added AMD to Main.')
    await expect(w.locator('tbody tr').last()).toContainText('AMD')
    await expect(input).toHaveValue('')

    await input.fill('AAPL')
    await input.press('Enter')
    await expect(w.getByRole('alert')).toHaveText('AAPL is already in "Main".')

    await input.fill('ZZZZ')
    await input.press('Enter')
    await expect(w.getByRole('alert')).toContainText("No instrument found for 'ZZZZ'")
    await expect(input).toHaveValue('ZZZZ') // kept so it can be corrected

    await w.getByRole('button', { name: 'Remove AMD' }).click()
    await expect(w.getByRole('status')).toHaveText('Removed AMD from Main.')
    await expect(w.locator('tbody tr')).toHaveCount(7)
    expect(mock.requests).toContain('POST /api/watchlists/1/items')
    expect(mock.requests).toContain('DELETE /api/watchlists/1/items/AMD')
  })

  test('W ADD and W DEL work from the command bar', async ({ page, mock }) => {
    mock.watchlists.push({ id: 2, name: 'Tech', symbols: [] })
    await openWith(page, [{ kind: 'W' }])
    const w = panel(page, 'W')

    await run(page, 'W ADD AMD')
    await expect(w.getByRole('status')).toHaveText('Added AMD to Main.')
    await expect(w.locator('tbody tr').filter({ hasText: 'AMD' })).toBeVisible()

    await run(page, 'w add nvda to tech')
    await expect(w.getByRole('button', { name: /^Tech 1$/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(w.getByRole('status')).toHaveText('Added NVDA to Tech.')

    await run(page, 'W DEL AMD FROM Main')
    await expect(w.getByRole('status')).toHaveText('Removed AMD from Main.')

    await run(page, 'W ADD AMD TO Nope')
    await expect(w.getByRole('alert')).toHaveText('There\'s no watchlist called "Nope".')
  })

  test('creates, renames, switches and deletes lists', async ({ page }) => {
    await openWith(page, [{ kind: 'W' }])
    const w = panel(page, 'W')
    await expect(w.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled() // only one list

    await w.getByRole('button', { name: 'New watchlist' }).click()
    await w.getByRole('textbox', { name: 'New watchlist name' }).fill('main')
    await w.getByRole('button', { name: 'Save' }).click()
    await expect(w.getByRole('alert')).toHaveText('You already have a watchlist called "main".')

    await w.getByRole('textbox', { name: 'New watchlist name' }).fill('Tech')
    await w.getByRole('textbox', { name: 'New watchlist name' }).press('Enter')
    await expect(w.getByRole('button', { name: /^Tech 0$/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(w).toContainText('This list is empty')

    await w.getByRole('button', { name: 'Rename' }).click()
    await w.getByRole('textbox', { name: 'Rename watchlist' }).fill('Semis')
    await w.getByRole('button', { name: 'Save' }).click()
    await expect(w.getByRole('button', { name: /^Semis 0$/ })).toBeVisible()

    await w.getByRole('button', { name: /^Main 7$/ }).click()
    await expect(w.locator('tbody tr')).toHaveCount(7)

    await w.getByRole('button', { name: /^Semis 0$/ }).click()
    await w.getByRole('button', { name: 'Delete', exact: true }).click()
    await w.getByRole('button', { name: 'Delete', exact: true }).click() // confirm
    await expect(w.getByRole('status')).toHaveText('Deleted Semis.')
    await expect(w.getByRole('button', { name: /^Semis/ })).toHaveCount(0)
    await expect(w.getByRole('button', { name: /^Main 7$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('"W <name>" picks a list, and the choice survives a reload', async ({ page, mock }) => {
    mock.watchlists.push({ id: 2, name: 'Tech', symbols: ['AMD', 'NVDA'] })
    await openWith(page, [{ kind: 'W' }])
    await run(page, 'W tech')
    const w = panel(page, 'W')
    await expect(w.getByRole('button', { name: /^Tech 2$/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(w.locator('tbody tr')).toHaveCount(2)

    await page.reload()
    await expect(panel(page, 'W').getByRole('button', { name: /^Tech 2$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('clicking a row opens it in the other panel, keeping the watchlist', async ({ page }) => {
    await openWith(page, [{ kind: 'W' }, { kind: 'DES', symbol: 'MSFT' }])
    const w = panel(page, 'W')

    await w.locator('tbody tr').filter({ hasText: 'NVDA' }).click()
    await expect(panel(page, 'DES', 'NVDA')).toBeVisible()
    await expect(panel(page, 'W')).toBeVisible()
    await expect(panels(page)).toHaveCount(2)

    await w.locator('tbody tr').filter({ hasText: 'TSLA' }).getByRole('button', { name: 'GP' }).click()
    await expect(panel(page, 'GP', 'TSLA')).toBeVisible()
    await expect(panels(page)).toHaveCount(2)
  })

  test('explains when the database is unavailable', async ({ page, mock }) => {
    mock.on(/^\/api\/watchlists$/, {
      status: 503,
      body: { title: 'Database unavailable', detail: "Can't reach the Stodash database. Is SQL Server LocalDB installed and running?" },
    })
    await openWith(page, [{ kind: 'W' }])
    await expect(panel(page, 'W')).toContainText("Couldn't load watchlists")
    await expect(panel(page, 'W')).toContainText('LocalDB')
  })
})
