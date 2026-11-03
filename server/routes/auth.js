import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { Router } from 'express'
import { signToken } from '../config/jwt.js'
import { sendVerificationEmail } from '../config/email.js'
import { requireAuth } from '../middleware/auth.js'
import { findUserWithPasswordByEmail, insertStudent, markUserVerified } from '../queries/users.js'
import { logEmail } from '../queries/emailLog.js'
import { serializeUser } from '../utils/users.js'

// Must match client/src/utils/universities.js — only these student email domains may sign up.
const UNIVERSITY_DOMAINS = {
  HKU: ['connect.hku.hk', 'hku.hk'],
  CUHK: ['link.cuhk.edu.hk', 'cuhk.edu.hk'],
  PolyU: ['connect.polyu.hk', 'polyu.edu.hk'],
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// bcrypt only hashes the first 72 bytes, so longer passwords are refused rather than truncated.
const MAX_PASSWORD_BYTES = 72

function universityFromEmail(email) {
  const domain = email.split('@')[1]
  return Object.keys(UNIVERSITY_DOMAINS).find((code) => UNIVERSITY_DOMAINS[code].includes(domain)) ?? null
}

const router = Router()

router.post('/register', async (request, response) => {
  const { name, email, password, student_id: studentId } = request.body ?? {}
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  if (typeof name !== 'string' || !name.trim()) {
    return response.status(400).json({ error: 'Name is required' })
  }
  if (name.trim().length > 120) {
    return response.status(400).json({ error: 'Name must be 120 characters or fewer' })
  }
  // users.email is VARCHAR(160).
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 160) {
    return response.status(400).json({ error: 'Enter a valid email address' })
  }
  const university = universityFromEmail(normalizedEmail)
  if (!university) {
    return response.status(400).json({ error: 'Use your HKU, CUHK or PolyU student email' })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return response.status(400).json({ error: 'Password must be at least 8 characters' })
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return response.status(400).json({ error: `Password must be ${MAX_PASSWORD_BYTES} bytes or fewer` })
  }
  if (studentId != null && (typeof studentId !== 'string' || studentId.length > 40)) {
    return response.status(400).json({ error: 'Student ID must be text of 40 characters or fewer' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const verificationCode = 'VRF' + crypto.randomBytes(7).toString('hex').toUpperCase().slice(0, 13)

    const userId = await insertStudent({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      studentId: studentId?.trim() || null,
      university,
      verificationCode,
    })

    const user = serializeUser({
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      role: 'student',
      student_id: studentId?.trim() || null,
      university,
      is_verified: false,
    })

    let verificationEmailSent = false
    try {
      await sendVerificationEmail({ name: name.trim(), email: normalizedEmail, code: verificationCode })
      verificationEmailSent = true
    } catch (error) {
      console.error(`Verification email for ${normalizedEmail} was not sent: ${error.message}`)
    }
    await logEmail(userId, 'verification', verificationCode, verificationEmailSent)

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Verification code for ${normalizedEmail}: ${verificationCode}`)
    }

    return response.status(201).json({ token: signToken(user), user, verification_email_sent: verificationEmailSent })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'An account with this email already exists' })
    }
    throw error
  }
})

router.post('/login', async (request, response) => {
  const { email, password } = request.body ?? {}
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  // Over 72 bytes can never be a real password (register rejects it), and bcrypt would compare
  // only the first 72 bytes, so "<password>anything" would otherwise log in.
  if (!normalizedEmail || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return response.status(401).json({ error: 'Invalid email or password' })
  }

  const row = await findUserWithPasswordByEmail(normalizedEmail)
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return response.status(401).json({ error: 'Invalid email or password' })
  }

  const user = serializeUser(row)
  return response.json({ token: signToken(user), user })
})

router.post('/verify', async (request, response) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const code = typeof request.body?.code === 'string' ? request.body.code.trim().toUpperCase() : ''
  if (!email || !code) return response.status(400).json({ error: 'Email and verification code are required' })

  const verified = await markUserVerified(email, code)
  if (!verified) return response.status(400).json({ error: 'Invalid or expired verification code' })
  return response.json({ verified: true })
})

router.get('/me', requireAuth, (request, response) => {
  response.json({ user: request.user })
})

export default router
