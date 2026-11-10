import { Server } from 'socket.io'
import { authenticateToken } from '../middleware/auth.js'
import { getChatAccess } from '../utils/chatAccess.js'

let io = null

function roomFor(eventId) {
  return `event:${eventId}`
}

function reply(callback, payload) {
  if (typeof callback === 'function') callback(payload)
}

function parseEventId(payload) {
  const eventId = Number(payload?.eventId)
  return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null
}

export function attachChatServer(httpServer) {
  io = new Server(httpServer, { path: '/socket.io' })

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : ''
    try {
      const { user, error } = await authenticateToken(token)
      if (error) return next(new Error(error))
      socket.data.token = token
      socket.data.user = user
      return next()
    } catch (error) {
      console.error(`Chat socket authentication failed: ${error.message}`)
      return next(new Error('Authentication failed'))
    }
  })

  io.on('connection', (socket) => {
    socket.on('chat:join', async (payload, callback) => {
      const eventId = parseEventId(payload)
      if (eventId === null) {
        return reply(callback, { ok: false, status: 404, error: 'Event not found' })
      }

      try {
        const { user, error: authError } = await authenticateToken(socket.data.token)
        if (authError) {
          return reply(callback, { ok: false, status: 401, error: authError })
        }
        socket.data.user = user

        const access = await getChatAccess(user, eventId)
        if (access.error) {
          return reply(callback, { ok: false, status: access.status, error: access.error })
        }

        await socket.join(roomFor(eventId))
        return reply(callback, { ok: true })
      } catch (error) {
        console.error(`Chat socket join failed for event ${eventId}: ${error.message}`)
        return reply(callback, { ok: false, status: 500, error: 'Unable to join the event chat' })
      }
    })

    socket.on('chat:leave', (payload) => {
      const eventId = parseEventId(payload)
      if (eventId !== null) socket.leave(roomFor(eventId))
    })
  })

  return io
}

export function broadcastChatMessage(eventId, message) {
  if (!io) return
  io.to(roomFor(eventId)).emit('chat:message', { event_id: Number(eventId), message })
}
