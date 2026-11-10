import assert from 'node:assert/strict'
import test from 'node:test'
import { validateEventForm } from './validation.js'

const validEvent = {
  type: 'event',
  title: 'Campus meetup',
  description: 'A campus meetup with talks and time for questions.',
  category: 'Social',
  date: '2030-01-01T10:00',
  endDate: '2030-01-01T11:00',
  location: 'Student Union',
  capacity: '20',
  price: '0',
  goal: '5000',
}

test('requires an event end date and time', () => {
  const errors = validateEventForm({ ...validEvent, endDate: '' })
  assert.equal(errors.endDate, 'Pick an end date and time.')
})

test('requires the event end time to be after its start time', () => {
  const errors = validateEventForm({ ...validEvent, endDate: '2030-01-01T10:00' })
  assert.equal(errors.endDate, 'The event must end after it starts.')
})

test('accepts a valid event date range', () => {
  const errors = validateEventForm(validEvent)
  assert.equal(errors.endDate, undefined)
})
