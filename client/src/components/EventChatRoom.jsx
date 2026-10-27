import { useEffect, useState } from 'react'
import { apiGet } from '../api/client.js'

export default function EventChatRoom({ event }) {
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const deadline = new Date(event.date).getTime() - 6 * 60 * 60 * 1000
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (now < deadline || now >= new Date(event.date).getTime()) return undefined
    let active = true
    const load = () => apiGet(`/events/${event.id}/messages`).then((data) => active && setMessages(data.messages || [])).catch((requestError) => active && setError(requestError.message))
    load()
    const timer = setInterval(load, 4000)
    return () => { active = false; clearInterval(timer) }
  }, [event.id, event.date, deadline, now])
  const status = now < deadline ? 'Chat opens 6 hours before event' : now >= new Date(event.date).getTime() ? 'Chat Closed' : 'Active Chat'
  return <section className="panel mt-10"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="eyebrow">Event chat</h2><span className="badge">{status}</span></div>{error && <p className="mt-3 text-sm text-accent">{error}</p>}<div className="mt-4 space-y-2">{messages.length ? messages.map((message) => <p key={message.id} className="rounded-sm bg-white/60 p-3 text-sm"><strong>{message.user_name || 'Student'}:</strong> {message.content}</p>) : <p className="text-sm text-muted">No messages yet.</p>}</div></section>
}
