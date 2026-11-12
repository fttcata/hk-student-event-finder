import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import mysql from 'mysql2/promise'

const API = process.env.TEST_API_URL || 'http://localhost:5001/api'
const RUN = crypto.randomBytes(4).toString('hex')
const EMAIL_DOMAIN = 'connect.hku.hk'

const db = await mysql.createConnection(
  process.env.TEST_DATABASE_URL || {
    host: process.env.TEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT || 3307),
    user: process.env.TEST_DB_USER || 'app_user',
    password: process.env.TEST_DB_PASSWORD || 'app_password',
    database: process.env.TEST_DB_NAME || 'student_events',
    timezone: 'Z',
    decimalNumbers: true,
  },
)
await db.query("SET time_zone = '+00:00'")

async function register(label) {
  const response = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Check-in ${label}`,
      email: `${label}.${RUN}.checkin@${EMAIL_DOMAIN}`,
      password: 'password123',
    }),
  })
  assert.equal(response.status, 201, `registering ${label}`)
  const { token, user } = await response.json()
  await db.query('UPDATE users SET is_verified = TRUE WHERE id = ?', [user.id])
  return { token, id: user.id, name: user.name }
}

async function insertEvent(organizerId, { status = 'published', type = 'standard' } = {}) {
  const [categories] = await db.query('SELECT id FROM categories ORDER BY id LIMIT 1')
  assert.ok(categories[0], 'expected at least one seeded category')
  const [result] = await db.query(
    `INSERT INTO events (title, description, category_id, organizer_id, location, event_date,
                         event_type, capacity, available_tickets, price, goal_amount, status)
     VALUES (?, 'Check-in test event', ?, ?, 'Test Hall', ?, ?, 20, 20, 0, ?, ?)`,
    [
      `Check-in Test ${RUN}`,
      categories[0].id,
      organizerId,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      type,
      type === 'fundraiser' ? 500 : null,
      status,
    ],
  )
  return result.insertId
}

async function insertTicket(eventId, holder, { status = 'confirmed' } = {}) {
  const ticketCode = crypto.randomUUID()
  await db.query(
    `INSERT INTO tickets
       (user_id, purchased_by, event_id, attendee_name, attendee_email, type, status, ticket_code)
     VALUES (?, ?, ?, ?, ?, 'free', ?, ?)`,
    [holder.id, holder.id, eventId, holder.name, holder.email ?? `${holder.name}@test.local`, status, ticketCode],
  )
  return ticketCode
}

async function checkIn(eventId, token, ticketCode) {
  const headers = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
  const response = await fetch(`${API}/events/${eventId}/check-in`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ticketCode === undefined ? {} : { ticket_code: ticketCode }),
  })
  return { status: response.status, body: await response.json() }
}

async function deleteByIds(table, column, ids) {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(', ')
  await db.query(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`, ids)
}

const users = {}
let eventId
let otherEventId
let cancelledEventId

before(async () => {
  for (const label of ['organizer', 'attendee', 'holder1', 'holder2', 'holder3', 'guest', 'other', 'outsider', 'admin']) {
    users[label] = await register(label)
  }
  await db.query("UPDATE users SET role = 'admin' WHERE id = ?", [users.admin.id])

  eventId = await insertEvent(users.organizer.id)
  otherEventId = await insertEvent(users.organizer.id)
  cancelledEventId = await insertEvent(users.organizer.id, { status: 'cancelled' })
})

after(async () => {
  const events = [eventId, otherEventId, cancelledEventId].filter(Boolean)
  const ids = Object.values(users).map((user) => user.id)
  await deleteByIds('tickets', 'event_id', events)
  await deleteByIds('events', 'id', events)
  await deleteByIds('users', 'id', ids)
  await db.end()
})

describe('POST /api/events/:id/check-in', () => {
  test('requires authentication', async () => {
    const ticketCode = await insertTicket(eventId, users.attendee)
    const { status, body } = await checkIn(eventId, null, ticketCode)
    assert.equal(status, 401)
    assert.equal(body.error, 'Authentication required')
  })

  test('rejects an organizer who does not own the event', async () => {
    const ticketCode = await insertTicket(eventId, users.guest)
    const { status, body } = await checkIn(eventId, users.outsider.token, ticketCode)
    assert.equal(status, 403)
    assert.match(body.error, /organizer/i)
  })

  test('rejects malformed and missing ticket codes', async () => {
    const malformed = await checkIn(eventId, users.organizer.token, 'not-a-ticket-code')
    assert.equal(malformed.status, 400)
    assert.match(malformed.body.error, /ticket_code/i)

    const missing = await checkIn(eventId, users.organizer.token, undefined)
    assert.equal(missing.status, 400)
  })

  test('returns 404 for an unknown code or a code from another event', async () => {
    const unknown = await checkIn(eventId, users.organizer.token, crypto.randomUUID())
    assert.equal(unknown.status, 404)

    const otherCode = await insertTicket(otherEventId, users.other)
    const wrongEvent = await checkIn(eventId, users.organizer.token, otherCode)
    assert.equal(wrongEvent.status, 404)
  })

  test('rejects cancelled tickets and cancelled events', async () => {
    const cancelledCode = await insertTicket(eventId, users.other, { status: 'cancelled' })
    const cancelledTicket = await checkIn(eventId, users.organizer.token, cancelledCode)
    assert.equal(cancelledTicket.status, 409)

    const cancelledEvent = await checkIn(cancelledEventId, users.organizer.token, crypto.randomUUID())
    assert.equal(cancelledEvent.status, 409)
  })

  test('checks in a confirmed ticket and flags a duplicate scan', async () => {
    const ticketCode = await insertTicket(eventId, users.holder1)
    const first = await checkIn(eventId, users.organizer.token, ticketCode)

    assert.equal(first.status, 200)
    assert.equal(first.body.check_in.ticket_code, ticketCode)
    assert.equal(first.body.check_in.attendee_name, users.holder1.name)
    assert.equal(first.body.check_in.already_checked_in, false)
    assert.ok(first.body.check_in.checked_in_at)

    const [[stored]] = await db.query('SELECT checked_in_at FROM tickets WHERE ticket_code = ?', [ticketCode])
    assert.ok(stored.checked_in_at)

    const duplicate = await checkIn(eventId, users.organizer.token, ticketCode)
    assert.equal(duplicate.status, 200)
    assert.equal(duplicate.body.check_in.already_checked_in, true)
    assert.equal(duplicate.body.check_in.checked_in_at, first.body.check_in.checked_in_at)

    const [[unchanged]] = await db.query('SELECT checked_in_at FROM tickets WHERE ticket_code = ?', [ticketCode])
    assert.equal(unchanged.checked_in_at.getTime(), stored.checked_in_at.getTime())
  })

  test('allows an administrator to check in a ticket', async () => {
    const ticketCode = await insertTicket(eventId, users.holder2)
    const { status, body } = await checkIn(eventId, users.admin.token, ticketCode)
    assert.equal(status, 200)
    assert.equal(body.check_in.ticket_code, ticketCode)
    assert.equal(body.check_in.already_checked_in, false)
  })

  test('rejects check-in for fundraiser events', async () => {
    const fundraiserId = await insertEvent(users.organizer.id, { type: 'fundraiser' })
    const ticketCode = await insertTicket(fundraiserId, users.holder3)
    const { status, body } = await checkIn(fundraiserId, users.organizer.token, ticketCode)
    assert.equal(status, 409)
    assert.match(body.error, /standard events/i)
    await deleteByIds('tickets', 'event_id', [fundraiserId])
    await deleteByIds('events', 'id', [fundraiserId])
  })
})
