import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { getChatSocket } from '../realtime/chatSocket.js'

const MAX_MESSAGE_LENGTH = 1000

function sortMessages(messages) {
  return [...messages].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at) || Number(a.id) - Number(b.id),
  )
}

function mergeMessage(messages, message) {
  const index = messages.findIndex((item) => item.id === message.id)
  if (index === -1) return sortMessages([...messages, message])

  const next = [...messages]
  next[index] = message
  return sortMessages(next)
}

function mergeMessages(messages, incoming) {
  return incoming.reduce((current, message) => mergeMessage(current, message), messages)
}

export function useEventChat(eventId, { enabled = true } = {}) {
  const { token } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [canChat, setCanChat] = useState(false)
  const [sending, setSending] = useState(false)
  const numericEventId = Number(eventId)
  const isValidEventId = Number.isSafeInteger(numericEventId) && numericEventId > 0

  useEffect(() => {
    if (!enabled || !token || !isValidEventId) {
      setMessages([])
      setLoading(false)
      setError('')
      setConnected(false)
      setCanChat(false)
      return undefined
    }

    let active = true
    const socket = getChatSocket(token)
    if (!socket) return undefined

    setMessages([])
    setLoading(true)
    setError('')
    setConnected(socket.connected)
    setCanChat(false)

    async function loadHistory() {
      try {
        const data = await apiGet(`/events/${numericEventId}/messages`)
        if (active) setMessages((current) => mergeMessages(current, data.messages ?? []))
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    function joinRoom() {
      socket.emit('chat:join', { eventId: numericEventId }, (result) => {
        if (!active) return
        if (!result?.ok) {
          setConnected(false)
          setCanChat(false)
          setLoading(false)
          setError(result?.error || 'Unable to join the event chat')
          return
        }

        setConnected(true)
        setCanChat(true)
        setError('')
        void loadHistory()
      })
    }

    function handleMessage(payload) {
      if (!active || Number(payload?.event_id) !== numericEventId || !payload.message) return
      setMessages((current) => mergeMessage(current, payload.message))
    }

    function handleConnect() {
      setConnected(true)
      joinRoom()
    }

    function handleDisconnect() {
      setConnected(false)
    }

    function handleConnectError(connectError) {
      if (!active) return
      setConnected(false)
      setLoading(false)
      setError(`Live chat unavailable: ${connectError.message}`)
    }

    socket.on('chat:message', handleMessage)
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)

    if (socket.connected) joinRoom()
    else socket.connect()

    return () => {
      active = false
      socket.off('chat:message', handleMessage)
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
    }
  }, [enabled, isValidEventId, numericEventId, token])

  const sendMessage = useCallback(
    async (content) => {
      const trimmed = content.trim()
      if (!enabled || !isValidEventId || !trimmed) return null

      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        const message = `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters`
        setError(message)
        throw new Error(message)
      }

      setSending(true)
      setError('')
      try {
        const data = await apiPost(`/events/${numericEventId}/messages`, { content: trimmed })
        if (data.message) setMessages((current) => mergeMessage(current, data.message))
        return data.message
      } catch (requestError) {
        setError(requestError.message)
        throw requestError
      } finally {
        setSending(false)
      }
    },
    [enabled, isValidEventId, numericEventId],
  )

  return { messages, loading, error, connected, canChat, sending, sendMessage }
}
