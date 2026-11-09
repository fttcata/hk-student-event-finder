import { io } from 'socket.io-client'

let socket = null
let currentToken = ''

export function getChatSocket(token) {
  if (!token) return null

  if (!socket) {
    socket = io({
      autoConnect: false,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    })
  }

  if (currentToken !== token) {
    currentToken = token
    socket.auth = { token }
    if (socket.connected) socket.disconnect()
  }

  if (!socket.connected) socket.connect()
  return socket
}

export function disconnectChatSocket() {
  if (socket) socket.disconnect()
  socket = null
  currentToken = ''
}
