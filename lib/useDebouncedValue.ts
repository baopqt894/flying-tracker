// Simple debounce hook for fallback if use-debounce is not available
import { useRef, useEffect, useState } from "react"

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const handler = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (handler.current) clearTimeout(handler.current)
    handler.current = setTimeout(() => setDebounced(value), delay) as unknown as NodeJS.Timeout
    return () => {
      if (handler.current) clearTimeout(handler.current as NodeJS.Timeout)
    }
  }, [value, delay])

  return debounced
}
