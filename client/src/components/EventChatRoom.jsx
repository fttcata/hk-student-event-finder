import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiGet, apiPost } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useNow } from '../hooks/useNow.js'
import { getChatStatus } from '../utils/format.js'

const POLL_INTERVAL_MS = 4000

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
  const userId = user?.id

  useEffect(() => {
    if (!isOpen || !userId) return undefined

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
  }, [event.id, isOpen, userId])

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
                <strong>{message.user_name || 'Student'}:</strong> {message.content}
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
