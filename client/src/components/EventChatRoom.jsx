import { useEffect, useState } from 'react'
import { apiGet } from '../api/client.js'
import { useNow } from '../hooks/useNow.js'
import { formatDateTime, formatTimeLeft, getChatStatus } from '../utils/format.js'

const POLL_INTERVAL = 4000

function ChatStatusBanner({ eventDate, now }) {
  const status = getChatStatus(eventDate, now)

  if (status.state === 'locked') {
    const opensAt = new Date(eventDate).getTime() - 6 * 60 * 60 * 1000
    return (
      <div className="rounded-sm bg-ink/5 px-4 py-3 text-sm text-muted" role="status">
        Chat opens 6 hours before the event · opens in {formatTimeLeft(opensAt - now)}
      </div>
    )
  }

  if (status.state === 'open') {
    return (
      <div className="rounded-sm bg-leaf/20 px-4 py-3 text-sm font-semibold text-teal" role="status">
        Active Chat
      </div>
    )
  }

  return (
    <div className="rounded-sm bg-ink/5 px-4 py-3 text-sm text-muted" role="status">
      Chat Closed
    </div>
  )
}

export default function EventChatRoom({ event, hasTicket }) {
  const now = useNow(1000)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const chatStatus = getChatStatus(event.date, now)
  const isPolling = chatStatus.state === 'open' && hasTicket

  useEffect(() => {
    if (!isPolling) return undefined

    const controller = new AbortController()
    let timeoutId
    let isFirstRequest = true

    async function pollMessages() {
      if (isFirstRequest) setLoading(true)

      try {
        const data = await apiGet(`/events/${encodeURIComponent(event.id)}/messages`, {
          signal: controller.signal,
        })
        if (!Array.isArray(data.messages)) {
          throw new Error('The chat service returned an invalid message list.')
        }
        setMessages(data.messages)
        setError('')
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message || 'Unable to refresh chat messages.')
        }
      } finally {
        isFirstRequest = false
        if (!controller.signal.aborted) {
          setLoading(false)
          timeoutId = window.setTimeout(pollMessages, POLL_INTERVAL)
        }
      }
    }

    pollMessages()
    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [event.id, isPolling])

  return (
    <section className="panel mt-10 space-y-4" aria-labelledby="event-chat-heading">
      <div>
        <p className="eyebrow">Event chat</p>
        <h2 id="event-chat-heading" className="display mt-2 text-3xl">Coordinate with attendees.</h2>
      </div>

      <ChatStatusBanner eventDate={event.date} now={now} />

      {chatStatus.state === 'open' && !hasTicket ? (
        <p className="text-sm text-muted">Active chat is available to booked ticket holders.</p>
      ) : chatStatus.state === 'open' ? (
        <div className="space-y-3" aria-live="polite">
          {loading && messages.length === 0 && <p className="text-sm text-muted">Loading chat messages…</p>}
          {error && (
            <p className="rounded-sm bg-accent/10 px-4 py-3 text-sm text-accent" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && messages.length === 0 && (
            <p className="text-sm text-muted">No messages yet. Check back shortly.</p>
          )}
          {messages.length > 0 && (
            <ol className="max-h-96 space-y-3 overflow-y-auto" aria-label="Chat messages">
              {messages.map((message) => (
                <li key={message.id} className="rounded-sm border border-line bg-white/60 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {message.author ?? message.name ?? message.user_name ?? 'Attendee'}
                    </span>
                    <time
                      className="font-mono text-xs text-muted"
                      dateTime={message.createdAt ?? message.created_at}
                    >
                      {formatDateTime(message.createdAt ?? message.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{message.content}</p>
                </li>
              ))}
            </ol>
          )}
          <p className="text-right font-mono text-[11px] text-muted">Refreshes every 4 seconds</p>
        </div>
      ) : null}
    </section>
  )
}
