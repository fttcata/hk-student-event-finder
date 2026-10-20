import { pool } from '../config/db.js'
import { verifyToken } from '../config/jwt.js'
import { USER_COLUMNS, serializeUser } from '../utils/users.js'

// Resolves "Authorization: Bearer <token>" to { user } or { error }.
// The user is re-read from the DB so a deleted account or a newly verified email takes effect immediately.
async function authenticate(request) {
  const [scheme, token] = (request.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) return { error: 'Authentication required' }

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    return { error: 'Invalid or expired token' }
  }

  const [[row]] = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [payload.sub])
  if (!row) return { error: 'User no longer exists' }
  return { user: serializeUser(row) }
}

export async function requireAuth(request, response, next) {
  const { user, error } = await authenticate(request)
  if (error) return response.status(401).json({ error })
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
