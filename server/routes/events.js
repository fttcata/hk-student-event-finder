import { Router } from 'express'
import { pool } from '../config/db.js'

const router = Router()

// mysql2 returns DECIMAL and SUM() as strings; nullable columns stay null.
function toNumber(value) {
  return value == null ? null : Number(value)
}

const EVENT_TYPES = ['standard', 'fundraiser']
const AVAILABILITY_FILTERS = ['available', 'sold_out', 'all']
const PRICE_FILTERS = ['free', 'paid']
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50

function parsePositiveInt(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

// Escape LIKE wildcards so a search for "100%" only matches a literal percent sign.
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

// Shared WHERE builder for the list query and the total-count query.
function buildEventFilters(query) {
  const conditions = [`e.status = 'published'`]
  const params = []

  const search = typeof query.search === 'string' ? query.search.trim() : ''
  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(`(e.title LIKE ? ESCAPE '\\\\'
      OR e.description LIKE ? ESCAPE '\\\\'
      OR e.location LIKE ? ESCAPE '\\\\')`)
    params.push(pattern, pattern, pattern)
  }

  if (query.category_id !== undefined) {
    const categoryId = parsePositiveInt(query.category_id, null)
    if (categoryId === null || categoryId < 1) {
      return { error: 'category_id must be a positive integer' }
    }
    conditions.push('e.category_id = ?')
    params.push(categoryId)
  }

  if (query.event_type !== undefined) {
    if (!EVENT_TYPES.includes(query.event_type)) {
      return { error: "event_type must be 'standard' or 'fundraiser'" }
    }
    conditions.push('e.event_type = ?')
    params.push(query.event_type)
  }

  // Anson's catalog tabs need free/paid filtering on top of event_type.
  if (query.price !== undefined) {
    if (!PRICE_FILTERS.includes(query.price)) {
      return { error: "price must be 'free' or 'paid'" }
    }
    conditions.push(query.price === 'free' ? 'e.price = 0' : 'e.price > 0')
  }

  const availability = query.availability ?? 'all'
  if (!AVAILABILITY_FILTERS.includes(availability)) {
    return { error: "availability must be 'available', 'sold_out' or 'all'" }
  }
  // capacity = 0 means unlimited seats, so those events are never sold out.
  const bookedSubquery = `(SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'confirmed')`
  if (availability === 'available') {
    conditions.push(`(e.capacity = 0 OR ${bookedSubquery} < e.capacity)`)
  } else if (availability === 'sold_out') {
    conditions.push(`(e.capacity > 0 AND ${bookedSubquery} >= e.capacity)`)
  }

  return { where: conditions.join(' AND '), params }
}

router.get('/', async (request, response) => {
  const page = parsePositiveInt(request.query.page, DEFAULT_PAGE)
  if (page === null || page < 1) {
    return response.status(400).json({ error: 'page must be a positive integer' })
  }
  const limit = parsePositiveInt(request.query.limit, DEFAULT_LIMIT)
  if (limit === null || limit < 1 || limit > MAX_LIMIT) {
    return response.status(400).json({ error: `limit must be an integer between 1 and ${MAX_LIMIT}` })
  }

  const filters = buildEventFilters(request.query)
  if (filters.error) {
    return response.status(400).json({ error: filters.error })
  }

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM events e WHERE ${filters.where}`,
      filters.params,
    )

    // Ticket counts and fundraiser totals are computed live (see HANDOFF.md §1) — never stored.
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.category_id, c.name AS category,
              e.event_date AS date, e.location,
              e.latitude, e.longitude, e.price, e.event_type,
              e.capacity AS total_tickets,
              (SELECT COUNT(*) FROM tickets t
                WHERE t.event_id = e.id AND t.status = 'confirmed') AS booked_tickets,
              e.goal_amount AS fundraiser_goal,
              (SELECT COALESCE(SUM(p.amount), 0) FROM pledges p WHERE p.event_id = e.id) AS raised_amount
       FROM events e
       JOIN categories c ON c.id = e.category_id
       WHERE ${filters.where}
       ORDER BY e.event_date ASC, e.id ASC
       LIMIT ? OFFSET ?`,
      [...filters.params, limit, (page - 1) * limit],
    )

    const events = rows.map((row) => {
      const capacity = Number(row.total_tickets)
      const booked = Number(row.booked_tickets)
      return {
        id: row.id,
        title: row.title,
        category_id: row.category_id,
        category: row.category,
        date: row.date,
        location: row.location,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        price: Number(row.price),
        event_type: row.event_type,
        // capacity/booked keep the existing client contract working.
        capacity,
        booked,
        total_tickets: capacity,
        booked_tickets: booked,
        available_tickets: capacity > 0 ? Math.max(capacity - booked, 0) : null,
        fundraiser_goal: toNumber(row.fundraiser_goal),
        raised_amount: Number(row.raised_amount),
      }
    })

    response.json({ events, page, limit, total: Number(total) })
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
