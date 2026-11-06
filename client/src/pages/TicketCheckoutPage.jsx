import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { bookEventTickets, fetchEvent } from '../api/events.js'
import Field from '../components/Field.jsx'
import { CheckoutSkeleton } from '../components/LoadingSkeleton.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useEvents } from '../hooks/useEvents.js'
import { formatDateTime, formatMoney } from '../utils/format.js'

const STEPS = [
  ['attendees', 'Attendee details'],
  ['payment', 'Payment / claim'],
  ['complete', 'Confirmation'],
]

const MAX_TICKETS_PER_ORDER = 4

function CheckoutProgress({ currentStep }) {
  const activeIndex = STEPS.findIndex(([key]) => key === currentStep)
  const progress = (activeIndex / (STEPS.length - 1)) * 100

  return (
    <nav aria-label="Checkout progress" className="mb-8">
      <div className="relative mb-4 h-1 rounded-full bg-line">
        <div className="absolute left-0 top-0 h-1 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ol className="grid grid-cols-3 gap-3">
        {STEPS.map(([key, label], index) => {
          const complete = index < activeIndex
          const active = index === activeIndex
          return (
            <li
              key={key}
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm ${active ? 'font-semibold text-ink' : 'text-muted'}`}
            >
              <span className={`inline-grid size-6 shrink-0 place-items-center rounded-full text-xs ${
                active || complete ? 'bg-ink text-paper' : 'border border-line'
              }`}>
                {complete ? '✓' : index + 1}
              </span>
              {label}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function createAttendees(quantity, user) {
  return Array.from({ length: quantity }, (_, index) => ({
    name: index === 0 ? user.name ?? '' : '',
    email: index === 0 ? user.email ?? '' : '',
  }))
}

function CheckoutFlow({ id }) {
  const { user } = useAuth()
  const { bookTicket } = useActivity()
  const { events, source, loading } = useEvents()
  const [searchParams] = useSearchParams()
  const requestedQuantity = Number(searchParams.get('quantity'))
  const quantity =
    Number.isInteger(requestedQuantity) && requestedQuantity >= 1 && requestedQuantity <= MAX_TICKETS_PER_ORDER
      ? requestedQuantity
      : 1
  const listedEvent = events.find((item) => item.id === id)
  const [remoteResult, setRemoteResult] = useState(null)
  const currentRemoteResult = remoteResult?.id === id ? remoteResult : null
  const event = listedEvent ?? currentRemoteResult?.event ?? null
  const loadError = currentRemoteResult?.error ?? null
  const isLoadingEvent = loading || (!listedEvent && !currentRemoteResult)
  const [attendees, setAttendees] = useState(() => createAttendees(quantity, user))
  const [step, setStep] = useState('attendees')
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (loading || listedEvent) return

    let active = true
    fetchEvent(id)
      .then((loadedEvent) => {
        if (active) setRemoteResult({ id, event: loadedEvent, source: 'api' })
      })
      .catch((requestError) => {
        if (active) setRemoteResult({ id, error: requestError })
      })

    return () => {
      active = false
    }
  }, [id, loading, listedEvent])

  if (isLoadingEvent) {
    return <CheckoutSkeleton />
  }
  if (loadError || !event) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p role="alert" className="text-accent">
          {loadError ? `Unable to load this event: ${loadError.message}` : "We couldn't find that event."}
        </p>
        <Link to={`/events/${id}`} className="mt-4 inline-block text-sm text-muted hover:text-accent">
          ← Back to event
        </Link>
      </main>
    )
  }
  if (event.isScraped) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="text-muted">Tickets for web-scraped events must be booked on the original event website.</p>
        <Link to={`/events/${id}`} className="mt-4 inline-block text-sm text-muted hover:text-accent">
          ← Back to event
        </Link>
      </main>
    )
  }

  const isPaid = event.price > 0
  const isApiEvent = /^\d+$/.test(event.id) && (source === 'api' || currentRemoteResult?.source === 'api')
  const tickets = result?.tickets ?? []

  function updateAttendee(index, name, value) {
    setAttendees((current) => current.map((attendee, attendeeIndex) => (
      attendeeIndex === index ? { ...attendee, [name]: value } : attendee
    )))
  }

  function continueToPayment(formEvent) {
    formEvent.preventDefault()
    setError('')
    setStep('payment')
  }

  async function completeCheckout(formEvent) {
    formEvent.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isApiEvent) {
        const booking = await bookEventTickets(event.id, { attendees })
        setResult(booking)
      } else {
        const booking = bookTicket(event, attendees)
        setResult({
          tickets: booking.attendees.map((attendee) => ({
            reference_code: attendee.reference,
            attendee_name: attendee.name,
            attendee_email: attendee.email,
            amount_paid: event.price,
          })),
          demo: true,
        })
      }
      setStep('complete')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to={`/events/${event.id}`} className="text-sm text-muted hover:text-accent">
        ← Back to event
      </Link>

      <header className="mt-5">
        <p className="eyebrow">Ticket checkout</p>
        <h1 className="display mt-2 text-4xl sm:text-5xl">{event.title}</h1>
        <p className="mt-3 text-sm text-muted">
          {formatDateTime(event.date)} · {quantity} ticket{quantity === 1 ? '' : 's'} ·{' '}
          {isPaid ? formatMoney(event.price * quantity) : 'Free'}
        </p>
      </header>

      <section className="panel mt-6 p-4 sm:mt-8 sm:p-6">
        <CheckoutProgress currentStep={step} />

        {step === 'attendees' && (
          <form className="space-y-6" onSubmit={continueToPayment}>
            <div>
              <h2 className="display text-2xl">Who is joining?</h2>
              <p className="mt-2 text-sm text-muted">Enter the name and email address for each ticket.</p>
            </div>

            {attendees.map((attendee, index) => (
              <fieldset key={index} className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold">Attendee {index + 1}</legend>
                <Field label="Full name" htmlFor={`attendee-${index}-name`}>
                  <input
                    id={`attendee-${index}-name`}
                    autoComplete={index === 0 ? 'name' : 'off'}
                    className="input"
                    maxLength={120}
                    required
                    value={attendee.name}
                    onChange={(e) => updateAttendee(index, 'name', e.target.value)}
                  />
                </Field>
                <Field label="Email address" htmlFor={`attendee-${index}-email`}>
                  <input
                    id={`attendee-${index}-email`}
                    type="email"
                    autoComplete={index === 0 ? 'email' : 'off'}
                    className="input"
                    maxLength={160}
                    required
                    value={attendee.email}
                    onChange={(e) => updateAttendee(index, 'email', e.target.value)}
                  />
                </Field>
              </fieldset>
            ))}

            <p className="rounded-sm bg-ink/5 p-3 text-xs text-muted">
              Each attendee will receive their own ticket confirmation at the email address provided.
            </p>
            <button type="submit" className="btn btn-dark w-full">Continue to {isPaid ? 'payment' : 'claim'}</button>
          </form>
        )}

        {step === 'payment' && (
          <form className="space-y-5" onSubmit={completeCheckout}>
            <div>
              <h2 className="display text-2xl">{isPaid ? 'Review and pay' : 'Review and claim'}</h2>
              <p className="mt-2 text-sm text-muted">
                {quantity} ticket{quantity === 1 ? '' : 's'} · {isPaid ? formatMoney(event.price * quantity) : 'Free'}
              </p>
            </div>

            <ul className="space-y-2 border-y border-line py-4">
              {attendees.map((attendee, index) => (
                <li key={index} className="flex flex-col justify-between gap-1 text-sm sm:flex-row">
                  <span>{attendee.name}</span>
                  <span className="text-muted">{attendee.email}</span>
                </li>
              ))}
            </ul>

            {isPaid ? (
              <>
                <p className="rounded-sm bg-peach/50 p-3 text-xs text-muted">
                  Demo payment: this checkout does not charge a card or store card details.
                </p>
                <div className="grid gap-3">
                  <Field label="Demo card number" htmlFor="card-number">
                    <input
                      id="card-number"
                      autoComplete="off"
                      inputMode="numeric"
                      className="input"
                      placeholder="Any number for this demo"
                      required
                      value={card.number}
                      onChange={(e) => setCard({ ...card, number: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Expiry" htmlFor="card-expiry">
                      <input
                        id="card-expiry"
                        autoComplete="off"
                        className="input"
                        placeholder="MM/YY"
                        required
                        value={card.expiry}
                        onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                      />
                    </Field>
                    <Field label="CVC" htmlFor="card-cvc">
                      <input
                        id="card-cvc"
                        autoComplete="off"
                        inputMode="numeric"
                        className="input"
                        placeholder="CVC"
                        required
                        value={card.cvc}
                        onChange={(e) => setCard({ ...card, cvc: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              </>
            ) : (
              <p className="rounded-sm bg-sage p-3 text-sm text-muted">No payment is required for these tickets.</p>
            )}

            {error && <p role="alert" className="text-sm text-accent">{error}</p>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn btn-outline flex-1" onClick={() => setStep('attendees')}>
                Back to attendee details
              </button>
              <button type="submit" className="btn btn-accent flex-1" disabled={saving}>
                {saving
                  ? 'Processing…'
                  : isPaid
                    ? `Pay ${formatMoney(event.price * quantity)}`
                    : `Claim ${quantity} free ticket${quantity === 1 ? '' : 's'}`}
              </button>
            </div>
          </form>
        )}

        {step === 'complete' && (
          <section aria-labelledby="checkout-complete-heading">
            <h2 id="checkout-complete-heading" className="display text-2xl">You’re all set</h2>
            {result?.demo ? (
              <p className="mt-2 text-sm text-muted">
                Demo booking saved in this browser. No attendee email was sent because the API is offline.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Your booking is confirmed. Ticket emails are sent individually to each attendee when email delivery is configured.
              </p>
            )}
            <ul className="mt-5 space-y-3">
              {tickets.map((ticket) => {
                const emailStatus = result?.receipt_emails?.find(
                  (receipt) => receipt.reference_code === ticket.reference_code,
                )
                return (
                  <li key={ticket.reference_code} className="rounded-sm border border-line p-4">
                    <p className="font-semibold">{ticket.attendee_name}</p>
                    <p className="mt-1 text-sm text-muted">{ticket.attendee_email}</p>
                    <p className="mt-2 font-mono text-sm">Ticket: {ticket.reference_code}</p>
                    {emailStatus && (
                      <p className={`mt-2 text-xs ${emailStatus.sent ? 'text-teal' : 'text-accent'}`}>
                        {emailStatus.sent ? 'Confirmation email sent' : 'Email could not be sent; keep this ticket reference'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            <Link to={`/events/${event.id}`} className="btn btn-dark mt-6 inline-flex">
              Return to event
            </Link>
          </section>
        )}
      </section>
    </main>
  )
}

export default function TicketCheckoutPage() {
  const { id } = useParams()
  return <CheckoutFlow key={id} id={id} />
}
