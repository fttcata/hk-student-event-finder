import { pool } from '../config/db.js'

export async function logEmail(userId, type, referenceCode, sent) {
  await pool.query(`INSERT INTO email_log (user_id, type, reference_code, status) VALUES (?, ?, ?, ?)`, [
    userId,
    type,
    referenceCode,
    sent ? 'sent' : 'failed',
  ])
}
