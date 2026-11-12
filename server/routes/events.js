import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { Router } from 'express'
import { sendBookingSummary, sendDonationReceipt } from '../config/email.js'
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js'
import { findCategoryById, findCategoryByName } from '../queries/categories.js'
import { insertEventMessage, isChatMember, listEventMessages } from '../queries/chat.js'
import { logEmail } from '../queries/emailLog.js'
import {
  cancelEvent,
  cancelAllUserEvents,
  deleteAllCedarsEvents,
  deleteScrapedEvent,
  findEventRow,
  findEventStatus,
  insertEvent,
  listEventRows,
  lockEventForBooking,
  lockEventForCancellation,
  lockEventRow,
  releaseSeat,
  reserveSeats,
  updateEvent,
} from '../queries/events.js'
import { insertPledge } from '../queries/pledges.js'
import {
  cancelTicket,
  insertTicket,
  listTicketsByCodes,
  lockTicketsForUsers,
  lockUserTicket,
  reconfirmTicket,
} from '../queries/tickets.js'
import { withTransaction } from '../queries/transaction.js'
import { findUsersByEmails } from '../queries/users.js'
import { getChatAccess } from '../utils/chatAccess.js'

const router = Router()

const EVENT_TYPES = ['standard', 'fundraiser']
const AVAILABILITY_FILTERS = ['available', 'sold_out', 'all']
const PRICE_FILTERS = ['free', 'paid']
const SOURCE_FILTERS = ['app', 'external']
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50
const MAX_TICKET_QUANTITY = 4
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

export function serializeEvent(row, viewer) {
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
    // Scraped events are view-only: the client links to source_url instead of booking or donating.
    // fee_text is the original wording, since "$20 (member) / $30 (non-member)" has no single price.
    is_external: row.source !== null,
    source: row.source,
    source_url: row.source_url,
    source_organizer: row.source_organizer,
    fee_text: row.fee_text,
    end_date: row.end_date,
  }
}

async function selectEventById(eventId, viewer) {
  const row = await findEventRow(eventId)
  return row ? serializeEvent(row, viewer) : null
}

function parsePositiveInt(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

// Validates the list query string into filters for listEventRows, or returns { error }.
function parseEventFilters(query) {
  const filters = {}

  filters.source = query.source ?? 'app'
  if (!SOURCE_FILTERS.includes(filters.source)) {
    return { error: "source must be 'app' or 'external'" }
  }

  filters.search = typeof query.search === 'string' ? query.search.trim() : ''

  if (query.category_id !== undefined) {
    filters.categoryId = parsePositiveInt(query.category_id, null)
    if (filters.categoryId === null || filters.categoryId < 1) {
      return { error: 'category_id must be a positive integer' }
    }
  }

  if (query.event_type !== undefined) {
    if (!EVENT_TYPES.includes(query.event_type)) {
      return { error: "event_type must be 'standard' or 'fundraiser'" }
    }
    filters.eventType = query.event_type
  }

  // Anson's catalog tabs need free/paid filtering on top of event_type.
  if (query.price !== undefined) {
    if (!PRICE_FILTERS.includes(query.price)) {
      return { error: "price must be 'free' or 'paid'" }
    }
    filters.price = query.price
  }

  filters.availability = query.availability ?? 'all'
  if (!AVAILABILITY_FILTERS.includes(filters.availability)) {
    return { error: "availability must be 'available', 'sold_out' or 'all'" }
  }

  return { filters }
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

  const { error, filters } = parseEventFilters(request.query)
  if (error) {
    return response.status(400).json({ error })
  }

  const { rows, total } = await listEventRows(filters, limit, (page - 1) * limit)

  const events = rows.map((row) => serializeEvent(row, request.user))
  return response.json({ events, page, limit, total })
})

router.get('/manage', requireAdmin, async (request, response) => {
  const page = parsePositiveInt(request.query.page, DEFAULT_PAGE)
  const limit = parsePositiveInt(request.query.limit, DEFAULT_LIMIT)
  if (page === null || page < 1 || limit === null || limit < 1 || limit > MAX_LIMIT) {
    return response.status(400).json({ error: `page must be positive and limit must be between 1 and ${MAX_LIMIT}` })
  }

  const { rows, total } = await listEventRows({ source: 'all' }, limit, (page - 1) * limit)
  return response.status(200).json({
    events: rows.map((row) => serializeEvent(row, request.user)),
    page,
    limit,
    total,
  })
})

