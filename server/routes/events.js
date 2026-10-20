import { Router } from 'express'
import { pool } from '../config/db.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'

const router = Router()

const EVENT_TYPES = ['standard', 'fundraiser']
const AVAILABILITY_FILTERS = ['available', 'sold_out', 'all']
const PRICE_FILTERS = ['free', 'paid']
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50

// Ticket counts and fundraiser totals are computed live (see HANDOFF.md §1) — never stored.
const BOOKED_TICKETS_SQL = `(SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'confirmed')`

// One SELECT for every endpoint that returns events, so list, detail and create share a shape.
const EVENT_SELECT = `
  SELECT e.id, e.title, e.description, e.category_id, c.name AS category,
         e.event_type, e.status, e.image_url, e.event_date, e.registration_deadline,
         e.location, e.address, e.latitude, e.longitude,
         e.capacity, e.price, e.goal_amount, e.created_at,
         u.id AS organizer_id, u.name AS organizer_name, u.email AS organizer_email,
         u.role AS organizer_role, u.student_id AS organizer_student_id,
         u.university AS organizer_university, u.is_verified AS organizer_is_verified,
         ${BOOKED_TICKETS_SQL} AS booked,
         (SELECT COALESCE(SUM(p.amount), 0) FROM pledges p WHERE p.event_id = e.id) AS raised,
         (SELECT COUNT(*) FROM pledges p WHERE p.event_id = e.id) AS pledge_count,
         (SELECT COUNT(DISTINCT p.user_id) FROM pledges p WHERE p.event_id = e.id) AS donor_count
  FROM events e
  JOIN categories c ON c.id = e.category_id
  JOIN users u ON u.id = e.organizer_id`

// Organizer contact details (email, student ID) are only shown to signed-in viewers.
function serializeOrganizer(row, viewer) {
  const organizer = {
    id: row.organizer_id,
    name: row.organizer_name,
    role: row.organizer_role,
    university: row.organizer_university,
    is_verified: Boolean(row.organizer_is_verified),
  }
  if (!viewer) return organizer
  return { ...organizer, email: row.organizer_email, student_id: row.organizer_student_id }
}

function serializeEvent(row, viewer) {
  // capacity = 0 means unlimited seats.
  const remaining = row.capacity > 0 ? Math.max(row.capacity - row.booked, 0) : null
  const goal = row.goal_amount
  const coordinates =
    row.latitude != null && row.longitude != null ? { latitude: row.latitude, longitude: row.longitude } : null

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category_id: row.category_id,
    category: row.category,
    event_type: row.event_type,
    status: row.status,
    image_url: row.image_url,
    date: row.event_date,
    registration_deadline: row.registration_deadline,
    location: row.location,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    coordinates,
    price: row.price,
    is_free: row.price === 0,
    tickets: {
      capacity: row.capacity,
      booked: row.booked,
      remaining,
      sold_out: remaining === 0,
    },
    // Flat spec names for the ticket and fundraiser figures.
    total_tickets: row.capacity,
    booked_tickets: row.booked,
    available_tickets: remaining,
    fundraiser:
      row.event_type === 'fundraiser'
        ? {
            goal,
            raised: row.raised,
            pledge_count: row.pledge_count,
            donor_count: row.donor_count,
            progress_percent: goal > 0 ? Math.min(Math.round((row.raised / goal) * 100), 100) : 0,
          }
        : null,
    fundraiser_goal: goal,
    raised_amount: row.raised,
    organizer: serializeOrganizer(row, viewer),
    created_at: row.created_at,
  }
}

async function selectEventById(eventId, viewer) {
  const [[row]] = await pool.query(`${EVENT_SELECT} WHERE e.id = ? AND e.status <> 'draft' LIMIT 1`, [eventId])
  return row ? serializeEvent(row, viewer) : null
}

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
  if (availability === 'available') {
    conditions.push(`(e.capacity = 0 OR ${BOOKED_TICKETS_SQL} < e.capacity)`)
  } else if (availability === 'sold_out') {
    conditions.push(`(e.capacity > 0 AND ${BOOKED_TICKETS_SQL} >= e.capacity)`)
  }

  return { where: conditions.join(' AND '), params }
}

