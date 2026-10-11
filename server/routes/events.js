import { Router } from 'express'
import { pool } from '../config/db.js'

const router = Router()

// mysql2 returns DECIMAL and SUM() as strings; nullable columns stay null.
function toNumber(value) {
  return value == null ? null : Number(value)
}

router.get('/', async (_request, response) => {
  try {
    const [events] = await pool.query(
      `SELECT e.id, e.title, c.name AS category, e.event_date AS date, e.location
       FROM events e
       JOIN categories c ON c.id = e.category_id
       WHERE e.status = 'published'
       ORDER BY e.event_date ASC`,
    )
    response.json({ events })
  } catch (error) {
    console.error(error)
    response.status(500).json({ error: 'Unable to load events' })
  }
})

router.get('/:id', async (request, response) => {
  const eventId = Number(request.params.id)
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return response.status(404).json({ error: 'Event not found' })
  }

  try {
    // Ticket counts and fundraiser totals are computed live (see HANDOFF.md §1) — never stored.
    const [[row]] = await pool.query(
      `SELECT e.id, e.title, e.description, e.category_id, c.name AS category,
              e.event_type, e.status, e.image_url,
              DATE_FORMAT(e.event_date, '%Y-%m-%d') AS date,
              DATE_FORMAT(e.registration_deadline, '%Y-%m-%dT%H:%i:%s') AS deadline,
              e.location, e.address, e.latitude, e.longitude,
              e.capacity, e.price, e.goal_amount, e.created_at,
              u.id AS organizer_id, u.name AS organizer_name, u.email AS organizer_email,
              u.role AS organizer_role, u.university AS organizer_university,
              u.is_verified AS organizer_is_verified,
              (SELECT COUNT(*) FROM tickets t
                WHERE t.event_id = e.id AND t.status = 'confirmed') AS booked,
              (SELECT COALESCE(SUM(p.amount), 0) FROM pledges p WHERE p.event_id = e.id) AS raised,
              (SELECT COUNT(*) FROM pledges p WHERE p.event_id = e.id) AS pledge_count,
              (SELECT COUNT(DISTINCT p.user_id) FROM pledges p WHERE p.event_id = e.id) AS donor_count
       FROM events e
       JOIN categories c ON c.id = e.category_id
       JOIN users u ON u.id = e.organizer_id
       WHERE e.id = ? AND e.status <> 'draft'
       LIMIT 1`,
      [eventId],
    )

    if (!row) {
      return response.status(404).json({ error: 'Event not found' })
    }

    const booked = Number(row.booked)
    // capacity = 0 means unlimited seats.
    const remaining = row.capacity > 0 ? Math.max(row.capacity - booked, 0) : null
    const goal = toNumber(row.goal_amount)
    const raised = Number(row.raised)

    const event = {
      id: row.id,
      title: row.title,
      description: row.description,
      category_id: row.category_id,
      category: row.category,
      event_type: row.event_type,
      status: row.status,
      image_url: row.image_url,
      date: row.date,
      deadline: row.deadline,
      location: row.location,
      address: row.address,
      coordinates:
        row.latitude != null && row.longitude != null
          ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
          : null,
      price: Number(row.price),
      is_free: Number(row.price) === 0,
      tickets: {
        capacity: row.capacity,
        booked,
        remaining,
        sold_out: remaining === 0,
      },
      fundraiser:
        row.event_type === 'fundraiser'
          ? {
              goal,
              raised,
              pledge_count: Number(row.pledge_count),
              donor_count: Number(row.donor_count),
              progress_percent: goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0,
            }
          : null,
      organizer: {
        id: row.organizer_id,
        name: row.organizer_name,
        email: row.organizer_email,
        role: row.organizer_role,
        university: row.organizer_university,
        is_verified: Boolean(row.organizer_is_verified),
      },
      created_at: row.created_at,
    }

    return response.status(200).json({ event })
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Unable to load event' })
  }
})

export default router
