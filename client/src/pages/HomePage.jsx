import { Link } from 'react-router-dom'
import ApiStatus from '../components/ApiStatus.jsx'
import EventCard from '../components/EventCard.jsx'
import { useEvents } from '../hooks/useEvents.js'
import { byDate } from '../utils/format.js'

const STEPS = [
  ['01', 'Browse', 'Search events and fundraisers across HKU, CUHK and PolyU, filtered by free, paid or charity.'],
  ['02', 'Book or pledge', 'Claim a free ticket, check out a paid one, or pledge to a campaign in a couple of taps.'],
  ['03', 'Get your receipt', 'Every booking gets a unique reference, and the event chat unlocks 6 hours before it starts.'],
]

export default function HomePage() {
  const { events, source } = useEvents()

  const sorted = [...events].sort(byDate)
  const upcoming = sorted.filter((event) => new Date(event.date) >= new Date())
  const featured = (upcoming.length ? upcoming : sorted).slice(0, 3)

  return (
    <main>
      <section className="mx-auto max-w-6xl bg-[radial-gradient(circle_at_72%_48%,#e0e8cc_0,transparent_34%)] px-4 pt-16 pb-24 sm:px-6 md:pt-24">
        <p className="eyebrow">Campus Hub · HKU · CUHK · PolyU</p>
        <h1 className="display mt-6 max-w-3xl text-5xl sm:text-7xl lg:text-8xl">
          Find your next <em className="text-accent not-italic">good reason</em> to show up.
        </h1>
        <p className="mt-8 max-w-md leading-relaxed text-muted">
          Student events, tickets and grassroots fundraisers in one place, instead of scattered across twenty group
          chats and a noticeboard.
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Link to="/events" className="btn btn-dark">
            Browse events <span className="text-accent">↗</span>
          </Link>
          <Link to="/events?type=fundraiser" className="text-sm font-semibold hover:text-accent">
            Support a fundraiser <span className="text-accent">→</span>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-line px-4 py-14 sm:px-6">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Up next</p>
            <h2 className="display mt-4 max-w-md text-4xl">Events worth leaving your room for.</h2>
          </div>
          <ApiStatus source={source} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featured.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-line px-4 py-14 sm:px-6">
        <p className="eyebrow">How it works</p>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map(([number, title, text]) => (
            <div key={number}>
              <p className="font-mono text-xs text-muted">{number}</p>
              <h3 className="display mt-3 text-2xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