router.post('/admin/scrape', requireAdmin, async (_request, response) => {
  const child = spawn(process.execPath, ['scripts/scrapeCedars.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  let errorOutput = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { errorOutput += chunk.toString() })
  child.on('error', (error) => response.status(500).json({ error: `CEDARS scrape failed: ${error.message}` }))
  child.on('close', (code) => {
    if (response.headersSent) return
    if (code !== 0) return response.status(502).json({ error: errorOutput.trim() || 'CEDARS scrape failed' })
    return response.status(200).json({ message: 'CEDARS events refreshed', output: output.trim() })
  })
})

router.delete('/admin/user-created', requireAdmin, async (_request, response) => {
  let cancelledUserEvents = 0
  await withTransaction(async (connection) => {
    cancelledUserEvents = await cancelAllUserEvents(connection)
  })
  return response.status(200).json({ cancelled_user_events: cancelledUserEvents })
})

router.delete('/admin/cedars', requireAdmin, async (_request, response) => {
  await withTransaction(async (connection) => {
    await deleteAllCedarsEvents(connection)
  })
  return response.status(200).json({ deleted_cedars_events: true })
})

// Non-numeric ids ('abc', '1e1', '0x2') can never match a row, so callers answer 404 rather than 400.
function parseEventId(rawId) {
  const eventId = parsePositiveInt(rawId, null)
  return eventId === null || eventId < 1 ? null : eventId
}

const EVENT_NOT_FOUND = { error: 'Event not found' }

// Scraped events belong to another website, so ordinary routes that change an event or join it
// stop here. Administrators have a separate delete path for removing stale CEDARS rows.
async function rejectExternalEvent(request, response, next) {
  const eventId = parseEventId(request.params.id)
  const event = eventId === null ? null : await findEventStatus(eventId)
  if (event?.source) {
    return response.status(403).json({ error: 'This event is managed on its original website' })
  }
  return next()
}

router.get('/:id', optionalAuth, async (request, response) => {
  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  const event = await selectEventById(eventId, request.user)
  if (!event) return response.status(404).json(EVENT_NOT_FOUND)

  return response.status(200).json({ event })
})

// HANDOFF.md §1 and §3: chat is for verified ticket holders and donors, from 6 hours before the
// event until 7 days after it. Runs after requireAuth and sets request.eventId.
async function requireChatAccess(request, response, next) {
  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  const access = await getChatAccess(request.user, eventId)
  if (access.error) return response.status(access.status).json({ error: access.error })

  request.eventId = eventId
  return next()
}

const MAX_CHAT_MESSAGE_LENGTH = 1000

router.get('/:id/messages', requireAuth, requireChatAccess, async (request, response) => {
  const messages = await listEventMessages(request.eventId)
  return response.status(200).json({ messages })
})

router.post('/:id/messages', requireAuth, requireChatAccess, async (request, response) => {
  const content = typeof request.body?.content === 'string' ? request.body.content.trim() : ''
  if (!content || content.length > 1000) {
    return response.status(400).json({ error: 'Message must contain between 1 and 1000 characters' })
  }

  const message = await insertEventMessage({
    eventId: request.eventId,
    userId: request.user.id,
    content,
  })
  return response.status(201).json({ message })
})

// Upper bounds keep values inside their columns (DECIMAL(8,2), DECIMAL(10,2), INT UNSIGNED, TEXT),
// so oversized input is a 400 instead of a MySQL out-of-range 500.
const MAX_PRICE = 10000
const MIN_FUNDRAISER_GOAL = 100
const MAX_FUNDRAISER_GOAL = 10000000
const MAX_CAPACITY = 100000
const MAX_DESCRIPTION_LENGTH = 5000
const REGISTRATION_CLOSES_BEFORE_MS = 2 * 60 * 60 * 1000

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
async function parseEventInput(body, { allowPastDate = false } = {}) {
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
  if (!allowPastDate && startsAt <= new Date()) {
    return { error: 'The event must be in the future' }
  }

  const endsAt = new Date(body.end_date)
  if (typeof body.end_date !== 'string' || Number.isNaN(endsAt.getTime())) {
    return { error: 'end_date must be a valid date' }
  }
  if (endsAt <= startsAt) {
    return { error: 'end_date must be after date' }
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
    const category = await findCategoryById(categoryId)
    if (!category) return { error: 'Unknown category' }
  } else {
    const categoryName = typeof body.category === 'string' ? body.category.trim() : ''
    if (!categoryName) {
      return { error: 'Category is required' }
    }
    const category = await findCategoryByName(categoryName)
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
      end_date: endsAt,
      // registration_deadline is computed, never taken from the client: exactly 2h before the start.
      registration_deadline: new Date(startsAt.getTime() - REGISTRATION_CLOSES_BEFORE_MS),
      event_type: eventType,
      capacity,
      price,
      goal_amount: goalAmount,
    },
  }
}

const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// Pledge receipt codes follow the seed format: <prefix> + 9 uppercase alphanumerics (UNIQUE).
function generateReference(prefix) {
  const bytes = crypto.randomBytes(9)
  return prefix + Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
}

// Calls write(ticketCode) and returns the code, retrying with a fresh UUID on a uq_tickets_code
// collision. Anything else is a real failure.
async function withFreshTicketCode(write) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ticketCode = crypto.randomUUID()
    try {
      await write(ticketCode)
      return ticketCode
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error
    }
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

  // The organizer gets a free ticket with the event (it does not take a seat), which also lets them into the chat.
  let eventId
  await withTransaction(async (connection) => {
    eventId = await insertEvent(connection, {
      ...values,
      available_tickets: values.capacity,
      organizer_id: request.user.id,
      status: 'published',
    })
    await withFreshTicketCode((ticketCode) =>
      insertTicket(connection, {
        userId: request.user.id,
        purchasedBy: request.user.id,
        eventId,
        attendeeName: request.user.name,
        attendeeEmail: request.user.email,
        type: 'free',
        ticketCode,
        amountPaid: 0,
      }),
    )
  })

  const event = await selectEventById(eventId, request.user)
  if (!event) {
    throw new Error(`Event ${eventId} was inserted but could not be read back`)
  }

  return response.status(201).json({ event })
})

