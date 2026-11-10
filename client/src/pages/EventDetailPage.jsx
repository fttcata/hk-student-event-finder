import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import MapEmbed from '../components/MapEmbed.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import Receipt from '../components/Receipt.jsx'
import TicketCounter from '../components/TicketCounter.jsx'
import EventChatRoom from '../components/EventChatRoom.jsx'
import FundraiserDonateModal from '../components/FundraiserDonateModal.jsx'
import { cancelEvent, fetchEvent, fetchMyTickets } from '../api/events.js'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useEvents } from '../hooks/useEvents.js'
import { useNow } from '../hooks/useNow.js'
import {
  formatDateTime,
  formatMoney,
  getEventKind,
  getSafeExternalUrl,
  KIND_LABELS,
} from '../utils/format.js'
import { googleCalendarUrl } from '../utils/calendar.js'
import NotFoundPage from './NotFoundPage.jsx'

const QUICK_AMOUNTS = [20, 50, 100, 200]

// Shown instead of the booking button when the visitor is not logged in.
function LoginPrompt({ action }) {
  const location = useLocation()
  return (
    <Link to="/login" state={{ from: location.pathname }} className="btn btn-dark w-full">
      Log in to {action}
    </Link>
  )
}

const REGISTRATION_CLOSES_BEFORE_MS = 2 * 60 * 60 * 1000

function RegistrationWindow({ event }) {
  const registrationDeadline = new Date(new Date(event.date).getTime() - REGISTRATION_CLOSES_BEFORE_MS)
  return (
    <p className="text-xs text-muted">
      Event registration closes 2 hours before {formatDateTime(event.date)}.
      {registrationDeadline <= new Date() ? ' The booking window has closed.' : ''}
    </p>
  )
}

// Select quantity here, then collect attendee details on the dedicated checkout page.
function TicketPanel({ event }) {
  const { user } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(1)

  const hasLimit = event.capacity > 0
  const seatsLeft = hasLimit ? event.capacity - event.booked : Infinity
  const isFull = seatsLeft <= 0
  const isClosed = new Date(event.date).getTime() - REGISTRATION_CLOSES_BEFORE_MS <= now
  const isPaid = event.price > 0
  const total = event.price * quantity

  return (
    <div className="panel space-y-5">
      {hasLimit && (
        <span className={`badge ${isFull ? 'bg-accent/10 text-accent' : 'bg-sage'}`}>
          {Math.max(0, seatsLeft)} / {event.capacity} Tickets Remaining
        </span>
      )}
      <div>
        <p className="text-xs text-muted">Ticket price</p>
        <p className="display text-4xl">{formatMoney(event.price)}</p>
      </div>

      {hasLimit && (
        <div className="space-y-2">
          <ProgressBar value={event.booked} max={event.capacity} />
          <p className="text-sm">
            {isFull ? 'Sold out' : `${Math.max(0, seatsLeft)} of ${event.capacity} seats left`}
          </p>
        </div>
      )}
      <RegistrationWindow event={event} />

      {isFull || isClosed ? (
        <button type="button" className="btn btn-dark w-full" disabled>
          {isFull ? 'Sold out' : 'Registration closed'}
        </button>
      ) : !user ? (
        <LoginPrompt action="book" />
      ) : (
        <div className="space-y-3">
          <label className="flex items-center justify-between text-sm">
            Tickets
            <TicketCounter available={seatsLeft} total={event.capacity} value={quantity} onChange={setQuantity} />
          </label>
          <button
            type="button"
            className="btn btn-dark w-full"
            onClick={() => navigate(`/events/${event.id}/checkout?quantity=${quantity}`)}
          >
            {isPaid ? `Continue · ${formatMoney(total)}` : 'Continue to free ticket checkout'}
          </button>
        </div>
      )}
    </div>
  )
}

