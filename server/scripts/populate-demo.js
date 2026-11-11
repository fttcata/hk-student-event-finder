// Seeds the database with realistic Hong Kong university events for the live demo.
//
//   npm run db:populate-demo             add anything still missing (safe to rerun)
//   npm run db:populate-demo -- --reset  delete the demo events, then seed with fresh dates
//
// A normal run never duplicates rows: events are looked up by title and bookings by the
// UNIQUE(user_id, event_id) ticket key. It expects the schema from database/init.sql and the
// five categories that file seeds.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { pool } from '../config/db.js'

const DEMO_PASSWORD = 'Demo1234!'
const RESET = process.argv.includes('--reset')
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000
const STUDENT_COUNT = 160

// ---------------------------------------------------------------- dates

// Builds the UTC instant for a Hong Kong wall-clock time, `daysAhead` days from today.
function hkTime(daysAhead, hour, minute = 0) {
  const hkNow = new Date(Date.now() + HKT_OFFSET_MS)
  const hkMidnight = Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate())
  return new Date(hkMidnight + daysAhead * 86400000 + hour * 3600000 + minute * 60000 - HKT_OFFSET_MS)
}

// Rounded up to the next half hour so the event is always at least `hours` away and the
// 6-hour chat window has already opened.
function hoursFromNow(hours) {
  const target = Date.now() + hours * 3600000
  return new Date(Math.ceil(target / 1800000) * 1800000)
}

// The API always sets the deadline two hours before the start (see routes/events.js).
function registrationDeadline(start) {
  return new Date(start.getTime() - 2 * 3600000)
}

// ---------------------------------------------------------------- accounts

// Demo logins must use an HKU/CUHK/PolyU domain because the client validates the email before
// it calls the API. The organizers below are ordinary verified accounts, not seeded placeholders.
const ORGANIZERS = [
  { email: 'hku.careers@connect.hku.hk', name: 'HKU Careers & Placement Office', university: 'HKU' },
  { email: 'hku.athletics@connect.hku.hk', name: 'HKU Athletics Club', university: 'HKU' },
  { email: 'hku.rotaract@connect.hku.hk', name: 'HKU Rotaract Club', university: 'HKU' },
  { email: 'cuhk.su@link.cuhk.edu.hk', name: 'CUHK Student Union', university: 'CUHK' },
  { email: 'cuhk.cats@link.cuhk.edu.hk', name: 'CUHK Cat Club', university: 'CUHK' },
  { email: 'polyu.music@connect.polyu.hk', name: 'PolyU Music Society', university: 'PolyU' },
  { email: 'polyu.design@connect.polyu.hk', name: 'PolyU Design Society', university: 'PolyU' },
  { email: 'polyu.entrepreneurs@connect.polyu.hk', name: 'PolyU Entrepreneurship Club', university: 'PolyU' },
]

const FIRST_NAMES = [
  'Alice', 'Brian', 'Chloe', 'Daniel', 'Emily', 'Felix', 'Grace', 'Hugo',
  'Iris', 'Jason', 'Karen', 'Leo', 'Mandy', 'Nathan', 'Olivia', 'Peter',
  'Queenie', 'Ryan', 'Sophie', 'Tommy', 'Vivian', 'Wilson', 'Yoyo', 'Zoe',
]

const LAST_NAMES = [
  'Chan', 'Lee', 'Wong', 'Cheung', 'Lam', 'Ho', 'Ng', 'Tam', 'Yip', 'Tsang', 'Lau', 'Kwok',
]

const UNIVERSITY_DOMAINS = {
  HKU: 'connect.hku.hk',
  CUHK: 'link.cuhk.edu.hk',
  PolyU: 'connect.polyu.hk',
}

const UNIVERSITIES = ['HKU', 'CUHK', 'PolyU']

