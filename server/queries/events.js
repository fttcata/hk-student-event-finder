import { pool } from '../config/db.js'

// Booked counts and fundraiser totals are computed live; available_tickets is the stored booking
// counter that the booking/cancellation transactions maintain under the event row lock.
// The organizer's own ticket does not take a seat, so it is left out of both.
const BOOKED_TICKETS_SQL = `(SELECT COUNT(*) FROM tickets t
  WHERE t.event_id = e.id AND t.status = 'confirmed' AND t.user_id <> e.organizer_id)`

// One SELECT for every endpoint that returns events, so list, detail and create share a shape.
const EVENT_SELECT = `
  SELECT e.id, e.title, e.description, e.category_id, c.name AS category,
         e.event_type, e.status, e.image_url, e.event_date, e.registration_deadline,
         e.location, e.address, e.latitude, e.longitude,
         e.capacity, e.available_tickets, e.price, e.goal_amount, e.created_at,
         e.source, e.source_url, e.source_organizer, e.fee_text, e.end_date,
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

// Escape LIKE wildcards so a search for "100%" only matches a literal percent sign.
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

// Shared WHERE builder for the list query and the total-count query. Filters are already validated.
function buildEventFilters({ source, search, categoryId, eventType, price, availability }) {
  const conditions = [`e.status = 'published'`]
  const params = []

  // Scraped events have their own section and only appear there until they end.
  if (source === 'external') {
    conditions.push('e.source IS NOT NULL', 'COALESCE(e.end_date, e.event_date) >= NOW()')
  } else {
    conditions.push('e.source IS NULL')
  }

  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(`(e.title LIKE ? ESCAPE '\\'
      OR e.description LIKE ? ESCAPE '\\'
      OR e.location LIKE ? ESCAPE '\\')`)
    params.push(pattern, pattern, pattern)
  }
  if (categoryId !== undefined) {
    conditions.push('e.category_id = ?')
    params.push(categoryId)
  }
  if (eventType !== undefined) {
    conditions.push('e.event_type = ?')
    params.push(eventType)
  }
  if (price !== undefined) {
    conditions.push(price === 'free' ? 'e.price = 0' : 'e.price > 0')
  }
  // capacity = 0 means unlimited seats, so those events are never sold out.
  if (availability === 'available') {
    conditions.push('(e.capacity = 0 OR e.available_tickets > 0)')
  } else if (availability === 'sold_out') {
    conditions.push('(e.capacity > 0 AND e.available_tickets = 0)')
  }

  return { where: conditions.join(' AND '), params }
}

export async function listEventRows(filters, limit, offset) {
  const { where, params } = buildEventFilters(filters)
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM events e WHERE ${where}`, params)
  const [rows] = await pool.query(
    `${EVENT_SELECT}
     WHERE ${where}
     ORDER BY e.event_date ASC, e.id ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )
  return { rows, total }
}

export async function findEventRow(eventId) {
  const [[row]] = await pool.query(`${EVENT_SELECT} WHERE e.id = ? AND e.status <> 'draft' LIMIT 1`, [eventId])
  return row ?? null
}

// FOR UPDATE OF e locks only the event row, so a concurrent booking cannot slip past a
// capacity or status change (the joined user and category rows stay unlocked).
export async function lockEventRow(connection, eventId) {
  const [[row]] = await connection.query(
    `${EVENT_SELECT} WHERE e.id = ? AND e.status <> 'draft' LIMIT 1 FOR UPDATE OF e`,
    [eventId],
  )
  return row ?? null
}

// The few columns the donation, chat and read-only rules look at.
export async function findEventStatus(eventId) {
  const [[event]] = await pool.query(
    `SELECT event_type, status, event_date, source FROM events WHERE id = ? AND status <> 'draft'`,
    [eventId],
  )
  return event ?? null
}

// FOR UPDATE serializes concurrent bookings for this event until the transaction commits.
export async function lockEventForBooking(connection, eventId) {
  const [[event]] = await connection.query(
    `SELECT id, organizer_id, event_type, status, capacity, available_tickets, price, event_date, registration_deadline
     FROM events WHERE id = ? AND status <> 'draft' LIMIT 1 FOR UPDATE`,
    [eventId],
  )
  return event ?? null
}

// Same lock order as booking: event first, then the ticket row.
export async function lockEventForCancellation(connection, eventId) {
  const [[event]] = await connection.query('SELECT id, organizer_id FROM events WHERE id = ? LIMIT 1 FOR UPDATE', [
    eventId,
  ])
  return event ?? null
}

export async function reserveSeats(connection, eventId, seats) {
  await connection.query('UPDATE events SET available_tickets = available_tickets - ? WHERE id = ?', [seats, eventId])
}

export async function releaseSeat(connection, eventId) {
  await connection.query(`UPDATE events SET available_tickets = LEAST(available_tickets + 1, capacity) WHERE id = ?`, [
    eventId,
  ])
}

export async function insertEvent(connection, values) {
  const columns = Object.keys(values)
  const placeholders = columns.map(() => '?').join(', ')
  const [rows] = await connection.query(
    `INSERT INTO events (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    columns.map((column) => values[column]),
  )
  return rows[0].id
}

export async function updateEvent(connection, eventId, values) {
  const columns = Object.keys(values)
  const assignments = columns.map((column) => `${column} = ?`).join(', ')
  await connection.query(
    `UPDATE events SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...columns.map((column) => values[column]), eventId],
  )
}

export async function cancelEvent(connection, eventId) {
  await connection.query(`UPDATE events SET status = 'cancelled' WHERE id = ?`, [eventId])
}

// Inserts a scraped event, or refreshes the row uq_events_source finds. Setting status here
// brings back an event that a previous scrape cancelled.
export async function upsertScrapedEvent(values) {
  const columns = Object.keys(values)
  const placeholders = columns.map(() => '?').join(', ')
  const updates = columns
    .filter((column) => !['source', 'source_id'].includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ')
  await pool.query(
    `INSERT INTO events (${columns.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (source, source_id) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`,
    columns.map((column) => values[column]),
  )
}

// Events that have not ended but are gone from the website were taken down by their organizer.
export async function cancelMissingScrapedEvents(source, listedIds) {
  const [result] = await pool.query(
    `UPDATE events SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE source = ? AND status = 'published' AND source_id NOT IN (?)
       AND COALESCE(end_date, event_date) >= NOW()`,
    [source, listedIds],
  )
  return result.affectedRows
}
