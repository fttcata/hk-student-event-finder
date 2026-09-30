import { useEffect, useState } from 'react'

// Current time that re-renders the component every `intervalMs`, used by countdowns.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}