// Loads an event for an organizer-only route inside a transaction: 404 when it is missing
// (or a draft), 403 when the signed-in user is not its organizer. Returns { row } or { status, error }.
async function findOwnedEvent(connection, rawId, user) {
  const eventId = parseEventId(rawId)
  if (eventId === null) return { status: 404, ...EVENT_NOT_FOUND }

  const row = await lockEventRow(connection, eventId)
  if (!row) return { status: 404, ...EVENT_NOT_FOUND }
  if (row.organizer_id !== user.id && user.role !== 'admin') {
    return { status: 403, error: 'Only the event organizer can change this event' }
  }
  return { row }
}

// Protected, organizer only. Fields left out keep their current value, so the client can send
// just what changed; the merged event goes through the same validation as POST.
router.put('/:id', requireAuth, rejectExternalEvent, async (request, response) => {
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
      end_date: row.end_date?.toISOString() ?? null,
      type: row.event_type,
      total_tickets: row.capacity,
      price: row.price,
      goal: row.goal_amount,
      category: row.category,
    }
    const { error: inputError, values } = await parseEventInput(
      { ...current, ...(request.body ?? {}) },
      { allowPastDate: row.event_date <= new Date() },
    )
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

    await updateEvent(connection, row.id, {
      ...values,
      available_tickets: values.event_type === 'standard' ? values.capacity - row.booked : 0,
    })
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
  let scrapedDeleted = false
  const earlyResponse = await withTransaction(async (connection) => {
    const { row, status, error } = await findOwnedEvent(connection, request.params.id, request.user)
    if (error) return { status, body: { error } }

    if (row.source) {
      if (request.user.role !== 'admin') {
        return { status: 403, body: { error: 'Only administrators can delete CEDARS events' } }
      }
      await deleteScrapedEvent(connection, row.id)
      eventId = row.id
      scrapedDeleted = true
      return null
    }

    await cancelEvent(connection, row.id)
    eventId = row.id
  })
  if (earlyResponse) return response.status(earlyResponse.status).json(earlyResponse.body)

  if (scrapedDeleted) {
    return response.status(200).json({ id: eventId, deleted: true })
  }
  const event = await selectEventById(eventId, request.user)
  return response.status(200).json({ event })
})

