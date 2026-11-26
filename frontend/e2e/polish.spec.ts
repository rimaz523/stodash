import { commandBar, expect, openWith, panel, panels, run, test } from './fixtures.ts'
import { fx, history, topNews } from './mock-api.ts'

const fail = { status: 502, body: { title: 'Data provider unavailable', detail: 'Yahoo returned 500.' } }

test.describe('errors and recovery', () => {
  test('Retry reloads a panel that failed', async ({ page, mock }) => {
    // A flag, not "fail the first call": React's dev StrictMode sends the first request twice.
    let down = true
    mock.on(/^\/api\/topnews/, () => (down ? fail : { status: 200, body: topNews() }))
    await openWith(page, [{ kind: 'TOP' }])
    const top = panel(page, 'TOP')

    await expect(top).toContainText("Couldn't load headlines")
    down = false
    await top.getByRole('button', { name: 'Retry' }).click()
    await expect(top.locator('.news-list > li')).toHaveCount(4)
  })

  test('a failed refresh keeps the data and marks it stale; clicking the badge retries', async ({ page, mock }) => {
    await page.clock.install()
    let down = false
    mock.on(/^\/api\/fx/, () => (down ? fail : { status: 200, body: fx() }))
    await openWith(page, [{ kind: 'FX' }])
    const fxPanel = panel(page, 'FX')
    await expect(fxPanel.locator('.fx-pairs tbody tr')).toHaveCount(8)

    down = true
    await page.clock.fastForward(61_000) // FX refreshes every minute
    const badge = fxPanel.getByRole('button', { name: /Data may be out of date/ })
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('title', /Yahoo returned 500/)
    await expect(fxPanel.locator('.fx-pairs tbody tr')).toHaveCount(8) // still showing the last good rates

    down = false
    await badge.click()
    await expect(badge).toBeHidden()
  })

  test('one banner while the API is down; panels reload when it is back', async ({ page, mock }) => {
    mock.on(/^\/api\//, 'abort')
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    const banner = page.locator('.offline-banner')
    await expect(banner).toContainText("Can't reach the Stodash API")
    await expect(panel(page, 'DES')).toContainText("Couldn't load AAPL")

    mock.clear()
    await banner.getByRole('button', { name: 'Try now' }).click()
    await expect(banner).toBeHidden()
    await expect(panel(page, 'DES', 'AAPL')).toContainText('Apple Inc.')
    await expect(page.locator('footer.statusbar')).toContainText('API connected')
  })

  test('a chart range with no trading data says so', async ({ page, mock }) => {
    mock.on(/^\/api\/history\//, { status: 200, body: { ...history('AAPL', '1D'), bars: [] } })
    await openWith(page, [{ kind: 'GP', symbol: 'AAPL', range: '1D' }])
    await expect(panel(page, 'GP', 'AAPL')).toContainText('No prices for 1D')
  })

  test('EQS warns when its prices are more than a day old', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'EQS' }])
    await expect(panel(page, 'EQS').locator('tbody tr')).toHaveCount(8)
    await expect(panel(page, 'EQS')).not.toContainText("Yahoo hasn't answered")

    mock.on(/^\/api\/screener/, (url) => {
      const old = new Date(Date.now() - 3 * 86_400_000).toISOString()
      return { status: 200, body: { universe: 'S&P 500', total: 0, matched: 0, rows: [], sectors: [], universeAsOf: old, pricesAsOf: old, refreshing: false, source: url.pathname } }
    })
    await page.reload()
    await expect(panel(page, 'EQS')).toContainText("Yahoo hasn't answered since")
  })
})

test.describe('keyboard', () => {
  test('Enter on a focused row opens it; Shift+Enter opens a new panel', async ({ page }) => {
    await openWith(page, [{ kind: 'EQS' }, { kind: 'YC' }])
    const row = panel(page, 'EQS').locator('tbody tr', { hasText: 'JPM' })
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(panel(page, 'DES', 'JPM')).toBeVisible()
    await expect(panels(page)).toHaveCount(2)

    await panel(page, 'EQS').locator('tbody tr', { hasText: 'XOM' }).focus()
    await page.keyboard.press('Shift+Enter')
    await expect(panel(page, 'DES', 'XOM')).toBeVisible()
    await expect(panels(page)).toHaveCount(3)
  })

  test('Alt+arrow keys reorder a watchlist and keep focus on the row', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'W' }])
    const w = panel(page, 'W')
    const symbols = w.locator('tbody th')
    await expect(symbols.first()).toHaveText('AAPL')

    await w.locator('tbody tr', { hasText: 'AAPL' }).focus()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(symbols.nth(0)).toHaveText('MSFT')
    await expect(symbols.nth(1)).toHaveText('AAPL')
    await expect(w.locator('tbody tr', { hasText: 'AAPL' })).toBeFocused()
    await expect(w.locator('[aria-live]')).toHaveText('Moved AAPL to position 2 of 7.')
    expect(mock.watchlists[0].symbols.slice(0, 2)).toEqual(['MSFT', 'AAPL'])
  })
})

test.describe('theme', () => {
  const theme = (page: import('@playwright/test').Page) => page.locator('html').getAttribute('data-theme')

  test('dark by default; the button switches to light and it sticks across reloads', async ({ page }) => {
    await openWith(page, [{ kind: 'GP', symbol: 'AAPL' }])
    expect(await theme(page)).toBeNull()

    await page.getByRole('button', { name: /Switch to light mode/ }).click()
    expect(await theme(page)).toBe('light')
    await expect(page.getByRole('button', { name: /Switch to dark mode/ })).toBeVisible()

    await page.reload()
    expect(await theme(page)).toBe('light')
    // The page background really changed (not just the attribute).
    const bg = await page.locator('html').evaluate((b) => (b.ownerDocument.defaultView as unknown as { getComputedStyle: (e: unknown) => { backgroundColor: string } }).getComputedStyle(b).backgroundColor)
    expect(bg).toBe('rgb(242, 244, 247)')
  })

  test('THEME commands and Alt+T', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'THEME LIGHT')
    expect(await theme(page)).toBe('light')
    await run(page, 'theme dark')
    expect(await theme(page)).toBe('dark')
    await run(page, 'THEME')
    expect(await theme(page)).toBe('light')
    await page.keyboard.press('Alt+KeyT')
    expect(await theme(page)).toBe('dark')

    await run(page, 'THEME BLUE')
    await expect(page.getByRole('alert').filter({ hasText: 'Use THEME, THEME LIGHT or THEME DARK.' })).toBeVisible()
    await expect(commandBar(page)).toBeFocused()
  })
})
