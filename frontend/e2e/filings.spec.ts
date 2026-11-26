import { expect, openWith, panel, test } from './fixtures.ts'

test.describe('CF: SEC filings', () => {
  test('lists filings with category counts and pages through long lists', async ({ page }) => {
    await openWith(page, [{ kind: 'CF', symbol: 'AAPL' }])
    const cf = panel(page, 'CF', 'AAPL')
    const chip = (name: RegExp) => cf.getByRole('button', { name })

    await expect(chip(/^All 135$/)).toHaveAttribute('aria-pressed', 'true')
    await expect(chip(/^Annual 3$/)).toBeVisible()
    await expect(chip(/^Quarterly 4$/)).toBeVisible()
    await expect(chip(/^8-K 5$/)).toBeVisible()
    await expect(chip(/^Proxy 2$/)).toBeVisible()
    await expect(chip(/^Insider 120$/)).toBeVisible()
    await expect(chip(/^Other 1$/)).toBeVisible()

    const rows = cf.locator('tbody tr')
    await expect(rows).toHaveCount(100)
    await expect(cf).toContainText('Showing 100 of 135')
    await cf.getByRole('button', { name: 'Show 35 more' }).click()
    await expect(rows).toHaveCount(135)
    await expect(cf.getByRole('button', { name: /more$/ })).toHaveCount(0)
  })

  test('filters by category, and the filter is remembered', async ({ page }) => {
    await openWith(page, [{ kind: 'CF', symbol: 'AAPL' }])
    const cf = panel(page, 'CF', 'AAPL')

    await cf.getByRole('button', { name: /^8-K/ }).click()
    const rows = cf.locator('tbody tr')
    await expect(rows).toHaveCount(5)
    for (const form of await rows.locator('.badge.form').allTextContents()) expect(form).toBe('8-K')
    await expect(rows.first()).toContainText('Current report: Results of operations')

    await page.reload()
    await expect(panel(page, 'CF', 'AAPL').getByRole('button', { name: /^8-K/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(panel(page, 'CF', 'AAPL').locator('tbody tr')).toHaveCount(5)
  })

  test('links go to the document, its index and EDGAR, in new tabs', async ({ page }) => {
    await openWith(page, [{ kind: 'CF', symbol: 'AAPL' }])
    const cf = panel(page, 'CF', 'AAPL')
    await cf.getByRole('button', { name: /^Annual/ }).click()

    const first = cf.locator('tbody tr').first()
    const doc = first.getByRole('link', { name: 'Annual report' })
    await expect(doc).toHaveAttribute('href', /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/.+\/doc\.htm$/)
    await expect(doc).toHaveAttribute('target', '_blank')
    await expect(first.getByRole('link', { name: /index/ })).toHaveAttribute('href', /-index\.htm$/)
    await expect(cf.getByRole('link', { name: /All filings on EDGAR/ })).toHaveAttribute('href', /CIK=320193/)
  })

  test('explains that non-US listings have no SEC filings', async ({ page }) => {
    await openWith(page, [{ kind: 'CF', symbol: 'RY.TO' }])
    const cf = panel(page, 'CF', 'RY.TO')
    await expect(cf).toContainText('No SEC filings')
    await expect(cf).toContainText('EDGAR only covers companies registered with the US SEC')
    await expect(cf.locator('table')).toHaveCount(0)
  })

  test('shows the setup hint when SEC is not configured', async ({ page, mock }) => {
    mock.on(/^\/api\/filings\//, {
      status: 502,
      body: { title: 'Data provider unavailable', detail: 'SEC EDGAR is not configured. Set Sec:UserAgent to "Stodash your@email" (see README).' },
    })
    await openWith(page, [{ kind: 'CF', symbol: 'AAPL' }])
    await expect(panel(page, 'CF', 'AAPL')).toContainText("Couldn't load SEC filings")
    await expect(panel(page, 'CF', 'AAPL')).toContainText('Set Sec:UserAgent')
  })
})
