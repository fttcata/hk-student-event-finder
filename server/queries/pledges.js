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

// The user's pledges with the fundraiser they went to, newest first.
export async function listPledgeRowsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.amount, p.reference_code, p.created_at,
            e.id AS event_id, e.title, e.event_date, e.status AS event_status
     FROM pledges p
     JOIN events e ON e.id = p.event_id
     WHERE p.user_id = ?
     ORDER BY p.created_at DESC, p.id DESC`,
    [userId],
  )
  return rows
}
