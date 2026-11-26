import { expect, openWith, panel, panels, run, test } from './fixtures.ts'
import { yieldCurve } from './mock-api.ts'

test.describe('ECO: economy', () => {
  test('shows nine indicator tiles with values in their own units', async ({ page }) => {
    await openWith(page, [{ kind: 'ECO' }])
    const eco = panel(page, 'ECO')
    const tiles = eco.locator('.eco-tile')
    await expect(tiles).toHaveCount(9)

    const tile = (label: string) => tiles.filter({ hasText: label })
    await expect(tile('CPI inflation')).toContainText('2.94%')
    await expect(tile('CPI inflation')).toContainText('−0.07 pp')
    await expect(tile('CPI inflation')).toContainText('Oct 2026')
    await expect(tile('Initial jobless claims')).toContainText('221,000')
    await expect(tile('Initial jobless claims')).toContainText('+5,000')
    await expect(tile('Consumer sentiment')).toContainText('71.8')
    await expect(tile('10Y–2Y spread')).toContainText('0.24 pp')
    await expect(tile('Real GDP growth')).toContainText('Q4 2026')
    await expect(eco).toContainText('Source: FRED')
  })

  test('opens an indicator in detail, changes range and goes back', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'ECO' }])
    const eco = panel(page, 'ECO')

    await eco.locator('.eco-tile').filter({ hasText: 'Unemployment' }).click()
    await expect(eco.getByRole('heading', { name: 'Unemployment' })).toBeVisible()
    await expect(eco.locator('.eco-chart canvas').first()).toBeVisible()
    expect(mock.requests).toContain('/api/eco/UNEMP?range=5Y')

    await eco.getByRole('button', { name: '10Y' }).click()
    await expect(eco.getByRole('button', { name: '10Y' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => mock.requests).toContain('/api/eco/UNEMP?range=10Y')

    await eco.getByRole('button', { name: '← All indicators' }).click()
    await expect(eco.locator('.eco-tile')).toHaveCount(9)
  })

  test('"ECO CPI" opens CPI directly; a second ECO reuses the panel', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'ECO CPI', { newPanel: true })
    await expect(panel(page, 'ECO').getByRole('heading', { name: 'CPI inflation' })).toBeVisible()

    await run(page, 'eco inflation', { newPanel: true }) // an alias, and no second ECO panel
    await expect(panel(page, 'ECO')).toHaveCount(1)
    await expect(panels(page)).toHaveCount(2)
  })

  test('explains how to add a FRED key when there is none', async ({ page, mock }) => {
    mock.ecoConfigured = false
    await openWith(page, [{ kind: 'ECO' }])
    const eco = panel(page, 'ECO')
    await expect(eco).toContainText('FRED key not configured')
    await expect(eco.locator('code.setup')).toHaveText(/dotnet user-secrets set "Fred:ApiKey" "YOUR_KEY"/)
    await expect(page.locator('.provider-summary')).toHaveAttribute('title', /FRED: not configured/)
  })
})

test.describe('YC: yield curve', () => {
  test('draws three curves and lists each maturity with changes in basis points', async ({ page }) => {
    await openWith(page, [{ kind: 'YC' }])
    const yc = panel(page, 'YC')

    await expect(yc.locator('.yc-spreads')).toContainText('10Y–2Y +24 bp')
    await expect(yc.locator('.yc-spreads')).toContainText('As of Nov 25, 2026')
    await expect(yc.locator('svg polyline')).toHaveCount(3)
    await expect(yc.locator('.yc-legend')).toContainText('1 year ago')

    const twoYear = yc.locator('tbody tr').filter({ has: page.locator('th', { hasText: /^2Y$/ }) })
    await expect(twoYear).toContainText('4.61%')
    await expect(twoYear.locator('td').nth(3)).toHaveText('−8 bp') // vs 1 month ago
    await expect(twoYear.locator('td').nth(4)).toHaveText('+118 bp') // vs 1 year ago
  })

  test('flags an inverted curve', async ({ page, mock }) => {
    mock.on(/^\/api\/yieldcurve/, { status: 200, body: yieldCurve(true) })
    await openWith(page, [{ kind: 'YC' }])
    await expect(panel(page, 'YC').locator('.badge.inverted').first()).toContainText('inverted')
  })
})

test.describe('FX: currencies', () => {
  test('lists eight pairs in market convention and a cross-rate matrix', async ({ page }) => {
    await openWith(page, [{ kind: 'FX' }])
    const fx = panel(page, 'FX')
    const pairs = fx.locator('.fx-pairs tbody tr')
    await expect(pairs).toHaveCount(8)
    expect(await pairs.locator('th').allTextContents()).toEqual([
      'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD', 'USD/CNY',
    ])
    await expect(pairs.filter({ hasText: 'EUR/USD' })).toContainText('1.0963')
    await expect(pairs.filter({ hasText: 'USD/JPY' })).toContainText('159.16')

    // NZD came from the ECB fallback: labelled, no intraday change, and explained in the footnote.
    const nzd = pairs.filter({ hasText: 'NZD/USD' })
    await expect(nzd.locator('.badge.ecb')).toHaveText('ECB')
    await expect(fx).toContainText('ECB daily reference rates')

    const eurRow = fx.locator('.fx-matrix tbody tr').filter({ has: page.locator('th', { hasText: /^EUR$/ }) })
    await expect(eurRow.locator('td').nth(0)).toHaveText('1.0963') // 1 EUR in USD
    await expect(eurRow.locator('td').nth(1)).toHaveText('—') // EUR → EUR
  })

  test('clicking a pair charts it in a new panel', async ({ page }) => {
    await openWith(page, [{ kind: 'FX' }])
    await panel(page, 'FX').locator('.fx-pairs tbody tr').filter({ hasText: 'EUR/USD' }).click()
    await expect(panel(page, 'GP', 'EURUSD=X')).toBeVisible()
    await expect(panel(page, 'FX')).toBeVisible()
  })
})

test.describe('CRYPTO', () => {
  test('lists coins by rank and sorts by column', async ({ page }) => {
    await openWith(page, [{ kind: 'CRYPTO' }])
    const c = panel(page, 'CRYPTO')
    const rows = c.locator('tbody tr')
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toContainText('BTC')
    await expect(rows.first()).toContainText('60,892.00')
    await expect(rows.first()).toContainText('1.22T')
    await expect(rows.first().locator('svg.sparkline path')).toHaveCount(1)

    await c.getByRole('button', { name: '24h', exact: true }).click() // biggest gain first
    await expect(rows.first()).toContainText('SOL')
    await c.getByRole('button', { name: '24h', exact: true }).click() // then smallest first
    await expect(rows.first()).toContainText('USDT')
    await expect(c.locator('th[aria-sort="ascending"]')).toContainText('24h')
  })

  test('clicking a coin charts its -USD pair', async ({ page }) => {
    await openWith(page, [{ kind: 'CRYPTO' }])
    await panel(page, 'CRYPTO').locator('tbody tr').filter({ hasText: 'Ethereum' }).click()
    await expect(panel(page, 'GP', 'ETH-USD')).toBeVisible()
  })
})
