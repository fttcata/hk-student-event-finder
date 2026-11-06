import 'dotenv/config'
import { pool } from '../config/db.js'

async function getTicketColumns() {
  const [rows] = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'tickets'`,
  )
  return new Set(rows.map((row) => row.column_name))
}

async function migrate() {
  const columns = await getTicketColumns()
  if (!columns.has('attendee_name')) {
    await pool.query('ALTER TABLE tickets ADD COLUMN attendee_name VARCHAR(120) NULL')
  }
  if (!columns.has('attendee_email')) {
    await pool.query('ALTER TABLE tickets ADD COLUMN attendee_email VARCHAR(160) NULL')
  }

  await pool.query(
    `UPDATE tickets t
     SET attendee_name = COALESCE(NULLIF(t.attendee_name, ''), u.name),
         attendee_email = COALESCE(NULLIF(t.attendee_email, ''), u.email)
     FROM users u
     WHERE u.id = t.user_id
       AND (t.attendee_name IS NULL OR t.attendee_name = ''
        OR t.attendee_email IS NULL OR t.attendee_email = '')`,
  )
  await pool.query(
    `ALTER TABLE tickets
       ALTER COLUMN attendee_name SET NOT NULL,
       ALTER COLUMN attendee_email SET NOT NULL`,
  )

  const [userIndexes] = await pool.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = current_schema()
       AND tablename = 'tickets'
       AND indexname = 'idx_tickets_user'
     LIMIT 1`,
  )
  if (userIndexes.length === 0) {
    await pool.query('CREATE INDEX idx_tickets_user ON tickets (user_id)')
  }

  const [indexes] = await pool.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = current_schema()
       AND tablename = 'tickets'
       AND indexname = 'uq_tickets_user_event'
     LIMIT 1`,
  )
  if (indexes.length > 0) {
    await pool.query('ALTER TABLE tickets DROP CONSTRAINT uq_tickets_user_event')
  }

  console.log('Ticket attendee fields are ready; existing tickets were backfilled from purchaser accounts.')
}

try {
  await migrate()
} catch (error) {
  console.error(`Ticket attendee migration failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
