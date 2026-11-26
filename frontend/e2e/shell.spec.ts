import { commandBar, expect, openWith, panel, panels, run, test } from './fixtures.ts'

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
    await expect(status.locator('.provider.up', { hasText: 'Yahoo' })).toBeVisible()
    await expect(status.locator('.provider.up', { hasText: 'SEC' })).toBeVisible()
    await expect(status.locator('.provider.off', { hasText: 'Finnhub' })).toBeVisible()
    await expect(commandBar(page)).toBeFocused()

    expect(mock.requests.some((r) => r.startsWith('/api/quotes?symbols='))).toBe(true)
  })

  test('shows a failing provider in red with its error on hover', async ({ page, mock }) => {
    mock.on(/^\/api\/health/, {
      status: 200,
      body: {
        status: 'ok',
        providers: {
          yahoo: { configured: true, state: 'up', lastOk: null, lastFailure: null, lastError: null },
          sec: { configured: true, state: 'down', lastOk: null, lastFailure: '2026-11-26T04:00:00Z', lastError: 'SEC EDGAR timed out.' },
          finnhub: { configured: true, state: 'unknown', lastOk: null, lastFailure: null, lastError: null },
        },
      },
    })
    await page.goto('/')

    const sec = page.locator('.provider.down', { hasText: 'SEC' })
    await expect(sec).toBeVisible()
    await expect(sec).toHaveAttribute('title', /SEC EDGAR timed out/)
    await expect(page.locator('.provider.unknown', { hasText: 'Finnhub' })).toBeVisible()
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
