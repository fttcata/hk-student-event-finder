import { pool } from '../config/db.js'

export async function lockUserTicket(connection, userId, eventId) {
  const [[ticket]] = await connection.query(
    `SELECT id, status FROM tickets WHERE user_id = ? AND event_id = ? FOR UPDATE`,
    [userId, eventId],
  )
  return ticket ?? null
}

// The organizer's own ticket does not take a seat.
export async function countBookedSeats(connection, eventId, organizerId) {
  const [[{ booked }]] = await connection.query(
    `SELECT COUNT(*) AS booked FROM tickets WHERE event_id = ? AND status = 'confirmed' AND user_id <> ?`,
    [eventId, organizerId],
  )
  return booked
}

// Returns the new ticket's id.
export async function insertTicket(connection, { userId, eventId, type, referenceCode, amountPaid }) {
  const [result] = await connection.query(
    `INSERT INTO tickets (user_id, event_id, type, status, reference_code, amount_paid)
     VALUES (?, ?, ?, 'confirmed', ?, ?)`,
    [userId, eventId, type, referenceCode, amountPaid],
  )
  return result.insertId
}

// A cancelled ticket keeps its row (UNIQUE user+event), so rebooking confirms it again.
export async function reconfirmTicket(connection, ticketId, { type, referenceCode, amountPaid }) {
  await connection.query(
    `UPDATE tickets SET type = ?, status = 'confirmed', reference_code = ?, amount_paid = ? WHERE id = ?`,
    [type, referenceCode, amountPaid, ticketId],
  )
}

export async function findTicketById(ticketId) {
  const [[ticket]] = await pool.query(
    `SELECT id, event_id, type, status, reference_code, amount_paid, created_at
     FROM tickets WHERE id = ?`,
    [ticketId],
  )
  return ticket ?? null
}

export async function listTicketRowsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.reference_code, t.type, t.status, t.amount_paid, t.created_at,
            e.id AS event_id, e.title, e.event_date, e.location, e.address, e.image_url,
            e.event_type, e.status AS event_status, e.price, c.name AS category
     FROM tickets t
     JOIN events e ON e.id = t.event_id
     JOIN categories c ON c.id = e.category_id
     WHERE t.user_id = ?
     ORDER BY e.event_date ASC, t.id ASC`,
    [userId],
  )
  return rows
}
