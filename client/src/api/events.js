import { apiDelete, apiGet, apiPost, apiPut } from './client.js'
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
    type: raw.event_type === 'standard' ? 'event' : raw.event_type ?? raw.type ?? 'event',
    isScraped:
      raw.is_scraped === true ||
      raw.isScraped === true ||
      raw.source_type === 'web_scraped' ||
      raw.sourceType === 'web_scraped' ||
      raw.event_type === 'web_scraped' ||
      raw.type === 'web_scraped' ||
      raw.type === 'scraped' ||
      raw.source != null,
    isExternal: raw.is_external === true || raw.source != null,
    originalUrl: raw.original_url ?? raw.source_url ?? raw.originalUrl ?? raw.sourceUrl ?? '',
    date: raw.date,
    endDate: raw.end_date ?? raw.endDate ?? null,
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
    organizerId: raw.organizer?.id ?? raw.organizer_id ?? null,
    status: raw.status ?? 'published',
  }

}

export async function fetchAllEvents() {
  try {
    const [appResponse, externalResponse] = await Promise.all([
      apiGet('/events?source=app'),
      apiGet('/events?source=external'),
    ])
    return {
      events: [...appResponse.events, ...externalResponse.events].map(normalizeEvent),
      source: 'api',
    }
  } catch {
    return { events: demoEvents.map(normalizeEvent), source: 'demo' }
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

export async function fetchMyTickets() {
  const data = await apiGet('/users/me/tickets')
  return data.tickets
}

export async function createEvent(payload) {
  return apiPost('/events', payload)
}

export async function fetchEvent(id) {
  const data = await apiGet(`/events/${encodeURIComponent(id)}`)
  return normalizeEvent(data.event)
}

export async function fetchManagedEvents(page = 1, limit = 12) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  const data = await apiGet(`/events/manage?${params}`)
  return {
    events: data.events.map(normalizeEvent),
    page: data.page,
    limit: data.limit,
    total: data.total,
  }
}

export async function updateEvent(id, event) {
  const data = await apiPut(`/events/${encodeURIComponent(id)}`, {
    title: event.title,
    description: event.description,
    category: event.category,
    date: event.date,
    end_date: event.endDate,
    location: event.location,
    event_type: event.type === 'fundraiser' ? 'fundraiser' : 'standard',
    total_tickets: event.capacity,
    price: event.price,
    fundraiser_goal: event.goal,
  })
  return normalizeEvent(data.event)
}

export async function cancelEvent(id) {
  const data = await apiDelete(`/events/${encodeURIComponent(id)}`)
  return normalizeEvent(data.event)
}

export async function deleteEvent(id) {
  return apiDelete(`/events/${encodeURIComponent(id)}`)
}

export async function refreshCedarsEvents() {
  return apiPost('/events/admin/scrape', {})
}

export async function cancelAllUserEvents() {
  return apiDelete('/events/admin/user-created')
}

export async function deleteAllCedarsEvents() {
  return apiDelete('/events/admin/cedars')
}

export async function fetchAdminUsers() {
  const data = await apiGet('/users/admin')
  return data.users
}

export async function deleteAdminUser(id) {
  return apiDelete(`/users/admin/${encodeURIComponent(id)}`)
}

export async function bookEventTickets(id, { attendees }) {
  const data = await apiPost(`/events/${encodeURIComponent(id)}/tickets`, {
    quantity: attendees.length,
    attendees,
  })
  return data
}
