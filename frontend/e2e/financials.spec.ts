import { expect, openWith, panel, run, test } from './fixtures.ts'

const rowOf = (fa: ReturnType<typeof panel>, label: string) =>
  fa.locator('tbody tr').filter({ has: fa.page().locator('th', { hasText: new RegExp(`^${label}$`) }) })

test.describe('FA: financial statements', () => {
  test('shows the key income rows by default, with period columns and change', async ({ page }) => {
    await openWith(page, [{ kind: 'FA', symbol: 'AAPL' }])
    const fa = panel(page, 'FA', 'AAPL')

    await expect(fa.locator('thead')).toContainText('FY2026')
    await expect(fa.locator('thead')).toContainText('FY2023')
    await expect(rowOf(fa, 'Revenue')).toContainText('478.83B')
    await expect(rowOf(fa, 'Revenue')).toHaveClass(/total/)
    await expect(rowOf(fa, 'Revenue').locator('td.chg')).toHaveText('+15.06%')
    await expect(rowOf(fa, 'EPS \\(diluted\\)')).toContainText('8.98')
    await expect(fa).toContainText('Source: Yahoo · figures in USD')

    // Non-key rows stay hidden until expanded.
    await expect(rowOf(fa, 'Total operating expenses')).toHaveCount(0)
    await fa.getByRole('button', { name: 'All rows (7)' }).click()
    await expect(rowOf(fa, 'Total operating expenses')).toBeVisible()
    await fa.getByRole('button', { name: 'Key rows' }).click()
    await expect(rowOf(fa, 'Total operating expenses')).toHaveCount(0)
  })

  test('switches statements and periods', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'FA', symbol: 'AAPL' }])
    const fa = panel(page, 'FA', 'AAPL')

    await fa.getByRole('button', { name: 'Balance sheet' }).click()
    await expect(rowOf(fa, 'Total assets')).toContainText('404.50B')

    await fa.getByRole('button', { name: 'Cash flow' }).click()
    await expect(rowOf(fa, 'Capital expenditure')).toContainText('−9.04B')

    await fa.getByRole('button', { name: 'Ratios' }).click()
    await expect(rowOf(fa, 'Gross margin')).toContainText('48.8%')
    await expect(rowOf(fa, 'Gross margin').locator('td.chg')).toHaveText('+1.9 pts')
    await expect(rowOf(fa, 'Debt / equity')).toContainText('0.87×')

    await fa.getByRole('button', { name: 'Quarterly' }).click()
    await expect(fa.locator('thead')).toContainText('Sep 2026')
    await expect(fa.locator('thead')).toContainText('QoQ')
    expect(mock.requests).toContain('/api/financials/AAPL?period=quarterly')
  })

  test('"FA Q" opens quarterly, and the chosen statement sticks across tickers and reloads', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'AAPL FA Q')
    const fa = panel(page, 'FA', 'AAPL')
    await expect(fa.getByRole('button', { name: 'Quarterly' })).toHaveAttribute('aria-pressed', 'true')

    await fa.getByRole('button', { name: 'Ratios' }).click()
    await run(page, 'MSFT FA')
    const msft = panel(page, 'FA', 'MSFT')
    await expect(msft.getByRole('button', { name: 'Ratios' })).toHaveAttribute('aria-pressed', 'true')
    await expect(msft.getByRole('button', { name: 'Quarterly' })).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(panel(page, 'FA', 'MSFT').getByRole('button', { name: 'Ratios' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('explains why an index has no statements', async ({ page }) => {
    await openWith(page, [{ kind: 'FA', symbol: '^GSPC' }])
    const fa = panel(page, 'FA', '^GSPC')
    await expect(fa).toContainText('No financial statements')
    await expect(fa).toContainText('^GSPC is an index')
  })

  test('an unknown ticker shows one clear error', async ({ page }) => {
    await openWith(page, [{ kind: 'FA', symbol: 'ZZZZ' }])
    await expect(panel(page, 'FA', 'ZZZZ')).toContainText("Couldn't load ZZZZ")
    await expect(panel(page, 'FA', 'ZZZZ')).toContainText("No instrument found for 'ZZZZ'")
  })

  test('a provider failure keeps the quote and says what failed', async ({ page, mock }) => {
    mock.on(/^\/api\/financials\//, { status: 502, body: { title: 'Data provider unavailable', detail: 'Yahoo is rate-limiting requests; try again shortly.' } })
    await openWith(page, [{ kind: 'FA', symbol: 'AAPL' }])
    const fa = panel(page, 'FA', 'AAPL')

    await expect(fa).toContainText('355.58')
    await expect(fa).toContainText("Couldn't load financial statements")
    await expect(fa).toContainText('Yahoo is rate-limiting')
  })
})
