import { createContext, useContext } from 'react'
import { usePersistentState } from '../hooks/usePersistentState.js'
import { getUniversityFromEmail } from '../utils/universities.js'
import { validatePassword, validateStudentEmail } from '../utils/validation.js'

const AuthContext = createContext(null)

// Stand-in for network latency until POST /api/auth/* exists on the backend.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function buildUser(name, email) {
  return { name, email, university: getUniversityFromEmail(email).code }
}

// Holds "who is logged in" for the whole app. Any component can call useAuth() to read it.
export function AuthProvider({ children }) {
  const [user, setUser] = usePersistentState('campushub:user', null)
  // email → display name for accounts registered in this browser (no passwords are stored).
  const [accounts, setAccounts] = usePersistentState('campushub:accounts', {})

  async function register({ name, email, password }) {
    const error = (!name.trim() && 'Name is required.') || validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    await wait(400) // TODO: replace with POST /api/auth/register
    const normalizedEmail = email.trim().toLowerCase()
    if (accounts[normalizedEmail]) throw new Error('An account with this email already exists. Log in instead.')

    setAccounts((current) => ({ ...current, [normalizedEmail]: name.trim() }))
    setUser(buildUser(name.trim(), normalizedEmail))
  }

  async function login({ email, password }) {
    const error = validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    await wait(400) // TODO: replace with POST /api/auth/login
    const normalizedEmail = email.trim().toLowerCase()
    if (!accounts[normalizedEmail]) throw new Error('No account found for this email. Sign up first.')

    setUser(buildUser(accounts[normalizedEmail], normalizedEmail))
  }

  function logout() {
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, register, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
