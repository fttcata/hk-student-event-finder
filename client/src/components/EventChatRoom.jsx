import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useEventChat } from '../hooks/useEventChat.js'
import { useNow } from '../hooks/useNow.js'
import { getChatStatus } from '../utils/format.js'

export default function EventChatRoom({ event }) {
  const { user } = useAuth()
  const location = useLocation()
  const now = useNow()
  const [messageText, setMessageText] = useState('')

  const chat = getChatStatus(event.date, now)
  const isOpen = chat.state === 'open'
  const { messages, loading, error, canChat, sending, sendMessage } = useEventChat(event.id, {
    enabled: isOpen && Boolean(user),
  })

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault()
    const content = messageText.trim()
    if (!content || sending) return

    try {
      const message = await sendMessage(content)
      if (message) setMessageText('')
    } catch {
      return
    }
  }

  return (
    <section className="panel mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow">Event chat</h2>
        <span className="badge">{chat.label}</span>
      </div>
      {isOpen && !user && (
        <p className="mt-4 text-sm text-muted">
          <Link to="/login" state={{ from: location.pathname }} className="underline hover:text-accent">
            Log in
          </Link>{' '}
          to read the chat. It is open to ticket holders and donors.
        </p>
      )}
      {isOpen && user && (
        <>
          {error && <p role="alert" className="mt-4 text-sm text-accent">{error}</p>}
          <div className="mt-4 space-y-2" aria-live="polite">
            {loading && messages.length === 0 && <p className="text-sm text-muted">Loading messages…</p>}
            {messages.map((message) => (
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
            </form>
          )}
        </>
      )}
    </section>
  )
}
