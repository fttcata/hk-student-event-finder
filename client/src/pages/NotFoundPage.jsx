import { Link } from 'react-router-dom'

export default function NotFoundPage({ message = "This page doesn't exist." }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <p className="eyebrow">404</p>
      <h1 className="display mt-4 text-5xl md:text-7xl">Nothing here.</h1>
      <p className="mt-6 text-muted">{message}</p>
      <Link to="/events" className="btn btn-dark mt-8">
        Browse events
      </Link>
    </main>
  )
}
