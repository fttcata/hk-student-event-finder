import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { pool } from '../config/db.js'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to server/.env (see .env.example).')
}

const jwtSecret = process.env.JWT_SECRET

// Verifies "Authorization: Bearer <token>" and attaches the student to req.user.
// The user is re-read from the DB so a deleted account or a newly verified email takes effect immediately.
export async function requireAuth(request, response, next) {
  const [scheme, token] = (request.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ error: 'Authentication required' })
  }

  let payload
  try {
    payload = jwt.verify(token, jwtSecret)
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
    return next()
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Unable to authenticate' })
  }
}
