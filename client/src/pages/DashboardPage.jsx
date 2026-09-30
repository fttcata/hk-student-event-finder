import { Link, useSearchParams } from 'react-router-dom'
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
              <span className={`rounded-full px-2.5 py-1 text-xs ${CHAT_STYLES[chat.state]}`}>{chat.label}</span>
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
                onClick={() => window.confirm(`Delete "${event.title}"?`) && onDelete(event.id)}
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
  const { user } = useAuth()
  const { bookings, pledges, bookmarks, deleteEvent } = useActivity()
  const { events } = useEvents()

  // Active tab is kept in the URL (?tab=pledges) so links like "View in dashboard" can target a tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = TABS.some(([key]) => key === requested) ? requested : 'tickets'

  const myEvents = events.filter((event) => event.organizerEmail === user.email)
  const savedEvents = events.filter((event) => bookmarks.includes(event.id))
  const totalPledged = pledges.reduce((sum, p) => sum + p.amount, 0)
  const ticketCount = bookings.reduce((sum, b) => sum + b.quantity, 0)

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
        {tab === 'tickets' && <TicketsTab bookings={bookings} />}
        {tab === 'pledges' && <PledgesTab pledges={pledges} />}
        {tab === 'events' && <MyEventsTab events={myEvents} onDelete={deleteEvent} />}
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
