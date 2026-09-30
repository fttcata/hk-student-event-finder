// In Docker, Nginx proxies /api to the Express container; in `vite dev`, vite.config.js proxies it to :5000.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
  return response.json()
}
