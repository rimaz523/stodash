import { expect, openWith, panel, panels, run, test } from './fixtures.ts'

const toast = (page: import('@playwright/test').Page) => page.locator('.toast')

test.describe('LAYOUT: saved workspaces', () => {
  test('LAYOUT SAVE stores the open panels and sizes; LAYOUT <name> brings them back', async ({ page, mock }) => {
    await openWith(page, [
      { kind: 'DES', symbol: 'MSFT' },
      { kind: 'GP', symbol: 'MSFT', range: '1Y' },
    ])
    await run(page, 'LAYOUT SAVE Morning')
    await expect(toast(page)).toHaveText('Saved layout "Morning".')
    expect(mock.layouts).toHaveLength(1)
    const saved = mock.layouts[0].workspace as { panels: { kind: string; symbol?: string }[]; sizes: unknown }
    expect(saved.panels.map((p) => `${p.symbol} ${p.kind}`)).toEqual(['MSFT DES', 'MSFT GP'])
    expect(saved.sizes).toEqual({ col: 0.5, row: 0.5 })

    await run(page, 'CLEAR')
    await expect(panels(page)).toHaveCount(0)
    await run(page, 'layout morning') // names match regardless of case
    await expect(toast(page)).toHaveText('Loaded layout "Morning".')
    await expect(panel(page, 'DES', 'MSFT')).toBeVisible()
    await expect(panel(page, 'GP', 'MSFT')).toBeVisible()
  })

  test('saving under an existing name replaces it; deleting removes it', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'LAYOUT SAVE Desk')
    await expect(toast(page)).toHaveText('Saved layout "Desk".')
    await run(page, 'TOP', { newPanel: true })
    await run(page, 'LAYOUT SAVE desk')
    await expect(toast(page)).toHaveText('Updated layout "Desk".')
    expect(mock.layouts).toHaveLength(1)
    expect((mock.layouts[0].workspace as { panels: unknown[] }).panels).toHaveLength(2)

    await run(page, 'LAYOUT DEL Desk')
    await expect(toast(page)).toHaveText('Deleted layout "Desk".')
    expect(mock.layouts).toHaveLength(0)
  })

  test('explains unknown names and missing names', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'LAYOUT Nope')
    await expect(toast(page)).toHaveText(`There's no layout called "Nope". Type LAYOUT to see them.`)
    await run(page, 'LAYOUT SAVE')
    await expect(page.getByRole('alert').filter({ hasText: 'Which layout? e.g. LAYOUT SAVE Morning' })).toBeVisible()
  })

  test('LAYOUT DES is the ticker LAYOUT, like W DES', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await run(page, 'LAYOUT DES')
    await expect.poll(() => mock.requests.some((r) => r.startsWith('/api/quote/LAYOUT'))).toBe(true)
  })

  test('the LAYOUT panel saves, loads, renames and deletes', async ({ page, mock }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'LAYOUT' }], 1)
    const lp = panel(page, 'LAYOUT')
    await expect(lp).toContainText('No saved layouts yet')

    await lp.getByLabel('Layout name').fill('Research')
    await lp.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(lp).toContainText('Saved layout "Research".')
    // The layout manager itself isn't part of what gets saved.
    await expect(lp.locator('.layout-item')).toContainText('AAPL DES')
    await expect(lp.locator('.layout-item .badge')).toHaveCount(1)
    expect((mock.layouts[0].workspace as { panels: { kind: string }[] }).panels.map((p) => p.kind)).toEqual(['DES'])

    // Typing an existing name asks before replacing it.
    await lp.getByLabel('Layout name').fill('research')
    await lp.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(lp).toContainText('A layout with that name exists. Replace it?')
    await lp.getByRole('button', { name: 'Replace' }).click()
    await expect(lp).toContainText('Updated layout "Research".')

    await lp.getByRole('button', { name: 'Rename' }).click()
    await lp.getByLabel('New layout name').fill('Deep dive')
    await lp.getByRole('button', { name: 'Rename' }).click()
    await expect(lp).toContainText('Renamed to "Deep dive".')

    await lp.getByRole('button', { name: 'Load', exact: true }).click()
    await expect(panels(page)).toHaveCount(1)
    await expect(panel(page, 'DES', 'AAPL')).toBeVisible()

    await run(page, 'LAYOUT', { newPanel: true })
    const again = panel(page, 'LAYOUT')
    await again.getByRole('button', { name: 'Delete' }).click()
    await again.getByRole('button', { name: 'Delete' }).click() // confirm
    await expect(again).toContainText('Deleted layout "Deep dive".')
    await expect(again).toContainText('No saved layouts yet')
  })

  test('Alt+Shift+number loads the nth saved layout', async ({ page, mock }) => {
    mock.layouts = [
      { id: 50, name: 'A first', workspace: { panels: [{ id: 'x', kind: 'YC' }], activeId: 'x' }, updatedAt: '2026-11-26T04:00:00Z' },
      { id: 51, name: 'B second', workspace: { panels: [{ id: 'y', kind: 'FX' }, { id: 'z', kind: 'CRYPTO' }], activeId: 'z' }, updatedAt: '2026-11-26T04:00:00Z' },
    ]
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await page.locator('footer.statusbar').click()
    await page.keyboard.press('Alt+Shift+Digit2')
    await expect(toast(page)).toHaveText('Loaded layout "B second".')
    await expect(panel(page, 'FX')).toBeVisible()
    await expect(panel(page, 'CRYPTO')).toHaveClass(/active/)

    await page.keyboard.press('Alt+Shift+Digit5')
    await expect(toast(page)).toContainText("There's no saved layout 5")
  })

  test("a layout this version can't read is shown but can't be loaded", async ({ page, mock }) => {
    mock.layouts = [{ id: 60, name: 'Future', workspace: { panels: [{ id: 'q', kind: 'NEWTHING' }] }, updatedAt: '2026-11-26T04:00:00Z' }]
    await openWith(page, [{ kind: 'LAYOUT' }])
    const lp = panel(page, 'LAYOUT')
    await expect(lp).toContainText("can't be loaded")
    await expect(lp.getByRole('button', { name: 'Load', exact: true })).toBeDisabled()
  })
})
