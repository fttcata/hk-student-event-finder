import 'dotenv/config'
import { pool } from '../config/db.js'

async function getTicketColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets'`,
  )
  return new Set(rows.map((row) => row.COLUMN_NAME))
}

async function migrate() {
  let columns = await getTicketColumns()
  if (!columns.has('attendee_name')) {
    await pool.query('ALTER TABLE tickets ADD COLUMN attendee_name VARCHAR(120) NULL AFTER event_id')
  }
  if (!columns.has('attendee_email')) {
    await pool.query('ALTER TABLE tickets ADD COLUMN attendee_email VARCHAR(160) NULL AFTER attendee_name')
  }

  await pool.query(
    `UPDATE tickets t
     JOIN users u ON u.id = t.user_id
     SET t.attendee_name = COALESCE(NULLIF(t.attendee_name, ''), u.name),
         t.attendee_email = COALESCE(NULLIF(t.attendee_email, ''), u.email)
     WHERE t.attendee_name IS NULL OR t.attendee_name = ''
        OR t.attendee_email IS NULL OR t.attendee_email = ''`,
  )
  await pool.query(
    `ALTER TABLE tickets
       MODIFY attendee_name VARCHAR(120) NOT NULL,
       MODIFY attendee_email VARCHAR(160) NOT NULL`,
  )

  const [userIndexes] = await pool.query(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tickets'
       AND INDEX_NAME = 'idx_tickets_user'
     LIMIT 1`,
  )
  if (userIndexes.length === 0) {
    await pool.query('ALTER TABLE tickets ADD INDEX idx_tickets_user (user_id)')
  }

  const [indexes] = await pool.query(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tickets'
       AND INDEX_NAME = 'uq_tickets_user_event'
     LIMIT 1`,
  )
  if (indexes.length > 0) {
    await pool.query('ALTER TABLE tickets DROP INDEX uq_tickets_user_event')
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
