import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to server/.env (see .env.example).')
}

const JWT_SECRET = process.env.JWT_SECRET

// Must match client/src/utils/universities.js — only these student email domains may sign up.
const UNIVERSITY_DOMAINS = {
  HKU: ['connect.hku.hk', 'hku.hk'],
  CUHK: ['link.cuhk.edu.hk', 'cuhk.edu.hk'],
  PolyU: ['connect.polyu.hk', 'polyu.edu.hk'],
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function universityFromEmail(email) {
  const domain = email.split('@')[1]
  return Object.keys(UNIVERSITY_DOMAINS).find((code) => UNIVERSITY_DOMAINS[code].includes(domain)) ?? null
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  })
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
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
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

    const user = {
      id: result.insertId,
      name: name.trim(),
      email: normalizedEmail,
      role: 'student',
      student_id: studentId?.trim() || null,
      university,
      is_verified: false,
    }

    // The verification code stays server-side until the email service sends it.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Verification code for ${normalizedEmail}: ${verificationCode}`)
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

export default router
