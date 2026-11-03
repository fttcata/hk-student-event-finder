import { Router } from 'express'
import { pool } from '../config/db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// The signed-in student's tickets, soonest event first. Cancelled tickets are included
// (they are receipts, HANDOFF.md §1) and carry status 'cancelled'.
router.get('/me/tickets', requireAuth, async (request, response) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.reference_code, t.type, t.status, t.amount_paid, t.created_at,
            e.id AS event_id, e.title, e.event_date, e.location, e.address, e.image_url,
            e.event_type, e.status AS event_status, e.price, c.name AS category
     FROM tickets t
     JOIN events e ON e.id = t.event_id
     JOIN categories c ON c.id = e.category_id
     WHERE t.user_id = ?
     ORDER BY e.event_date ASC, t.id ASC`,
    [request.user.id],
  )

  const tickets = rows.map((row) => ({
    id: row.id,
    reference_code: row.reference_code,
    type: row.type,
    status: row.status,
    amount_paid: row.amount_paid,
    booked_at: row.created_at,
    event: {
      id: row.event_id,
      title: row.title,
      date: row.event_date,
      location: row.location,
      address: row.address,
      image_url: row.image_url,
      category: row.category,
      event_type: row.event_type,
      status: row.event_status,
      price: row.price,
    },
  }))

  return response.status(200).json({ tickets })
})

export default router
