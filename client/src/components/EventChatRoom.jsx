import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiGet } from '../api/client.js'
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

  const chat = getChatStatus(event.date, now)
  const isOpen = chat.state === 'open'
  const userId = user?.id

  useEffect(() => {
    if (!isOpen || !userId) return undefined

    let active = true
    let timer
    const load = async () => {
      try {
        const data = await apiGet(`/events/${event.id}/messages`)
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
      {isOpen && user && accessNotice && <p className="mt-4 text-sm text-muted">{accessNotice}</p>}
      {isOpen && user && error && <p className="mt-3 text-sm text-accent">{error}</p>}
      {isOpen && user && !accessNotice && (
        <div className="mt-4 space-y-2">
          {messages.length ? (
            messages.map((message) => (
              <p key={message.id} className="rounded-sm bg-white/60 p-3 text-sm">
                <strong>{message.user_name || 'Student'}:</strong> {message.content}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted">No messages yet.</p>
          )}
        </div>
      )}
    </section>
  )
}
