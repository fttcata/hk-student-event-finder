import { useEffect, useMemo, useState } from 'react'
import { fetchEvents } from '../api/events.js'
import { useActivity } from '../context/ActivityContext.jsx'

// Single source of events for every page: API (or demo) events + events created in this browser,
// with this user's bookings and pledges added onto the seat and fundraising totals.
export function useEvents() {
  const { createdEvents, bookings, pledges } = useActivity()
  const [result, setResult] = useState({ events: [], source: 'loading' })

  useEffect(() => {
    let ignore = false
    fetchEvents().then((data) => {
      if (!ignore) setResult(data)
    })
    return () => {
      ignore = true
    }
  }, [])

  const events = useMemo(
    () =>
      [...createdEvents, ...result.events].map((event) => {
        const seats = bookings.filter((b) => b.eventId === event.id).reduce((sum, b) => sum + b.quantity, 0)
        const pledged = pledges.filter((p) => p.eventId === event.id).reduce((sum, p) => sum + p.amount, 0)
        return { ...event, booked: event.booked + seats, raised: event.raised + pledged }
      }),
    [createdEvents, result.events, bookings, pledges],
  )

  return { events, source: result.source, loading: result.source === 'loading' }
}
