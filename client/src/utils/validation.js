import { getUniversityFromEmail } from './universities.js'

// Each validator returns an error message, or '' when the value is valid.

export function validateStudentEmail(email) {
  const value = email.trim()
  if (!value) return 'Email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.'
  if (!getUniversityFromEmail(value)) return 'Use your HKU, CUHK or PolyU student email.'
  return ''
}

export function validatePassword(password) {
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return ''
}

// Returns an object like { title: 'Title is required.' }; empty object means the form is valid.
export function validateEventForm(form, bookedSeats = 0) {
  const errors = {}
  const now = new Date()

  if (form.title.trim().length < 3) errors.title = 'Title must be at least 3 characters.'
  if (form.title.length > 150) errors.title = 'Title must be 150 characters or fewer.'
  if (form.description.trim().length < 20) errors.description = 'Describe the event in at least 20 characters.'
  if (!form.location.trim()) errors.location = 'Venue is required.'

  if (!form.date) errors.date = 'Pick a date and time.'
  else if (new Date(form.date) <= now) errors.date = 'The event must be in the future.'

  if (!form.deadline) errors.deadline = 'Pick a registration deadline.'
  else if (form.date && new Date(form.deadline) > new Date(form.date)) {
    errors.deadline = 'The deadline must be before the event starts.'
  }

  if (form.type === 'fundraiser') {
    if (!(Number(form.goal) >= 100)) errors.goal = 'Fundraising goal must be at least HK$100.'
  } else {
    const capacity = Number(form.capacity)
    if (!Number.isInteger(capacity) || capacity < 1) errors.capacity = 'Capacity must be a whole number of at least 1.'
    else if (capacity < bookedSeats) errors.capacity = `${bookedSeats} seats are already booked; capacity cannot go lower.`

    const price = Number(form.price)
    if (form.price === '' || price < 0 || price > 10000) errors.price = 'Price must be between HK$0 and HK$10,000.'
  }

  return errors
}
