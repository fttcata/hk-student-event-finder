import { Link } from 'react-router-dom'

export default function NotFoundPage({ message = "This page doesn't exist." }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-6xl items-center px-4 py-16 sm:px-6 sm:py-24">
      <section className="max-w-2xl">
        <p className="eyebrow">Campus Hub · 404</p>
        <h1 className="display mt-4 text-6xl sm:text-8xl">Wrong turn.</h1>
        <p className="mt-6 max-w-md leading-relaxed text-muted">{message}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/events" className="btn btn-dark">Browse events</Link>
          <Link to="/" className="btn btn-outline">Back to home</Link>
        </div>
      </section>
    </main>
  )
}
