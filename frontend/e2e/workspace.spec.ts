import { expect, openWith, panel, panels, test } from './fixtures.ts'

const widths = async (page: import('@playwright/test').Page) =>
  Promise.all((await panels(page).all()).map(async (p) => (await p.boundingBox())!.width))

/** Moves focus out of the command bar, so plain keys reach the app. */
const leaveCommandBar = (page: import('@playwright/test').Page) => page.locator('footer.statusbar').click()

test.describe('workspace: resizing and shortcuts', () => {
  test('dragging the divider resizes the columns, and it is remembered', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'YC' }])
    const divider = page.getByRole('separator', { name: 'Resize columns' })
    await expect(divider).toHaveAttribute('aria-valuenow', '50')

    const box = (await divider.boundingBox())!
    const ws = (await page.locator('main.workspace').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(ws.x + ws.width * 0.3, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()

    const [left, right] = await widths(page)
    expect(left / (left + right)).toBeLessThan(0.36)
    const after = Number(await divider.getAttribute('aria-valuenow'))
    expect(after).toBeLessThan(36)

    await page.reload()
    await expect(page.getByRole('separator', { name: 'Resize columns' })).toHaveAttribute('aria-valuenow', String(after))
  })

  test('dividers work from the keyboard and stop at 20/80', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'YC' }, { kind: 'FX' }, { kind: 'CRYPTO' }])
    const rows = page.getByRole('separator', { name: 'Resize rows' })
    await rows.focus()
    await page.keyboard.press('ArrowDown')
    await expect(rows).toHaveAttribute('aria-valuenow', '55')
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown')
    await expect(rows).toHaveAttribute('aria-valuenow', '80')
    await page.keyboard.press('Enter')
    await expect(rows).toHaveAttribute('aria-valuenow', '50')
  })

  test('a single panel has no dividers', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await expect(page.getByRole('separator')).toHaveCount(0)
  })

  test('Alt+M maximizes the active panel and restores it', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'YC' }, { kind: 'FX' }], 1)
    await page.keyboard.press('Alt+KeyM')
    await expect(panel(page, 'YC')).toHaveClass(/maximized/)
    await expect(panel(page, 'DES', 'AAPL')).toBeHidden()
    await expect(panel(page, 'FX')).toBeHidden()
    await expect(page.getByRole('separator')).toHaveCount(0)

    // Switching panels while maximized shows the other one instead.
    await page.keyboard.press('Alt+Digit3')
    await expect(panel(page, 'FX')).toBeVisible()
    await expect(panel(page, 'YC')).toBeHidden()

    await panel(page, 'FX').getByRole('button', { name: /Restore panel/ }).click()
    await expect(panels(page).filter({ visible: true })).toHaveCount(3)
  })

  test('Alt+X closes the active panel; Alt+] and Alt+[ move it', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'YC' }, { kind: 'FX' }], 0)
    const order = () => panels(page).locator('.panel-head .fn').allTextContents()

    await page.keyboard.press('Alt+BracketRight')
    await expect.poll(order).toEqual(['YC', 'DES', 'FX'])
    await page.keyboard.press('Alt+BracketRight')
    await expect.poll(order).toEqual(['YC', 'FX', 'DES'])
    await page.keyboard.press('Alt+BracketLeft')
    await expect.poll(order).toEqual(['YC', 'DES', 'FX'])

    await page.keyboard.press('Alt+KeyX')
    await expect.poll(order).toEqual(['YC', 'FX'])
  })

  test('Alt+. and Alt+, step through panels', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'YC' }, { kind: 'FX' }], 0)
    await page.keyboard.press('Alt+Period')
    await expect(panel(page, 'YC')).toHaveClass(/active/)
    await page.keyboard.press('Alt+Comma')
    await page.keyboard.press('Alt+Comma')
    await expect(panel(page, 'FX')).toHaveClass(/active/)
  })

  test('? opens help and Alt+L opens layouts, in new panels', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    await leaveCommandBar(page)
    await page.keyboard.press('?')
    await expect(panel(page, 'HELP')).toBeVisible()
    await expect(panel(page, 'DES', 'AAPL')).toBeVisible()
    await page.keyboard.press('Alt+KeyL')
    await expect(panel(page, 'LAYOUT')).toBeVisible()
    await expect(panels(page)).toHaveCount(3)
  })

  test('typing ? in the command bar types it', async ({ page }) => {
    await openWith(page, [{ kind: 'DES', symbol: 'AAPL' }])
    const input = page.getByRole('combobox', { name: 'Command' })
    await input.fill('AAPL')
    await input.press('?')
    await expect(input).toHaveValue('AAPL?')
    await expect(panel(page, 'HELP')).toHaveCount(0)
  })
})
