import { Link } from 'react-router-dom'
import ProgressBar from './ProgressBar.jsx'
import { formatDate, formatMoney, getEventKind, KIND_LABELS } from '../utils/format.js'

// Card colour tells the event kind apart at a glance.
const KIND_STYLES = {
  free: 'bg-sage border-sage-dark',
  paid: 'bg-peach border-accent',
  fundraiser: 'bg-mist border-teal',
}

export default function EventCard({ event }) {
  const kind = getEventKind(event)
  const seatsLeft = event.capacity - event.booked

  return (
    <article className={`flex min-h-64 flex-col border-t-[3px] p-6 ${KIND_STYLES[kind]}`}>
      <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted">
        <span>{formatDate(event.date)}</span>
        <span className="badge">{KIND_LABELS[kind]}</span>
      </div>

      <h3 className="display mt-auto pt-8 text-2xl">{event.title}</h3>
      <p className="mt-2 text-sm text-muted">
        {event.category} · {event.location}
      </p>

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

      <Link to={`/events/${event.id}`} className="mt-5 text-sm font-semibold hover:text-accent">
        View details <span className="text-accent">→</span>
      </Link>
    </article>
  )
}
