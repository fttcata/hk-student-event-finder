import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import Field from '../components/Field.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function VerifyPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { verify } = useAuth()
  const [email, setEmail] = useState(location.state?.email ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await verify({ email, code })
      navigate('/events', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout eyebrow="Verify your student account" title="Almost there.">
      <form className="space-y-5" onSubmit={submit}>
        <h2 className="display text-3xl">Enter your email code</h2>
        <p className="text-sm text-muted">Check your inbox for the Campus Hub verification code.</p>
        <Field label="University email" htmlFor="email">
          <input id="email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Verification code" htmlFor="code">
          <input id="code" className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="VRF..." required />
        </Field>
        {error && <p className="rounded-sm bg-peach/50 p-3 text-sm">{error}</p>}
        <button className="btn btn-dark w-full" disabled={submitting}>{submitting ? 'Verifying…' : 'Verify account'}</button>
      </form>
    </AuthLayout>
  )
}
