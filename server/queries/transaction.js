import { pool } from '../config/db.js'

// Runs handler(connection) in a transaction; it returns { status, body } for an early
// (rolled-back) response, or nothing to commit.
export async function withTransaction(handler) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const earlyResponse = await handler(connection)
    if (earlyResponse) {
      await connection.rollback()
      return earlyResponse
    }
    await connection.commit()
    return null
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
