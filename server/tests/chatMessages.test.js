// Integration tests for GET /api/events/:id/messages against the running Docker stack
// (`docker compose up`). Users register through the API; events, tickets, pledges and messages
// are written straight to MySQL because the API only accepts future event dates.
// Run with `npm test --prefix server`. TEST_API_URL / TEST_DB_* override the defaults.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import mysql from 'mysql2/promise'
import { io as createSocketClient } from 'socket.io-client'


const API = process.env.TEST_API_URL || 'http://localhost:5000/api'
const API_ORIGIN = new URL(API).origin
const RUN = crypto.randomBytes(4).toString('hex')
const EMAIL_DOMAIN = 'connect.hku.hk'
const RUN_AT = Date.now()

// The schema stores UTC timestamps without a time zone. Keep the test clock fixed so rows
// intentionally written with the same timestamp stay tied (id is the tie-breaker).
function utcTimestamp(offsetMs = 0) {
  return new Date(RUN_AT + offsetMs).toISOString().slice(0, 23).replace('T', ' ')
}

const db = await mysql.createConnection({
  host: process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 3307),
  database: process.env.TEST_DB_NAME || process.env.DB_NAME || 'student_events',
  user: process.env.TEST_DB_USER || process.env.DB_USER || 'app_user',
  password: process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || 'app_password',
})

async function getMessages(eventId, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const response = await fetch(`${API}/events/${eventId}/messages`, { headers })
  return { status: response.status, body: await response.json() }
}

async function postMessage(eventId, token, content) {
  const headers = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
  const response = await fetch(`${API}/events/${eventId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  })
  return { status: response.status, body: await response.json() }
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(API_ORIGIN, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 5000,
    })
    const timer = setTimeout(() => {
      socket.disconnect()
      reject(new Error('Socket connection timed out'))
    }, 5000)

    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timer)
      socket.close()
      reject(error)
    })
  })
}

function joinEvent(socket, eventId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chat join timed out')), 5000)
    socket.emit('chat:join', { eventId }, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

function nextChatMessage(socket) {
  return new Promise((resolve, reject) => {
    function handleMessage(payload) {
      clearTimeout(timer)
      resolve(payload)
    }
    const timer = setTimeout(() => {
      socket.off('chat:message', handleMessage)
      reject(new Error('Timed out waiting for a chat message'))
    }, 5000)
    socket.once('chat:message', handleMessage)
  })
}

async function register(label, { verified = true } = {}) {
  const response = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Chat ${label}`,
      email: `${label}.${RUN}.chattest@${EMAIL_DOMAIN}`,
      password: 'password123',
    }),
  })
  assert.equal(response.status, 201, `registering ${label}`)
  const { token, user } = await response.json()
  if (verified) await db.query('UPDATE users SET is_verified = TRUE WHERE id = ?', [user.id])
  return { token, id: user.id, name: user.name }
}

async function insertEvent(organizerId, { type = 'standard', startsAt = utcTimestamp(-60 * 60 * 1000) } = {}) {
  const [[{ id: categoryId }]] = await db.query('SELECT id FROM categories ORDER BY id LIMIT 1')
  const [result] = await db.query(
    `INSERT INTO events (title, description, category_id, organizer_id, location, event_date,
                         event_type, capacity, available_tickets, price, goal_amount, status)
     VALUES (?, 'Chat test event', ?, ?, 'Test Hall', ?, ?, 10, 10, 0, ?, 'published')`,
    [`Chat Test ${RUN}`, categoryId, organizerId, startsAt, type, type === 'fundraiser' ? 500 : null],
  )
  return result.insertId
}

async function setEventDate(eventId, startsAt) {
  await db.query('UPDATE events SET event_date = ? WHERE id = ?', [startsAt, eventId])
}

