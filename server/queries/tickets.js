import { pool } from '../config/db.js'

export async function lockUserTicket(connection, userId, eventId) {
  const [[ticket]] = await connection.query(
    `SELECT id, user_id, ticket_code, status FROM tickets WHERE user_id = ? AND event_id = ? FOR UPDATE`,
    [userId, eventId],
  )
  return ticket ?? null
}

export async function lockTicketsForUsers(connection, eventId, userIds) {
  const [tickets] = await connection.query(
    `SELECT id, user_id, status FROM tickets WHERE event_id = ? AND user_id IN (?) FOR UPDATE`,
    [eventId, userIds],
  )
  return tickets
}

// user_id holds the ticket and attends; purchased_by paid for it.
export async function insertTicket(
  connection,
  { userId, purchasedBy, eventId, attendeeName, attendeeEmail, type, ticketCode, amountPaid },
) {
  await connection.query(
    `INSERT INTO tickets (
       user_id, purchased_by, event_id, attendee_name, attendee_email, type, status, ticket_code, amount_paid
     ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
    [userId, purchasedBy, eventId, attendeeName, attendeeEmail, type, ticketCode, amountPaid],
  )
}

// A cancelled ticket keeps its row (UNIQUE user+event), so rebooking confirms it again.
export async function reconfirmTicket(connection, ticketId, { purchasedBy, type, ticketCode, amountPaid }) {
  await connection.query(
    `UPDATE tickets SET purchased_by = ?, type = ?, status = 'confirmed',
       ticket_code = ?, amount_paid = ? WHERE id = ?`,
    [purchasedBy, type, ticketCode, amountPaid, ticketId],
  )
}

export async function cancelTicket(connection, ticketId) {
  await connection.query(`UPDATE tickets SET status = 'cancelled' WHERE id = ?`, [ticketId])
}

export async function listTicketsByCodes(ticketCodes) {
  const [rows] = await pool.query(
    `SELECT t.id, t.user_id, t.purchased_by, t.event_id, t.type, t.status, t.ticket_code,
            t.amount_paid, t.created_at, u.name AS holder_name, u.email AS holder_email
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.ticket_code IN (?)
     ORDER BY t.id ASC`,
    [ticketCodes],
  )
  return rows
}

export async function listTicketRowsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.ticket_code, t.type, t.status, t.amount_paid, t.created_at,
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
