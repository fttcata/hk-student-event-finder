import { createContext, useContext, useEffect, useState } from 'react'
import { usePersistentState } from '../hooks/usePersistentState.js'
import { apiGet } from '../api/client.js'
import { loginUser, registerUser, verifyUser } from '../api/auth.js'
import { validatePassword, validateStudentEmail } from '../utils/validation.js'

const AuthContext = createContext(null)

// Holds "who is logged in" for the whole app. Any component can call useAuth() to read it.
export function AuthProvider({ children }) {
  const [user, setUser] = usePersistentState('campushub:user', null)
  const [token, setToken] = usePersistentState('campushub:token', '')
  const [authLoading, setAuthLoading] = useState(Boolean(token))

  useEffect(() => {
    function handleSessionExpired() {
      setToken('')
      setUser(null)
    }
    window.addEventListener('campushub:session-expired', handleSessionExpired)
    return () => window.removeEventListener('campushub:session-expired', handleSessionExpired)
  }, [setToken, setUser])

  useEffect(() => {
    if (!token) {
      setAuthLoading(false)
      return undefined
    }

    let active = true
    setAuthLoading(true)
    apiGet('/auth/me')
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser)
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          setToken('')
          setUser(null)
        } else {
          console.error(`Unable to refresh the signed-in user: ${error.message}`)
        }
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })

    return () => {
      active = false
    }
  }, [setToken, setUser, token])

  async function register({ name, email, password }) {
    const error = (!name.trim() && 'Name is required.') || validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    const response = await registerUser({ name: name.trim(), email: email.trim(), password })
    setToken(response.token)
    setUser(response.user)
    return response
  }

  async function login({ email, password }) {
    const error = validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    const response = await loginUser({ email: email.trim(), password })
    setToken(response.token)
    setUser(response.user)
  }

  async function verify({ email, code }) {
    await verifyUser({ email: email.trim(), code: code.trim() })
    setUser((current) => (current ? { ...current, is_verified: true } : current))
  }

  function logout() {
    setToken('')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, token, authLoading, register, login, verify, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