async function insertTicket(eventId, holder, { buyer = holder, status = 'confirmed' } = {}) {
  await db.query(
    `INSERT INTO tickets
       (user_id, purchased_by, event_id, attendee_name, attendee_email, status, ticket_code)
     VALUES (?, ?, ?, ?, 'attendee@test.local', ?, UUID())`,
    [holder.id, buyer.id, eventId, holder.name, status],
  )
}

async function insertMessage(eventId, user, content, createdAt) {
  await db.query(
    `INSERT INTO chat_messages (event_id, user_id, content, created_at)
     VALUES (?, ?, ?, ?)`,
    [eventId, user.id, content, createdAt],
  )
}

const users = {}
let eventId
let fundraiserId
let otherEventId

before(async () => {
  for (const label of ['organizer', 'holder', 'donor', 'outsider', 'cancelled', 'buyer', 'guest']) {
    users[label] = await register(label)
  }
  users.unverified = await register('unverified', { verified: false })

  eventId = await insertEvent(users.organizer.id)
  fundraiserId = await insertEvent(users.organizer.id, { type: 'fundraiser' })
  otherEventId = await insertEvent(users.organizer.id)

  // The app issues organizers a ticket when they create an event.
  await insertTicket(eventId, users.organizer)
  await insertTicket(eventId, users.holder)
  await insertTicket(eventId, users.unverified)
  await insertTicket(eventId, users.cancelled, { status: 'cancelled' })
  // buyer paid for guest's ticket: guest holds it, buyer does not.
  await insertTicket(eventId, users.guest, { buyer: users.buyer })
  await insertTicket(otherEventId, users.outsider)
  await db.query(
    `INSERT INTO pledges (event_id, user_id, amount, reference_code) VALUES (?, ?, 25, ?)`,
    [fundraiserId, users.donor.id, `T${RUN}`.toUpperCase()],
  )

  // Inserted out of order; the two "second" rows share a timestamp so id must break the tie.
  await insertMessage(eventId, users.holder, 'third', utcTimestamp(0))
  await insertMessage(eventId, users.organizer, 'second-a', utcTimestamp(-60 * 1000))
  await insertMessage(eventId, users.holder, 'first', utcTimestamp(-2 * 60 * 1000))
  await insertMessage(eventId, users.guest, 'second-b', utcTimestamp(-60 * 1000))
  await insertMessage(otherEventId, users.outsider, 'other event', utcTimestamp(-3 * 60 * 1000))
})

after(async () => {
  const events = [eventId, fundraiserId, otherEventId].filter(Boolean)
  const ids = Object.values(users).map((user) => user.id)
  if (events.length) {
    await db.query('DELETE FROM chat_messages WHERE event_id IN (?)', [events])
    await db.query('DELETE FROM tickets WHERE event_id IN (?)', [events])
    await db.query('DELETE FROM pledges WHERE event_id IN (?)', [events])
    await db.query('DELETE FROM events WHERE id IN (?)', [events])
  }
  if (ids.length) await db.query('DELETE FROM users WHERE id IN (?)', [ids])
  await db.end()
})

