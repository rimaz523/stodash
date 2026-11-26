import { commandBar, expect, openWith, panel, panels, run, test } from './fixtures.ts'
import { health } from './mock-api.ts'

test.describe('app shell', () => {
  test('opens the default layout with quotes, market strip and status bar', async ({ page, mock }) => {
    await page.goto('/')

    await expect(panels(page)).toHaveCount(2)
    await expect(panel(page, 'DES', 'AAPL')).toContainText('Apple Inc.')
    await expect(panel(page, 'DES', 'AAPL')).toContainText('355.58')
    await expect(panel(page, 'GP', 'AAPL').locator('canvas').first()).toBeVisible()

    const strip = page.getByRole('navigation', { name: 'Markets overview' })
    await expect(strip.getByRole('button', { name: /S&P 500/ })).toContainText('7,182.78')

    const status = page.locator('footer.statusbar')
    await expect(status).toContainText('API connected')
    // 10 providers, Finnhub not configured: 9 counted, all fine. Hovering lists each one.
    const summary = status.locator('.provider-summary')
    await expect(summary).toHaveText(/9\/9 ok/)
    await expect(summary).toHaveAttribute('title', /Yahoo: working/)
    await expect(summary).toHaveAttribute('title', /Finnhub: not configured/)
    await expect(status.locator('.provider.down')).toHaveCount(0)
    await expect(commandBar(page)).toBeFocused()

    expect(mock.requests.some((r) => r.startsWith('/api/quotes?symbols='))).toBe(true)
  })

  test('shows a failing provider in red with its error on hover', async ({ page, mock }) => {
    mock.on(/^\/api\/health/, { status: 200, body: health({ sec: 'down', finnhub: 'unknown' }, 'live') })
    await page.goto('/')

    const sec = page.locator('.provider.down', { hasText: 'SEC failing' })
    await expect(sec).toBeVisible()
    await expect(sec).toHaveAttribute('title', /SEC EDGAR timed out/)
    await expect(page.locator('.provider-summary')).toHaveText(/9\/10 ok/)
    await expect(page.locator('.provider-summary')).toHaveClass(/down/)
    await expect(page.locator('.provider.live')).toHaveText(/Live/) // the watchlist stream is up
  })

  test('explains that the backend is offline', async ({ page, mock }) => {
    mock.on(/^\/api\//, 'abort')
    await page.goto('/')

    await expect(page.locator('footer.statusbar')).toContainText('API offline')
    await expect(panel(page, 'DES')).toContainText("Couldn't load AAPL")
    await expect(panel(page, 'DES')).toContainText('Is the backend running on :5080?')
  })

  test('clicking the market strip charts that market in the active panel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /S&P 500/ }).click()

    await expect(panel(page, 'GP', '^GSPC')).toBeVisible()
    await expect(panel(page, 'GP', '^GSPC')).toContainText('S&P 500')
    await expect(panels(page)).toHaveCount(2)
  })

  test('Alt+number switches the active panel', async ({ page }) => {
    await page.goto('/')
    await expect(panels(page).nth(0)).toHaveClass(/active/)

    await page.keyboard.press('Alt+2')
    await expect(panels(page).nth(1)).toHaveClass(/active/)
    await expect(panels(page).nth(0)).not.toHaveClass(/active/)
  })

  test('the layout survives a reload', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'MSFT FA', { newPanel: true })
    await expect(panel(page, 'FA', 'MSFT')).toBeVisible()

    await page.reload()
    await expect(panels(page)).toHaveCount(2)
    await expect(panel(page, 'FA', 'MSFT')).toBeVisible()
    await expect(panels(page).nth(1)).toHaveClass(/active/)
  })
})
