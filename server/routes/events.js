import crypto from 'node:crypto'
import { Router } from 'express'
import { pool } from '../config/db.js'
import { sendBookingSummary, sendDonationReceipt, sendTicketReceipt } from '../config/email.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'

const router = Router()

const EVENT_TYPES = ['standard', 'fundraiser']
const AVAILABILITY_FILTERS = ['available', 'sold_out', 'all']
const PRICE_FILTERS = ['free', 'paid']
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50

// Booked counts and fundraiser totals are computed live; available_tickets is the stored booking
// counter that the booking/cancellation transactions maintain under the event row lock.
const BOOKED_TICKETS_SQL = `(SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'confirmed')`

// One SELECT for every endpoint that returns events, so list, detail and create share a shape.
const EVENT_SELECT = `
  SELECT e.id, e.title, e.description, e.category_id, c.name AS category,
         e.event_type, e.status, e.image_url, e.event_date, e.registration_deadline,
         e.location, e.address, e.latitude, e.longitude,
         e.capacity, e.available_tickets, e.price, e.goal_amount, e.created_at,
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
  // capacity = 0 means unlimited seats; standard events keep a stored available_tickets counter.
  const remaining = row.capacity > 0 ? row.available_tickets : null
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
    conditions.push('(e.capacity = 0 OR e.available_tickets > 0)')
  } else if (availability === 'sold_out') {
    conditions.push('(e.capacity > 0 AND e.available_tickets = 0)')
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

// Non-numeric ids ('abc', '1e1', '0x2') can never match a row, so callers answer 404 rather than 400.
function parseEventId(rawId) {
  const eventId = parsePositiveInt(rawId, null)
  return eventId === null || eventId < 1 ? null : eventId
}

const EVENT_NOT_FOUND = { error: 'Event not found' }

router.get('/:id', optionalAuth, async (request, response) => {
  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  const event = await selectEventById(eventId, request.user)
  if (!event) return response.status(404).json(EVENT_NOT_FOUND)

  return response.status(200).json({ event })
})

router.get('/:id/messages', optionalAuth, async (request, response) => {
  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)
  const [[event]] = await pool.query('SELECT event_date FROM events WHERE id = ? AND status = \'published\'', [eventId])
  if (!event) return response.status(404).json(EVENT_NOT_FOUND)
  const now = new Date()
  const eventDate = new Date(event.event_date)
  const opensAt = new Date(eventDate.getTime() - 6 * 60 * 60 * 1000)
  if (now < opensAt || now >= eventDate) return response.json({ messages: [] })
  const [messages] = await pool.query(
    `SELECT m.id, m.content, m.created_at, u.name AS user_name
     FROM chat_messages m JOIN users u ON u.id = m.user_id
     WHERE m.event_id = ? ORDER BY m.created_at ASC LIMIT 100`,
    [eventId],
  )
  return response.json({ messages })
})

// Upper bounds keep values inside their columns (DECIMAL(8,2), DECIMAL(10,2), INT UNSIGNED, TEXT),
// so oversized input is a 400 instead of a MySQL out-of-range 500.
const MAX_PRICE = 10000
const MIN_FUNDRAISER_GOAL = 100
const MAX_FUNDRAISER_GOAL = 10000000
const MAX_CAPACITY = 100000
const MAX_DESCRIPTION_LENGTH = 5000
const REGISTRATION_CLOSES_BEFORE_MS = 24 * 60 * 60 * 1000

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

// Accepts a JSON number or a plain decimal string ("12.50"); null/'' or absent mean "not given"
// and return null. Anything else (true, [7], "0x10", "1e2", " ") returns undefined.
function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && DECIMAL_PATTERN.test(value.trim())) return Number(value)
  return undefined
}

// Money columns are DECIMAL(_,2); compared via toFixed because value * 100 is inexact (0.29 * 100).
function hasAtMostTwoDecimals(value) {
  return Number(value.toFixed(2)) === value
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

// Shared by POST and PUT: validates an event payload and returns { error } or { values },
// where values is keyed by events column name, ready for INSERT ... SET ? / UPDATE ... SET ?.
async function parseEventInput(body) {
  const eventType = normalizeEventType(body.event_type ?? body.type)

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title.length < 3 || title.length > 150) {
    return { error: 'Title must be between 3 and 150 characters' }
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description.length < 20 || description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `Description must be between 20 and ${MAX_DESCRIPTION_LENGTH} characters` }
  }

  const location = typeof body.location === 'string' ? body.location.trim() : ''
  if (!location || location.length > 150) {
    return { error: 'Location is required (150 characters or fewer)' }
  }

  const address = typeof body.address === 'string' ? body.address.trim() : null
  if (address && address.length > 200) {
    return { error: 'Address must be 200 characters or fewer' }
  }

  const latitude = parseCoordinate(body.latitude, 90, 'latitude')
  if (latitude.error) return { error: latitude.error }
  const longitude = parseCoordinate(body.longitude, 180, 'longitude')
  if (longitude.error) return { error: longitude.error }
  // Half a coordinate cannot be placed on the map.
  if ((latitude.value === null) !== (longitude.value === null)) {
    return { error: 'latitude and longitude must be sent together' }
  }

  // The full start instant is stored (UTC), so the time of day survives and chat windows can use it.
  const startsAt = new Date(body.date)
  if (typeof body.date !== 'string' || Number.isNaN(startsAt.getTime())) {
    return { error: 'date must be a valid date' }
  }
  if (startsAt <= new Date()) {
    return { error: 'The event must be in the future' }
  }

  if (!EVENT_TYPES.includes(eventType)) {
    return { error: "event_type must be 'standard' or 'fundraiser'" }
  }

  let capacity = 0
  let price = 0
  let goalAmount = null

  if (eventType === 'standard') {
    // total_tickets is the spec name for the capacity column.
    capacity = parseOptionalNumber(body.capacity ?? body.total_tickets)
    if (capacity === null || capacity === undefined || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
      return { error: `total_tickets must be a whole number between 1 and ${MAX_CAPACITY}` }
    }
    // Not `?? 0`: that would also turn an unparseable price (undefined) into a free event.
    price = parseOptionalNumber(body.price)
    if (price === null) price = 0
    if (price === undefined || price < 0 || price > MAX_PRICE || !hasAtMostTwoDecimals(price)) {
      return { error: `price must be between 0 and ${MAX_PRICE} with at most 2 decimal places` }
    }
  } else {
    // fundraiser_goal is the spec name for the goal_amount column (CHECK requires it).
    goalAmount = parseOptionalNumber(body.fundraiser_goal ?? body.goal_amount ?? body.goal)
    if (
      goalAmount === null ||
      goalAmount === undefined ||
      goalAmount < MIN_FUNDRAISER_GOAL ||
      goalAmount > MAX_FUNDRAISER_GOAL ||
      !hasAtMostTwoDecimals(goalAmount)
    ) {
      return {
        error: `A fundraiser goal must be between HK$${MIN_FUNDRAISER_GOAL} and HK$${MAX_FUNDRAISER_GOAL} with at most 2 decimal places`,
      }
    }
  }

  // Category may be sent as an id or as the client-facing name.
  let categoryId = parseOptionalNumber(body.category_id)
  if (categoryId !== null && categoryId !== undefined) {
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return { error: 'Unknown category' }
    }
    const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [categoryId])
    if (!category) return { error: 'Unknown category' }
  } else {
    const categoryName = typeof body.category === 'string' ? body.category.trim() : ''
    if (!categoryName) {
      return { error: 'Category is required' }
    }
    const [[category]] = await pool.query('SELECT id FROM categories WHERE name = ?', [categoryName])
    // Note: the client form offers 'Arts', which is not seeded — 400 for now,
    // pending the team's decision to seed it or auto-create categories.
    if (!category) return { error: 'Unknown category' }
    categoryId = category.id
  }

  return {
    values: {
      title,
      description,
      category_id: categoryId,
      location,
      address: address || null,
      latitude: latitude.value,
      longitude: longitude.value,
      event_date: startsAt,
      // registration_deadline is computed, never taken from the client: exactly 24h before the start.
      registration_deadline: new Date(startsAt.getTime() - REGISTRATION_CLOSES_BEFORE_MS),
      event_type: eventType,
      capacity,
      price,
      goal_amount: goalAmount,
    },
  }
}

// Protected: creating an event requires a valid Bearer token (see middleware/auth.js).
// 403 gate per HANDOFF.md §1: only verified students may create events. Students verify
// their email via POST /api/auth/verify before they can use this route.
router.post('/', requireAuth, async (request, response) => {
  if (!request.user.is_verified) {
    return response.status(403).json({ error: 'Verify your student email before creating events' })
  }

  const { error, values } = await parseEventInput(request.body ?? {})
  if (error) return response.status(400).json({ error })

  // SET ? expands the column-keyed object (mysql2 escapes every value).
  const [result] = await pool.query('INSERT INTO events SET ?', [
    {
      ...values,
      available_tickets: values.capacity,
      organizer_id: request.user.id,
      status: 'published',
    },
  ])

  const event = await selectEventById(result.insertId, request.user)
  if (!event) {
    throw new Error(`Event ${result.insertId} was inserted but could not be read back`)
  }

  return response.status(201).json({ event })
})

// Loads an event for an organizer-only route inside a transaction: 404 when it is missing
// (or a draft), 403 when the signed-in user is not its organizer. Returns { row } or { status, error }.
async function findOwnedEvent(connection, rawId, user) {
  const eventId = parseEventId(rawId)
  if (eventId === null) return { status: 404, ...EVENT_NOT_FOUND }

  // FOR UPDATE OF e locks only the event row, so a concurrent booking cannot slip past a
  // capacity or status change (the joined user and category rows stay unlocked).
  const [[row]] = await connection.query(
    `${EVENT_SELECT} WHERE e.id = ? AND e.status <> 'draft' LIMIT 1 FOR UPDATE OF e`,
    [eventId],
  )
  if (!row) return { status: 404, ...EVENT_NOT_FOUND }
  if (row.organizer_id !== user.id) {
    return { status: 403, error: 'Only the event organizer can change this event' }
  }
  return { row }
}

// Runs handler(connection) in a transaction; it returns { status, body } for an early
// (rolled-back) response, or nothing to commit.
async function withTransaction(handler) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const earlyResponse = await handler(connection)
    if (earlyResponse) {
      await connection.rollback()
      return earlyResponse
    }
    await connection.commit()
    return null
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

// Protected, organizer only. Fields left out keep their current value, so the client can send
// just what changed; the merged event goes through the same validation as POST.
router.put('/:id', requireAuth, async (request, response) => {
  let eventId
  const earlyResponse = await withTransaction(async (connection) => {
    const { row, status, error } = await findOwnedEvent(connection, request.params.id, request.user)
    if (error) return { status, body: { error } }
    if (row.status === 'cancelled') {
      return { status: 409, body: { error: 'A cancelled event cannot be edited' } }
    }

    // Current values sit under the last alias each field is read from, so whichever spelling
    // the client sends (total_tickets or capacity, category or category_id) takes precedence.
    const current = {
      title: row.title,
      description: row.description,
      location: row.location,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      date: row.event_date.toISOString(),
      type: row.event_type,
      total_tickets: row.capacity,
      price: row.price,
      goal: row.goal_amount,
      category: row.category,
    }
    const { error: inputError, values } = await parseEventInput({ ...current, ...(request.body ?? {}) })
    if (inputError) return { status: 400, body: { error: inputError } }

    // Existing tickets and pledges must stay valid after the edit.
    if (values.event_type !== row.event_type && (row.booked > 0 || row.pledge_count > 0)) {
      return {
        status: 409,
        body: { error: 'event_type cannot change once tickets have been booked or pledges made' },
      }
    }
    if (values.event_type === 'standard' && values.capacity < row.booked) {
      return {
        status: 409,
        body: { error: `total_tickets cannot be lower than the ${row.booked} tickets already booked` },
      }
    }

    await connection.query('UPDATE events SET ? WHERE id = ?', [
      {
        ...values,
        available_tickets: values.event_type === 'standard' ? values.capacity - row.booked : 0,
      },
      row.id,
    ])
    eventId = row.id
  })
  if (earlyResponse) return response.status(earlyResponse.status).json(earlyResponse.body)

  const event = await selectEventById(eventId, request.user)
  return response.status(200).json({ event })
})

// Protected, organizer only. Tickets and pledges are receipts (FK ON DELETE RESTRICT), so the
// event is cancelled rather than removed: it drops out of GET /api/events but stays readable by id.
router.delete('/:id', requireAuth, async (request, response) => {
  let eventId
  const earlyResponse = await withTransaction(async (connection) => {
    const { row, status, error } = await findOwnedEvent(connection, request.params.id, request.user)
    if (error) return { status, body: { error } }

    await connection.query(`UPDATE events SET status = 'cancelled' WHERE id = ?`, [row.id])
    eventId = row.id
  })
  if (earlyResponse) return response.status(earlyResponse.status).json(earlyResponse.body)

  const event = await selectEventById(eventId, request.user)
  return response.status(200).json({ event })
})

const MAX_DONATION = 100000
const MAX_TICKETS_PER_BOOKING = 4

const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// Receipt codes follow the seed format: <prefix> + 9 uppercase alphanumerics (UNIQUE in both tables).
function generateReference(prefix) {
  const bytes = crypto.randomBytes(9)
  return prefix + Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
}

// Protected, verified students only (HANDOFF.md §1). raised_amount is never stored: inserting
// the pledge row is what raises it, since it is SUM(pledges.amount). Repeat donations are allowed.
router.post('/:id/donate', requireAuth, async (request, response) => {
  if (!request.user.is_verified) {
    return response.status(403).json({ error: 'Verify your student email before donating' })
  }

  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  const [[target]] = await pool.query(
    `SELECT event_type, status, event_date FROM events WHERE id = ? AND status <> 'draft'`,
    [eventId],
  )
  if (!target) return response.status(404).json(EVENT_NOT_FOUND)
  if (target.event_type !== 'fundraiser') {
    return response.status(400).json({ error: 'Donations are only accepted for fundraiser events' })
  }
  if (target.status === 'cancelled') {
    return response.status(409).json({ error: 'This fundraiser has been cancelled' })
  }
  if (target.event_date <= new Date()) {
    return response.status(409).json({ error: 'This fundraiser has already ended' })
  }

  const amount = parseOptionalNumber(request.body?.amount)
  if (amount === null || amount === undefined || amount <= 0 || amount > MAX_DONATION) {
    return response.status(400).json({ error: `amount must be greater than 0 and at most ${MAX_DONATION}` })
  }
  if (!hasAtMostTwoDecimals(amount)) {
    return response.status(400).json({ error: 'amount can have at most 2 decimal places' })
  }

  const referenceCode = generateReference('PLG')
  const [result] = await pool.query(
    'INSERT INTO pledges (event_id, user_id, amount, reference_code) VALUES (?, ?, ?, ?)',
    [eventId, request.user.id, amount, referenceCode],
  )
  const [[pledgeRow]] = await pool.query('SELECT created_at FROM pledges WHERE id = ?', [result.insertId])
  const pledge = {
    id: result.insertId,
    event_id: eventId,
    amount,
    reference_code: referenceCode,
    created_at: pledgeRow.created_at,
  }

  const event = await selectEventById(eventId, request.user)

  // The donation is already recorded, so a mail failure is logged but never fails the request.
  let emailSent = false
  try {
    await sendDonationReceipt({ user: request.user, event, pledge })
    emailSent = true
  } catch (error) {
    console.error(`Donation receipt ${referenceCode} was not emailed: ${error.message}`)
  }
  await pool.query(
    `INSERT INTO email_log (user_id, type, reference_code, status) VALUES (?, 'donation', ?, ?)`,
    [request.user.id, referenceCode, emailSent ? 'sent' : 'failed'],
  )

  return response.status(200).json({ pledge, event, receipt_email_sent: emailSent })
})

// Group bookings name every attendee. quantity remains a convenience for single-ticket requests,
// but buying more than one seat requires the registered email of each attendee.
function parseAttendees(body, buyerEmail) {
  const raw = body?.attendees
  const quantity = parseOptionalNumber(body?.quantity)

  if (raw === undefined) {
    if (quantity === undefined) return { error: 'quantity must be a whole number' }
    if (quantity === null) return { emails: [buyerEmail.toLowerCase()] }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
      return { error: `quantity must be a whole number between 1 and ${MAX_TICKETS_PER_BOOKING}` }
    }
    if (quantity > 1) return { error: 'attendees is required when buying more than one ticket' }
    return { emails: [buyerEmail.toLowerCase()] }
  }

  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_TICKETS_PER_BOOKING) {
    return { error: `attendees must list between 1 and ${MAX_TICKETS_PER_BOOKING} student emails` }
  }
  if (raw.some((email) => typeof email !== 'string' || email.trim() === '')) {
    return { error: 'Every attendee must be a student email' }
  }

  const emails = raw.map((email) => email.trim().toLowerCase())
  if (new Set(emails).size !== emails.length) {
    return { error: 'Each attendee can only appear once' }
  }
  if (quantity === undefined) return { error: 'quantity must be a whole number' }
  if (quantity !== null && quantity !== emails.length) {
    return { error: 'quantity must match the number of attendees' }
  }

  return { emails }
}

// Sends receipts after the booking has committed. Called without awaiting so the HTTP response
// is not held open by SMTP; every ticket outcome is still recorded in email_log.
async function sendBookingEmails({ buyer, event, tickets }) {
  const sends = tickets.map((ticket) => sendTicketReceipt({ user: ticket.attendee, event, ticket }))
  const buyerIsAttendee = tickets.some((ticket) => ticket.user_id === buyer.id)
  if (!buyerIsAttendee) {
    sends.push(sendBookingSummary({ user: buyer, event, tickets }))
  }
  const results = await Promise.allSettled(sends)
  const ticketResults = results.slice(0, tickets.length)
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const label = tickets[index]?.ticket_code ?? 'booking summary'
      console.error(`Ticket receipt ${label} was not emailed: ${result.reason?.message ?? result.reason}`)
    }
  })
  await Promise.all(
    tickets.map((ticket, index) =>
      pool.query(
        `INSERT INTO email_log (user_id, type, reference_code, status) VALUES (?, 'booking', ?, ?)`,
        [
          ticket.user_id,
          ticket.ticket_code,
          ticketResults[index].status === 'fulfilled' ? 'sent' : 'failed',
        ],
      ),
    ),
  )
}

// Protected, verified students only (HANDOFF.md §1). Each attendee gets their own ticket row and
// code; purchased_by records the buyer. Seats are a stored counter, so the capacity check,
// decrement, and every insert/update run while the event row is locked.
router.post('/:id/tickets', requireAuth, async (request, response) => {
  if (!request.user.is_verified) {
    return response.status(403).json({ error: 'Verify your student email before booking tickets' })
  }

  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  const { emails, error: attendeeError } = parseAttendees(request.body, request.user.email)
  if (attendeeError) return response.status(400).json({ error: attendeeError })

  let ticketCodes = []
  const earlyResponse = await withTransaction(async (connection) => {
    // FOR UPDATE serializes concurrent bookings for this event until this transaction commits.
    const [[event]] = await connection.query(
      `SELECT id, event_type, status, capacity, available_tickets, price, event_date, registration_deadline
       FROM events WHERE id = ? AND status <> 'draft' LIMIT 1 FOR UPDATE`,
      [eventId],
    )
    if (!event) return { status: 404, body: EVENT_NOT_FOUND }
    if (event.status === 'cancelled') {
      return { status: 409, body: { error: 'This event has been cancelled' } }
    }
    if (event.event_type !== 'standard') {
      return { status: 400, body: { error: 'Tickets are only available for standard events' } }
    }

    const now = new Date()
    if (event.registration_deadline != null && event.registration_deadline <= now) {
      return { status: 409, body: { error: 'Registration for this event has closed' } }
    }
    if (event.event_date <= now) {
      return { status: 409, body: { error: 'This event has already started' } }
    }

    const [attendeeRows] = await connection.query(
      `SELECT id, name, email, is_verified FROM users WHERE email IN (?)`,
      [emails],
    )
    const attendeeByEmail = new Map(attendeeRows.map((row) => [row.email.toLowerCase(), row]))
    const unknown = emails.filter((email) => !attendeeByEmail.has(email))
    if (unknown.length) {
      return { status: 400, body: { error: `Unknown attendee email: ${unknown.join(', ')}` } }
    }
    const unverified = emails.filter((email) => !attendeeByEmail.get(email).is_verified)
    if (unverified.length) {
      return {
        status: 403,
        body: { error: `Attendee has not verified their student email: ${unverified.join(', ')}` },
      }
    }
    const attendees = emails.map((email) => attendeeByEmail.get(email))

    const [existingRows] = await connection.query(
      `SELECT id, user_id, status FROM tickets WHERE event_id = ? AND user_id IN (?) FOR UPDATE`,
      [eventId, attendees.map((attendee) => attendee.id)],
    )
    const existingByUser = new Map(existingRows.map((row) => [row.user_id, row]))
    const alreadyBooked = attendees.filter(
      (attendee) => existingByUser.get(attendee.id)?.status === 'confirmed',
    )
    if (alreadyBooked.length) {
      return {
        status: 409,
        body: {
          error: `Already has a ticket for this event: ${alreadyBooked
            .map((attendee) => attendee.email)
            .join(', ')}`,
        },
      }
    }

    if (event.available_tickets < attendees.length) {
      return {
        status: 409,
        body: { error: `Not enough seats left (${event.available_tickets} available)` },
      }
    }
    await connection.query(
      'UPDATE events SET available_tickets = available_tickets - ? WHERE id = ?',
      [attendees.length, eventId],
    )

    const type = event.price > 0 ? 'paid' : 'free'
    for (const attendee of attendees) {
      const existing = existingByUser.get(attendee.id)
      // A cancelled ticket keeps its row (UNIQUE user+event), so rebooking confirms it again.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const ticketCode = crypto.randomUUID()
        try {
          if (existing) {
            await connection.query(
              `UPDATE tickets SET purchased_by = ?, type = ?, status = 'confirmed',
                 ticket_code = ?, amount_paid = ? WHERE id = ?`,
              [request.user.id, type, ticketCode, event.price, existing.id],
            )
          } else {
            await connection.query(
              `INSERT INTO tickets (user_id, purchased_by, event_id, type, status, ticket_code, amount_paid)
               VALUES (?, ?, ?, ?, 'confirmed', ?, ?)`,
              [attendee.id, request.user.id, eventId, type, ticketCode, event.price],
            )
          }
          ticketCodes.push(ticketCode)
          break
        } catch (error) {
          // uq_tickets_code collision: generate a fresh code. Anything else is a real failure.
          if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error
        }
      }
    }
  })
  if (earlyResponse) return response.status(earlyResponse.status).json(earlyResponse.body)

  const [ticketRows] = await pool.query(
    `SELECT t.id, t.user_id, t.purchased_by, t.event_id, t.type, t.status, t.ticket_code,
            t.amount_paid, t.created_at, u.name AS holder_name, u.email AS holder_email
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.ticket_code IN (?)
     ORDER BY t.id ASC`,
    [ticketCodes],
  )
  const tickets = ticketRows.map((row) => ({
    id: row.id,
    ticket_code: row.ticket_code,
    reference_code: row.ticket_code,
    event_id: row.event_id,
    user_id: row.user_id,
    attendee: { id: row.user_id, name: row.holder_name, email: row.holder_email },
    purchased_by: row.purchased_by,
    type: row.type,
    status: row.status,
    amount_paid: row.amount_paid,
    booked_at: row.created_at,
  }))
  if (tickets.length !== ticketCodes.length) {
    throw new Error(`Booked ${ticketCodes.length} tickets but read back ${tickets.length}`)
  }

  // Re-fetched after commit, so available_tickets reflects this booking.
  const event = await selectEventById(eventId, request.user)

  // Fire-and-forget: the endpoint returns once the booking is durable, while Nodemailer and the
  // email_log inserts continue in the background.
  setImmediate(() => {
    sendBookingEmails({ buyer: request.user, event, tickets }).catch((error) => {
      console.error(`Booking emails for ${tickets.map((ticket) => ticket.ticket_code).join(', ')} failed: ${error.message}`)
    })
  })

  return response
    .status(201)
    .json({ tickets, ticket: tickets[0], event, email_queued: true })
})

// Protected. Cancelling releases the seat and restores the stored counter; the row stays as a
// receipt (HANDOFF.md §1), so a later rebooking updates it instead of inserting a second row.
router.delete('/:id/ticket', requireAuth, async (request, response) => {
  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  let cancelled
  const earlyResponse = await withTransaction(async (connection) => {
    // Same lock order as booking: event first, then the ticket row.
    const [[event]] = await connection.query(
      'SELECT id FROM events WHERE id = ? LIMIT 1 FOR UPDATE',
      [eventId],
    )
    if (!event) return { status: 404, body: EVENT_NOT_FOUND }

    const [[ticket]] = await connection.query(
      `SELECT id, ticket_code, status FROM tickets
       WHERE user_id = ? AND event_id = ? FOR UPDATE`,
      [request.user.id, eventId],
    )
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } }
    if (ticket.status !== 'confirmed') {
      return { status: 409, body: { error: 'Ticket is already cancelled' } }
    }

    await connection.query(`UPDATE tickets SET status = 'cancelled' WHERE id = ?`, [ticket.id])
    await connection.query(
      `UPDATE events SET available_tickets = LEAST(available_tickets + 1, capacity) WHERE id = ?`,
      [eventId],
    )
    cancelled = { id: ticket.id, ticket_code: ticket.ticket_code, status: 'cancelled' }
  })
  if (earlyResponse) return response.status(earlyResponse.status).json(earlyResponse.body)

  const event = await selectEventById(eventId, request.user)
  return response.status(200).json({ ticket: cancelled, event })
})

export default router
