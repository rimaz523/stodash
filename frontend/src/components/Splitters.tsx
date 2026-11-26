import type { KeyboardEvent, PointerEvent } from 'react'
import { EVEN, clampShare, type Sizes } from '../lib/workspace'

const STEP = 0.05

interface Props {
  /** How many panels are showing: 2 has a column split, 3 adds a row split on the right, 4 a full-width row split. */
  count: number
  sizes: Sizes
  onChange: (sizes: Sizes) => void
}

/**
 * Drag handles between panels. Each sits in the gap between grid tracks and sets the first column's or first row's
 * share of the workspace. Keyboard: focus a handle, then use the arrow keys; Enter (or a double-click) evens it out.
 */
export function Splitters({ count, sizes, onChange }: Props) {
  if (count < 2) return null
  return (
    <>
      <Handle axis="col" sizes={sizes} onChange={onChange} />
      {count >= 3 && <Handle axis="row" sizes={sizes} onChange={onChange} rightOnly={count === 3} />}
    </>
  )
}

function Handle({ axis, sizes, onChange, rightOnly }: {
  axis: 'col' | 'row'
  sizes: Sizes
  onChange: (sizes: Sizes) => void
  rightOnly?: boolean
}) {
  const value = sizes[axis]
  const set = (n: number) => onChange({ ...sizes, [axis]: clampShare(Math.round(n * 1000) / 1000) })

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const box = e.currentTarget.parentElement!.getBoundingClientRect()
    // The workspace has 10px padding and a 10px gap, so the tracks share (size - 30px).
    set(axis === 'col' ? (e.clientX - box.left - 15) / (box.width - 30) : (e.clientY - box.top - 15) / (box.height - 30))
  }

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const back = axis === 'col' ? 'ArrowLeft' : 'ArrowUp'
    const fwd = axis === 'col' ? 'ArrowRight' : 'ArrowDown'
    if (e.key === back) set(value - STEP)
    else if (e.key === fwd) set(value + STEP)
    else if (e.key === 'Home') set(0)
    else if (e.key === 'End') set(1)
    else if (e.key === 'Enter') set(EVEN[axis])
    else return
    e.preventDefault()
  }

  const style =
    axis === 'col'
      ? { left: `calc(10px + (100% - 30px) * ${value})` }
      : { top: `calc(10px + (100% - 30px) * ${value})`, left: rightOnly ? `calc(20px + (100% - 30px) * ${sizes.col})` : '10px' }

  return (
    <div
      className={`splitter ${axis}`}
      style={style}
      role="separator"
      tabIndex={0}
      aria-orientation={axis === 'col' ? 'vertical' : 'horizontal'}
      aria-label={axis === 'col' ? 'Resize columns' : 'Resize rows'}
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(value * 100)}
      title="Drag to resize · double-click to even out"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.focus()
      }}
      onPointerMove={move}
      onDoubleClick={() => set(EVEN[axis])}
      onKeyDown={key}
    />
  )
}
