import { Router } from 'express'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { listEventRowsByOrganizer } from '../queries/events.js'
import { listPledgeRowsForUser } from '../queries/pledges.js'
import { listTicketRowsForUser } from '../queries/tickets.js'
import { deleteUserForAdmin, listUsersForAdmin } from '../queries/users.js'
import { serializeEvent } from './events.js'

const router = Router()

router.get('/admin', requireAdmin, async (_request, response) => {
  const users = await listUsersForAdmin()
  return response.status(200).json({ users })
})

router.delete('/admin/:id', requireAdmin, async (request, response) => {
  const userId = Number(request.params.id)
  if (!Number.isInteger(userId) || userId < 1) {
    return response.status(400).json({ error: 'User id must be a positive integer' })
  }

  const result = await deleteUserForAdmin(userId, request.user.id)
  if (result.status === 'not_found') return response.status(404).json({ error: 'User not found' })
  if (result.status === 'self') return response.status(409).json({ error: 'You cannot delete your own administrator account' })
  if (result.status === 'admin') return response.status(409).json({ error: 'Administrator accounts cannot be deleted here' })
  if (result.status === 'owns_events') {
    return response.status(409).json({ error: 'This account owns events. Cancel or reassign its events before deleting the account.' })
  }
  if (result.status === 'bought_for_others') {
    return response.status(409).json({ error: 'This account purchased tickets for other attendees and cannot be deleted yet.' })
  }
  return response.status(204).send()
})

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

// The signed-in student's pledges, newest first. Pledges are receipts, so ones made to a
// fundraiser that was later cancelled are still listed.
router.get('/me/pledges', requireAuth, async (request, response) => {
  const rows = await listPledgeRowsForUser(request.user.id)

  const pledges = rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    reference_code: row.reference_code,
    created_at: row.created_at,
    event: {
      id: row.event_id,
      title: row.title,
      date: row.event_date,
      status: row.event_status,
    },
  }))

  return response.status(200).json({ pledges })
})

// Every published listing the signed-in user organises, unpaginated, in the GET /api/events shape.
router.get('/me/events', requireAuth, async (request, response) => {
  const rows = await listEventRowsByOrganizer(request.user.id)
  const events = rows.map((row) => serializeEvent(row, request.user))
  return response.status(200).json({ events })
})

export default router
