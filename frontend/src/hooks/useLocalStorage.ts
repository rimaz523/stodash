import { useEffect, useState } from 'react'

/** useState that survives reloads. Falls back to `initial` if stored JSON is missing or unreadable. */
export function useLocalStorage<T>(key: string, initial: T, validate?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return initial
      const parsed: unknown = JSON.parse(raw)
      return validate && !validate(parsed) ? initial : (parsed as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or disabled: keep working in memory */
    }
  }, [key, value])

  return [value, setValue] as const
}
