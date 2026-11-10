const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// The token lives in memory as well as localStorage. Reading it straight from localStorage
// is not enough: `usePersistentState` only persists in an effect, and React flushes child
// effects before parent effects, so a request fired by a child in the same commit as
// `login()` (e.g. event chat rooms, profile tickets) would still see the old token.
let authToken = readStoredToken()

export function setAuthToken(token) {
  authToken = token ?? ''
  try {
    if (authToken) localStorage.setItem('campushub:token', JSON.stringify(authToken))
    else localStorage.removeItem('campushub:token')
  } catch {
    // Storage can be unavailable (private mode); the in-memory token still works.
  }
}

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() })
  if (!response.ok) throw await requestError(response)
  return response.json()
}

export async function apiPost(path, body) {
  return apiRequest(path, 'POST', body)
}

export async function apiPut(path, body) {
  return apiRequest(path, 'PUT', body)
}

export async function apiDelete(path) {
  return apiRequest(path, 'DELETE')
}

async function apiRequest(path, method, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: body === undefined ? authHeaders() : { ...authHeaders(), 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`)
  }
  return data
}

async function requestError(response) {
  const data = await response.json().catch(() => ({}))
  const error = new Error(data.error || `Request failed with status ${response.status}`)
  error.status = response.status
  return error
}

function authHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {}
}

function readStoredToken() {
  try {
    const storedToken = localStorage.getItem('campushub:token')
    if (!storedToken) return ''
    try {
      return JSON.parse(storedToken) || ''
    } catch {
      // Support tokens written by older builds as plain strings.
      return storedToken
    }
  } catch {
    return ''
  }
}
