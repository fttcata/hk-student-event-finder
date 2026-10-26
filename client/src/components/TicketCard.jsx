import { Link } from 'react-router-dom'
import TicketBarcode from './TicketBarcode.jsx'
import { formatDateTime, formatMoney } from '../utils/format.js'

export default function TicketCard({ booking }) {
  return (
    <article className="panel grid gap-5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="font-mono text-xs text-muted">{formatDateTime(booking.date)}</p>
        <h3 className="display mt-2 text-2xl">
          <Link to={`/events/${booking.eventId}`} className="hover:text-accent">
            {booking.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted">
          {booking.location} · {booking.quantity} ticket{booking.quantity === 1 ? '' : 's'}
        </p>
        <p className="mt-3 text-sm">
          Price paid: <span className="font-semibold">{booking.total > 0 ? formatMoney(booking.total) : 'Free'}</span>
        </p>
      </div>

      <div className="grid gap-4 border-t border-dashed border-line pt-4 sm:col-span-2 sm:grid-cols-2 sm:border-t-0 sm:pt-0">
        {(booking.ticketCodes ?? [booking.reference]).map((code) => (
          <div key={code} className="flex flex-col items-start gap-2 border-line sm:items-end">
            <span className="font-mono text-xs text-muted">Ticket code</span>
            <span className="font-mono text-sm font-semibold tracking-wider">{code}</span>
            <TicketBarcode code={code} />
          </div>
        ))}
      </div>
    </article>
  )
}