// Fundraiser pledge form with live progress towards the goal.
function PledgePanel({ event }) {
  const { user } = useAuth()
  const { pledge } = useActivity()
  const now = useNow()
  const [amount, setAmount] = useState('50')
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [donateOpen, setDonateOpen] = useState(false)

  const isClosed = new Date(event.date).getTime() - REGISTRATION_CLOSES_BEFORE_MS <= now
  const percent = event.goal > 0 ? Math.round((event.raised / event.goal) * 100) : 0

  function handleSubmit(e) {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isInteger(value) || value < 10) return setError('Pledges must be a whole amount of at least HK$10.')
    if (value > 100000) return setError('Pledges are capped at HK$100,000.')
    setError('')
    setReceipt(pledge(event, value))
  }

  if (receipt) {
    return (
      <Receipt
        heading="Thank you for your pledge"
        reference={receipt.reference}
        email={user.email}
        rows={[
          ['Campaign', event.title],
          ['Amount', formatMoney(receipt.amount)],
          ['New total', `${formatMoney(event.raised)} (${percent}%)`],
        ]}
      />
    )
  }

  return (
    <form className="panel space-y-5" onSubmit={handleSubmit} noValidate>
      <div>
        <p className="eyebrow">Cause / pledge</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">
          {event.cause || event.description || 'Support this campaign by making a pledge.'}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted">Raised so far</p>
        <p className="display text-4xl">{formatMoney(event.raised)}</p>
        <p className="mt-1 text-sm text-muted">
          of {formatMoney(event.goal)} goal · {percent}%
        </p>
      </div>
      <ProgressBar value={event.raised} max={event.goal} barClassName="bg-teal" />
      {user && !isClosed && <button type="button" className="btn btn-accent w-full" onClick={() => setDonateOpen(true)}>Open donation checkout</button>}
      <RegistrationWindow event={event} />

      {isClosed ? (
        <button type="button" className="btn btn-dark w-full" disabled>
          Campaign closed
        </button>
      ) : !user ? (
        <LoginPrompt action="pledge" />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                className={`rounded-sm border py-2 text-sm ${
                  amount === String(value) ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
                }`}
              >
                ${value}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="text-muted">Custom amount (HK$)</span>
            <input
              type="number"
              min="10"
              step="1"
              className={`input mt-1 ${error ? 'input-error' : ''}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {error && <p className="text-xs text-accent">{error}</p>}
          <button type="submit" className="btn btn-accent w-full">
            Pledge {amount && Number(amount) > 0 ? formatMoney(amount) : ''}
          </button>
        </div>
      )}
      {donateOpen && <FundraiserDonateModal event={event} onClose={() => setDonateOpen(false)} onSuccess={(result) => { setDonateOpen(false); setReceipt({ reference: result.pledge.reference_code, amount: result.pledge.amount }) }} />}
    </form>
  )
}

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { bookings, bookmarks, toggleBookmark } = useActivity()
  const { events, loading } = useEvents()
  const ownerKey = user && token ? String(user.id ?? user.email) : ''
  const [ticketResult, setTicketResult] = useState({ ownerKey: '', eventIds: [], error: '' })
  const listedEvent = events.find((e) => e.id === id)
  const [detailResult, setDetailResult] = useState(null)
  const currentDetailResult = detailResult?.id === id ? detailResult : null
  const requestedEvent = currentDetailResult?.event ?? null
  const detailError = currentDetailResult?.error ?? null
  const detailLoading = !loading && !listedEvent && !currentDetailResult
  const [adminError, setAdminError] = useState('')
  const [canceling, setCanceling] = useState(false)

  useEffect(() => {
    if (!ownerKey) {
      setTicketResult({ ownerKey: '', eventIds: [], error: '' })
      return undefined
    }

    let active = true
    fetchMyTickets()
      .then((tickets) => {
        if (active) {
          setTicketResult({
            ownerKey,
            eventIds: tickets
              .filter((ticket) => ticket.status === 'confirmed')
              .map((ticket) => String(ticket.event.id)),
            error: '',
          })
        }
      })
      .catch((requestError) => {
        if (active) setTicketResult({ ownerKey, eventIds: [], error: requestError.message })
      })

    return () => {
      active = false
    }
  }, [ownerKey, token])

  useEffect(() => {
    if (loading || listedEvent) return

    let active = true
    fetchEvent(id)
      .then((result) => {
        if (active) setDetailResult({ id, event: result })
      })
      .catch((requestError) => {
        if (active) setDetailResult({ id, error: requestError })
      })

    return () => {
      active = false
    }
  }, [id, loading, listedEvent])

  const event = listedEvent ?? requestedEvent

  if (loading || detailLoading) {
    return <main className="mx-auto max-w-6xl px-4 py-16 text-muted sm:px-6">Loading event…</main>
  }
  if (detailError && detailError.status !== 404) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p role="alert" className="text-accent">Unable to load this event: {detailError.message}</p>
        <Link to="/events" className="mt-4 inline-block text-sm text-muted hover:text-accent">← All events</Link>
      </main>
    )
  }
  if (!event) return <NotFoundPage message="We couldn't find that event. It may have been removed." />

  if (event.isScraped) {
    const originalUrl = getSafeExternalUrl(event.originalUrl)

    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Link to="/events" className="text-sm text-muted hover:text-accent">
          ← All events
        </Link>

        <section className="mt-6 max-w-3xl">
          <span className="badge bg-ink text-paper">CEDARS</span>
          <h1 className="display mt-5 text-4xl sm:text-6xl">{event.title}</h1>
          <p className="mt-4 text-sm text-muted">
            {formatDateTime(event.date)}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          <p className="mt-6 leading-relaxed whitespace-pre-line text-ink/80">
            {event.description || 'See the original listing for event details.'}
          </p>
          {originalUrl ? (
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-dark mt-8 inline-flex"
            >
              View details ↗
            </a>
          ) : (
            <p className="mt-8 text-sm text-muted">Original event link unavailable.</p>
          )}
          {event.location && (
            <section className="panel mt-10 space-y-4" aria-labelledby="event-location-heading">
              <div>
                <h2 id="event-location-heading" className="eyebrow">Location</h2>
                <p className="mt-2 font-medium">{event.location}</p>
              </div>
              <MapEmbed query={event.location} className="h-56 sm:h-72" />
            </section>
          )}
        </section>
      </main>
    )
  }

  const kind = getEventKind(event)
  const isSaved = bookmarks.includes(event.id)
  const currentTicketResult = ticketResult.ownerKey === ownerKey ? ticketResult : null
  const hasLocalBooking = bookings.some((booking) => String(booking.eventId) === event.id)
  const hasJoined = hasLocalBooking || currentTicketResult?.eventIds.includes(event.id)

  function handleBookmark() {
    if (!user) return navigate('/login', { state: { from: `/events/${event.id}` } })
    toggleBookmark(event.id)
  }

  async function handleAdminCancel() {
    if (!window.confirm(`Cancel "${event.title}"? Existing tickets and pledges will be kept.`)) return
    setCanceling(true)
    setAdminError('')
    try {
      await cancelEvent(event.id)
      navigate('/admin/events')
    } catch (requestError) {
      setAdminError(requestError.message)
      setCanceling(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link to="/events" className="text-sm text-muted hover:text-accent">
        ← All events
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <section>
          {event.status === 'cancelled' && (
            <p role="status" className="mb-5 rounded-sm bg-peach/50 p-3 text-sm text-accent">
              This event has been cancelled.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-ink text-paper">{KIND_LABELS[kind]}</span>
            <span className="badge">{event.category}</span>
            {event.university && <span className="badge">{event.university}</span>}
          </div>
          <h1 className="display mt-5 text-4xl sm:text-6xl">{event.title}</h1>

          <dl className="mt-8 grid gap-4 border-y border-line py-6 sm:grid-cols-3">
            <div>
              <dt className="font-mono text-xs text-muted">When</dt>
              <dd className="mt-1 text-sm font-medium">{formatDateTime(event.date)}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs text-muted">Where</dt>
              <dd className="mt-1 text-sm font-medium">{event.location}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs text-muted">Organiser</dt>
              <dd className="mt-1 text-sm font-medium">{event.organizer}</dd>
            </div>
          </dl>

          <p className="mt-8 max-w-2xl leading-relaxed whitespace-pre-line text-ink/80">
            {event.description || 'The organiser has not added a description yet.'}
          </p>

          <section className="panel mt-10 space-y-4" aria-labelledby="event-location-heading">
            <div>
              <h2 id="event-location-heading" className="eyebrow">Location</h2>
              <p className="mt-2 font-medium">{event.location}</p>
            </div>
            <MapEmbed query={event.location} className="h-56 sm:h-72" />
            <EventChatRoom event={event} />
          </section>
        </section>

        <aside className="space-y-3 self-start lg:sticky lg:top-24">
          {currentTicketResult?.error && !hasLocalBooking && (
            <p role="alert" className="rounded-sm bg-peach/50 p-3 text-sm text-accent">
              Unable to check your booking status: {currentTicketResult.error}
            </p>
          )}
          {event.status === 'cancelled' ? (
            <div className="panel text-sm text-muted">Registration and pledges are closed for this event.</div>
          ) : (
            <>
              {kind === 'fundraiser' ? <PledgePanel event={event} /> : <TicketPanel event={event} />}
              {kind !== 'fundraiser' && hasJoined && (
                <a
                  href={googleCalendarUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline w-full"
                >
                  Add to Google Calendar
                </a>
              )}
              <button type="button" className="btn btn-outline w-full" onClick={handleBookmark}>
                {isSaved ? '★ Saved to dashboard' : '☆ Save for later'}
              </button>
            </>
          )}
          {user?.role === 'admin' && (
            <section className="panel space-y-3" aria-label="Administrator controls">
              <p className="eyebrow">Admin controls</p>
              {event.status !== 'cancelled' && (
                <Link to={`/events/${event.id}/edit`} className="btn btn-dark block w-full text-center">
                  Edit event
                </Link>
              )}
              {event.status !== 'cancelled' && (
                <button
                  type="button"
                  className="btn btn-outline w-full text-accent"
                  disabled={canceling}
                  onClick={handleAdminCancel}
                >
                  {canceling ? 'Cancelling…' : 'Cancel event'}
                </button>
              )}
              {adminError && <p role="alert" className="text-sm text-accent">{adminError}</p>}
            </section>
          )}
        </aside>
      </div>
    </main>
  )
}
