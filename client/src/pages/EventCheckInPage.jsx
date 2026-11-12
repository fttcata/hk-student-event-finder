import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { checkInTicket, fetchEvent } from '../api/events.js'
import CameraQrScanner from '../components/CameraQrScanner.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatDateTime, formatMoney } from '../utils/format.js'

export default function EventCheckInPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [ticketInput, setTicketInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [scanError, setScanError] = useState('')
  const [checkIn, setCheckIn] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    setEvent(null)
    setCheckIn(null)
    setScanError('')

    fetchEvent(id)
      .then((loadedEvent) => {
        if (active) setEvent(loadedEvent)
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id])

  const verifyCode = useCallback(
    async (rawCode) => {
      const ticketCode = rawCode.trim()
      if (!ticketCode) {
        setScanError('Enter or scan a ticket code.')
        return
      }

      setChecking(true)
      setScanError('')
      setCheckIn(null)
      try {
        const data = await checkInTicket(id, ticketCode)
        setCheckIn(data.check_in)
        setTicketInput('')
      } catch (requestError) {
        setScanError(requestError.message)
      } finally {
        setChecking(false)
      }
    },
    [id],
  )

  function handleManualSubmit(submitEvent) {
    submitEvent.preventDefault()
    verifyCode(ticketInput)
  }

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-16 text-muted sm:px-6">Loading check-in…</main>
  }

  if (loadError || !event) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <p role="alert" className="text-accent">
          {loadError ? `Unable to load this event: ${loadError}` : "We couldn't find that event."}
        </p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm text-muted hover:text-accent">
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  const isOwner = user && String(event.organizerId) === String(user.id)
  const canScan = Boolean(isOwner || user?.role === 'admin')
  const scannerUnavailable = event.isScraped || event.type === 'fundraiser'

  if (!canScan) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="panel">
          <p className="eyebrow">Access restricted</p>
          <h1 className="display mt-3 text-3xl">Organizer check-in only</h1>
          <p className="mt-3 text-sm text-muted">
            Only the organizer of {event.title} or an administrator can check in tickets.
          </p>
          <Link to={`/events/${event.id}`} className="btn btn-dark mt-5 inline-flex">
            Back to event
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Link to={`/events/${event.id}`} className="text-sm text-muted hover:text-accent">
        ← Back to event
      </Link>

      <header className="mt-5">
        <p className="eyebrow">Organizer check-in</p>
        <h1 className="display mt-2 text-4xl sm:text-5xl">{event.title}</h1>
        <p className="mt-3 text-sm text-muted">
          {formatDateTime(event.date)} · {event.location}
        </p>
      </header>

      {scannerUnavailable || event.status === 'cancelled' ? (
        <div className="panel mt-8">
          <p className="text-sm text-muted">
            {event.status === 'cancelled'
              ? 'This event has been cancelled. Ticket check-in is closed.'
              : 'Ticket check-in is only available for standard Campus Hub events.'}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="panel" aria-labelledby="scanner-heading">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="scanner-heading" className="display text-2xl">Scan a ticket</h2>
                <p className="mt-2 text-sm text-muted">
                  Point the camera at the QR code on the attendee’s ticket.
                </p>
              </div>
              <span className="badge">Live check-in</span>
            </div>

            <div className="mt-5">
              <CameraQrScanner onScan={verifyCode} disabled={checking} />
            </div>

            <form className="mt-6 space-y-3 border-t border-line pt-5" onSubmit={handleManualSubmit}>
              <label htmlFor="ticket-code" className="block text-sm font-semibold">
                Enter a ticket code manually
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="ticket-code"
                  className="input font-mono"
                  autoComplete="off"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={ticketInput}
                  onChange={(changeEvent) => setTicketInput(changeEvent.target.value)}
                />
                <button type="submit" className="btn btn-dark shrink-0" disabled={checking}>
                  {checking ? 'Checking…' : 'Check in'}
                </button>
              </div>
              <p className="text-xs text-muted">
                Use this fallback when camera access is unavailable. Camera access needs HTTPS or localhost.
              </p>
            </form>
          </section>

          <div className="space-y-4">
            {checking && (
              <div className="panel" role="status" aria-live="polite">
                <p className="text-sm text-muted">Checking ticket…</p>
              </div>
            )}

            {scanError && (
              <div role="alert" className="rounded-sm border border-accent/40 bg-peach/50 p-5">
                <p className="eyebrow text-accent">Check-in failed</p>
                <p className="mt-2 text-sm">{scanError}</p>
              </div>
            )}

            {checkIn && (
              <section
                role="status"
                aria-live="polite"
                className={`rounded-sm border p-5 ${
                  checkIn.already_checked_in
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-leaf bg-sage/70'
                }`}
              >
                <p className={`eyebrow ${checkIn.already_checked_in ? 'text-amber-700' : 'text-teal'}`}>
                  {checkIn.already_checked_in ? 'Already checked in' : 'Checked in'}
                </p>
                <h2 className="display mt-2 text-2xl">{checkIn.attendee_name}</h2>
                <p className="mt-1 text-sm text-muted">{checkIn.attendee_email}</p>

                <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Ticket</dt>
                    <dd className="break-all text-right font-mono text-xs">{checkIn.ticket_code}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Type</dt>
                    <dd className="font-medium capitalize">{checkIn.type}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Paid</dt>
                    <dd className="font-medium">{formatMoney(checkIn.amount_paid)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Check-in time</dt>
                    <dd className="text-right font-medium">{formatDateTime(checkIn.checked_in_at)}</dd>
                  </div>
                </dl>

                {checkIn.already_checked_in && (
                  <p className="mt-4 text-xs text-amber-800">
                    This ticket was already used. The original check-in time is shown above.
                  </p>
                )}
              </section>
            )}

            <section className="panel text-sm">
              <h2 className="font-semibold">How it works</h2>
              <p className="mt-2 leading-relaxed text-muted">
                A valid ticket is marked as checked in once. Scanning it again shows the original
                check-in time instead of creating a duplicate.
              </p>
            </section>
          </div>
        </div>
      )}
    </main>
  )
}
