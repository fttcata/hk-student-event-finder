import { useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'

const sampleEvents = [
  { id: 1, title: 'Campus Innovation Night', category: 'Technology', date: '2026-10-03', location: 'Central Campus' },
  { id: 2, title: 'International Food Fair', category: 'Social', date: '2026-10-08', location: 'Student Union' },
  { id: 3, title: 'Design Portfolio Workshop', category: 'Career', date: '2026-10-12', location: 'Media Lab' },
]

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'

function Home() {
  const [events, setEvents] = useState([])
  const [apiStatus, setApiStatus] = useState('Checking API...')

  useEffect(() => {
    fetch(`${apiBaseUrl}/events`)
      .then((response) => response.json())
      .then((data) => {
        setEvents(data.events)
        setApiStatus('MySQL API connected')
      })
      .catch(() => {
        setEvents(sampleEvents)
        setApiStatus('Showing demo events')
      })
  }, [])

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">HK STUDENT EVENT FINDER</p>
        <h1>Find your next <em>good reason</em> to show up.</h1>
        <p className="hero-copy">A focused home for talks, societies, workshops, and the moments that make campus feel smaller.</p>
        <div className="hero-actions"><Link className="button button-dark" to="/events">Browse events</Link><a className="text-link" href="#how-it-works">How it works <span>↗</span></a></div>
      </section>
      <section className="event-section" id="how-it-works">
        <div className="section-heading"><div><p className="eyebrow">UP NEXT</p><h2>Events worth leaving your room for.</h2></div><p className="status">● {apiStatus}</p></div>
        <div className="event-grid">{events.map((event) => <article className="event-card" key={event.id}><p className="event-date">{new Date(event.date).toLocaleDateString('en-HK', { month: 'short', day: 'numeric' })}</p><h3>{event.title}</h3><p>{event.category} · {event.location}</p><a href="/events">View details <span>→</span></a></article>)}</div>
      </section>
    </main>
  )
}

function Events() {
  return <main className="events-page"><p className="eyebrow">DIRECTORY</p><h1>All events</h1><p>Search and filter controls can grow here as the event catalogue takes shape.</p><Link className="button button-dark" to="/">Back home</Link></main>
}

function App() {
  return (
    <><header><Link className="brand" to="/"><span>◒</span> event finder</Link><nav><Link to="/events">Events</Link><a href="#how-it-works">About</a></nav><Link className="nav-cta" to="/events">Explore <span>↗</span></Link></header><Routes><Route path="/" element={<Home />} /><Route path="/events" element={<Events />} /></Routes></>
  )
}

export default App
