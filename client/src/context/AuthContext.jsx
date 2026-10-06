import { createContext, useContext } from 'react'
import { usePersistentState } from '../hooks/usePersistentState.js'
import { getUniversityFromEmail } from '../utils/universities.js'
import { validatePassword, validateStudentEmail } from '../utils/validation.js'

const AuthContext = createContext(null)

// Stand-in for network latency until POST /api/auth/* exists on the backend.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function buildUser(name, email) {
  return { name, email, university: getUniversityFromEmail(email).code, role: 'Student' }
}

function decodeStudentInfo(token) {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return null

    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes))
    const email = claims.email ?? claims.student_email
    if (typeof email !== 'string' || !email) return null

    return {
      id: claims.id ?? claims.sub ?? null,
      name: claims.name ?? claims.full_name ?? email.split('@')[0],
      email,
      university: claims.university ?? getUniversityFromEmail(email).code,
      role: claims.role ?? 'Student',
    }
  } catch {
    return null
  }
}

// Holds "who is logged in" for the whole app. Any component can call useAuth() to read it.
export function AuthProvider({ children }) {
  const [savedUser, setUser] = usePersistentState('campushub:user', null)
  const [token, setToken] = usePersistentState('campushub:token', null)
  // email → display name for accounts registered in this browser (no passwords are stored).
  const [accounts, setAccounts] = usePersistentState('campushub:accounts', {})
  const decodedStudent = token ? decodeStudentInfo(token) : null
  const user = decodedStudent ?? savedUser

  function setSession(accessToken, studentInfo) {
    if (typeof accessToken !== 'string' || !accessToken.trim()) {
      throw new Error('A valid access token is required.')
    }
    const student = decodeStudentInfo(accessToken) ?? studentInfo
    if (!student?.email) {
      throw new Error('The access token does not contain student information.')
    }
    setToken(accessToken)
    setUser(student)
  }

  async function register({ name, email, password }) {
    const error = (!name.trim() && 'Name is required.') || validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    await wait(400) // TODO: replace with POST /api/auth/register
    const normalizedEmail = email.trim().toLowerCase()
    if (accounts[normalizedEmail]) throw new Error('An account with this email already exists. Log in instead.')

    setAccounts((current) => ({ ...current, [normalizedEmail]: name.trim() }))
    setToken(null)
    setUser(buildUser(name.trim(), normalizedEmail))
  }

  async function login({ email, password }) {
    const error = validateStudentEmail(email) || validatePassword(password)
    if (error) throw new Error(error)

    await wait(400) // TODO: replace with POST /api/auth/login
    const normalizedEmail = email.trim().toLowerCase()
    if (!accounts[normalizedEmail]) throw new Error('No account found for this email. Sign up first.')

    setToken(null)
    setUser(buildUser(accounts[normalizedEmail], normalizedEmail))
  }

  function logout() {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, student: user, token, setSession, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
