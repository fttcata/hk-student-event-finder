import { verifyToken } from '../config/jwt.js'
import { findUserById } from '../queries/users.js'
import { serializeUser } from '../utils/users.js'

// Resolves a JWT to { user } or { error }. The user is re-read from the DB so a deleted account
// or a newly verified email takes effect immediately.
export async function authenticateToken(token) {
  if (!token) return { error: 'Authentication required' }

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    return { error: 'Invalid or expired token' }
  }

  const row = await findUserById(payload.sub)
  if (!row) return { error: 'User no longer exists' }
  return { user: serializeUser(row) }
}

// Resolves "Authorization: Bearer <token>" to { user } or { error }.
async function authenticate(request) {
  const [scheme, token] = (request.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) return { error: 'Authentication required' }
  return authenticateToken(token)
}

export async function requireAuth(request, response, next) {
  const { user, error } = await authenticate(request)
  if (error) return response.status(401).json({ error })
  request.user = user
  return next()
}

export async function requireAdmin(request, response, next) {
  const { user, error } = await authenticate(request)
  if (error) return response.status(401).json({ error })
  if (user.role !== 'admin') return response.status(403).json({ error: 'Administrator access required' })
  request.user = user
  return next()
}

// For public routes that reveal more to signed-in users: sets req.user when a valid token
// is sent, otherwise req.user = null. A stale token never blocks a public page.
export async function optionalAuth(request, _response, next) {
  const { user } = await authenticate(request)
  request.user = user ?? null
  return next()
}
