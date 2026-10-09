import { createContext, useContext } from 'react'
import { usePersistentState } from '../hooks/usePersistentState.js'
import { loginUser, registerUser } from '../api/auth.js'
import { validatePassword, validateStudentEmail } from '../utils/validation.js'

const AuthContext = createContext(null)

// Holds "who is logged in" for the whole app. Any component can call useAuth() to read it.
export function AuthProvider({ children }) {
  const [user, setUser] = usePersistentState('campushub:user', null)
  const [token, setToken] = usePersistentState('campushub:token', '')

  async function register({ name, email, password }) {
    const error = (!name.trim() && 'Name is required.') || validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    const response = await registerUser({ name: name.trim(), email: email.trim(), password })
    setToken(response.token)
    setUser(response.user)
  }

  async function login({ email, password }) {
    const error = validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    const response = await loginUser({ email: email.trim(), password })
    setToken(response.token)
    setUser(response.user)
  }

  function logout() {
    setToken('')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, token, register, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
