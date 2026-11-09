import { pool } from '../config/db.js'

// Chat members are holders of a confirmed ticket (organizers get one with their event) and donors.
export async function isChatMember(userId, eventId) {
  const [[{ member }]] = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM tickets WHERE user_id = ? AND event_id = ? AND status = 'confirmed')
         OR EXISTS (SELECT 1 FROM pledges WHERE user_id = ? AND event_id = ?) AS member`,
    [userId, eventId, userId, eventId],
  )
  return Boolean(member)
}

// created_at only has one-second precision, so id keeps same-second messages in send order.
export async function listEventMessages(eventId) {
  const [messages] = await pool.query(
    `SELECT m.id, m.user_id, u.name AS user_name, m.content, m.created_at
     FROM chat_messages m JOIN users u ON u.id = m.user_id
     WHERE m.event_id = ? ORDER BY m.created_at ASC, m.id ASC`,
    [eventId],
  )
  return messages
}

export async function insertEventMessage(eventId, userId, content) {
  const [inserted] = await pool.query(
    'INSERT INTO chat_messages (event_id, user_id, content) VALUES (?, ?, ?) RETURNING id',
    [eventId, userId, content],
  )
  const [[message]] = await pool.query(
    `SELECT m.id, m.user_id, u.name AS user_name, m.content, m.created_at
     FROM chat_messages m JOIN users u ON u.id = m.user_id
     WHERE m.id = ?`,
    [inserted[0].id],
  )
  return message
}