router.get('/', optionalAuth, async (request, response) => {
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

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM events e WHERE ${filters.where}`,
    filters.params,
  )
  const [rows] = await pool.query(
    `${EVENT_SELECT}
     WHERE ${filters.where}
     ORDER BY e.event_date ASC, e.id ASC
     LIMIT ? OFFSET ?`,
    [...filters.params, limit, (page - 1) * limit],
  )

  const events = rows.map((row) => serializeEvent(row, request.user))
  return response.json({ events, page, limit, total })
})

router.get('/:id', optionalAuth, async (request, response) => {
  // Non-numeric ids ('abc', '1e1', '0x2') can never match a row, so they are a 404 rather than a 400.
  const eventId = parsePositiveInt(request.params.id, null)
  if (eventId === null || eventId < 1) {
    return response.status(404).json({ error: 'Event not found' })
  }

  const event = await selectEventById(eventId, request.user)
  if (!event) {
    return response.status(404).json({ error: 'Event not found' })
  }

  return response.status(200).json({ event })
})

const MAX_PRICE = 10000
const MIN_FUNDRAISER_GOAL = 100
const REGISTRATION_CLOSES_BEFORE_MS = 24 * 60 * 60 * 1000

// Accepts a number or null/'' (treated as absent); returns undefined when unparseable.
function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseCoordinate(value, limit, label) {
  const parsed = parseOptionalNumber(value)
  if (parsed === undefined || (parsed !== null && Math.abs(parsed) > limit)) {
    return { error: `${label} must be a number between -${limit} and ${limit}` }
  }
  return { value: parsed }
}

// 'event' is the client's form value for a standard event.
function normalizeEventType(value) {
  if (value === 'event') return 'standard'
  return value
}

// Protected: creating an event requires a valid Bearer token (see middleware/auth.js).
// 403 gate per HANDOFF.md §1: only verified students may create events.
// Note: POST /api/auth/verify is not implemented yet, so freshly registered users
// (is_verified = 0) are blocked until the verification flow ships.
router.post('/', requireAuth, async (request, response) => {
  if (!request.user.is_verified) {
    return response.status(403).json({ error: 'Verify your student email before creating events' })
  }

  const body = request.body ?? {}
  const eventType = normalizeEventType(body.event_type ?? body.type)

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title.length < 3 || title.length > 150) {
    return response.status(400).json({ error: 'Title must be between 3 and 150 characters' })
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description.length < 20) {
    return response.status(400).json({ error: 'Description must be at least 20 characters' })
  }

  const location = typeof body.location === 'string' ? body.location.trim() : ''
  if (!location || location.length > 150) {
    return response.status(400).json({ error: 'Location is required (150 characters or fewer)' })
  }

  const address = typeof body.address === 'string' ? body.address.trim() : null
  if (address && address.length > 200) {
    return response.status(400).json({ error: 'Address must be 200 characters or fewer' })
  }

  const latitude = parseCoordinate(body.latitude, 90, 'latitude')
  if (latitude.error) return response.status(400).json({ error: latitude.error })
  const longitude = parseCoordinate(body.longitude, 180, 'longitude')
  if (longitude.error) return response.status(400).json({ error: longitude.error })

  // The full start instant is stored (UTC), so the time of day survives and chat windows can use it.
  const startsAt = new Date(body.date)
  if (typeof body.date !== 'string' || Number.isNaN(startsAt.getTime())) {
    return response.status(400).json({ error: 'date must be a valid date' })
  }
  if (startsAt <= new Date()) {
    return response.status(400).json({ error: 'The event must be in the future' })
  }

  if (!EVENT_TYPES.includes(eventType)) {
    return response.status(400).json({ error: "event_type must be 'standard' or 'fundraiser'" })
  }

  let capacity = 0
  let price = 0
  let goalAmount = null

  if (eventType === 'standard') {
    // total_tickets is the spec name for the capacity column.
    capacity = parseOptionalNumber(body.capacity ?? body.total_tickets)
    if (capacity === null || capacity === undefined || !Number.isInteger(capacity) || capacity < 1) {
      return response.status(400).json({ error: 'total_tickets must be a whole number of at least 1' })
    }
    price = parseOptionalNumber(body.price)
    if (price === undefined || (price !== null && (price < 0 || price > MAX_PRICE))) {
      return response.status(400).json({ error: `price must be between 0 and ${MAX_PRICE}` })
    }
    price = price ?? 0
  } else {
    // fundraiser_goal is the spec name for the goal_amount column (CHECK requires it).
    goalAmount = parseOptionalNumber(body.fundraiser_goal ?? body.goal_amount ?? body.goal)
    if (goalAmount === null || goalAmount === undefined || goalAmount < MIN_FUNDRAISER_GOAL) {
      return response
        .status(400)
        .json({ error: `A fundraiser needs a goal of at least HK$${MIN_FUNDRAISER_GOAL}` })
    }
  }

  // Category may be sent as an id or as the client-facing name.
  let categoryId = parseOptionalNumber(body.category_id)
  if (categoryId !== null && categoryId !== undefined) {
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return response.status(400).json({ error: 'Unknown category' })
    }
    const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [categoryId])
    if (!category) return response.status(400).json({ error: 'Unknown category' })
  } else {
    const categoryName = typeof body.category === 'string' ? body.category.trim() : ''
    if (!categoryName) {
      return response.status(400).json({ error: 'Category is required' })
    }
    const [[category]] = await pool.query('SELECT id FROM categories WHERE name = ?', [categoryName])
    // Note: the client form offers 'Arts', which is not seeded — 400 for now,
    // pending the team's decision to seed it or auto-create categories.
    if (!category) return response.status(400).json({ error: 'Unknown category' })
    categoryId = category.id
  }

  // registration_deadline is computed, never taken from the client: exactly 24h before the start.
  const deadline = new Date(startsAt.getTime() - REGISTRATION_CLOSES_BEFORE_MS)

  const [result] = await pool.query(
    `INSERT INTO events
       (title, description, category_id, organizer_id, location, address, latitude, longitude,
        event_date, registration_deadline, event_type, capacity, price, goal_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
    [
      title,
      description,
      categoryId,
      request.user.id,
      location,
      address || null,
      latitude.value,
      longitude.value,
      startsAt,
      deadline,
      eventType,
      capacity,
      price,
      goalAmount,
    ],
  )

  const event = await selectEventById(result.insertId, request.user)
  if (!event) {
    throw new Error(`Event ${result.insertId} was inserted but could not be read back`)
  }

  return response.status(201).json({ event })
})

export default router
