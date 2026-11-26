import { PanelFrame } from '../components/PanelFrame'
import type { PanelProps } from './types'

const COMMANDS: [string, string][] = [
  ['AAPL', 'Company description (same as AAPL DES)'],
  ['AAPL DES', 'Overview: price, trading ranges, key statistics, profile, management'],
  ['AAPL GP', 'Price chart with range, candles/line, SMA 20/50 and volume'],
  ['AAPL GP 1Y', 'Price chart opened at a range: 1D 5D 1M 3M 6M YTD 1Y 5Y MAX'],
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

        <p>Data from Yahoo Finance, usually delayed about 15 minutes. For personal research only.</p>
      </div>
    </PanelFrame>
  )
}
