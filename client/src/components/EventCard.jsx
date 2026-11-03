import { Link } from 'react-router-dom'
import ProgressBar from './ProgressBar.jsx'
import { formatDate, formatMoney, getEventKind, getSafeExternalUrl, KIND_LABELS } from '../utils/format.js'

// Card colour tells the event kind apart at a glance.
const KIND_STYLES = {
  free: 'bg-sage border-sage-dark',
  paid: 'bg-peach border-accent',
  fundraiser: 'bg-mist border-teal',
  scraped: 'bg-mist border-teal',
}

export default function EventCard({ event }) {
  const kind = getEventKind(event)
  const seatsLeft = event.capacity - event.booked
  const external = event.isScraped || event.isExternal
  const cardKind = external ? 'scraped' : kind
  const originalUrl = external ? getSafeExternalUrl(event.originalUrl) : null

  return (
    <article className={`flex min-h-64 flex-col border-t-[3px] p-6 ${KIND_STYLES[cardKind]}`}>
      <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted">
        <span>{formatDate(event.date)}</span>
        <span className="badge">{external ? 'Web-scraped' : KIND_LABELS[kind]}</span>
      </div>

      <h3 className="display mt-auto pt-8 text-2xl">{event.title}</h3>
      <p className="mt-2 text-sm text-muted">{event.category}{event.location ? ` · ${event.location}` : ''}</p>

      {!external && (
        <div className="mt-4 text-xs text-muted">
          {kind === 'fundraiser' ? (
            <>
              <ProgressBar value={event.raised} max={event.goal} barClassName="bg-teal" />
              <p className="mt-2">
                {formatMoney(event.raised)} of {formatMoney(event.goal)}
              </p>
            </>
          ) : (
            <p>
              {kind === 'paid' ? formatMoney(event.price) : 'Free'}
              {event.capacity > 0 && ` · ${seatsLeft > 0 ? `${seatsLeft} seats left` : 'Sold out'}`}
            </p>
          )}
        </div>
      )}

      {external ? (
        originalUrl ? (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 text-sm font-semibold hover:text-accent"
          >
            View details <span className="text-accent">↗</span>
          </a>
        ) : (
          <p className="mt-5 text-sm text-muted">Original event link unavailable</p>
        )
      ) : (
        <Link to={`/events/${event.id}`} className="mt-5 text-sm font-semibold hover:text-accent">
          View details <span className="text-accent">→</span>
        </Link>
      )}
    </article>
  )
}
