import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'
import { JWT_SECRET, requireAuth } from '../middleware/auth.js'

const router = Router()

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10)

// Must match client/src/utils/universities.js — only these student email domains may sign up.
const UNIVERSITY_DOMAINS = {
  HKU: ['connect.hku.hk', 'hku.hk'],
  CUHK: ['link.cuhk.edu.hk', 'cuhk.edu.hk'],
  PolyU: ['connect.polyu.hk', 'polyu.edu.hk'],
}

function universityFromEmail(email) {
  const domain = email.split('@')[1]
  return Object.keys(UNIVERSITY_DOMAINS).find((code) => UNIVERSITY_DOMAINS[code].includes(domain)) ?? null
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  })
}

router.post('/register', async (request, response) => {
  const { name, email, password, student_id: studentId } = request.body ?? {}
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  if (typeof name !== 'string' || !name.trim()) {
    return response.status(400).json({ error: 'Name is required' })
  }
  if (name.trim().length > 120) {
    return response.status(400).json({ error: 'Name must be 120 characters or fewer' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return response.status(400).json({ error: 'Enter a valid email address' })
  }
  const university = universityFromEmail(normalizedEmail)
  if (!university) {
    return response.status(400).json({ error: 'Use your HKU, CUHK or PolyU student email' })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return response.status(400).json({ error: 'Password must be at least 8 characters' })
  }
  if (studentId != null && (typeof studentId !== 'string' || studentId.length > 40)) {
    return response.status(400).json({ error: 'Student ID must be text of 40 characters or fewer' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const verificationCode = 'VRF' + crypto.randomBytes(7).toString('hex').toUpperCase().slice(0, 13)

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, student_id, university, is_verified, verification_code)
       VALUES (?, ?, ?, 'student', ?, ?, FALSE, ?)`,
      [name.trim(), normalizedEmail, passwordHash, studentId?.trim() || null, university, verificationCode],
    )

    // No email service yet — log the code so it can be used with POST /api/auth/verify during development.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Verification code for ${normalizedEmail}: ${verificationCode}`)
    }

    const user = {
      id: result.insertId,
      name: name.trim(),
      email: normalizedEmail,
      role: 'student',
      student_id: studentId?.trim() || null,
      university,
      is_verified: false,
    }
    response.status(201).json({ token: signToken(user), user })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'An account with this email already exists' })
    }
    console.error(error)
    response.status(500).json({ error: 'Unable to register' })
  }
})

router.post('/login', async (request, response) => {
  const { email, password } = request.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return response.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const [[user]] = await pool.query(
      `SELECT id, name, email, password_hash, role, student_id, university, is_verified
       FROM users WHERE email = ?`,
      [email.trim().toLowerCase()],
    )

    const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !passwordMatches) {
      return response.status(401).json({ error: 'Invalid email or password' })
    }

    const { password_hash: _omit, ...student } = user
    response.status(200).json({ token: signToken(user), user: { ...student, is_verified: Boolean(student.is_verified) } })
  } catch (error) {
    console.error(error)
    response.status(500).json({ error: 'Unable to log in' })
  }
})

// Returns the logged-in student — lets the client restore a session from a stored token.
router.get('/me', requireAuth, (request, response) => {
  response.status(200).json({ user: request.user })
})

export default router
