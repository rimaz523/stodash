import type { Quote } from '../../src/api/types.ts'
import { expect, openWith, panels, test, type SeedPanel } from '../fixtures.ts'

/**
 * The README screenshots, taken from the mocked API's fake data (never real provider data, whose terms forbid
 * redistribution). Run `npm run screenshots`; the PNGs land in docs/screenshots.
 */
const OUT = '../docs/screenshots'

const SHOTS: [file: string, theme: 'dark' | 'light', panels: SeedPanel[]][] = [
  ['overview-dark', 'dark', [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'GP', symbol: 'AAPL', range: '6M' }, { kind: 'W' }, { kind: 'TOP' }]],
  ['overview-light', 'light', [{ kind: 'DES', symbol: 'AAPL' }, { kind: 'GP', symbol: 'AAPL', range: '6M' }, { kind: 'W' }, { kind: 'TOP' }]],
  ['research-dark', 'dark', [{ kind: 'FA', symbol: 'AAPL' }, { kind: 'EQS' }]],
  ['macro-light', 'light', [{ kind: 'ECO' }, { kind: 'YC' }, { kind: 'FX' }, { kind: 'CRYPTO' }]],
]

/** Made-up levels for every market strip symbol, so the strip is full (the shared mock only knows a few). */
const STRIP: [symbol: string, price: number, change: number][] = [
  ['^GSPC', 7182.78, -18.31], ['^IXIC', 23585.8, -148.2], ['^DJI', 50182.95, 165.4], ['^RUT', 2704.06, 19.1],
  ['^VIX', 26.8, -1.49], ['^TNX', 4.848, -0.055], ['EURUSD=X', 1.0963, -0.002], ['JPY=X', 159.26, 0.14],
  ['GC=F', 3593.4, 28.9], ['CL=F', 84.91, 1.23], ['BTC-USD', 60869.69, 1740],
]
const stripQuotes = (): Quote[] =>
  STRIP.map(([symbol, price, change]) => ({
    symbol, name: symbol, exchange: null, currency: 'USD', quoteType: null, price, change,
    changePercent: (change / (price - change)) * 100, previousClose: price - change, open: null, dayHigh: null,
    dayLow: null, volume: null, marketCap: null, marketState: 'CLOSED', time: '2026-11-26T21:00:00Z', source: 'mock',
  }))

for (const [file, theme, seed] of SHOTS) {
  test(file, async ({ page, mock }) => {
    mock.on(/^\/api\/quotes\?symbols=\^GSPC/, { status: 200, body: stripQuotes() })
    await page.addInitScript((t) => localStorage.setItem('stodash.theme.v1', t), theme)
    await openWith(page, seed)
    await expect(panels(page)).toHaveCount(seed.length)
    await expect(panels(page).locator('.skeleton')).toHaveCount(0)
    await page.locator('footer.statusbar').click() // move focus out of the command bar
    await page.waitForTimeout(500) // let charts finish drawing
    await page.screenshot({ path: `${OUT}/${file}.png` })
  })
}
