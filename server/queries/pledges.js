import { pool } from '../config/db.js'

// Returns the stored pledge's id and created_at.
export async function insertPledge({ eventId, userId, amount, referenceCode }) {
  const [result] = await pool.query(
    'INSERT INTO pledges (event_id, user_id, amount, reference_code) VALUES (?, ?, ?, ?) RETURNING id, created_at',
    [eventId, userId, amount, referenceCode],
  )
  const [row] = result
  return { id: row.id, created_at: row.created_at }
}
