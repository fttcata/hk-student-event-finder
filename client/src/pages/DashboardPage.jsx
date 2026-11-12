import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { deleteEvent as deleteApiEvent, fetchMyEvents, fetchMyPledges, fetchMyTickets } from '../api/events.js'
import EventCard from '../components/EventCard.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useEvents } from '../hooks/useEvents.js'
import { useNow } from '../hooks/useNow.js'
import { formatDate, formatDateTime, formatMoney, getChatStatus, getEventKind, KIND_LABELS } from '../utils/format.js'

const TABS = [
  ['tickets', 'My tickets'],
  ['pledges', 'My pledges'],
  ['events', 'My events'],
  ['saved', 'Saved'],
]

const CHAT_STYLES = {
  locked: 'bg-ink/5 text-muted',
  open: 'bg-leaf/20 text-teal',
  closed: 'bg-ink/5 text-muted line-through',
}

// The API returns one ticket row per attendee; map it onto the booking shape the tabs render.
function ticketToBooking(ticket) {
  return {
    reference: ticket.reference_code,
    eventId: String(ticket.event.id),
    title: ticket.event.title,
    date: ticket.event.date,
    location: ticket.event.location,
    quantity: 1,
    total: Number(ticket.amount_paid ?? 0),
    cancelled: ticket.status === 'cancelled' || ticket.event.status === 'cancelled',
  }
}

function apiPledgeToPledge(pledge) {
  return {
    reference: pledge.reference_code,
    eventId: String(pledge.event.id),
    title: pledge.event.title,
    amount: Number(pledge.amount),
    createdAt: pledge.created_at,
  }
}

// Loads the signed-in user's tickets, pledges and organised events from the API.
// Reloads after a checkout elsewhere in the app, or when `reload()` is called.
function useAccountActivity(token, enabled) {
  const [result, setResult] = useState({ token: null, status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled || !token) return undefined

    let active = true
    Promise.all([fetchMyTickets(), fetchMyPledges(), fetchMyEvents()])
      .then(([tickets, pledges, events]) => {
        if (!active) return
        setResult({
          token,
          status: 'ready',
          bookings: tickets.map(ticketToBooking),
          pledges: pledges.map(apiPledgeToPledge),
          events,
        })
      })
      .catch((error) => {
        if (active) setResult({ token, status: 'error', error: error.message })
      })

    return () => {
      active = false
    }
  }, [token, enabled, reloadKey])

  useEffect(() => {
    const reload = () => setReloadKey((key) => key + 1)
    window.addEventListener('campushub:ticket-booked', reload)
    return () => window.removeEventListener('campushub:ticket-booked', reload)
  }, [])

  const current = result.token === token ? result : { status: 'loading' }
  return { ...current, reload: () => setReloadKey((key) => key + 1) }
}

function EmptyState({ text, to, action }) {
  return (
    <div className="panel text-center">
      <p className="text-muted">{text}</p>
      <Link to={to} className="btn btn-dark mt-4">
        {action}
      </Link>
    </div>
  )
}

