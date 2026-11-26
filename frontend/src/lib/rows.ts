import type { KeyboardEvent, MouseEvent } from 'react'

/**
 * Props for a table row that opens something: click or Enter opens it, Shift opens it in a new panel. The row is
 * focusable, so lists (W, FX, CRYPTO, EQS) work from the keyboard. Keys pressed on buttons inside the row are left alone.
 */
export function openRowProps(open: (newPanel: boolean) => void) {
  return {
    tabIndex: 0,
    className: 'open-row',
    onClick: (e: MouseEvent) => open(e.shiftKey),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' || e.target !== e.currentTarget) return
      e.preventDefault()
      open(e.shiftKey)
    },
  }
}
