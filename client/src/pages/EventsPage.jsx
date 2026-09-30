import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import ApiStatus from '../components/ApiStatus.jsx'
import EventCard from '../components/EventCard.jsx'
import { useEvents } from '../hooks/useEvents.js'
import { byDate, getEventKind } from '../utils/format.js'
import { UNIVERSITIES } from '../utils/universities.js'

const KIND_FILTERS = [
  ['all', 'All'],
  ['free', 'Free'],
  ['paid', 'Paid'],
  ['fundraiser', 'Fundraisers'],
]

export default function EventsPage() {
  const { events, source, loading } = useEvents()

  // Filters live in the URL (?q=run&type=paid) so a filtered list can be shared or bookmarked.
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const kind = searchParams.get('type') ?? 'all'
  const university = searchParams.get('uni') ?? 'all'

  function updateParam(name, value) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') next.delete(name)
    else next.set(name, value)
    setSearchParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return events
      .filter((event) => kind === 'all' || getEventKind(event) === kind)
      .filter((event) => university === 'all' || event.university === university)
      .filter((event) => {
        if (!keyword) return true
        const text = [event.title, event.description, event.location, event.category, event.organizer].join(' ')
        return text.toLowerCase().includes(keyword)
      })
      .sort(byDate)
  }, [events, query, kind, university])

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Directory</p>
          <h1 className="display mt-4 text-5xl md:text-6xl">All events</h1>
        </div>
        <ApiStatus source={source} />
      </div>

      <div className="mt-10 flex flex-col gap-3 md:flex-row">
        <input
          type="search"
          className="input md:flex-1"
          placeholder="Search by title, venue, society…"
          value={query}
          onChange={(e) => updateParam('q', e.target.value)}
          aria-label="Search events"
        />
        <select
          className="input md:w-56"
          value={university}
          onChange={(e) => updateParam('uni', e.target.value)}
          aria-label="Filter by university"
        >
          <option value="all">All universities</option>
          {UNIVERSITIES.map((u) => (
            <option key={u.code} value={u.code}>
              {u.code}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {KIND_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => updateParam('type', value)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              kind === value ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-8 font-mono text-xs text-muted">
        {loading ? 'Loading events…' : `Showing ${filtered.length} of ${events.length} events`}
      </p>

      {!loading && filtered.length === 0 ? (
        <div className="panel mt-4 text-center">
          <p className="text-muted">No events match those filters.</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => setSearchParams({})}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </main>
  )
}
