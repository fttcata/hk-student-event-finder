const HOUR = 60 * 60 * 1000

function toGoogleDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError('Calendar event dates must be valid.')
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function googleCalendarUrl(event) {
  const start = new Date(event.date)
  if (Number.isNaN(start.getTime())) throw new RangeError('Calendar event dates must be valid.')

  const end = event.endDate ? new Date(event.endDate) : new Date(start.getTime() + HOUR)
  if (Number.isNaN(end.getTime()) || end <= start) {
    throw new RangeError('Calendar event end time must be after its start time.')
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    details: event.description ?? '',
    location: event.location ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
