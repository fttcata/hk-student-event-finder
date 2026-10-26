import { Link, useNavigate } from 'react-router-dom'
import TicketCard from '../components/TicketCard.jsx'
import { useActivity } from '../context/ActivityContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function Profile() {
  const { user, logout } = useAuth()
  const { bookings } = useActivity()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  const details = [
    ['Full name', user.name],
    ['Student email', user.email],
    ['University', user.university],
    ['Account type', user.role ?? 'Student'],
    ['Student ID', user.id ?? 'Not provided'],
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Student account</p>
          <h1 className="display mt-4 text-5xl md:text-6xl">Your profile.</h1>
          <p className="mt-3 text-sm text-muted">Manage and review your Campus Hub account details.</p>
        </div>
        <Link to="/dashboard" className="btn btn-dark self-start sm:self-auto">
          Open dashboard
        </Link>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="panel self-start" aria-label="Student summary">
          <div className="grid size-16 place-items-center rounded-full bg-ink font-mono text-2xl text-paper">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="display mt-5 text-3xl">{user.name}</h2>
          <p className="mt-2 text-sm text-muted">{user.email}</p>
          <span className="badge mt-5">{user.university} student</span>
          <button type="button" className="btn btn-outline mt-8 w-full" onClick={handleLogout}>
            Log out
          </button>
        </section>

        <section className="panel" aria-labelledby="profile-details-heading">
          <h2 id="profile-details-heading" className="eyebrow">Account information</h2>
          <dl className="mt-5 divide-y divide-line">
            {details.map(([label, value]) => (
              <div key={label} className="grid gap-1 py-4 sm:grid-cols-[160px_1fr] sm:gap-4">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-sm font-medium">{value || 'Not provided'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-4 lg:col-span-2" aria-labelledby="my-tickets-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Your bookings</p>
              <h2 id="my-tickets-heading" className="display mt-2 text-3xl">My tickets.</h2>
            </div>
            <span className="badge">{bookings.reduce((total, booking) => total + booking.quantity, 0)} tickets</span>
          </div>
          {bookings.length === 0 ? (
            <div className="panel">
              <p className="text-sm text-muted">Your event tickets and their unique barcodes will appear here after booking.</p>
              <Link to="/events" className="btn btn-dark mt-4">Find an event</Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {bookings.map((booking) => (
                <li key={booking.reference}>
                  <TicketCard booking={booking} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}