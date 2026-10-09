// In Docker, Nginx proxies /api to the Express container; in `vite dev`, vite.config.js proxies it to :5000.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() })
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
  return response.json()
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}`)
  return data
}

function authHeaders() {
  const token = localStorage.getItem('campushub:token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}
