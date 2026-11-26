import { expect, openWith, panel, panels, run, test } from './fixtures.ts'

const symbols = (p: ReturnType<typeof panel>) => p.locator('tbody th')

test.describe('EQS: equity screener', () => {
  test('lists the universe by market cap with prices and ratios', async ({ page }) => {
    await openWith(page, [{ kind: 'EQS' }])
    const eqs = panel(page, 'EQS')

    await expect(eqs).toContainText('Equity screener · S&P 500')
    await expect(eqs.locator('.eqs-summary')).toContainText('8 of 8 match')
    await expect(symbols(eqs)).toHaveText(['AAPL', 'MSFT', 'NVDA', 'BRK-B', 'JPM', 'XOM', 'INTC', 'DVN'])

    const aapl = eqs.locator('tbody tr').first()
    await expect(aapl).toContainText('Apple Inc.')
    await expect(aapl).toContainText('355.58')
    await expect(aapl).toContainText('+0.43%')
    await expect(aapl).toContainText('5.17T')
    await expect(aapl).toContainText('39.60')
    await expect(aapl).toContainText('0.30%') // yield is a fraction
    // A loss-maker has no P/E.
    await expect(eqs.locator('tbody tr', { hasText: 'INTC' })).toContainText('—')
  })

  test('filters by sector and ranges, a moment after typing', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'EQS' }])
    const eqs = panel(page, 'EQS')
    await expect(symbols(eqs)).toHaveCount(8)

    await eqs.getByRole('combobox').selectOption('Energy')
    await expect(symbols(eqs)).toHaveText(['XOM', 'DVN'])
    await expect(eqs.locator('.eqs-summary')).toContainText('2 of 8 match')

    await eqs.getByRole('combobox').selectOption('')
    await eqs.getByLabel('Minimum market cap ($B)').fill('1000')
    await expect(symbols(eqs)).toHaveText(['AAPL', 'MSFT', 'NVDA', 'BRK-B'])
    // Market caps are typed in billions and sent in dollars.
    expect(mock.requests.some((r) => r.includes('minCap=1000000000000'))).toBe(true)

    await eqs.getByLabel('Maximum p/e').fill('30')
    await expect(symbols(eqs)).toHaveText(['MSFT', 'NVDA', 'BRK-B'])
  })

  test('sorts by a column and flips on a second click', async ({ page }) => {
    await openWith(page, [{ kind: 'EQS' }])
    const eqs = panel(page, 'EQS')
    const chg = eqs.getByRole('button', { name: /^Chg/ })

    await chg.click()
    await expect(symbols(eqs).first()).toHaveText('INTC')
    await expect(eqs.locator('th[aria-sort="descending"]')).toContainText('Chg')
    await chg.click()
    await expect(symbols(eqs).first()).toHaveText('NVDA')
    await expect(eqs.locator('th[aria-sort="ascending"]')).toContainText('Chg')
  })

  test('presets set filters and sorting; Reset clears them', async ({ page }) => {
    await openWith(page, [{ kind: 'EQS' }])
    const eqs = panel(page, 'EQS')

    await eqs.getByRole('button', { name: 'Gainers' }).click()
    await expect(symbols(eqs)).toHaveText(['INTC', 'DVN', 'XOM'])
    await expect(eqs.getByLabel('Minimum change (%)')).toHaveValue('2')

    await eqs.getByRole('button', { name: 'Value' }).click()
    await expect(symbols(eqs)).toHaveText(['DVN', 'XOM'])

    await eqs.getByRole('button', { name: 'Reset' }).click()
    await expect(symbols(eqs)).toHaveCount(8)
    await expect(eqs.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  test('keeps the screen across reloads', async ({ page }) => {
    await openWith(page, [{ kind: 'EQS' }])
    await panel(page, 'EQS').getByRole('combobox').selectOption('Financials')
    await expect(symbols(panel(page, 'EQS'))).toHaveText(['BRK-B', 'JPM'])
    await page.reload()
    await expect(symbols(panel(page, 'EQS'))).toHaveText(['BRK-B', 'JPM'])
    await expect(panel(page, 'EQS').getByRole('combobox')).toHaveValue('Financials')
  })

  test('says so when nothing matches, and catches min above max', async ({ page }) => {
    await openWith(page, [{ kind: 'EQS' }])
    const eqs = panel(page, 'EQS')
    await eqs.getByLabel('Minimum p/e').fill('500')
    await expect(eqs).toContainText('Nothing matches')

    await eqs.getByLabel('Maximum p/e').fill('10')
    await expect(eqs.getByRole('alert')).toHaveText('The minimum p/e is above the maximum.')
  })

  test('clicking a row opens DES in the other panel, keeping the screener', async ({ page }) => {
    await openWith(page, [{ kind: 'EQS' }, { kind: 'GP', symbol: 'AAPL' }])
    await panel(page, 'EQS').locator('tbody tr', { hasText: 'JPM' }).click()
    await expect(panel(page, 'DES', 'JPM')).toBeVisible()
    await expect(panel(page, 'EQS')).toBeVisible()
    await expect(panels(page)).toHaveCount(2)
  })

  test('shows the error when the screener fails', async ({ page, mock }) => {
    mock.on(/^\/api\/screener/, {
      status: 502,
      body: { title: 'Data provider unavailable', detail: "Yahoo didn't return prices for the screener. Try again shortly." },
    })
    await openWith(page, [{ kind: 'EQS' }])
    await expect(panel(page, 'EQS')).toContainText("Couldn't load the screener")
    await expect(panel(page, 'EQS')).toContainText("Yahoo didn't return prices")
  })

  test('EQS takes no arguments', async ({ page }) => {
    await openWith(page, [])
    await run(page, 'EQS TECH')
    await expect(page.getByRole('alert').filter({ hasText: "EQS doesn't take anything after it" })).toBeVisible()
  })
})
