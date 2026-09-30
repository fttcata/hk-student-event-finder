# Backend Handoff — Database Design Decisions & Required Patterns

**From:** Louis (Database Architecture, Core Querying, Data Integrity)
**For:** Gaspar (API/middleware), Masud & Anson (client), Cata (merge/review)
**Branch:** `feature/schema_extension` — applies to all 9-table schema in `database/init.sql`

> One-time setup for everyone: `docker compose down -v` (MySQL only runs `init.sql` on a fresh volume).

---

## 1. Schema decisions the API must respect

| Decision | Rule | Why |
|---|---|---|
| Seat ownership | A seat exists only while `tickets.status = 'confirmed'`. `cancelled` releases the seat but keeps the receipt row. | Proposal: capacity enforcement + receipt lookups after cancellation |
| Ticket uniqueness | `UNIQUE(user_id, event_id)` — one ticket row per user per event. Rebooking = **UPDATE** the row (`cancelled → confirmed`), never a second INSERT. | Verified: round-trip update works; a second INSERT fails with 1062 |
| Receipts | `reference_code` is UNIQUE in both `tickets` and `pledges`. Generate server-side (e.g. `TKT`/`PLG` + random), return in every booking/donation response. | Proposal: receipts with unique verification code |
| Repeat donations | `pledges` has **no** unique on `(user_id, event_id)` — students may pledge many times. Don't add one. | Team decision (Option B): repeat giving is realistic for fundraisers |
| Fundraiser progress | Always compute live: `SELECT COALESCE(SUM(amount),0) FROM pledges WHERE event_id = ?`. Never store a running total. | No stale counters; verified SUM = 350 on seed data |
| Fundraiser rows | A row with `event_type = 'fundraiser'` **must** have `goal_amount` (CHECK enforced, error 3819 — on INSERT *and* UPDATE). Standard events: `goal_amount = NULL`. | Schema integrity |
| Ratings | `reviews.rating` must be 1–5 (CHECK), one review per user per event (UNIQUE). | Proposal: ratings for completed events |
| Verification | `users.is_verified = TRUE` required before booking/donating/creating events/chatting (proposal: university-domain signup). `verification_code` holds the pending code. | Proposal must-have |
| Enums | Invalid enum values are **rejected** (error 1265, strict mode). Validate in Express too so users get a 400, not a 500. | Verified on `users.university` |

---

## 2. Required pattern: race-free capacity booking (CRITICAL)

Two students booking the last seat at the same time **will overbook** if the code counts seats before inserting without a lock. Each INSERT looks valid individually — no constraint catches it. Use a transaction:

```js
// POST /api/events/:id/book
const conn = await pool.getConnection()
try {
  await conn.beginTransaction()

  // 1. Lock the event row — concurrent bookings now queue up
  const [[event]] = await conn.query(
    'SELECT capacity, price FROM events WHERE id = ? FOR UPDATE',
    [eventId],
  )

  // 2. Count confirmed seats (locks held until COMMIT)
  const [[{ n }]] = await conn.query(
    "SELECT COUNT(*) AS n FROM tickets WHERE event_id = ? AND status = 'confirmed'",
    [eventId],
  )
  if (event.capacity > 0 && n >= event.capacity) {
    await conn.rollback()
    return response.status(409).json({ error: 'Event is full' })
  }

  // 3. Insert with fresh reference code (unique violation -> retry/409)
  const code = 'TKT' + crypto.randomBytes(6).toString('hex').toUpperCase()
  await conn.query(
    `INSERT INTO tickets (user_id, event_id, type, status, reference_code, amount_paid)
     VALUES (?, ?, ?, 'confirmed', ?, ?)`,
    [userId, eventId, event.price > 0 ? 'paid' : 'free', code, event.price],
  )

  await conn.commit()
  return response.status(201).json({ reference_code: code })
} catch (err) {
  await conn.rollback()
  throw err
} finally {
  conn.release()
}
```

Same shape applies to pledges (no capacity check, just INSERT + `SUM` refresh).

**Why:** verified the schema can't prevent overbooking — `capacity` is just a number, each INSERT is individually valid. The lock (`FOR UPDATE`) is the fix.

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

Also require: authenticated user + `tickets.status = 'confirmed'` for that event (verified ticket holders only).

---

## 4. Endpoints the schema expects

| Method & path | Table(s) | Notes |
|---|---|---|
| `POST /api/auth/register` | `users` | validate email domain, set `verification_code`, `is_verified=0` |
| `POST /api/auth/verify` | `users` | match code → `is_verified=1`, `verified_at=NOW()` |
| `GET /api/events` | `events` + `categories` | exists ✅ (add filters: type, free/paid, keyword, lat/lng bounds) |
| `POST /api/events` | `events` | allow `event_type`, lat/lng, deadline; fundraiser requires `goal_amount` (400 if missing, else 500 from CHECK) |
| `PUT /api/events/:id` | `events` | organizer only; same fundraiser rule on UPDATE |
| `POST /api/events/:id/book` | `tickets` | **transaction pattern §2** → 201 + reference code; 409 when full; 401/403 if unverified |
| `DELETE /api/events/:id/ticket` | `tickets` | set `status='cancelled'` (do not DELETE) |
| `POST /api/events/:id/pledge` | `pledges` | repeated allowed; 201 + reference code; `amount > 0` → 400 |
| `GET /api/events/:id/progress` | `pledges` | `SUM(amount)` vs `goal_amount` |
| `GET /api/events/:id/attendees` | `tickets` | organizer only, `status='confirmed'` |
| `POST /api/events/:id/messages` | `chat_messages` | chat-window middleware §3 + confirmed ticket required |
| `GET /api/events/:id/messages` | `chat_messages` | same window rules, `ORDER BY created_at` |
| `POST /api/events/:id/review` | `reviews` | attended only; duplicate → 409 (UNIQUE); rating 1–5 → 400 |
| `GET /api/me` (dashboard) | `tickets`, `events`, `pledges` | booked / created / donated views |
| email sends | `email_log` | after booking/donation: insert `type='booking'|'donation'` + `reference_code` |

**HTTP status conventions (grading requirement):** 200 ok, 201 created, 400 validation, 401 unauthenticated, 403 unverified/forbidden, 404 missing, 409 conflict (full/duplicate), 500 unexpected.

---

## 5. Query cheat-sheet

```sql
-- Seats left (race-free version needs FOR UPDATE, see §2)
SELECT capacity - COUNT(*) AS seats_left
FROM events e LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'confirmed'
WHERE e.id = ? GROUP BY e.id;

-- Fundraiser progress
SELECT COALESCE(SUM(p.amount),0) AS raised, e.goal_amount
FROM events e LEFT JOIN pledges p ON p.event_id = e.id
WHERE e.id = ? GROUP BY e.id;

-- Donor leaderboard
SELECT u.name, SUM(p.amount) AS total FROM pledges p
JOIN users u ON u.id = p.user_id WHERE p.event_id = ?
GROUP BY p.user_id ORDER BY total DESC;

-- Student dashboard: booked events
SELECT e.title, t.status, t.reference_code FROM tickets t
JOIN events e ON e.id = t.event_id WHERE t.user_id = ? ORDER BY e.event_date;
```

**Index note:** every column used in the WHERE/JOIN above is indexed (see `init.sql`) — no full scans at project scale.
