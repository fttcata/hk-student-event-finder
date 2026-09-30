import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import Field from '../components/Field.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getUniversityFromEmail } from '../utils/universities.js'
import { validatePassword, validateStudentEmail } from '../utils/validation.js'

function validate(form) {
  return {
    name: form.name.trim() ? '' : 'Name is required.',
    email: validateStudentEmail(form.email),
    password: validatePassword(form.password),
    confirm: form.confirm === form.password ? '' : 'Passwords do not match.',
  }
}

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Live feedback: as soon as the domain matches, show which university was detected.
  const detected = getUniversityFromEmail(form.email)

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
    // Hide a field's error as soon as the user starts fixing it.
    setErrors({ ...errors, [e.target.name]: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await register(form)
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (err) {
      setSubmitError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout eyebrow="Join Campus Hub" title="One account for every campus.">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <h2 className="display text-3xl">Create account</h2>

        <Field label="Full name" htmlFor="name" error={errors.name}>
          <input
            id="name"
            name="name"
            autoComplete="name"
            className={`input ${errors.name ? 'input-error' : ''}`}
            value={form.name}
            onChange={handleChange}
          />
        </Field>

        <Field
          label="University email"
          htmlFor="email"
          error={errors.email}
          hint={detected ? `✓ ${detected.name}` : 'Must end in an HKU, CUHK or PolyU student domain.'}
        >
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className={`input ${errors.email ? 'input-error' : ''}`}
            placeholder="1155123456@link.cuhk.edu.hk"
            value={form.email}
            onChange={handleChange}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              className={`input ${errors.password ? 'input-error' : ''}`}
              value={form.password}
              onChange={handleChange}
            />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors.confirm}>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              className={`input ${errors.confirm ? 'input-error' : ''}`}
              value={form.confirm}
              onChange={handleChange}
            />
          </Field>
        </div>

        {submitError && <p className="rounded-sm bg-peach/50 p-3 text-sm">{submitError}</p>}

        <button type="submit" className="btn btn-dark w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="font-semibold text-ink hover:text-accent">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
