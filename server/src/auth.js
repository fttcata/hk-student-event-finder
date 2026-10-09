import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { pool } from '../config/db.js'

const studentEmailPattern = /^[^\s@]+@(connect\.hku\.hk|hku\.hk|link\.cuhk\.edu\.hk|cuhk\.edu\.hk|connect\.polyu\.hk|polyu\.edu\.hk)$/i
const jwtSecret = process.env.JWT_SECRET

function universityFromEmail(email) {
  if (email.endsWith('@connect.hku.hk') || email.endsWith('@hku.hk')) return 'HKU'
  if (email.endsWith('@link.cuhk.edu.hk') || email.endsWith('@cuhk.edu.hk')) return 'CUHK'
  if (email.endsWith('@connect.polyu.hk') || email.endsWith('@polyu.edu.hk')) return 'PolyU'
  return null
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.student_id,
    university: user.university,
  }
}

function issueToken(user) {
  if (!jwtSecret) throw new Error('JWT_SECRET is not configured')
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, university: user.university },
    jwtSecret,
    { expiresIn: '2h' },
  )
}

export async function register(request, response) {
  const { name, email, password, studentId } = request.body
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const university = universityFromEmail(normalizedEmail)

  if (!name?.trim() || !studentEmailPattern.test(normalizedEmail) || !university || typeof password !== 'string' || password.length < 8) {
    return response.status(400).json({ error: 'Name, valid HK university email, and an 8-character password are required.' })
  }

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail])
    if (existing.length) return response.status(400).json({ error: 'An account with this email already exists.' })

    const passwordHash = await bcrypt.hash(password, 12)
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, student_id, university, is_verified)
       VALUES (?, ?, ?, 'student', ?, ?, TRUE)`,
      [name.trim(), normalizedEmail, passwordHash, studentId || null, university || null],
    )
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId])
    const user = rows[0]

    return response.status(201).json({ token: issueToken(user), user: publicUser(user) })
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Unable to register account' })
  }
}

export async function login(request, response) {
  const { email, password } = request.body
  const normalizedEmail = String(email || '').trim().toLowerCase()

  if (!normalizedEmail || typeof password !== 'string') {
    return response.status(401).json({ error: 'Invalid email or password' })
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail])
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return response.status(401).json({ error: 'Invalid email or password' })
    }

    return response.json({ token: issueToken(user), user: publicUser(user) })
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Unable to log in' })
  }
}
