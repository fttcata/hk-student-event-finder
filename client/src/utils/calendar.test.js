import assert from 'node:assert/strict'
import test from 'node:test'
import { googleCalendarUrl } from './calendar.js'

test('builds a prefilled Google Calendar URL with event details and UTC dates', () => {
  const url = new URL(googleCalendarUrl({
    title: 'Campus meetup & lunch',
    date: '2026-11-10T02:00:00.000Z',
    endDate: '2026-11-10T03:30:00.000Z',
    description: 'Bring your notes & questions',
    location: 'Run Run Shaw Tower',
  }))

  assert.equal(url.origin, 'https://calendar.google.com')
  assert.equal(url.pathname, '/calendar/render')
  assert.equal(url.searchParams.get('action'), 'TEMPLATE')
  assert.equal(url.searchParams.get('text'), 'Campus meetup & lunch')
  assert.equal(url.searchParams.get('dates'), '20261110T020000Z/20261110T033000Z')
  assert.equal(url.searchParams.get('details'), 'Bring your notes & questions')
  assert.equal(url.searchParams.get('location'), 'Run Run Shaw Tower')
})

test('uses a one-hour end time for legacy events without an end date', () => {
  const url = new URL(googleCalendarUrl({
    title: 'Legacy event',
    date: '2026-11-10T02:00:00.000Z',
  }))

  assert.equal(url.searchParams.get('dates'), '20261110T020000Z/20261110T030000Z')
})

test('rejects invalid event date ranges', () => {
  assert.throws(
    () => googleCalendarUrl({
      title: 'Invalid event',
      date: '2026-11-10T02:00:00.000Z',
      endDate: '2026-11-10T01:00:00.000Z',
    }),
    RangeError,
  )
})
