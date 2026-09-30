import { useEffect, useState } from 'react'

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : JSON.parse(stored)
  } catch {
    return fallback
  }
}

// Works like useState, but the value survives a page refresh by living in localStorage.
// When `key` changes (e.g. a different user logs in) the state reloads from the new key.
export function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => readStorage(key, initialValue))
  const [currentKey, setCurrentKey] = useState(key)

  if (key !== currentKey) {
    setCurrentKey(key)
    setState(readStorage(key, initialValue))
  }

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // Storage can be unavailable (private mode); the app still works in memory.
    }
  }, [key, state])

  return [state, setState]
}