describe('GET /api/events/:id/messages', () => {
  test('returns the event messages ordered by created_at ASC with 200', async () => {
    const { status, body } = await getMessages(eventId, users.holder.token)
    assert.equal(status, 200)
    assert.deepEqual(
      body.messages.map((message) => message.content),
      ['first', 'second-a', 'second-b', 'third'],
    )
  })

  test('each message carries its id, author and ISO timestamp', async () => {
    const { body } = await getMessages(eventId, users.holder.token)
    const first = body.messages[0]
    assert.deepEqual(Object.keys(first).sort(), ['content', 'created_at', 'id', 'user_id', 'user_name'])
    assert.equal(first.user_id, users.holder.id)
    assert.equal(first.user_name, users.holder.name)
    assert.match(first.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    const times = body.messages.map((message) => Date.parse(message.created_at))
    assert.deepEqual(times, [...times].sort((a, b) => a - b))
  })

  test('does not include messages from other events', async () => {
    const { body } = await getMessages(eventId, users.organizer.token)
    assert.ok(body.messages.every((message) => message.content !== 'other event'))
  })

  test('returns an empty list when nobody has written yet', async () => {
    const { status, body } = await getMessages(fundraiserId, users.donor.token)
    assert.equal(status, 200)
    assert.deepEqual(body, { messages: [] })
  })

  describe('authentication', () => {
    test('401 without a token', async () => {
      assert.equal((await getMessages(eventId)).status, 401)
    })

    test('401 with an invalid token', async () => {
      assert.equal((await getMessages(eventId, 'not-a-jwt')).status, 401)
    })

    test('403 for an unverified ticket holder', async () => {
      const { status, body } = await getMessages(eventId, users.unverified.token)
      assert.equal(status, 403)
      assert.match(body.error, /verify/i)
    })
  })

  describe('event lookup', () => {
    test('404 for a non-numeric id', async () => {
      assert.equal((await getMessages('abc', users.holder.token)).status, 404)
    })

    test('404 for an event that does not exist', async () => {
      assert.equal((await getMessages(2147483647, users.holder.token)).status, 404)
    })
  })

  describe('ticket ownership', () => {
    test('200 for the organizer through their ticket', async () => {
      assert.equal((await getMessages(eventId, users.organizer.token)).status, 200)
    })

    test('200 for the holder of a ticket someone else paid for', async () => {
      assert.equal((await getMessages(eventId, users.guest.token)).status, 200)
    })

    test('200 for a donor of a fundraiser', async () => {
      assert.equal((await getMessages(fundraiserId, users.donor.token)).status, 200)
    })

    test('403 for a user without a ticket or pledge', async () => {
      const { status, body } = await getMessages(eventId, users.donor.token)
      assert.equal(status, 403)
      assert.match(body.error, /ticket holders and donors/)
    })

    test('403 for a user whose ticket is for a different event', async () => {
      assert.equal((await getMessages(eventId, users.outsider.token)).status, 403)
    })

    test('403 for a user whose ticket was cancelled', async () => {
      assert.equal((await getMessages(eventId, users.cancelled.token)).status, 403)
    })

    test('403 for a buyer who paid for a ticket but does not hold it', async () => {
      assert.equal((await getMessages(eventId, users.buyer.token)).status, 403)
    })
  })

  describe('chat active window (6 hours before to 7 days after the event)', () => {
    after(() => setEventDate(eventId, utcTimestamp(-60 * 60 * 1000)))

    test('403 more than 6 hours before the event', async () => {
      await setEventDate(eventId, utcTimestamp((6 * 60 + 5) * 60 * 1000))
      const { status, body } = await getMessages(eventId, users.holder.token)
      assert.equal(status, 403)
      assert.match(body.error, /opens 6 hours before/)
    })

    test('200 just inside 6 hours before the event', async () => {
      await setEventDate(eventId, utcTimestamp((6 * 60 - 5) * 60 * 1000))
      assert.equal((await getMessages(eventId, users.holder.token)).status, 200)
    })

    test('200 just inside 7 days after the event', async () => {
      await setEventDate(eventId, utcTimestamp(-(7 * 24 * 60 - 5) * 60 * 1000))
      assert.equal((await getMessages(eventId, users.holder.token)).status, 200)
    })

    test('403 more than 7 days after the event', async () => {
      await setEventDate(eventId, utcTimestamp(-(7 * 24 * 60 + 5) * 60 * 1000))
      const { status, body } = await getMessages(eventId, users.holder.token)
      assert.equal(status, 403)
      assert.match(body.error, /closed/)
    })

    test('403 once the event is cancelled, even inside the window', async () => {
      await setEventDate(eventId, utcTimestamp(-60 * 60 * 1000))
      await db.query("UPDATE events SET status = 'cancelled' WHERE id = ?", [eventId])
      try {
        const { status, body } = await getMessages(eventId, users.holder.token)
        assert.equal(status, 403)
        assert.match(body.error, /cancelled/)
      } finally {
        await db.query("UPDATE events SET status = 'published' WHERE id = ?", [eventId])
      }
    })
  })
})

describe('POST /api/events/:id/messages', () => {
  test('creates a message, returns its author, and persists it', async () => {
    const content = `posted-${RUN}`
    const { status, body } = await postMessage(eventId, users.holder.token, content)
    assert.equal(status, 201)
    assert.deepEqual(Object.keys(body.message).sort(), ['content', 'created_at', 'id', 'user_id', 'user_name'])
    assert.equal(body.message.content, content)
    assert.equal(body.message.user_id, users.holder.id)
    assert.equal(body.message.user_name, users.holder.name)
    assert.match(body.message.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    const listed = await getMessages(eventId, users.holder.token)
    assert.ok(listed.body.messages.some((message) => message.id === body.message.id))
  })

  test('trims surrounding whitespace', async () => {
    const { status, body } = await postMessage(eventId, users.holder.token, '  hello there  ')
    assert.equal(status, 201)
    assert.equal(body.message.content, 'hello there')
  })

  test('rejects empty, whitespace-only, non-string, and oversized messages', async () => {
    for (const content of ['', '   ', 42, null, 'x'.repeat(1001)]) {
      const { status, body } = await postMessage(eventId, users.holder.token, content)
      assert.equal(status, 400)
      assert.match(body.error, /between 1 and 1000/)
    }
  })

  test('requires authentication and event membership', async () => {
    assert.equal((await postMessage(eventId, '', 'hello')).status, 401)
    assert.equal((await postMessage(eventId, users.donor.token, 'hello')).status, 403)
    assert.equal((await postMessage(eventId, users.unverified.token, 'hello')).status, 403)
  })
})

describe('Socket.IO event chat', () => {
  test('an authenticated member joins and receives a newly posted message', async () => {
    const socket = await connectSocket(users.holder.token)
    try {
      assert.deepEqual(await joinEvent(socket, eventId), { ok: true })

      const incoming = nextChatMessage(socket)
      const { status, body } = await postMessage(eventId, users.organizer.token, `live-${RUN}`)
      assert.equal(status, 201)

      const payload = await incoming
      assert.equal(payload.event_id, eventId)
      assert.equal(payload.message.id, body.message.id)
      assert.equal(payload.message.content, `live-${RUN}`)
    } finally {
      socket.disconnect()
    }
  })

  test('rejects a socket handshake without a valid token', async () => {
    await assert.rejects(connectSocket('not-a-jwt'), /Invalid or expired token/)
    await assert.rejects(connectSocket(''), /Authentication required/)
  })

  test('denies chat:join to a user without an event ticket', async () => {
    const socket = await connectSocket(users.donor.token)
    try {
      const result = await joinEvent(socket, eventId)
      assert.equal(result.ok, false)
      assert.equal(result.status, 403)
      assert.match(result.error, /ticket holders and donors/)
    } finally {
      socket.disconnect()
    }
  })

  test('does not deliver room messages to a socket that did not join', async () => {
    const holderSocket = await connectSocket(users.holder.token)
    const outsiderSocket = await connectSocket(users.outsider.token)
    try {
      assert.deepEqual(await joinEvent(holderSocket, eventId), { ok: true })

      let outsiderReceived = false
      outsiderSocket.on('chat:message', () => {
        outsiderReceived = true
      })

      const incoming = nextChatMessage(holderSocket)
      await postMessage(eventId, users.holder.token, `room-only-${RUN}`)
      await incoming
      await new Promise((resolve) => setTimeout(resolve, 100))

      assert.equal(outsiderReceived, false)
    } finally {
      holderSocket.disconnect()
      outsiderSocket.disconnect()
    }
  })
})
