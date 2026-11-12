import { pool } from '../config/db.js'

// Columns needed to build the user object returned by register, login, /me and req.user.
const USER_COLUMNS = 'id, name, email, role, student_id, university, is_verified'

export async function listUsersForAdmin() {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, student_id, university, is_verified, created_at
     FROM users
     ORDER BY created_at DESC, id DESC`,
  )
  return rows
}

export async function deleteUserForAdmin(userId, adminId) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [[user]] = await connection.query('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [userId])
    if (!user) {
      await connection.rollback()
      return { status: 'not_found' }
    }
    if (user.id === adminId) {
      await connection.rollback()
      return { status: 'self' }
    }
    if (user.role === 'admin') {
      await connection.rollback()
      return { status: 'admin' }
    }

    const [[eventCount]] = await connection.query(
      'SELECT COUNT(*) AS count FROM events WHERE organizer_id = ?',
      [userId],
    )
    if (Number(eventCount.count) > 0) {
      await connection.rollback()
      return { status: 'owns_events' }
    }

    const [[purchasedForOthers]] = await connection.query(
      'SELECT COUNT(*) AS count FROM tickets WHERE purchased_by = ? AND user_id <> ?',
      [userId, userId],
    )
    if (Number(purchasedForOthers.count) > 0) {
      await connection.rollback()
      return { status: 'bought_for_others' }
    }

    await connection.query('DELETE FROM email_log WHERE user_id = ?', [userId])
    await connection.query('DELETE FROM chat_messages WHERE user_id = ?', [userId])
    await connection.query('DELETE FROM reviews WHERE user_id = ?', [userId])
    await connection.query('DELETE FROM bookmarks WHERE user_id = ?', [userId])
    await connection.query('DELETE FROM tickets WHERE user_id = ? AND purchased_by = ?', [userId, userId])
    await connection.query('DELETE FROM pledges WHERE user_id = ?', [userId])
    const [result] = await connection.query('DELETE FROM users WHERE id = ?', [userId])
    await connection.commit()
    return { status: result.affectedRows === 1 ? 'deleted' : 'not_found' }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

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

export async function findUsersByEmails(connection, emails) {
  const [rows] = await connection.query(`SELECT id, name, email, is_verified FROM users WHERE email IN (?)`, [emails])
  return rows
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
