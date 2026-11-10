import { findEventStatus } from '../queries/events.js'
import { isChatMember } from '../queries/chat.js'

const CHAT_OPENS_BEFORE_MS = 6 * 60 * 60 * 1000
const CHAT_CLOSES_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export async function getChatAccess(user, eventId) {
  if (!user?.is_verified) {
    return { status: 403, error: 'Verify your student email before using the event chat' }
  }

  const event = await findEventStatus(eventId)
  if (!event) return { status: 404, error: 'Event not found' }

  if (!(await isChatMember(user.id, eventId))) {
    return { status: 403, error: 'Only ticket holders and donors can access the event chat' }
  }

  if (event.status === 'cancelled') {
    return { status: 403, error: 'This event has been cancelled' }
  }

  const now = Date.now()
  const startsAt = event.event_date.getTime()
  if (now < startsAt - CHAT_OPENS_BEFORE_MS) {
    return { status: 403, error: 'Chat opens 6 hours before the event' }
  }
  if (now > startsAt + CHAT_CLOSES_AFTER_MS) {
    return { status: 403, error: 'Chat has closed' }
  }

  return { status: 200, event }
}
