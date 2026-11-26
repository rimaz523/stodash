import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { MockApi } from './mock-api.ts'

/** A saved panel, as App.tsx stores it in localStorage. */
export type SeedPanel = { kind: string; symbol?: string; [setting: string]: unknown }

/**
 * `test` with a fake API already installed (see mock-api.ts). Each test gets a fresh browser context, so
 * localStorage starts empty and the app opens its default layout (AAPL DES + AAPL GP) unless a test seeds one.
 */
export const test = base.extend<{ mock: MockApi }>({
  // auto: installed for every test, even ones that don't use `mock`, so no request ever reaches a real backend.
  mock: [
    async ({ page }, use) => {
      const mock = new MockApi()
      await mock.install(page)
      await use(mock)
    },
    { auto: true },
  ],
})

export { expect }

/** Opens the app with these panels already saved, as if the user had left them open last time. */
export async function openWith(page: Page, panels: SeedPanel[], activeIndex = 0) {
  const workspace = {
    panels: panels.map((p, i) => ({ id: `p${i}`, ...p })),
    activeId: panels.length ? `p${activeIndex}` : null,
  }
  // Seed only on the first load, so reloads inside a test see what the app saved.
  await page.addInitScript((ws) => {
    if (sessionStorage.getItem('e2e.seeded')) return
    sessionStorage.setItem('e2e.seeded', '1')
    localStorage.setItem('stodash.workspace.v1', ws)
  }, JSON.stringify(workspace))
  await page.goto('/')
}

/** All open panels, in layout order. */
export const panels = (page: Page) => page.locator('section.panel')

/** The panel showing function `fn` (e.g. "FA"), optionally for one symbol. */
export function panel(page: Page, fn: string, symbol?: string): Locator {
  let p = panels(page).filter({ has: page.locator('.panel-head .fn', { hasText: new RegExp(`^${fn}$`) }) })
  if (symbol) p = p.filter({ has: page.locator('.panel-head .title .mono', { hasText: new RegExp(`^${escape(symbol)}$`) }) })
  return p
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const commandBar = (page: Page) => page.getByRole('combobox', { name: 'Command' })

/** Types a command and presses Enter (or Shift+Enter for a new panel). */
export async function run(page: Page, command: string, opts: { newPanel?: boolean } = {}) {
  const input = commandBar(page)
  await input.fill(command)
  await input.press(opts.newPanel ? 'Shift+Enter' : 'Enter')
}
