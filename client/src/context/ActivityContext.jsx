import { createContext, useContext } from 'react'
import { useAuth } from './AuthContext.jsx'
import { usePersistentState } from '../hooks/usePersistentState.js'
import { createReference } from '../utils/format.js'

const ActivityContext = createContext(null)

// Everything the logged-in student has done: tickets, pledges, bookmarks and events they organise.
// Bookings/pledges/bookmarks are stored per user; created events are shared so everyone can browse them.
export function ActivityProvider({ children }) {
  const { user } = useAuth()
  const userKey = user?.email ?? 'guest'

  const [bookings, setBookings] = usePersistentState(`campushub:bookings:${userKey}`, [])
  const [pledges, setPledges] = usePersistentState(`campushub:pledges:${userKey}`, [])
  const [bookmarks, setBookmarks] = usePersistentState(`campushub:bookmarks:${userKey}`, [])
  const [createdEvents, setCreatedEvents] = usePersistentState('campushub:created-events', [])

  function bookTicket(event, quantity) {
    const seatsLeft = event.capacity > 0 ? event.capacity - event.booked : Infinity
    if (quantity > seatsLeft) throw new Error('Sorry, there are not enough seats left.')

    const booking = {
      reference: createReference('TKT'),
      eventId: event.id,
      title: event.title,
      date: event.date,
      location: event.location,
      quantity,
      total: event.price * quantity,
      createdAt: new Date().toISOString(),
    }
    setBookings((current) => [booking, ...current])
    return booking
  }

  function pledge(event, amount) {
    const donation = {
      reference: createReference('DON'),
      eventId: event.id,
      title: event.title,
      amount,
      createdAt: new Date().toISOString(),
    }
    setPledges((current) => [donation, ...current])
    return donation
  }

  function toggleBookmark(eventId) {
    setBookmarks((current) =>
      current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId],
    )
  }

  // Creates a new event, or updates it when `eventData.id` already exists.
  function saveEvent(eventData) {
    if (eventData.id) {
      setCreatedEvents((current) => current.map((e) => (e.id === eventData.id ? { ...e, ...eventData } : e)))
      return eventData
    }
    const newEvent = {
      ...eventData,
      id: `local-${Date.now()}`,
      booked: 0,
      raised: 0,
      organizer: user.name,
      organizerEmail: user.email,
      university: user.university,
    }
    setCreatedEvents((current) => [newEvent, ...current])
    return newEvent
  }

  function deleteEvent(eventId) {
    setCreatedEvents((current) => current.filter((e) => e.id !== eventId))
  }

  const value = {
    bookings,
    pledges,
    bookmarks,
    createdEvents,
    bookTicket,
    pledge,
    toggleBookmark,
    saveEvent,
    deleteEvent,
  }

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}

export function useActivity() {
  return useContext(ActivityContext)
}