// The demo student stays first so their dashboard holds a ticket for every standard event.
function buildStudents() {
  const students = [
    { email: 'demo.student@connect.hku.hk', name: 'Demo Student', university: 'HKU', studentId: '3035123456' },
  ]

  for (let index = 0; students.length < STUDENT_COUNT; index += 1) {
    const first = FIRST_NAMES[index % FIRST_NAMES.length]
    const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]
    const university = UNIVERSITIES[index % UNIVERSITIES.length]
    students.push({
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${UNIVERSITY_DOMAINS[university]}`,
      name: `${first} ${last}`,
      university,
      studentId: `S2026${String(index + 1).padStart(4, '0')}`,
    })
  }

  return students
}

// ---------------------------------------------------------------- events

const EVENTS = [
  {
    title: 'HKU Careers Fair 2026 — Graduate & Internship Expo',
    description:
      'Meet 60+ employers from banking, consulting, engineering and the public sector in one hall. The CV clinic runs all evening, company talks run every 20 minutes, and a free LinkedIn headshot booth is available. Open to HKU students and recent graduates — bring your student card.',
    category: 'Career',
    organizer: 'hku.careers@connect.hku.hk',
    location: 'Loke Yuen Yee Hall, HKU',
    address: '3 University Drive, Pok Fu Lam, Hong Kong',
    latitude: 22.2839,
    longitude: 114.134,
    startsInHours: 5,
    capacity: 150,
    price: 0,
    attendees: 118,
    imageUrl: 'https://picsum.photos/seed/hku-careers-fair/1200/800',
    chat: [
      { author: 'hku.careers@connect.hku.hk', content: 'Doors open at 5:30pm — bring your student card for check-in.' },
      { author: 'demo.student@connect.hku.hk', content: 'Will the CV clinic run all evening?' },
      { author: 'hku.careers@connect.hku.hk', content: 'Yes, drop in any time before 8pm. A printed copy of your CV helps.' },
      { author: 'alice.chan@connect.hku.hk', content: 'Any fintech employers attending this year?' },
      { author: 'hku.careers@connect.hku.hk', content: 'Twelve fintech booths confirmed, including two HKU spin-offs.' },
    ],
  },
  {
    title: 'HKU Harbour Night Run 2026',
    description:
      'A relaxed 5 km along the Central Harbourfront followed by stretching and snacks, plus a 2 km family route. All paces welcome; bag drop and water stations provided. Proceeds support the HKU Athletics Club travel fund.',
    category: 'Sports',
    organizer: 'hku.athletics@connect.hku.hk',
    location: 'Central Harbourfront Event Space',
    address: 'Lung Wo Road, Central, Hong Kong',
    latitude: 22.2852,
    longitude: 114.1612,
    daysAhead: 9,
    hour: 19,
    minute: 30,
    capacity: 200,
    price: 80,
    attendees: 148,
    imageUrl: 'https://picsum.photos/seed/hku-harbour-run/1200/800',
  },
  {
    title: 'Warm Winter Blanket Drive 2026',
    description:
      'We are buying blankets and winter packs for elderly residents in Sham Shui Po. Every dollar goes to supplies bought at cost through a partner NGO, and the delivery day is open to volunteers. Pledge any amount — repeated donations are welcome.',
    category: 'Charity',
    organizer: 'hku.rotaract@connect.hku.hk',
    location: 'Sun Yat-sen Place, HKU',
    address: 'Main Campus, Pok Fu Lam Road, Hong Kong',
    latitude: 22.2836,
    longitude: 114.1367,
    daysAhead: 18,
    hour: 10,
    minute: 0,
    goalAmount: 15000,
    pledges: [
      { amount: 100, count: 10 },
      { amount: 200, count: 8 },
      { amount: 500, count: 5 },
      { amount: 888, count: 4 },
      { amount: 1188, count: 1 },
    ],
    imageUrl: 'https://picsum.photos/seed/blanket-drive/1200/800',
  },
  {
    title: 'CUHK Marathon Fundraiser 2026',
    description:
      'Run the 10 km or gather a relay team for the 21 km route around Lake Ad Excellentiam. Collect pledges per kilometre or make a one-off donation; all funds go to the CUHK Student Union emergency grant for students facing sudden medical costs.',
    category: 'Charity',
    organizer: 'cuhk.su@link.cuhk.edu.hk',
    location: 'Lake Ad Excellentiam, CUHK',
    address: 'Central Avenue, CUHK, Sha Tin, Hong Kong',
    latitude: 22.4196,
    longitude: 114.2068,
    daysAhead: 26,
    hour: 7,
    minute: 30,
    goalAmount: 50000,
    pledges: [
      { amount: 100, count: 12 },
      { amount: 200, count: 14 },
      { amount: 500, count: 10 },
      { amount: 888, count: 8 },
      { amount: 1000, count: 6 },
      { amount: 2000, count: 4 },
    ],
    imageUrl: 'https://picsum.photos/seed/cuhk-marathon/1200/800',
  },
  {
    title: 'CUHK AI & Robotics Hackathon',
    description:
      'Twelve hours, four tracks and hardware on loan from the engineering faculty. Build a campus assistant, a warehouse robot demo or anything in between. Teams of up to four; beginners welcome at the morning bootcamp. Lunch and dinner provided.',
    category: 'Technology',
    organizer: 'cuhk.su@link.cuhk.edu.hk',
    location: 'Ho Sin Hang Engineering Building, CUHK',
    address: 'Central Avenue, CUHK, Sha Tin, Hong Kong',
    latitude: 22.4192,
    longitude: 114.206,
    daysAhead: 13,
    hour: 9,
    minute: 30,
    capacity: 100,
    price: 0,
    attendees: 76,
    imageUrl: 'https://picsum.photos/seed/cuhk-hackathon/1200/800',
  },
  {
    title: 'CUHK Inter-Hall Sports Day',
    description:
      'Track and field, basketball, badminton and the famous tug-of-war final. Register with your hall team or come and cheer — the opening parade starts at 9am sharp. Free entry for all CUHK students.',
    category: 'Sports',
    organizer: 'cuhk.su@link.cuhk.edu.hk',
    location: 'Peking Road Sports Field, CUHK',
    address: 'Peking Road, CUHK, Sha Tin, Hong Kong',
    latitude: 22.4166,
    longitude: 114.21,
    daysAhead: 7,
    hour: 9,
    minute: 0,
    capacity: 240,
    price: 0,
    attendees: 158,
    imageUrl: 'https://picsum.photos/seed/cuhk-sports-day/1200/800',
  },
  {
    title: 'Stray Cat Clinic Fund',
    description:
      'Funding vaccinations and neutering for the campus cat colony, run with a local vet clinic. The target covers one full clinic day and six months of food. Every pledge is listed on the wall of donors at the clinic.',
    category: 'Charity',
    organizer: 'cuhk.cats@link.cuhk.edu.hk',
    location: 'University Mall, CUHK',
    address: 'University Mall, CUHK, Sha Tin, Hong Kong',
    latitude: 22.418,
    longitude: 114.205,
    daysAhead: 21,
    hour: 13,
    minute: 0,
    goalAmount: 8000,
    pledges: [
      { amount: 50, count: 8 },
      { amount: 100, count: 6 },
      { amount: 200, count: 3 },
      { amount: 550, count: 1 },
    ],
    imageUrl: 'https://picsum.photos/seed/cat-clinic-fund/1200/800',
  },
  {
    title: 'PolyU Music Night 2026',
    description:
      'Six student bands, one stage and a late-night acoustic set in the courtyard. Doors at 7pm, first band at 7:30pm. Ticket includes one drink; all proceeds fund the society practice rooms.',
    category: 'Social',
    organizer: 'polyu.music@connect.polyu.hk',
    location: 'Shaw Auditorium, PolyU',
    address: '11 Yuk Choi Road, Hung Hom, Kowloon',
    latitude: 22.3036,
    longitude: 114.1797,
    daysAhead: 16,
    hour: 19,
    minute: 30,
    capacity: 180,
    price: 180,
    attendees: 152,
    imageUrl: 'https://picsum.photos/seed/polyu-music-night/1200/800',
  },
  {
    title: 'PolyU Design Portfolio Clinic',
    description:
      'Practical, one-to-one feedback for your next portfolio review from final-year design students and alumni. Each slot lasts 25 minutes and covers layout, storytelling and the interview walkthrough. Limited to 30 places.',
    category: 'Career',
    organizer: 'polyu.design@connect.polyu.hk',
    location: 'Jockey Club Innovation Tower, PolyU',
    address: '11 Yuk Choi Road, Hung Hom, Kowloon',
    latitude: 22.3053,
    longitude: 114.1794,
    daysAhead: 11,
    hour: 14,
    minute: 0,
    capacity: 30,
    price: 0,
    attendees: 30,
    imageUrl: 'https://picsum.photos/seed/polyu-portfolio-clinic/1200/800',
  },
  {
    title: 'PolyU Startup Pitch Night',
    description:
      'Ten student teams pitch to a panel of alumni investors and founders, followed by open networking. Come to pitch, to find a co-founder, or just to see what is being built on campus. Free entry, registration required.',
    category: 'Technology',
    organizer: 'polyu.entrepreneurs@connect.polyu.hk',
    location: 'PolyU InnoHub, Hung Hom',
    address: '11 Yuk Choi Road, Hung Hom, Kowloon',
    latitude: 22.305,
    longitude: 114.18,
    daysAhead: 23,
    hour: 18,
    minute: 30,
    capacity: 120,
    price: 0,
    attendees: 84,
    imageUrl: 'https://picsum.photos/seed/polyu-pitch-night/1200/800',
  },
]

const BOOKMARKED_EVENTS = ['PolyU Music Night 2026', 'CUHK Marathon Fundraiser 2026']

// ---------------------------------------------------------------- helpers

const PLEDGE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function pledgeReference() {
  const bytes = crypto.randomBytes(9)
  return `PLG${Array.from(bytes, (byte) => PLEDGE_ALPHABET[byte % PLEDGE_ALPHABET.length]).join('')}`
}

async function upsertUser(connection, { email, name, university, role, studentId }, passwordHash) {
  await connection.query(
    `INSERT INTO users
       (name, email, password_hash, role, student_id, university, is_verified, verification_code, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, TRUE, NULL, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       student_id = COALESCE(VALUES(student_id), student_id),
       university = VALUES(university),
       is_verified = TRUE,
       verification_code = NULL,
       verified_at = COALESCE(verified_at, CURRENT_TIMESTAMP)`,
    [name, email, passwordHash, role, studentId, university],
  )
  const [[row]] = await connection.query('SELECT id FROM users WHERE email = ?', [email])
  return row.id
}

async function insertTicket(connection, { userId, eventId, attendeeName, attendeeEmail, type, amountPaid }) {
  const [[existing]] = await connection.query(
    'SELECT id FROM tickets WHERE user_id = ? AND event_id = ? LIMIT 1',
    [userId, eventId],
  )
  if (existing) return null

  const ticketCode = crypto.randomUUID()
  await connection.query(
    `INSERT INTO tickets
       (user_id, purchased_by, event_id, attendee_name, attendee_email, type, status, ticket_code, amount_paid)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
    [userId, userId, eventId, attendeeName, attendeeEmail, type, ticketCode, amountPaid],
  )
  return ticketCode
}

async function logEmail(connection, userId, type, referenceCode) {
  await connection.query(
    `INSERT INTO email_log (user_id, type, reference_code, status) VALUES (?, ?, ?, 'sent')`,
    [userId, type, referenceCode],
  )
}

async function deleteDemoEvents(connection) {
  const titles = EVENTS.map((event) => event.title)
  const [events] = await connection.query(
    'SELECT id FROM events WHERE source IS NULL AND title IN (?)',
    [titles],
  )
  if (events.length === 0) return 0

  const eventIds = events.map((event) => event.id)
  const [tickets] = await connection.query('SELECT ticket_code FROM tickets WHERE event_id IN (?)', [eventIds])
  const [pledges] = await connection.query('SELECT reference_code FROM pledges WHERE event_id IN (?)', [eventIds])
  const references = [...tickets, ...pledges].map((row) => row.ticket_code ?? row.reference_code)

  // tickets/pledges are RESTRICT on the event FK, so receipts go first, then the events.
  if (references.length > 0) {
    await connection.query('DELETE FROM email_log WHERE reference_code IN (?)', [references])
  }
  await connection.query('DELETE FROM chat_messages WHERE event_id IN (?)', [eventIds])
  await connection.query('DELETE FROM reviews WHERE event_id IN (?)', [eventIds])
  await connection.query('DELETE FROM bookmarks WHERE event_id IN (?)', [eventIds])
  await connection.query('DELETE FROM tickets WHERE event_id IN (?)', [eventIds])
  await connection.query('DELETE FROM pledges WHERE event_id IN (?)', [eventIds])
  await connection.query('DELETE FROM events WHERE id IN (?)', [eventIds])
  return eventIds.length
}

// Past events cannot be booked any more, and the public listing has no date filter, so a reset
// hides them instead of leaving stale cards above the demo events. Their tickets and pledges stay.
async function cancelPastAppEvents(connection) {
  const [result] = await connection.query(
    `UPDATE events SET status = 'cancelled'
     WHERE source IS NULL AND status = 'published' AND event_date < UTC_TIMESTAMP()`,
  )
  return result.affectedRows
}

// ---------------------------------------------------------------- seed

async function seed(connection) {
  const [categoryRows] = await connection.query('SELECT id, name FROM categories')
  const categoryIds = new Map(categoryRows.map((row) => [row.name, row.id]))
  const missingCategories = [...new Set(EVENTS.map((event) => event.category))].filter(
    (name) => !categoryIds.has(name),
  )
  if (missingCategories.length > 0) {
    throw new Error(
      `Missing categories: ${missingCategories.join(', ')}. Recreate the database so database/init.sql seeds them.`,
    )
  }

  let removedEvents = 0
  let cancelledPastEvents = 0
  if (RESET) {
    removedEvents = await deleteDemoEvents(connection)
    cancelledPastEvents = await cancelPastAppEvents(connection)
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const userIds = new Map()

  for (const organizer of ORGANIZERS) {
    const id = await upsertUser(connection, { ...organizer, role: 'organizer', studentId: null }, passwordHash)
    userIds.set(organizer.email, id)
  }

  const students = buildStudents()
  if (students.length < STUDENT_COUNT) throw new Error('Not enough unique demo student names')

  for (const student of students) {
    const id = await upsertUser(connection, { ...student, role: 'student' }, passwordHash)
    userIds.set(student.email, id)
  }

  let eventsCreated = 0
  let eventsSkipped = 0
  let ticketsInserted = 0
  let pledgesInserted = 0
  let messagesInserted = 0
  const eventIdsByTitle = new Map()

  for (const event of EVENTS) {
    const [[existing]] = await connection.query('SELECT id FROM events WHERE title = ? LIMIT 1', [event.title])
    if (existing) {
      eventsSkipped += 1
      eventIdsByTitle.set(event.title, existing.id)
      continue
    }

    const organizerId = userIds.get(event.organizer)
    if (!organizerId) throw new Error(`Unknown organizer ${event.organizer}`)

    const start = event.startsInHours != null
      ? hoursFromNow(event.startsInHours)
      : hkTime(event.daysAhead, event.hour, event.minute)
    const deadline = registrationDeadline(start)
    const isFundraiser = event.goalAmount != null

    const [result] = await connection.query(
      `INSERT INTO events
         (title, description, category_id, organizer_id, location, address, latitude, longitude,
          event_date, registration_deadline, event_type, capacity, available_tickets, price, goal_amount,
          status, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      [
        event.title,
        event.description,
        categoryIds.get(event.category),
        organizerId,
        event.location,
        event.address,
        event.latitude,
        event.longitude,
        start,
        deadline,
        isFundraiser ? 'fundraiser' : 'standard',
        isFundraiser ? 0 : event.capacity,
        isFundraiser ? 0 : event.capacity,
        isFundraiser ? 0 : event.price,
        isFundraiser ? event.goalAmount : null,
        event.imageUrl,
      ],
    )
    const eventId = result.insertId
    eventIdsByTitle.set(event.title, eventId)
    eventsCreated += 1

    // Every organizer holds a free ticket to their own event; it does not take a seat.
    const organizerTicket = await insertTicket(connection, {
      userId: organizerId,
      eventId,
      attendeeName: ORGANIZERS.find((organizer) => organizer.email === event.organizer).name,
      attendeeEmail: event.organizer,
      type: 'free',
      amountPaid: 0,
    })
    if (organizerTicket) await logEmail(connection, organizerId, 'booking', organizerTicket)

    if (!isFundraiser) {
      const seats = Math.min(event.attendees, students.length)
      for (let index = 0; index < seats; index += 1) {
        const student = students[index]
        const ticketCode = await insertTicket(connection, {
          userId: userIds.get(student.email),
          eventId,
          attendeeName: student.name,
          attendeeEmail: student.email,
          type: event.price > 0 ? 'paid' : 'free',
          amountPaid: event.price,
        })
        if (!ticketCode) continue
        ticketsInserted += 1
        await logEmail(connection, userIds.get(student.email), 'booking', ticketCode)
      }

      await connection.query(
        `UPDATE events e
         SET e.available_tickets = GREATEST(
           e.capacity - (
             SELECT COUNT(*) FROM tickets t
             WHERE t.event_id = e.id AND t.status = 'confirmed' AND t.user_id <> e.organizer_id
           ),
           0
         )
         WHERE e.id = ?`,
        [eventId],
      )
    }

    if (isFundraiser && event.pledges) {
      let donorIndex = 0
      for (const bucket of event.pledges) {
        for (let count = 0; count < bucket.count; count += 1) {
          // The first donor of every fundraiser is the demo student, so their dashboard shows it.
          const donor = students[donorIndex % students.length]
          donorIndex += 1
          const referenceCode = pledgeReference()
          await connection.query(
            'INSERT INTO pledges (event_id, user_id, amount, reference_code) VALUES (?, ?, ?, ?)',
            [eventId, userIds.get(donor.email), bucket.amount, referenceCode],
          )
          pledgesInserted += 1
          await logEmail(connection, userIds.get(donor.email), 'donation', referenceCode)
        }
      }
    }

    if (event.chat) {
      for (const message of event.chat) {
        await connection.query(
          'INSERT INTO chat_messages (event_id, user_id, content) VALUES (?, ?, ?)',
          [eventId, userIds.get(message.author), message.content],
        )
        messagesInserted += 1
      }
    }
  }

  const demoStudentId = userIds.get('demo.student@connect.hku.hk')
  for (const title of BOOKMARKED_EVENTS) {
    const eventId = eventIdsByTitle.get(title)
    if (!eventId) continue
    await connection.query(
      'INSERT IGNORE INTO bookmarks (user_id, event_id) VALUES (?, ?)',
      [demoStudentId, eventId],
    )
  }

  const [[pledgeTotals]] = await connection.query(
    `SELECT COUNT(*) AS pledge_count, COALESCE(SUM(amount), 0) AS raised
     FROM pledges p JOIN events e ON e.id = p.event_id
     WHERE e.title IN (?)`,
    [EVENTS.filter((event) => event.goalAmount != null).map((event) => event.title)],
  )

  return {
    removedEvents,
    cancelledPastEvents,
    eventsCreated,
    eventsSkipped,
    ticketsInserted,
    pledgesInserted,
    messagesInserted,
    pledgeCount: pledgeTotals.pledge_count,
    raised: Number(pledgeTotals.raised),
    organizerCount: ORGANIZERS.length,
    studentCount: students.length,
  }
}

// ---------------------------------------------------------------- main

let connection
try {
  connection = await pool.getConnection()
  await connection.beginTransaction()
  const summary = await seed(connection)
  await connection.commit()

  console.log('Demo data ready:')
  if (summary.removedEvents > 0) console.log(`  removed ${summary.removedEvents} old demo event(s)`)
  if (summary.cancelledPastEvents > 0) {
    console.log(`  cancelled ${summary.cancelledPastEvents} past event(s) so the listing starts with upcoming ones`)
  }
  console.log(`  ${summary.organizerCount} organizer and ${summary.studentCount} student demo accounts`)
  console.log(`  ${summary.eventsCreated} event(s) created, ${summary.eventsSkipped} already present`)
  console.log(`  ${summary.ticketsInserted} ticket(s), ${summary.pledgesInserted} pledge(s), ${summary.messagesInserted} chat message(s)`)
  console.log(
    `  fundraisers: ${summary.pledgeCount} pledges totalling HK$${summary.raised.toFixed(2)}`,
  )
  console.log('')
  console.log('Sign in with (university domains only — the client rejects other emails):')
  console.log(`  demo.student@connect.hku.hk / ${DEMO_PASSWORD}   (student dashboard, tickets, pledge)`)
  console.log(`  hku.careers@connect.hku.hk  / ${DEMO_PASSWORD}   (organizer of the HKU Careers Fair)`)
  console.log('')
  console.log('Email delivery: Mailtrap sandbox SMTP. Restart the server after changing SMTP settings.')
  if (!RESET) console.log('Re-run with --reset to rebuild the demo events with fresh dates.')
} catch (error) {
  if (connection) await connection.rollback()
  console.error(`Demo data seeding failed: ${error.message}`)
  process.exitCode = 1
} finally {
  if (connection) connection.release()
  await pool.end()
}
