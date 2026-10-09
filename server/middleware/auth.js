import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to server/.env (see .env.example).')
}

export const JWT_SECRET = process.env.JWT_SECRET

// Verifies "Authorization: Bearer <token>" and attaches the student to req.user.
// The user is re-read from the DB so a deleted account or a newly verified email takes effect immediately.
export async function requireAuth(request, response, next) {
  const [scheme, token] = (request.get('Authorization') || '').split(' ')
  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ error: 'Missing or malformed Authorization header' })
  }

  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    return response.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    const [[user]] = await pool.query(
      `SELECT id, name, email, role, student_id, university, is_verified
       FROM users WHERE id = ?`,
      [payload.sub],
    )
    if (!user) return response.status(401).json({ error: 'User no longer exists' })

    request.user = { ...user, is_verified: Boolean(user.is_verified) }
    next()
  } catch (error) {
    console.error(error)
    response.status(500).json({ error: 'Unable to authenticate' })
  }
}
