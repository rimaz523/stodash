import { PanelFrame } from '../components/PanelFrame'
import type { PanelProps } from './types'

const COMMANDS: [string, string][] = [
  ['AAPL', 'Company description (same as AAPL DES)'],
  ['AAPL DES', 'Overview: price, trading ranges, key statistics, profile, management'],
  ['AAPL GP', 'Price chart with range, candles/line, SMA 20/50 and volume'],
  ['AAPL GP 1Y', 'Price chart opened at a range: 1D 5D 1M 3M 6M YTD 1Y 5Y MAX'],
  ['AAPL FA', 'Financials: income statement, balance sheet, cash flow and ratios'],
  ['AAPL FA Q', 'Financials opened on quarterly periods (A for annual)'],
  ['AAPL N', 'Latest company headlines; links open in a new tab'],
  ['AAPL CF', 'SEC filings (10-K, 10-Q, 8-K, proxy, insider) with links to EDGAR'],
  ['W', 'Watchlists with live prices; tabs switch lists, ＋ creates one'],
  ['W Tech', 'Open the watchlist called Tech'],
  ['W ADD NVDA', 'Add NVDA to the open list (W ADD NVDA TO Tech for another list)'],
  ['W DEL NVDA', 'Remove NVDA (also REMOVE or RM)'],
  ['W DES', 'A function after W means the ticker W (Wayfair), not watchlists'],
  ['ECO', 'US economy: CPI, core PCE, jobs, rates, GDP, mortgages, sentiment (needs a FRED key)'],
  ['ECO CPI', 'Open one indicator: CPI PCE UNEMP FEDFUNDS GDP SPREAD MORTGAGE CLAIMS SENTIMENT'],
  ['YC', 'US Treasury yield curve: now, a month ago, a year ago'],
  ['FX', 'Major currency pairs against USD and a cross-rate matrix'],
  ['CRYPTO', 'Top 25 coins by market cap, sortable'],
  ['TOP', 'Top market headlines from CNBC, MarketWatch, Yahoo, Investing.com (and Finnhub with a key)'],
  ['EQS', 'Screen the S&P 500 by sector, market cap, P/E and % change; click a row for DES'],
  ['LAYOUT', 'Saved layouts: save, load, update, rename and delete named workspaces'],
  ['LAYOUT SAVE Morning', 'Save the open panels (and their sizes) as "Morning"; saving again replaces it'],
  ['LAYOUT Morning', 'Load the layout called Morning (also LAYOUT LOAD Morning)'],
  ['LAYOUT DEL Morning', 'Delete a saved layout'],
  ['MSFT US EQUITY GP', 'Bloomberg-style words like US and EQUITY are ignored'],
  ['HELP', 'This panel'],
  ['CLEAR', 'Close every panel'],
]

const SYMBOLS: [string, string][] = [
  ['^GSPC  ^IXIC  ^DJI', 'Indexes start with ^'],
  ['EURUSD=X  JPY=X', 'Currencies end with =X'],
  ['BTC-USD  ETH-USD', 'Crypto pairs'],
  ['GC=F  CL=F', 'Futures end with =F (gold, crude)'],
  ['RY.TO  VOD.L  7203.T', 'Non-US listings use an exchange suffix'],
]

const KEYS: [string, string][] = [
  ['/  or  Ctrl K', 'Jump to the command bar (or just start typing)'],
  ['Enter', 'Run in the active panel'],
  ['Shift Enter', 'Run in a new panel (up to 4)'],
  ['↑ ↓', 'Pick a suggestion, or step through history when the list is closed'],
  ['Tab', 'Complete the highlighted suggestion'],
  ['Esc', 'Close suggestions, then leave the command bar'],
  ['Alt 1–4', 'Make panel 1–4 active'],
  ['Alt ,  Alt .', 'Previous / next panel'],
  ['Alt M', 'Maximize the active panel, or restore it (or double-click its title bar)'],
  ['Alt X', 'Close the active panel'],
  ['Alt [  Alt ]', 'Move the active panel earlier / later in the layout'],
  ['Alt L', 'Open saved layouts'],
  ['Alt Shift 1–9', 'Load saved layout 1–9 (in LAYOUT order)'],
  ['?', 'Open this help'],
  ['Drag a gap', 'Resize panels; arrow keys on a focused divider, Enter or double-click evens it'],
]

export function HelpPanel({ onRun, ...frame }: PanelProps & { onRun: (cmd: string) => void }) {
  return (
    <PanelFrame fn="HELP" title="Commands & shortcuts" {...frame}>
      <div className="help">
        <h3 className="section-title">Commands</h3>
        <table>
          <tbody>
            {COMMANDS.map(([cmd, desc]) => (
              <tr key={cmd}>
                <td>
                  <button className="link-btn" onClick={() => onRun(cmd)} title="Run this command">
                    <code>{cmd}</code>
                  </button>
                </td>
                <td className="muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-title">Ticker formats</h3>
        <table>
          <tbody>
            {SYMBOLS.map(([sym, desc]) => (
              <tr key={sym}>
                <td><code>{sym}</code></td>
                <td className="muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-title">Keyboard</h3>
        <table>
          <tbody>
            {KEYS.map(([k, desc]) => (
              <tr key={k}>
                <td><span className="kbd">{k}</span></td>
                <td className="muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p>
          Data from Yahoo Finance (usually delayed about 15 minutes), SEC EDGAR, FRED, the US Treasury, CoinGecko,
          the ECB, news RSS feeds and the open S&amp;P 500 constituent list, plus Finnhub (live watchlist prices and news) when a key is set.
          For personal research only.
        </p>
      </div>
    </PanelFrame>
  )
}
