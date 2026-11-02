# Backend Handoff — Database Design Decisions & Required Patterns

**From:** Louis (Database Architecture, Core Querying, Data Integrity)
**For:** Gaspar (API/middleware), Masud & Anson (client), Cata (merge/review)
**Branch:** `backend_dev_2` — applies to all 9-table schema in `database/init.sql`

> One-time setup for everyone: `docker compose down -v` (MySQL only runs `init.sql` on a fresh volume).

---

## 1. Schema decisions the API must respect

| Decision | Rule | Why |
|---|---|---|
| Seat ownership | A seat exists only while `tickets.status = 'confirmed'`. `cancelled` releases the seat but keeps the receipt row. Standard events keep a stored `events.available_tickets` counter, decremented on booking and restored on cancellation inside the event-row lock. | Proposal: capacity enforcement + receipt lookups after cancellation |
| Ticket uniqueness | `UNIQUE(user_id, event_id)` — one ticket row per holder per event. A buyer may book seats for several registered, verified students; each row keeps the holder's `user_id` and records the buyer in `purchased_by`. Rebooking = **UPDATE** the row (`cancelled → confirmed`), never a second INSERT. | Verified: round-trip update works; a second INSERT fails with 1062 |
| Organizer tickets | Creating an event also issues its organizer a free confirmed ticket. It does not take a seat: `available_tickets` and booked counts ignore `tickets.user_id = events.organizer_id`. | Team decision: organizers join the event chat through a ticket |
| Receipts | `tickets.ticket_code` is a server-generated UUID and is UNIQUE; `pledges.reference_code` remains UNIQUE with a `PLG` prefix. Return the code in every booking/donation response. `email_log.reference_code` is wide enough for the UUID. | Proposal: receipts with unique verification code |
| Repeat donations | `pledges` has **no** unique on `(user_id, event_id)` — students may pledge many times. Don't add one. | Team decision (Option B): repeat giving is realistic for fundraisers |
| Fundraiser progress | Always compute live: `SELECT COALESCE(SUM(amount),0) FROM pledges WHERE event_id = ?`. Never store a running total. | No stale counters; verified SUM = 350 on seed data |
| Fundraiser rows | A row with `event_type = 'fundraiser'` **must** have `goal_amount` (CHECK enforced, error 3819 — on INSERT *and* UPDATE). Standard events: `goal_amount = NULL`. | Schema integrity |
| Ratings | `reviews.rating` must be 1–5 (CHECK), one review per user per event (UNIQUE). | Proposal: ratings for completed events |
| Verification | `users.is_verified = TRUE` required before booking/donating/creating events/chatting (proposal: university-domain signup). `verification_code` holds the pending code. | Proposal must-have |
| Enums | Invalid enum values are **rejected** (error 1265, strict mode). Validate in Express too so users get a 400, not a 500. | Verified on `users.university` |

---

## 2. Required pattern: race-free counter booking (CRITICAL)

Two students booking the last seat at the same time **will overbook** if the code reads the seat count before inserting without a lock. Use a transaction and lock the event row:

```js
// POST /api/events/:id/tickets — one holder for quantity=1, up to four for a group
const conn = await pool.getConnection()
try {
  await conn.beginTransaction()
  const fail = async (status, error) => {
    await conn.rollback()
    response.status(status).json({ error })
  }

  // 1. Lock the event row — concurrent bookings/cancellations now queue up
  const [[event]] = await conn.query(
    `SELECT id, title, capacity, available_tickets, price, event_type, status,
            event_date, registration_deadline
     FROM events WHERE id = ? FOR UPDATE`,
    [eventId],
  )
  if (!event) return fail(404, 'Event not found')
  if (event.event_type !== 'standard') return fail(400, 'Tickets are only available for standard events')
  if (event.status === 'cancelled') return fail(409, 'This event has been cancelled')
  if (event.registration_deadline && event.registration_deadline <= new Date()) {
    return fail(409, 'Registration for this event has closed')
  }

  // 2. Validate/lock the holders, then check the stored counter for the whole group
  //    (UNIQUE(user_id, event_id) remains one row per holder).
  if (event.available_tickets < attendees.length) {
    return fail(409, `Not enough seats left (${event.available_tickets} available)`)
  }
  await conn.query(
    'UPDATE events SET available_tickets = available_tickets - ? WHERE id = ?',
    [attendees.length, eventId],
  )

  // 3. One row per holder. user_id is the attendee; purchased_by is the signed-in buyer.
  //    A cancelled row is re-confirmed with UPDATE; otherwise INSERT a fresh UUID.
  const type = event.price > 0 ? 'paid' : 'free'
  for (const attendee of attendees) {
    const ticketCode = crypto.randomUUID()
    await conn.query(
      `INSERT INTO tickets (user_id, purchased_by, event_id, type, status, ticket_code, amount_paid)
       VALUES (?, ?, ?, ?, 'confirmed', ?, ?)`,
      [attendee.id, buyerId, eventId, type, ticketCode, event.price],
    )
  }

  await conn.commit()
  // 4. Respond 201 immediately; send receipts in the background and log them.
  //    sendBookingEmails(...) inserts email_log rows and never blocks the response.
  setImmediate(() => sendBookingEmails({ buyer, event, tickets }))
  return response.status(201).json({ tickets, ticket: tickets[0], event, email_queued: true })
} catch (err) {
  await conn.rollback()
  throw err
} finally {
  conn.release()
}
```

