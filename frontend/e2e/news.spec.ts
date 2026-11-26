import { expect, openWith, panel, test } from './fixtures.ts'

test.describe('N: company news', () => {
  test('lists headlines newest first with source, age and tickers', async ({ page }) => {
    await openWith(page, [{ kind: 'N', symbol: 'AAPL' }])
    const n = panel(page, 'N', 'AAPL')
    const items = n.locator('.news-list > li')

    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText('Apple Inc. beats expectations')
    await expect(items.nth(0)).toContainText('Reuters')
    await expect(items.nth(0)).toContainText('25m ago')
    await expect(items.nth(0)).toContainText('Revenue rose 15%')
    await expect(items.nth(1)).toContainText('3h ago')

    // The panel's own ticker comes first and is highlighted; extras collapse into "+N".
    await expect(items.nth(1).locator('.badge').first()).toHaveText('AAPL')
    await expect(items.nth(1).locator('.badge.self')).toHaveText('AAPL')
    await expect(items.nth(1)).toContainText('+3')

    await expect(n).toContainText('2 headlines from Yahoo + Finnhub')
  })

  test('headlines open safely in a new tab', async ({ page }) => {
    await openWith(page, [{ kind: 'N', symbol: 'AAPL' }])
    const link = panel(page, 'N', 'AAPL').getByRole('link', { name: /beats expectations/ })

    await expect(link).toHaveAttribute('href', 'https://example.com/news/beats')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
  })

  test('says so when there is no news', async ({ page, mock }) => {
    mock.on(/^\/api\/news\//, { status: 200, body: { symbol: 'AAPL', items: [], providers: ['Yahoo'] } })
    await openWith(page, [{ kind: 'N', symbol: 'AAPL' }])
    await expect(panel(page, 'N', 'AAPL')).toContainText('No recent headlines')
  })

  test('shows the error when news fails', async ({ page, mock }) => {
    mock.on(/^\/api\/news\//, { status: 502, body: { title: 'Data provider unavailable', detail: 'Yahoo news returned 500.' } })
    await openWith(page, [{ kind: 'N', symbol: 'AAPL' }])
    await expect(panel(page, 'N', 'AAPL')).toContainText("Couldn't load news")
    await expect(panel(page, 'N', 'AAPL')).toContainText('Yahoo news returned 500.')
  })
})
