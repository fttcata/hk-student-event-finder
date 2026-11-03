import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import Field from '../components/Field.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { validateStudentEmail } from '../utils/validation.js'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Where ProtectedRoute wanted to send the user before asking them to log in.
  const redirectTo = location.state?.from ?? '/events'

  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
    // Hide a field's error as soon as the user starts fixing it.
    setErrors({ ...errors, [e.target.name]: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const nextErrors = {
      email: validateStudentEmail(form.email),
      password: form.password ? '' : 'Password is required.',
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await login(form)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setSubmitError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout eyebrow="Welcome back" title="Log in to Campus Hub.">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <h2 className="display text-3xl">Log in</h2>

        <Field label="University email" htmlFor="email" error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className={`input ${errors.email ? 'input-error' : ''}`}
            placeholder="u3612345@connect.hku.hk"
            value={form.email}
            onChange={handleChange}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password}>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className={`input ${errors.password ? 'input-error' : ''}`}
            value={form.password}
            onChange={handleChange}
          />
        </Field>

        {submitError && <p className="rounded-sm bg-peach/50 p-3 text-sm">{submitError}</p>}

        <button type="submit" className="btn btn-dark w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
        <p className="text-sm text-muted">
          New here?{' '}
          <Link to="/register" state={location.state} className="font-semibold text-ink hover:text-accent">
            Create a student account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
