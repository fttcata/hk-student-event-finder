import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cancelEvent, fetchManagedEvents } from '../api/events.js'
import { formatDateTime, formatMoney, getEventKind, KIND_LABELS } from '../utils/format.js'

const PAGE_SIZE = 12

export default function AdminEventsPage() {
  const [result, setResult] = useState({ events: [], page: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadEvents = useCallback(async () => {
    try {
      setResult(await fetchManagedEvents(page, PAGE_SIZE))
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  async function handleCancel(event) {
    if (!window.confirm(`Cancel "${event.title}"? Existing tickets and pledges will be kept.`)) return

    setError('')
    try {
      const cancelled = await cancelEvent(event.id)
      setResult((current) => ({
        ...current,
        events: current.events.map((item) => (item.id === cancelled.id ? cancelled : item)),
      }))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE))

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="display mt-4 text-5xl md:text-6xl">Manage events</h1>
          <p className="mt-3 text-sm text-muted">Edit listings or cancel events across Campus Hub.</p>
        </div>
        <Link to="/events" className="btn btn-outline self-start sm:self-auto">
          Browse events
        </Link>
      </div>

      <p className="mt-8 font-mono text-xs text-muted">
        {loading ? 'Loading events…' : `${result.total} event${result.total === 1 ? '' : 's'} in the system`}
      </p>
      {error && <p role="alert" className="mt-4 rounded-sm bg-peach/50 p-3 text-sm">{error}</p>}

      {!loading && result.events.length === 0 ? (
        <div className="panel mt-4 text-center">
          <p className="text-muted">There are no events to manage yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {result.events.map((event) => {
            const kind = getEventKind(event)
            return (
              <article key={event.id} className="panel flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted">{formatDateTime(event.date)}</p>
                  <h2 className="display mt-1 truncate text-2xl">{event.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {KIND_LABELS[kind]} · {event.organizer} · {event.status}
                    {kind === 'fundraiser'
                      ? ` · ${formatMoney(event.raised)} raised`
                      : ` · ${event.booked}${event.capacity ? ` / ${event.capacity}` : ''} tickets`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/events/${event.id}`} className="btn btn-outline py-2">
                    View
                  </Link>
                  {event.status !== 'cancelled' && (
                    <>
                      <Link to={`/events/${event.id}/edit`} className="btn btn-dark py-2">
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn btn-outline py-2 text-accent"
                        onClick={() => handleCancel(event)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Event pages">
          <button
            type="button"
            className="btn btn-outline py-2"
            disabled={page <= 1 || loading}
            onClick={() => {
              setLoading(true)
              setError('')
              setPage((current) => current - 1)
            }}
          >
            Previous
          </button>
          <span className="font-mono text-xs text-muted">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-outline py-2"
            disabled={page >= pageCount || loading}
            onClick={() => {
              setLoading(true)
              setError('')
              setPage((current) => current + 1)
            }}
          >
            Next
          </button>
        </nav>
      )}
    </main>
  )
}
