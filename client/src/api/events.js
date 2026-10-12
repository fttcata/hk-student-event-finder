import { apiGet } from './client.js'
import { demoEvents } from '../data/demoEvents.js'

// The list endpoint returns both the new filter field names (total_tickets,
// available_tickets, ...) and the original capacity/booked names, so reads
// here accept either shape.
export function normalizeEvent(raw) {
  return {
    id: String(raw.id),
    title: raw.title,
    description: raw.description ?? '',
    cause: raw.cause ?? raw.pledge ?? raw.description ?? '',
    category: raw.category ?? 'General',
    type: raw.event_type ?? raw.type ?? 'event',
    date: raw.date,
    deadline: raw.deadline ?? raw.date,
    location: raw.location,
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    university: raw.university ?? null,
    capacity: Number(raw.capacity ?? raw.total_tickets ?? 0),
    booked: Number(raw.booked ?? raw.booked_tickets ?? 0),
    available: raw.available_tickets ?? null,
    price: Number(raw.price ?? 0),
    goal: Number(raw.fundraiser_goal ?? raw.goal ?? 0),
    raised: Number(raw.raised_amount ?? raw.raised ?? 0),
    organizer: raw.organizer ?? 'Student organiser',
    organizerEmail: raw.organizerEmail ?? null,
  }
}

// GET /api/events → MySQL. Filters map 1:1 to the backend query params
// (search, category_id, event_type, availability, price, page, limit).
// Falls back to demo data so the UI is still usable without the backend.
export async function fetchEvents(filters = {}) {
  try {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      }
    }
    const query = params.toString()
    const data = await apiGet(query ? `/events?${query}` : '/events')
    return {
      events: data.events.map(normalizeEvent),
      source: 'api',
      page: data.page ?? 1,
      limit: data.limit ?? data.events.length,
      total: data.total ?? data.events.length,
    }
  } catch {
    return { events: demoEvents.map(normalizeEvent), source: 'demo' }
  }
}
