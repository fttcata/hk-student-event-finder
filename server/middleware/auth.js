import jwt from 'jsonwebtoken'
import 'dotenv/config'

const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret) {
  console.warn('JWT_SECRET is not configured; protected requests will be rejected.')
}

export function requireAuth(request, response, next) {
  const header = request.headers.authorization || ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token || !jwtSecret) {
    return response.status(401).json({ error: 'Authentication required' })
  }

  try {
    request.user = jwt.verify(token, jwtSecret)
    return next()
  } catch {
    return response.status(401).json({ error: 'Invalid or expired token' })
  }
}
