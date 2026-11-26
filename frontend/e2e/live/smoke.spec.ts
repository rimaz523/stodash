import { expect, test, type Page } from '@playwright/test'

/**
 * A short smoke test against the real API on :5080 and real Yahoo/SEC data. It checks that things load, not exact
 * numbers, since those change every day. Run with `npm run test:e2e:live` after starting the backend.
 */

const panelFor = (page: Page, fn: string) =>
  page.locator('section.panel').filter({ has: page.locator('.panel-head .fn', { hasText: new RegExp(`^${fn}$`) }) })

async function open(page: Page, command: string) {
  await page.goto('/')
  await expect(page.locator('footer.statusbar')).toContainText('API connected', { timeout: 15_000 })
  const input = page.getByRole('combobox', { name: 'Command' })
  await input.fill(command)
  await input.press('Enter')
}

test.describe('live backend', () => {
  test.slow() // real network calls

  test('DES and GP load for AAPL', async ({ page }) => {
    await page.goto('/')
    await expect(panelFor(page, 'DES')).toContainText('Apple', { timeout: 20_000 })
    await expect(panelFor(page, 'GP').locator('canvas').first()).toBeVisible()
  })

  test('FA shows statements', async ({ page }) => {
    await open(page, 'AAPL FA')
    await expect(panelFor(page, 'FA').locator('tbody th', { hasText: /^Revenue$/ })).toBeVisible({ timeout: 20_000 })
  })

  test('N shows headlines', async ({ page }) => {
    await open(page, 'AAPL N')
    await expect(panelFor(page, 'N').locator('.news-list > li').first()).toBeVisible({ timeout: 20_000 })
  })

  test('CF shows filings', async ({ page }) => {
    await open(page, 'AAPL CF')
    await expect(panelFor(page, 'CF').locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
  })

  test('W shows your watchlist (needs LocalDB)', async ({ page }) => {
    await open(page, 'W')
    await expect(panelFor(page, 'W').locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
  })

  test('YC draws the Treasury curve', async ({ page }) => {
    await open(page, 'YC')
    await expect(panelFor(page, 'YC').locator('svg polyline').first()).toBeVisible({ timeout: 20_000 })
  })

  test('FX and CRYPTO list rates', async ({ page }) => {
    await open(page, 'FX')
    await expect(panelFor(page, 'FX').locator('.fx-pairs tbody tr')).toHaveCount(8, { timeout: 20_000 })
    const input = page.getByRole('combobox', { name: 'Command' })
    await input.fill('CRYPTO')
    await input.press('Shift+Enter')
    await expect(panelFor(page, 'CRYPTO').locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
  })

  test('ECO shows indicators, or the FRED setup hint without a key', async ({ page }) => {
    await open(page, 'ECO')
    await expect(panelFor(page, 'ECO').locator('.eco-tile, code.setup').first()).toBeVisible({ timeout: 20_000 })
  })
})
