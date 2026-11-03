import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { listTicketRowsForUser } from '../queries/tickets.js'

const router = Router()

// The signed-in student's tickets, soonest event first. Cancelled tickets are included
// (they are receipts, HANDOFF.md §1) and carry status 'cancelled'.
router.get('/me/tickets', requireAuth, async (request, response) => {
  const rows = await listTicketRowsForUser(request.user.id)

  const tickets = rows.map((row) => ({
    id: row.id,
    ticket_code: row.ticket_code,
    reference_code: row.ticket_code,
    type: row.type,
    status: row.status,
    amount_paid: row.amount_paid,
    attendee_name: row.attendee_name,
    attendee_email: row.attendee_email,
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