Same transaction shape applies to cancellation: lock the event, lock the holder's confirmed ticket, set `status = 'cancelled'`, then `available_tickets = LEAST(available_tickets + 1, capacity)`. Never `DELETE` the ticket row.

Event create sets `available_tickets = capacity`; event update recomputes it as `capacity - confirmed seats` (or `0` for fundraisers). Seed data derives it from confirmed tickets. Fundraiser progress is still computed live with `SUM(amount)`.

**Why:** verified the schema can't prevent overbooking — `capacity` is just a number, each INSERT is individually valid. The lock (`FOR UPDATE`) plus the stored counter is the fix.

---

## 3. Required pattern: chat time-window middleware

Proposal: chat opens **6 hours before** `event_date`, closes **7 days after**. Enforce on every send/read in Express middleware — not in SQL:

```js
async function chatOpen(req, res, next) {
  const [[event]] = await pool.query(
    'SELECT event_date FROM events WHERE id = ?',
    [req.params.id],
  )
  if (!event) return res.status(404).json({ error: 'Event not found' })

  const opensAt  = new Date(event.event_date).getTime() - 6 * 3600 * 1000
  const closesAt = new Date(event.event_date).getTime() + 7 * 86400 * 1000
  const now = Date.now()

  if (now < opensAt)  return res.status(403).json({ error: 'Chat opens 6h before the event' })
  if (now > closesAt) return res.status(403).json({ error: 'Chat has closed' })
  next()
}
```

Also require: authenticated, verified user + `tickets.status = 'confirmed'` or at least one pledge for that event (ticket holders and donors only).

---

## 4. Endpoints the schema expects

| Method & path | Table(s) | Notes |
|---|---|---|
| `POST /api/auth/register` | `users` | validate email domain, set `verification_code`, `is_verified=0` |
| `POST /api/auth/verify` | `users` | match code → `is_verified=1`, `verified_at=NOW()` |
| `GET /api/events` | `events` + `categories` | exists ✅ (add filters: type, free/paid, keyword, lat/lng bounds) |
| `POST /api/events` | `events` | allow `event_type`, lat/lng, deadline; fundraiser requires `goal_amount` (400 if missing, else 500 from CHECK) |
| `PUT /api/events/:id` | `events` | organizer only; same fundraiser rule on UPDATE |
| `POST /api/events/:id/tickets` | `tickets` + `events` | **transaction pattern §2**; body `{ attendees: [student emails] }` (1–4) → 201 + one UUID per attendee; decrements `available_tickets`; 409 when full/already held; 401/403 if unverified; receipts queued in the background |
| `DELETE /api/events/:id/ticket` | `tickets` + `events` | holder only; set `status='cancelled'` (do not DELETE) and restore one `available_tickets` seat |
| `POST /api/events/:id/pledge` | `pledges` | repeated allowed; 201 + reference code; `amount > 0` → 400 |
| `GET /api/events/:id/progress` | `pledges` | `SUM(amount)` vs `goal_amount` |
| `GET /api/events/:id/attendees` | `tickets` | organizer only, `status='confirmed'` |
| `POST /api/events/:id/messages` | `chat_messages` | chat-window middleware §3 + confirmed ticket required |
| `GET /api/events/:id/messages` | `chat_messages` | same window rules, `ORDER BY created_at` |
| `POST /api/events/:id/review` | `reviews` | attended only; duplicate → 409 (UNIQUE); rating 1–5 → 400 |
| `GET /api/me` (dashboard) | `tickets`, `events`, `pledges` | booked / created / donated views |
| email sends | `email_log` | after booking/donation: insert `type='booking'|'donation'` + `reference_code`; booking sends never block the response |

**HTTP status conventions (grading requirement):** 200 ok, 201 created, 400 validation, 401 unauthenticated, 403 unverified/forbidden, 404 missing, 409 conflict (full/duplicate), 500 unexpected.

---

## 5. Query cheat-sheet

```sql
-- Seats left: read the stored counter inside the booking transaction (FOR UPDATE, see §2)
SELECT capacity, available_tickets
FROM events WHERE id = ?;

-- Fundraiser progress
SELECT COALESCE(SUM(p.amount),0) AS raised, e.goal_amount
FROM events e LEFT JOIN pledges p ON p.event_id = e.id
WHERE e.id = ? GROUP BY e.id;

-- Donor leaderboard
SELECT u.name, SUM(p.amount) AS total FROM pledges p
JOIN users u ON u.id = p.user_id WHERE p.event_id = ?
GROUP BY p.user_id ORDER BY total DESC;

-- Student dashboard: booked events
SELECT e.title, t.status, t.ticket_code FROM tickets t
JOIN events e ON e.id = t.event_id WHERE t.user_id = ? ORDER BY e.event_date;
```

**Index note:** every column used in the WHERE/JOIN above is indexed (see `init.sql`) — no full scans at project scale.
