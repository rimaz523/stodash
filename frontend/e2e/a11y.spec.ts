import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, openWith, panels, test, type SeedPanel } from './fixtures.ts'

/** Every panel kind, four at a time (the most the workspace holds). */
const GROUPS: [string, SeedPanel[]][] = [
  ['DES, GP, FA, N', [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'GP', symbol: 'AAPL' }, { kind: 'FA', symbol: 'AAPL' }, { kind: 'N', symbol: 'AAPL' }]],
  ['CF, W, ECO, YC', [{ kind: 'CF', symbol: 'AAPL' }, { kind: 'W' }, { kind: 'ECO' }, { kind: 'YC' }]],
  ['FX, CRYPTO, TOP, EQS', [{ kind: 'FX' }, { kind: 'CRYPTO' }, { kind: 'TOP' }, { kind: 'EQS' }]],
  ['LAYOUT, HELP', [{ kind: 'LAYOUT' }, { kind: 'HELP' }]],
]

async function useTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((t) => localStorage.setItem('stodash.theme.v1', t), theme)
}

/** WCAG 2.1 A and AA violations on the page, as readable lines ("rule: element"). */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The charts are canvases; TradingView's attribution link inside them is theirs to style.
    .exclude('#tv-attr-logo')
    .analyze()
  return result.violations.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')} – ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`))
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility (${theme})`, () => {
    for (const [name, group] of GROUPS) {
      test(`${name} have no WCAG A/AA violations`, async ({ page }) => {
        await useTheme(page, theme)
        await openWith(page, group)
        await expect(panels(page)).toHaveCount(group.length)
        // Wait until every panel has finished loading (no skeletons left).
        await expect(panels(page).locator('.skeleton')).toHaveCount(0)
        expect(await violations(page)).toEqual([])
      })
    }

    test('the empty workspace, command errors and the offline banner have no violations', async ({ page, mock }) => {
      await useTheme(page, theme)
      await openWith(page, [])
      const input = page.getByRole('combobox', { name: 'Command' })
      await input.fill('AAPL XYZ')
      await input.press('Enter')
      await expect(page.getByRole('alert').filter({ hasText: 'Unknown function' })).toBeVisible()
      expect(await violations(page)).toEqual([])

      mock.on(/^\/api\//, 'abort')
      await page.reload()
      await expect(page.locator('.offline-banner')).toBeVisible()
      expect(await violations(page)).toEqual([])
    })
  })
}
