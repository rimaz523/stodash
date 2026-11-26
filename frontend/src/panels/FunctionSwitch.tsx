import { FUNCTIONS, type FunctionCode } from '../lib/commands'

export function FunctionSwitch({ current, onSwitch }: { current: FunctionCode; onSwitch: (fn: FunctionCode) => void }) {
  return (
    <>
      {(Object.keys(FUNCTIONS) as FunctionCode[]).map((fn) => (
        <button
          key={fn}
          className={`chip mono${fn === current ? ' on' : ''}`}
          onClick={() => onSwitch(fn)}
          title={FUNCTIONS[fn].label}
          aria-pressed={fn === current}
        >
          {fn}
        </button>
      ))}
    </>
  )
}

export function PanelTitle({ symbol, name }: { symbol: string; name?: string | null }) {
  return (
    <>
      <span className="mono">{symbol}</span>
      {name && <span className="sub">{name}</span>}
    </>
  )
}
