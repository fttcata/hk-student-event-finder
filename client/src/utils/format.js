const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// An event is shown as one of three kinds, which drives badges, filters and the booking panel.
export function getEventKind(event) {
  if (event.type === 'fundraiser') return 'fundraiser'
  return event.price > 0 ? 'paid' : 'free'
}

export const KIND_LABELS = { free: 'Free', paid: 'Paid', fundraiser: 'Fundraiser' }

export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-HK', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-HK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMoney(amount) {
  return `HK$${Number(amount).toLocaleString('en-HK', { maximumFractionDigits: 2 })}`
}

export function formatTimeLeft(ms) {
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(minutes, 1)}m`
}

// Unique booking / donation reference shown on receipts, e.g. "TKT-8K2QX9".
export function createReference(prefix) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${random}`
}

// Event chat opens 6 hours before the event and closes 7 days after it.
export function getChatStatus(eventDate, now = Date.now()) {
  const start = new Date(eventDate).getTime()
  const opensAt = start - 6 * HOUR
  const closesAt = start + 7 * DAY
  if (now < opensAt) return { state: 'locked', label: `Chat opens in ${formatTimeLeft(opensAt - now)}` }
  if (now <= closesAt) return { state: 'open', label: 'Chat is open' }
  return { state: 'closed', label: 'Chat closed' }
}

export function byDate(a, b) {
  return new Date(a.date) - new Date(b.date)
}

// Converts an ISO date into the "YYYY-MM-DDTHH:mm" format that <input type="datetime-local"> expects.
export function toDateTimeInput(value) {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
