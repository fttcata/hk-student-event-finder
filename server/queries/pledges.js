import { pool } from '../config/db.js'

// Returns the stored pledge's id and created_at.
export async function insertPledge({ eventId, userId, amount, referenceCode }) {
  const [result] = await pool.query(
    'INSERT INTO pledges (event_id, user_id, amount, reference_code) VALUES (?, ?, ?, ?)',
    [eventId, userId, amount, referenceCode],
  )
  const [[row]] = await pool.query('SELECT created_at FROM pledges WHERE id = ?', [result.insertId])
  return { id: result.insertId, created_at: row.created_at }
}
