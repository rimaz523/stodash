import { expect, openWith, panel, panels, run, test } from './fixtures.ts'
import { topNews } from './mock-api.ts'

test.describe('TOP: market headlines', () => {
  test('lists headlines from every feed, newest first, with source and age', async ({ page }) => {
    await openWith(page, [{ kind: 'TOP' }])
    const top = panel(page, 'TOP')
    const items = top.locator('.news-list > li')

    await expect(items).toHaveCount(4)
    await expect(items.nth(0)).toContainText('Stocks rally as yields ease')
    await expect(items.nth(0)).toContainText('CNBC')
    await expect(items.nth(0)).toContainText('10m ago')
    // Finnhub stories also name their publisher, plus a summary and tickers.
    await expect(items.nth(1)).toContainText('Finnhub')
    await expect(items.nth(1)).toContainText('Reuters')
    await expect(items.nth(1)).toContainText('Officials saw no rush to cut.')
    await expect(items.nth(1).locator('.badge')).toHaveText('SPY')
    await expect(top).toContainText('4 headlines from CNBC, MarketWatch, Finnhub')

    const link = top.getByRole('link', { name: /Oil slides/ })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
  })

  test('filters by source and remembers the filter', async ({ page }) => {
    await openWith(page, [{ kind: 'TOP' }])
    const top = panel(page, 'TOP')
    const cnbc = top.getByRole('button', { name: /^CNBC 2$/ })

    await cnbc.click()
    await expect(cnbc).toHaveAttribute('aria-pressed', 'true')
    await expect(top.locator('.news-list > li')).toHaveCount(2)

    await page.reload()
    await expect(panel(page, 'TOP').locator('.news-list > li')).toHaveCount(2)
    await panel(page, 'TOP').getByRole('button', { name: /^All 4$/ }).click()
    await expect(panel(page, 'TOP').locator('.news-list > li')).toHaveCount(4)
  })

  test('says which feeds failed and still shows the rest', async ({ page, mock }) => {
    mock.on(/^\/api\/topnews/, { status: 200, body: { ...topNews(), failed: ['Investing.com'] } })
    await openWith(page, [{ kind: 'TOP' }])
    await expect(panel(page, 'TOP')).toContainText("Couldn't reach Investing.com")
    await expect(panel(page, 'TOP').locator('.news-list > li')).toHaveCount(4)
  })

  test('shows the error when every feed fails', async ({ page, mock }) => {
    mock.on(/^\/api\/topnews/, {
      status: 502,
      body: { title: 'Data provider unavailable', detail: 'None of the headline feeds answered. Try again shortly.' },
    })
    await openWith(page, [{ kind: 'TOP' }])
    await expect(panel(page, 'TOP')).toContainText("Couldn't load headlines")
    await expect(panel(page, 'TOP')).toContainText('None of the headline feeds answered')
  })

  test('opens once: running TOP again focuses it', async ({ page }) => {
    await openWith(page, [{ kind: 'TOP' }, { kind: 'DES', symbol: 'AAPL' }], 1)
    await run(page, 'TOP', { newPanel: true })
    await expect(panels(page)).toHaveCount(2)
    await expect(panel(page, 'TOP')).toHaveClass(/active/)
  })
})
