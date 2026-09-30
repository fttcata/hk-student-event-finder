import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Field from '../components/Field.jsx'
import MapEmbed from '../components/MapEmbed.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { toDateTimeInput } from '../utils/format.js'
import { validateEventForm } from '../utils/validation.js'

const CATEGORIES = ['Technology', 'Social', 'Career', 'Sports', 'Arts', 'Charity']

const EMPTY_FORM = {
  type: 'event',
  title: '',
  description: '',
  category: 'Social',
  date: '',
  deadline: '',
  location: '',
  capacity: '50',
  price: '0',
  goal: '5000',
}

function toForm(event) {
  return {
    type: event.type,
    title: event.title,
    description: event.description,
    category: event.category,
    date: toDateTimeInput(event.date),
    deadline: toDateTimeInput(event.deadline),
    location: event.location,
    capacity: String(event.capacity),
    price: String(event.price),
    goal: String(event.goal),
  }
}

function EventForm({ existing }) {
  const { saveEvent } = useActivity()
  const navigate = useNavigate()
  const [form, setForm] = useState(() => (existing ? toForm(existing) : EMPTY_FORM))
  const [errors, setErrors] = useState({})
  // The map only refreshes when the venue field loses focus, not on every keystroke.
  const [mapQuery, setMapQuery] = useState(existing?.location ?? '')

  const isFundraiser = form.type === 'fundraiser'

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
    // Hide a field's error as soon as the user starts fixing it.
    setErrors({ ...errors, [e.target.name]: '' })
  }

  function handleSubmit(e) {
    e.preventDefault()
    const nextErrors = validateEventForm(form, existing?.booked ?? 0)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const saved = saveEvent({
      ...(existing && { id: existing.id }),
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      category: isFundraiser ? 'Charity' : form.category,
      date: new Date(form.date).toISOString(),
      deadline: new Date(form.deadline).toISOString(),
      location: form.location.trim(),
      capacity: isFundraiser ? 0 : Number(form.capacity),
      price: isFundraiser ? 0 : Number(form.price),
      goal: isFundraiser ? Number(form.goal) : 0,
    })
    navigate(`/events/${saved.id}`)
  }

  const inputClass = (name) => `input ${errors[name] ? 'input-error' : ''}`

  return (
    <form className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]" onSubmit={handleSubmit} noValidate>
      <div className="space-y-6">
        {/* Event kind: standard (free/paid tickets) vs fundraiser (pledges toward a goal) */}
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">What are you organising?</legend>
          {[
            ['event', 'Standard event', 'Free or paid tickets with a seat limit.'],
            ['fundraiser', 'Fundraiser', 'Collect pledges toward a target amount.'],
          ].map(([value, label, text]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-sm border p-4 transition-colors ${
                form.type === value ? 'border-ink bg-white/70' : 'border-line hover:border-ink/40'
              }`}
            >
              <input
                type="radio"
                name="type"
                value={value}
                checked={form.type === value}
                onChange={handleChange}
                className="sr-only"
              />
              <span className="font-semibold">{label}</span>
              <span className="mt-1 block text-sm text-muted">{text}</span>
            </label>
          ))}
        </fieldset>

        <Field label="Title" htmlFor="title" error={errors.title}>
          <input id="title" name="title" className={inputClass('title')} value={form.title} onChange={handleChange} />
        </Field>

        <Field label="Description" htmlFor="description" error={errors.description}>
          <textarea
            id="description"
            name="description"
            rows={5}
            className={inputClass('description')}
            value={form.description}
            onChange={handleChange}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Starts" htmlFor="date" error={errors.date}>
            <input
              id="date"
              name="date"
              type="datetime-local"
              className={inputClass('date')}
              value={form.date}
              onChange={handleChange}
            />
          </Field>
          <Field label={isFundraiser ? 'Campaign ends' : 'Registration deadline'} htmlFor="deadline" error={errors.deadline}>
            <input
              id="deadline"
              name="deadline"
              type="datetime-local"
              className={inputClass('deadline')}
              value={form.deadline}
              onChange={handleChange}
            />
          </Field>
        </div>

        {isFundraiser ? (
          <Field label="Fundraising goal (HK$)" htmlFor="goal" error={errors.goal}>
            <input
              id="goal"
              name="goal"
              type="number"
              min="100"
              className={inputClass('goal')}
              value={form.goal}
              onChange={handleChange}
            />
          </Field>
        ) : (
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Category" htmlFor="category">
              <select id="category" name="category" className="input" value={form.category} onChange={handleChange}>
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Capacity" htmlFor="capacity" error={errors.capacity}>
              <input
                id="capacity"
                name="capacity"
                type="number"
                min="1"
                className={inputClass('capacity')}
                value={form.capacity}
                onChange={handleChange}
              />
            </Field>
            <Field label="Ticket price (HK$)" htmlFor="price" error={errors.price} hint="0 = free event">
              <input
                id="price"
                name="price"
                type="number"
                min="0"
                className={inputClass('price')}
                value={form.price}
                onChange={handleChange}
              />
            </Field>
          </div>
        )}
      </div>

      <aside className="space-y-4 self-start lg:sticky lg:top-24">
        <Field label="Venue" htmlFor="location" error={errors.location} hint="Type an address, then click away to pin it.">
          <input
            id="location"
            name="location"
            className={inputClass('location')}
            placeholder="e.g. Run Run Shaw Tower, HKU"
            value={form.location}
            onChange={handleChange}
            onBlur={() => setMapQuery(form.location.trim())}
          />
        </Field>
        {mapQuery ? (
          <MapEmbed query={mapQuery} className="h-64" />
        ) : (
          <div className="grid h-64 place-items-center rounded-sm border border-dashed border-line text-sm text-muted">
            Map preview appears here
          </div>
        )}
        <button type="submit" className="btn btn-dark w-full">
          {existing ? 'Save changes' : 'Publish event'}
        </button>
        {Object.values(errors).some(Boolean) && (
          <p className="text-center text-xs text-accent">Please fix the highlighted fields.</p>
        )}
      </aside>
    </form>
  )
}

// Used for both /events/new and /events/:id/edit.
export default function CreateEventPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { createdEvents } = useActivity()

  const existing = id ? createdEvents.find((event) => event.id === id) : null
  const canEdit = !id || (existing && existing.organizerEmail === user.email)

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="eyebrow">{id ? 'Manage listing' : 'New listing'}</p>
      <h1 className="display mt-4 text-5xl md:text-6xl">{id ? 'Edit event' : 'Create an event'}</h1>

      {canEdit ? (
        // `key` gives the form fresh state when switching between "new" and "edit".
        <EventForm key={id ?? 'new'} existing={existing} />
      ) : (
        <div className="panel mt-10">
          <p>You can only edit events you created.</p>
          <Link to="/dashboard?tab=events" className="btn btn-dark mt-4">
            Back to my events
          </Link>
        </div>
      )}
    </main>
  )
}
