import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api/client.js'
import { fetchMyTickets } from '../api/events.js'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useNow } from '../hooks/useNow.js'
import { formatDateTime, getChatStatus } from '../utils/format.js'

function buildRooms(tickets, bookings, now) {
  const rooms = new Map()

  for (const ticket of tickets) {
    const event = ticket.event
    if (!event?.id) continue

    const id = String(event.id)
    const room = rooms.get(id) ?? {
      id,
      title: event.title,
      date: event.date,
      location: event.location ?? '',
      ticketCount: 0,
    }
    room.ticketCount += 1
    rooms.set(id, room)
  }

  for (const booking of bookings) {
    const id = String(booking.eventId)
    const room = rooms.get(id) ?? {
      id,
      title: booking.title,
      date: booking.date,
      location: booking.location ?? '',
      ticketCount: 0,
    }
    room.ticketCount += booking.quantity ?? 1
    rooms.set(id, room)
  }

  return [...rooms.values()]
    .map((room) => ({ ...room, chat: getChatStatus(room.date, now) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
      <path
        d="M5 5.75A2.75 2.75 0 0 1 7.75 3h9.5A2.75 2.75 0 0 1 20 5.75v6.5A2.75 2.75 0 0 1 17.25 15H11l-4.5 4v-4.25A2.75 2.75 0 0 1 5 12.25v-6.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 8h7M9 11.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function FloatingEventChat() {
  const { user, token } = useAuth()
  const { bookings } = useActivity()
  const now = useNow(30000)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [ticketResult, setTicketResult] = useState({ ownerKey: '', tickets: [], error: '' })
  const [messageResult, setMessageResult] = useState({ roomId: null, messages: [], error: '' })
  const [demoMessages, setDemoMessages] = useState({})
  const [messageText, setMessageText] = useState('')
  const ownerKey = user ? String(user.id ?? user.email) : ''

  useEffect(() => {
    if (!ownerKey || !token) return undefined

    let active = true
    fetchMyTickets()
      .then((loadedTickets) => {
        if (active) setTicketResult({ ownerKey, tickets: loadedTickets, error: '' })
      })
      .catch((error) => {
        if (active) {
          setTicketResult({
            ownerKey,
            tickets: [],
            error: `Unable to load your booked events: ${error.message}`,
          })
        }
      })

    return () => {
      active = false
    }
  }, [ownerKey, token])

  const currentTicketResult = ticketResult.ownerKey === ownerKey ? ticketResult : null
  const tickets = currentTicketResult?.tickets ?? []
  const roomError = currentTicketResult?.error ?? ''
  const loadingRooms = Boolean(ownerKey && token && !currentTicketResult)
  const rooms = buildRooms(tickets, bookings, now)
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null
  const chatRoomId = selectedRoom?.id
  const chatRoomState = selectedRoom?.chat.state
  const messageResultForRoom = messageResult.roomId === chatRoomId ? messageResult : null
  const remoteMessages = messageResultForRoom?.messages ?? []
  const conversationError = messageResultForRoom?.error ?? ''
  const loadingMessages = Boolean(
    isOpen && chatRoomId && chatRoomState === 'open' && /^\d+$/.test(chatRoomId) && !messageResultForRoom,
  )
  const visibleMessages = [
    ...remoteMessages,
    ...(selectedRoom ? demoMessages[selectedRoom.id] ?? [] : []),
  ]

  useEffect(() => {
    if (!isOpen || !chatRoomId || chatRoomState !== 'open' || !/^\d+$/.test(chatRoomId)) return undefined

    let active = true

    async function loadMessages() {
      try {
        const data = await apiGet(`/events/${encodeURIComponent(chatRoomId)}/messages`)
        if (active) setMessageResult({ roomId: chatRoomId, messages: data.messages ?? [], error: '' })
      } catch (error) {
        if (active) {
          setMessageResult((current) => ({
            roomId: chatRoomId,
            messages: current.roomId === chatRoomId ? current.messages : [],
            error: `Unable to load messages: ${error.message}`,
          }))
        }
      }
    }

    loadMessages()
    const timer = window.setInterval(loadMessages, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [isOpen, chatRoomId, chatRoomState])

  if (!user || !token) return null

  function sendMessage(formEvent) {
    formEvent.preventDefault()
    const content = messageText.trim()
    if (!selectedRoom || selectedRoom.chat.state !== 'open' || !content) return

    const message = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      user_name: user.name || 'You',
      created_at: new Date().toISOString(),
      is_demo: true,
    }
    setDemoMessages((current) => ({
      ...current,
      [selectedRoom.id]: [...(current[selectedRoom.id] ?? []), message],
    }))
    setMessageText('')
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 sm:bottom-6 sm:right-6">
      {isOpen && (
        <section
          aria-label="Event chat"
          className="absolute bottom-16 right-0 flex h-[min(34rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-line bg-paper shadow-2xl"
        >
          <header className="flex items-center gap-3 border-b border-line bg-white/80 px-4 py-3">
            {selectedRoom ? (
              <button
                type="button"
                aria-label="Back to event chats"
                className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-ink/5"
                onClick={() => setSelectedRoomId(null)}
              >
                <span aria-hidden="true">←</span>
              </button>
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sage text-teal">
                <ChatIcon />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{selectedRoom?.title ?? 'Event chats'}</h2>
              <p className="truncate text-xs text-muted">
                {selectedRoom
                  ? selectedRoom.chat.label
                  : `${rooms.length} event room${rooms.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close event chats"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
              onClick={() => setIsOpen(false)}
            >
              <span aria-hidden="true" className="text-xl leading-none">×</span>
            </button>
          </header>

          {!selectedRoom ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="px-2 pb-3 pt-1 text-xs text-muted">Chats for events you’ve joined</p>
              {loadingRooms && <p className="px-2 py-4 text-sm text-muted">Loading your event chats…</p>}
              {roomError && <p role="alert" className="px-2 py-3 text-sm text-accent">{roomError}</p>}
              {!loadingRooms && rooms.length === 0 && !roomError && (
                <div className="rounded-sm border border-dashed border-line p-5 text-center">
                  <p className="text-sm text-muted">You don’t have any event chats yet.</p>
                  <Link to="/events" onClick={() => setIsOpen(false)} className="mt-3 inline-block text-sm font-semibold text-accent">
                    Find an event
                  </Link>
                </div>
              )}
              <ul className="space-y-1">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-sm p-3 text-left transition-colors hover:bg-white/80"
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mist font-semibold text-ink">
                        {room.title.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{room.title}</span>
                        <span className="mt-1 block truncate text-xs text-muted">
                          {formatDateTime(room.date)} · {room.ticketCount} ticket{room.ticketCount === 1 ? '' : 's'}
                        </span>
                        <span className={`mt-1 block truncate text-xs ${room.chat.state === 'open' ? 'text-teal' : 'text-muted'}`}>
                          {room.chat.label}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-lg text-muted">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                <div className="text-center">
                  <Link
                    to={`/events/${selectedRoom.id}`}
                    onClick={() => setIsOpen(false)}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    View event
                  </Link>
                  <p className="mt-1 text-xs text-muted">{selectedRoom.location}</p>
                </div>

                {selectedRoom.chat.state === 'locked' && (
                  <p className="rounded-sm bg-ink/5 p-3 text-center text-sm text-muted">
                    This room is locked. {selectedRoom.chat.label}.
                  </p>
                )}
                {selectedRoom.chat.state === 'closed' && (
                  <p className="rounded-sm bg-ink/5 p-3 text-center text-sm text-muted">This event chat is closed.</p>
                )}
                {loadingMessages && <p className="text-center text-xs text-muted">Loading messages…</p>}
                {conversationError && <p role="alert" className="rounded-sm bg-accent/10 p-2 text-xs text-accent">{conversationError}</p>}
                {!loadingMessages && visibleMessages.length === 0 && selectedRoom.chat.state === 'open' && (
                  <p className="pt-8 text-center text-sm text-muted">No messages yet. Say hello to the group.</p>
                )}
                {visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
                      message.is_demo ? 'ml-auto bg-ink text-paper' : 'mr-auto bg-white'
                    }`}
                  >
                    {!message.is_demo && <p className="mb-1 text-xs font-semibold text-teal">{message.user_name || 'Student'}</p>}
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    {message.is_demo && <p className="mt-1 text-[10px] text-paper/70">Demo message · only visible here</p>}
                  </div>
                ))}
              </div>

              {selectedRoom.chat.state === 'open' ? (
                <form onSubmit={sendMessage} className="border-t border-line bg-white/80 p-3">
                  <label className="sr-only" htmlFor="event-chat-message">Write a message</label>
                  <div className="flex items-end gap-2">
                    <textarea
                      id="event-chat-message"
                      className="input max-h-24 min-h-11 resize-y"
                      rows={1}
                      maxLength={1000}
                      placeholder="Message this event group…"
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                    />
                    <button type="submit" className="btn btn-accent shrink-0 px-3 py-2.5" disabled={!messageText.trim()}>
                      Send
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-muted">Demo messages are only visible in this browser session.</p>
                </form>
              ) : (
                <div className="border-t border-line bg-white/80 p-4 text-center text-xs text-muted">
                  Messaging is unavailable while this room is {selectedRoom.chat.state}.
                </div>
              )}
            </>
          )}
        </section>
      )}

      <button
        type="button"
        aria-label={isOpen ? 'Close event chats' : 'Open event chats'}
        aria-expanded={isOpen}
        className="grid size-14 place-items-center rounded-full bg-ink text-paper shadow-lg transition-transform hover:scale-105 hover:bg-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <span aria-hidden="true" className="text-2xl leading-none">×</span> : <ChatIcon />}
      </button>
    </div>
  )
}
