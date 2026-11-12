import 'dotenv/config'
import { pool } from '../config/db.js'

async function migrate() {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets' AND COLUMN_NAME = 'checked_in_at'
     LIMIT 1`,
  )

  if (columns.length === 0) {
    await pool.query('ALTER TABLE tickets ADD COLUMN checked_in_at DATETIME NULL AFTER created_at')
  }

  console.log('Ticket check-in field is ready.')
}

try {
  await migrate()
} catch (error) {
  console.error(`Ticket check-in migration failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
