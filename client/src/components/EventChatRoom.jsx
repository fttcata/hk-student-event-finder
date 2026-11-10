import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiGet, apiPost } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useEventChat } from '../hooks/useEventChat.js'
import { useNow } from '../hooks/useNow.js'
import { getChatStatus } from '../utils/format.js'

export default function EventChatRoom({ event }) {
  const { user } = useAuth()
  const location = useLocation()
  const now = useNow()
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [accessNotice, setAccessNotice] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)

  const chat = getChatStatus(event.date, now)
  const isOpen = chat.state === 'open'
  const { messages, loading, error, canChat, sending, sendMessage } = useEventChat(event.id, {
    enabled: isOpen && Boolean(user),
  })

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault()
    const content = messageText.trim()
    if (!content || sending) return

    let active = true
    let timer
    const load = async () => {
      try {
        const data = await apiGet(`/events/${encodeURIComponent(event.id)}/messages`)
        if (!active) return
        setMessages(data.messages || [])
        setError('')
      } catch (requestError) {
        if (!active) return
        if (requestError.status === 401 || requestError.status === 403) {
          // Retrying cannot help: the booking and pledge panels close before the chat opens.
          clearInterval(timer)
          setAccessNotice(requestError.message)
        } else {
          setError(requestError.message)
        }
      }
    }
    timer = setInterval(load, POLL_INTERVAL_MS)
    load()
    return () => {
      active = false
      clearInterval(timer)
    }
  }

  async function sendMessage(formEvent) {
    formEvent.preventDefault()
    const content = messageText.trim()
    if (!content || sending) return

    setSending(true)
    setError('')
    try {
      const data = await apiPost(`/events/${encodeURIComponent(event.id)}/messages`, { content })
      setMessages((current) => [...current, data.message])
      setMessageText('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="panel mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow">Event chat</h2>
        <div className="flex items-center gap-2">
          <span className="badge">{chat.label}</span>
          {isOpen && (
            <button
              type="button"
              className="btn btn-accent px-3 py-2"
              onClick={() => setChatExpanded((expanded) => !expanded)}
              aria-expanded={chatExpanded}
            >
              {chatExpanded ? 'Close chat' : 'Open chat'}
            </button>
          )}
        </div>
      </div>
      {isOpen && !user && (
        <p className="mt-4 text-sm text-muted">
          <Link to="/login" state={{ from: location.pathname }} className="btn btn-accent mt-2 inline-flex">
            Log in to chat
          </Link>
        </p>
      )}
      {isOpen && !user && (
        <p className="text-sm text-muted">Chat is open to ticket holders and donors.</p>
      )}
      {isOpen && user && chatExpanded && accessNotice && <p className="mt-4 text-sm text-muted">{accessNotice}</p>}
      {isOpen && user && chatExpanded && error && <p className="mt-3 text-sm text-accent">{error}</p>}
      {isOpen && user && chatExpanded && !accessNotice && (
        <>
          <div className="mt-4 space-y-2">
            {messages.length ? messages.map((message) => (
              <p key={message.id} className="rounded-sm bg-white/60 p-3 text-sm">
                <strong>{message.user_id === user.id ? 'You' : message.user_name || 'Student'}:</strong>{' '}
                <span className="whitespace-pre-wrap break-words">{message.content}</span>
              </p>
            ))}
            {!loading && messages.length === 0 && !error && (
              <p className="text-sm text-muted">No messages yet.</p>
            )}
          </div>
          {canChat && (
            <form onSubmit={handleSubmit} className="mt-4">
              <label className="sr-only" htmlFor="event-chat-room-message">Write a message</label>
              <div className="flex items-end gap-2">
                <textarea
                  id="event-chat-room-message"
                  className="input max-h-24 min-h-11 flex-1 resize-y"
                  rows={1}
                  maxLength={1000}
                  placeholder="Message this event group…"
                  value={messageText}
                  onChange={(changeEvent) => setMessageText(changeEvent.target.value)}
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="btn btn-accent shrink-0 px-3 py-2.5"
                  disabled={!messageText.trim() || sending}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-muted">
                Messages are visible to this event’s ticket holders and donors.
              </p>
            )) : <p className="text-sm text-muted">No messages yet.</p>}
          </div>
          <form className="mt-4 flex gap-2" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="event-chat-message">Write a message</label>
            <input
              id="event-chat-message"
              className="input"
              maxLength={1000}
              placeholder="Message this event group…"
              value={messageText}
              onChange={(formEvent) => setMessageText(formEvent.target.value)}
            />
            <button type="submit" className="btn btn-accent shrink-0" disabled={sending || !messageText.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </section>
  )
}