function TicketsTab({ bookings }) {
  const now = useNow(60000)
  if (bookings.length === 0) return <EmptyState text="You haven't booked anything yet." to="/events" action="Find an event" />

  return (
    <ul className="space-y-3">
      {bookings.map((booking) => {
        const chat = getChatStatus(booking.date, now)
        return (
          <li key={booking.reference} className="panel flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="w-20 shrink-0 font-mono text-xs text-muted">{formatDate(booking.date)}</div>
            <div className="flex-1">
              <Link to={`/events/${booking.eventId}`} className="font-semibold hover:text-accent">
                {booking.title}
              </Link>
              <p className="text-sm text-muted">
                {booking.location} · {booking.quantity} ticket{booking.quantity > 1 && 's'} ·{' '}
                {booking.total > 0 ? formatMoney(booking.total) : 'Free'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
              <span className="font-mono text-sm tracking-wider">{booking.reference}</span>
              {booking.cancelled ? (
                <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-muted">Cancelled</span>
              ) : (
                <span className={`rounded-full px-2.5 py-1 text-xs ${CHAT_STYLES[chat.state]}`}>{chat.label}</span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PledgesTab({ pledges }) {
  if (pledges.length === 0) {
    return <EmptyState text="No pledges yet." to="/events?type=fundraiser" action="Browse fundraisers" />
  }
  return (
    <ul className="space-y-3">
      {pledges.map((pledge) => (
        <li key={pledge.reference} className="panel flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <Link to={`/events/${pledge.eventId}`} className="font-semibold hover:text-accent">
              {pledge.title}
            </Link>
            <p className="text-sm text-muted">Pledged {formatDateTime(pledge.createdAt)}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="display text-2xl">{formatMoney(pledge.amount)}</p>
            <p className="font-mono text-xs text-muted">{pledge.reference}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Organiser tools: see how each listing is doing, edit it, or remove it.
function MyEventsTab({ events, onDelete }) {
  if (events.length === 0) return <EmptyState text="You aren't organising anything yet." to="/events/new" action="Create an event" />

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {events.map((event) => {
        const kind = getEventKind(event)
        const isFundraiser = kind === 'fundraiser'
        return (
          <li key={event.id} className="panel flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-muted">{formatDateTime(event.date)}</p>
                <h3 className="display mt-1 text-2xl">{event.title}</h3>
              </div>
              <span className="badge">{KIND_LABELS[kind]}</span>
            </div>

            <div className="space-y-2 text-sm">
              <ProgressBar
                value={isFundraiser ? event.raised : event.booked}
                max={isFundraiser ? event.goal : event.capacity}
                barClassName={isFundraiser ? 'bg-teal' : 'bg-accent'}
              />
              <p className="text-muted">
                {isFundraiser
                  ? `${formatMoney(event.raised)} raised of ${formatMoney(event.goal)}`
                  : `${event.booked} / ${event.capacity} seats booked`}
              </p>
            </div>

            <div className="mt-auto flex gap-2">
              <Link to={`/events/${event.id}`} className="btn btn-outline flex-1 py-2">
                View
              </Link>
              <Link to={`/events/${event.id}/edit`} className="btn btn-dark flex-1 py-2">
                Edit
              </Link>
              <button
                type="button"
                className="btn btn-outline py-2 text-accent"
                onClick={() => onDelete(event)}
              >
                Delete
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function DashboardPage() {
  const { user, token } = useAuth()
  const activity = useActivity()
  const { bookmarks } = activity
  const { events, source } = useEvents()
  const [deleteError, setDeleteError] = useState('')

  // With the API online, tickets/pledges/organised events live in MySQL. Browser storage only
  // holds what was done in demo mode (API offline), so it is the fallback, not the source.
  const useApi = Boolean(token) && source !== 'demo'
  const account = useAccountActivity(token, useApi)
  const remote = useApi && account.status === 'ready' ? account : null
  // Until useEvents knows whether the API is reachable, a failed request may just mean "offline".
  const remoteLoading = useApi && (account.status === 'loading' || (account.status === 'error' && source !== 'api'))
  const remoteError = useApi && source === 'api' && account.status === 'error' ? account.error : ''

  const bookings = remote ? remote.bookings : useApi ? [] : activity.bookings
  const pledges = remote ? remote.pledges : useApi ? [] : activity.pledges

  // Active tab is kept in the URL (?tab=pledges) so links like "View in dashboard" can target a tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = TABS.some(([key]) => key === requested) ? requested : 'tickets'

  // Events created in this browser (demo mode) are never on the server, so keep them alongside.
  const localEvents = activity.createdEvents.filter((event) => event.organizerEmail === user.email)
  const myEvents = remote
    ? [...localEvents, ...remote.events]
    : useApi
      ? localEvents
      : events.filter((event) => event.organizerEmail === user.email)
  const savedEvents = events.filter((event) => bookmarks.includes(event.id))
  const totalPledged = pledges.reduce((sum, p) => sum + p.amount, 0)
  const ticketCount = bookings.filter((b) => !b.cancelled).reduce((sum, b) => sum + b.quantity, 0)

  async function handleDelete(event) {
    setDeleteError('')
    if (String(event.id).startsWith('local-')) {
      if (window.confirm(`Delete "${event.title}"?`)) activity.deleteEvent(event.id)
      return
    }
    // Server events are cancelled rather than removed: tickets and pledges are receipts.
    if (!window.confirm(`Cancel "${event.title}"? Existing tickets and pledges will be kept.`)) return
    try {
      await deleteApiEvent(event.id)
      account.reload()
    } catch (requestError) {
      setDeleteError(requestError.message)
    }
  }

  const stats = [
    ['Tickets booked', ticketCount],
    ['Total pledged', formatMoney(totalPledged)],
    ['Events organised', myEvents.length],
    ['Saved', savedEvents.length],
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Dashboard · {user.university}</p>
          <h1 className="display mt-4 text-5xl md:text-6xl">Hi, {user.name.split(' ')[0]}.</h1>
          <p className="mt-3 font-mono text-xs text-muted">{user.email}</p>
        </div>
        <Link to="/events/new" className="btn btn-dark self-start md:self-auto">
          + Create event
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="panel p-5">
            <p className="text-xs text-muted">{label}</p>
            <p className="display mt-2 text-3xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex gap-6 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setSearchParams({ tab: key })}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm transition-colors ${
              tab === key ? 'border-accent font-semibold' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {remoteError && (
          <p role="alert" className="panel mb-4 text-sm text-accent">
            Unable to load your account activity: {remoteError}
          </p>
        )}
        {deleteError && (
          <p role="alert" className="panel mb-4 text-sm text-accent">
            {deleteError}
          </p>
        )}
        {remoteLoading && tab !== 'saved' ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            {tab === 'tickets' && <TicketsTab bookings={bookings} />}
            {tab === 'pledges' && <PledgesTab pledges={pledges} />}
            {tab === 'events' && <MyEventsTab events={myEvents} onDelete={handleDelete} />}
          </>
        )}
        {tab === 'saved' &&
          (savedEvents.length === 0 ? (
            <EmptyState text="Tap “Save for later” on any event to keep it here." to="/events" action="Browse events" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ))}
      </div>
    </main>
  )
}
