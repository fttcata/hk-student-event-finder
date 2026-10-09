import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import MapEmbed from '../components/MapEmbed.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import Receipt from '../components/Receipt.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useEvents } from '../hooks/useEvents.js'
import { useNow } from '../hooks/useNow.js'
import { formatDateTime, formatMoney, formatTimeLeft, getEventKind, KIND_LABELS } from '../utils/format.js'
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

function Deadline({ deadline, now }) {
  const msLeft = new Date(deadline) - now
  return (
    <p className="font-mono text-xs text-muted">
      {msLeft > 0 ? `Registration closes in ${formatTimeLeft(msLeft)}` : 'Registration closed'}
    </p>
  )
}

// Free ticket claim, or paid ticket with a mock checkout step.
function TicketPanel({ event }) {
  const { user } = useAuth()
  const { bookTicket } = useActivity()
  const now = useNow()
  const [quantity, setQuantity] = useState(1)
  const [step, setStep] = useState('select') // select → checkout (paid only) → done
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')

  const hasLimit = event.capacity > 0
  const seatsLeft = hasLimit ? event.capacity - event.booked : Infinity
  const isFull = seatsLeft <= 0
  const isClosed = new Date(event.deadline) <= now
  const isPaid = event.price > 0
  const total = event.price * quantity

  function confirmBooking() {
    try {
      setReceipt(bookTicket(event, quantity))
      setStep('done')
    } catch (err) {
      setError(err.message)
    }
  }

  if (step === 'done') {
    return (
      <Receipt
        heading={isPaid ? 'Payment received' : 'Ticket claimed'}
        reference={receipt.reference}
        email={user.email}
        rows={[
          ['Event', event.title],
          ['When', formatDateTime(event.date)],
          ['Tickets', receipt.quantity],
          ['Total', isPaid ? formatMoney(receipt.total) : 'Free'],
        ]}
      />
    )
  }

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
      <Deadline deadline={event.deadline} now={now} />

      {step === 'checkout' ? (
        <div className="space-y-4 border-t border-line pt-5">
          <p className="eyebrow">Mock checkout</p>
          <div className="flex justify-between text-sm">
            <span>
              {quantity} × {formatMoney(event.price)}
            </span>
            <span className="font-semibold">{formatMoney(total)}</span>
          </div>
          <p className="rounded-sm bg-peach/50 p-3 text-xs text-muted">
            Demo payment: no card details are collected. Stripe is planned as a nice-to-have.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline flex-1" onClick={() => setStep('select')}>
              Back
            </button>
            <button type="button" className="btn btn-accent flex-1" onClick={confirmBooking}>
              Pay {formatMoney(total)}
            </button>
          </div>
        </div>
      ) : isFull || isClosed ? (
        <button type="button" className="btn btn-dark w-full" disabled>
          {isFull ? 'Sold out' : 'Registration closed'}
        </button>
      ) : !user ? (
        <LoginPrompt action="book" />
      ) : (
        <div className="space-y-3">
          <label className="flex items-center justify-between text-sm">
            Tickets
            <select
              className="input w-24"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            >
              {/* Never offer more tickets than there are seats left (max 4 per student). */}
              {Array.from({ length: Math.min(4, seatsLeft) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-dark w-full"
            onClick={() => (isPaid ? setStep('checkout') : confirmBooking())}
          >
            {isPaid ? `Checkout · ${formatMoney(total)}` : 'Claim free ticket'}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
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

  const isClosed = new Date(event.deadline) <= now
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
      <Deadline deadline={event.deadline} now={now} />

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
    </form>
  )
}

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { bookmarks, toggleBookmark } = useActivity()
  const { events, loading } = useEvents()

  const event = events.find((e) => e.id === id)

  if (loading) return <main className="mx-auto max-w-6xl px-4 py-16 text-muted sm:px-6">Loading event…</main>
  if (!event) return <NotFoundPage message="We couldn't find that event. It may have been removed." />

  const kind = getEventKind(event)
  const isSaved = bookmarks.includes(event.id)

  function handleBookmark() {
    if (!user) return navigate('/login', { state: { from: `/events/${event.id}` } })
    toggleBookmark(event.id)
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link to="/events" className="text-sm text-muted hover:text-accent">
        ← All events
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <section>
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
            <MapEmbed query={event.location} className="h-72" />
          </section>
        </section>

        <aside className="space-y-3 self-start lg:sticky lg:top-24">
          {kind === 'fundraiser' ? <PledgePanel event={event} /> : <TicketPanel event={event} />}
          <button type="button" className="btn btn-outline w-full" onClick={handleBookmark}>
            {isSaved ? '★ Saved to dashboard' : '☆ Save for later'}
          </button>
        </aside>
      </div>
    </main>
  )
}
