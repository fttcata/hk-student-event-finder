import { pool } from '../config/db.js'

// Columns needed to build the user object returned by register, login, /me and req.user.
const USER_COLUMNS = 'id, name, email, role, student_id, university, is_verified'

// Returns the new user's id. A taken email rejects with ER_DUP_ENTRY.
export async function insertStudent({ name, email, passwordHash, studentId, university, verificationCode }) {
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, student_id, university, is_verified, verification_code)
     VALUES (?, ?, ?, 'student', ?, ?, FALSE, ?)`,
    [name, email, passwordHash, studentId, university, verificationCode],
  )
  return result.insertId
}

export async function findUserById(userId) {
  const [[row]] = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId])
  return row ?? null
}

export async function findUserWithPasswordByEmail(email) {
  const [[row]] = await pool.query(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ? LIMIT 1`, [email])
  return row ?? null
}

// Returns whether the code matched a user who was still unverified.
export async function markUserVerified(email, code) {
  const [result] = await pool.query(
    `UPDATE users SET is_verified = TRUE, verification_code = NULL, verified_at = CURRENT_TIMESTAMP
     WHERE email = ? AND verification_code = ? AND is_verified = FALSE`,
    [email, code],
  )
  return result.affectedRows === 1
}
