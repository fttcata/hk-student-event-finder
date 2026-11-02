import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Wraps pages that need a logged-in student. Guests are sent to /login,
// and `state.from` remembers where they were going so login can send them back.
export default function ProtectedRoute({ children, role }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (role && user.role !== role) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="panel">
          <h1 className="display text-3xl">Access restricted</h1>
          <p className="mt-3 text-muted">You need administrator access to view this page.</p>
        </div>
      </main>
    )
  }
  return children
}
