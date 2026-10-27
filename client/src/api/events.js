import { apiGet } from './client.js'
import { demoEvents } from '../data/demoEvents.js'

// Accepts the API event shape (GET /api/events and GET /api/events/:id return the
// same object) as well as the local demo/draft events, which use the older names.
export function normalizeEvent(raw) {
  return {
    id: String(raw.id),
    title: raw.title,
    description: raw.description ?? '',
    cause: raw.cause ?? raw.pledge ?? raw.description ?? '',
    category: raw.category ?? 'General',
    type: raw.event_type ?? raw.type ?? 'event',
    date: raw.date,
    deadline: raw.registration_deadline ?? raw.deadline ?? raw.date,
    location: raw.location,
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    university: raw.university ?? raw.organizer?.university ?? null,
    capacity: Number(raw.total_tickets ?? raw.capacity ?? 0),
    booked: Number(raw.booked_tickets ?? raw.booked ?? 0),
    available: raw.available_tickets ?? null,
    price: Number(raw.price ?? 0),
    goal: Number(raw.fundraiser_goal ?? raw.goal ?? 0),
    raised: Number(raw.raised_amount ?? raw.raised ?? 0),
    // The API sends organizer as an object; demo data uses a plain name string.
    organizer: raw.organizer?.name ?? raw.organizer ?? 'Student organiser',
    organizerEmail: raw.organizer?.email ?? raw.organizerEmail ?? null,
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
