const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const API_TIMEOUT_MS = 10000

export async function apiGet(path) {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, { headers: authHeaders() })
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
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
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

function fetchWithTimeout(url, options) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout))
}

async function requestError(response) {
  const data = await response.json().catch(() => ({}))
  const error = new Error(data.error || `Request failed with status ${response.status}`)
  error.status = response.status
  return error
}

function authHeaders() {
  const storedToken = localStorage.getItem('campushub:token')
  let token = storedToken
  try {
    token = storedToken ? JSON.parse(storedToken) : ''
  } catch {
    // Support tokens written by older builds as plain strings.
    token = storedToken
  }
  return token ? { Authorization: `Bearer ${token}` } : {}
}
