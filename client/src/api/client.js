const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() })
  if (!response.ok) throw await requestError(response)
  return response.json()
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`)
  }
  return data
}

async function requestError(response) {
  const data = await response.json().catch(() => ({}))
  return new Error(data.error || `Request failed with status ${response.status}`)
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
