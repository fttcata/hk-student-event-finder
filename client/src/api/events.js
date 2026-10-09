import { apiGet } from './client.js'
import { demoEvents } from '../data/demoEvents.js'

// The API currently returns only id, title, category, date and location,
// so every other field gets a safe default until the backend query is extended.
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
    university: raw.university ?? null,
    capacity: Number(raw.capacity ?? 0),
    booked: Number(raw.booked ?? 0),
    price: Number(raw.price ?? 0),
    goal: Number(raw.fundraiser_goal ?? raw.goal ?? 0),
    raised: Number(raw.raised_amount ?? raw.raised ?? 0),
    organizer: raw.organizer ?? 'Student organiser',
    organizerEmail: raw.organizerEmail ?? null,
  }
}

// GET /api/events → MySQL. Falls back to demo data so the UI is still usable without the backend.
export async function fetchEvents() {
  try {
    const data = await apiGet('/events')
    return { events: data.events.map(normalizeEvent), source: 'api' }
  } catch {
    return { events: demoEvents.map(normalizeEvent), source: 'demo' }
  }
}