const MAX_DONATION = 100000
const MAX_TICKETS_PER_BOOKING = 4

// Protected, verified students only (HANDOFF.md §1). raised_amount is never stored: inserting
// the pledge row is what raises it, since it is SUM(pledges.amount). Repeat donations are allowed.
router.post('/:id/donate', requireAuth, rejectExternalEvent, async (request, response) => {
  if (!request.user.is_verified) {
    return response.status(403).json({ error: 'Verify your student email before donating' })
  }

  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  const target = await findEventStatus(eventId)
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
  const stored = await insertPledge({ eventId, userId: request.user.id, amount, referenceCode })
  const pledge = {
    id: stored.id,
    event_id: eventId,
    amount,
    reference_code: referenceCode,
    created_at: stored.created_at,
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
  await logEmail(request.user.id, 'donation', referenceCode, emailSent)

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

// Sends one summary after the booking has committed. Only the buyer receives this email;
// it contains every ticket and QR code in the booking.
async function sendBookingEmails({ buyer, event, tickets }) {
  const [result] = await Promise.allSettled([sendBookingSummary({ user: buyer, event, tickets })])
  const sent = result.status === 'fulfilled'
  if (!sent) {
    console.error(
      `Booking summary for ${tickets.map((ticket) => ticket.ticket_code).join(', ')} was not emailed: ${
        result.reason?.message ?? result.reason
      }`,
    )
  }

  const logResults = await Promise.allSettled(
    tickets.map((ticket) =>
      logEmail(buyer.id, 'booking', ticket.ticket_code, sent),
    ),
  )
  logResults.forEach((logResult, index) => {
    if (logResult.status === 'rejected') {
      console.error(`Booking email result for ${tickets[index].ticket_code} was not logged: ${logResult.reason?.message ?? logResult.reason}`)
    }
  })

  return tickets.map((ticket, index) => ({
    reference_code: ticket.ticket_code,
    email: buyer.email,
    sent,
  }))
}

// Protected, verified students only (HANDOFF.md §1). Each attendee gets their own ticket row and
// code; purchased_by records the buyer. The buyer receives the only booking email. Seats are a
// stored counter, so the capacity check,
// decrement, and every insert/update run while the event row is locked.
router.post('/:id/tickets', requireAuth, rejectExternalEvent, async (request, response) => {
  if (!request.user.is_verified) {
    return response.status(403).json({ error: 'Verify your student email before booking tickets' })
  }

  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  const { quantity, attendees } = request.body ?? {}
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKET_QUANTITY) {
    return response.status(400).json({ error: `quantity must be a whole number between 1 and ${MAX_TICKET_QUANTITY}` })
  }
  if (!Array.isArray(attendees) || attendees.length !== quantity) {
    return response.status(400).json({ error: 'Provide one attendee name and email for each ticket' })
  }

  const normalizedAttendees = []
  for (const [index, attendee] of attendees.entries()) {
    const name = typeof attendee?.name === 'string' ? attendee.name.trim() : ''
    const email = typeof attendee?.email === 'string' ? attendee.email.trim().toLowerCase() : ''
    if (!name || name.length > 120) {
      return response.status(400).json({ error: `Attendee ${index + 1} name must be between 1 and 120 characters` })
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 160) {
      return response.status(400).json({ error: `Attendee ${index + 1} email must be valid and at most 160 characters` })
    }
    normalizedAttendees.push({ name, email })
  }
  const emails = normalizedAttendees.map((attendee) => attendee.email)

  const ticketCodes = []
  const earlyResponse = await withTransaction(async (connection) => {
    const event = await lockEventForBooking(connection, eventId)
    if (!event) return { status: 404, body: EVENT_NOT_FOUND }
    if (event.status === 'cancelled') {
      return { status: 409, body: { error: 'This event has been cancelled' } }
    }
    if (event.event_type !== 'standard') {
      return { status: 400, body: { error: 'Tickets are only available for standard events' } }
    }

    const now = new Date()
    const registrationDeadline = new Date(event.event_date.getTime() - REGISTRATION_CLOSES_BEFORE_MS)
    if (registrationDeadline <= now) {
      return { status: 409, body: { error: 'Registration for this event has closed' } }
    }
    if (event.event_date <= now) {
      return { status: 409, body: { error: 'This event has already started' } }
    }

    const attendeeRows = await findUsersByEmails(connection, emails)
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

    const existingRows = await lockTicketsForUsers(
      connection,
      eventId,
      attendees.map((attendee) => attendee.id),
    )
    const existingByUser = new Map(existingRows.map((row) => [row.user_id, row]))
    const alreadyBooked = attendees.filter((attendee) => existingByUser.get(attendee.id)?.status === 'confirmed')
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

    // The organizer's own ticket does not take a seat.
    const seats = attendees.filter((attendee) => attendee.id !== event.organizer_id).length
    if (event.available_tickets < seats) {
      return {
        status: 409,
        body: { error: `Not enough seats left (${event.available_tickets} available)` },
      }
    }
    await reserveSeats(connection, eventId, seats)

    const type = event.price > 0 ? 'paid' : 'free'
    const fields = { purchasedBy: request.user.id, type, amountPaid: event.price }
    for (const attendee of attendees) {
      const existing = existingByUser.get(attendee.id)
      const ticketCode = await withFreshTicketCode((code) =>
        existing
          ? reconfirmTicket(connection, existing.id, { ...fields, ticketCode: code })
          : insertTicket(connection, {
              ...fields,
              userId: attendee.id,
              eventId,
              attendeeName: attendee.name,
              attendeeEmail: attendee.email,
              ticketCode: code,
            }),
      )
      ticketCodes.push(ticketCode)
    }
  })
  if (earlyResponse) return response.status(earlyResponse.status).json(earlyResponse.body)

  const ticketRows = await listTicketsByCodes(ticketCodes)
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

  let receiptEmails
  try {
    receiptEmails = await sendBookingEmails({ buyer: request.user, event, tickets })
  } catch (error) {
    console.error(`Booking emails for ${tickets.map((ticket) => ticket.ticket_code).join(', ')} failed: ${error.message}`)
    receiptEmails = tickets.map((ticket) => ({
      reference_code: ticket.ticket_code,
      email: request.user.email,
      sent: false,
    }))
  }

  return response.status(201).json({ tickets, ticket: tickets[0], event, receipt_emails: receiptEmails })
})

// Protected. Cancelling releases the seat and restores the stored counter; the row stays as a
// receipt (HANDOFF.md §1), so a later rebooking updates it instead of inserting a second row.
router.delete('/:id/ticket', requireAuth, async (request, response) => {
  const eventId = parseEventId(request.params.id)
  if (eventId === null) return response.status(404).json(EVENT_NOT_FOUND)

  let cancelled
  const earlyResponse = await withTransaction(async (connection) => {
    const event = await lockEventForCancellation(connection, eventId)
    if (!event) return { status: 404, body: EVENT_NOT_FOUND }

    const ticket = await lockUserTicket(connection, request.user.id, eventId)
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } }
    if (ticket.status !== 'confirmed') {
      return { status: 409, body: { error: 'Ticket is already cancelled' } }
    }

    await cancelTicket(connection, ticket.id)
    // The organizer's own ticket never held a seat, so there is none to give back.
    if (ticket.user_id !== event.organizer_id) {
      await releaseSeat(connection, eventId)
    }
    cancelled = { id: ticket.id, ticket_code: ticket.ticket_code, status: 'cancelled' }
  })
  if (earlyResponse) return response.status(earlyResponse.status).json(earlyResponse.body)

  const event = await selectEventById(eventId, request.user)
  return response.status(200).json({ ticket: cancelled, event })
})

export default router
