import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

function linkClass({ isActive }) {
  return `text-sm transition-colors hover:text-accent ${isActive ? 'font-semibold text-ink' : 'text-muted'}`
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  function handleLogout() {
    logout()
    closeMenu()
    navigate('/')
  }

  // Links change depending on whether someone is logged in.
  const links = (
    <>
      <NavLink to="/events" end className={linkClass} onClick={closeMenu}>
        Events
      </NavLink>
      {user && (
        <NavLink to="/events/new" className={linkClass} onClick={closeMenu}>
          Create
        </NavLink>
      )}
      {user && (
        <NavLink to="/dashboard" className={linkClass} onClick={closeMenu}>
          Dashboard
        </NavLink>
      )}
    </>
  )

  const account = user ? (
    <>
      <span className="flex items-center gap-2 text-sm">
        <span className="grid size-8 place-items-center rounded-full bg-ink font-mono text-xs text-paper">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span>
          {user.name} <span className="text-muted">· {user.university}</span>
        </span>
      </span>
      <button type="button" className="btn btn-outline py-2" onClick={handleLogout}>
        Log out
      </button>
    </>
  ) : (
    <>
      <Link to="/login" className="text-sm font-semibold hover:text-accent" onClick={closeMenu}>
        Log in
      </Link>
      <Link to="/register" className="btn btn-dark py-2.5" onClick={closeMenu}>
        Sign up <span className="text-accent">↗</span>
      </Link>
    </>
  )

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <Link to="/" className="text-lg font-bold tracking-tight" onClick={closeMenu}>
          <span className="mr-1 align-[-2px] text-2xl text-accent">◒</span> campus hub
        </Link>

        {/* Desktop (md and up) */}
        <nav className="hidden items-center gap-8 md:flex">{links}</nav>
        <div className="hidden items-center gap-4 md:flex">{account}</div>

        {/* Mobile menu button (below md) */}
        <button
          type="button"
          className="text-2xl md:hidden"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-4 border-t border-line px-4 py-5 md:hidden">
          {links}
          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">{account}</div>
        </nav>
      )}
    </header>
  )
}
