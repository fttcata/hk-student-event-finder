import { useEffect, useState } from 'react'
import { formatMoney } from '../utils/format.js'

const QUICK_AMOUNTS = [20, 50, 100, 200]

export default function FundraiserDonateModal({ fundraiserTitle, onClose, onDonate }) {
  const [amount, setAmount] = useState('50')
  const [error, setError] = useState('')

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleSubmit(event) {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isInteger(value) || value < 10) {
      setError('Pledges must be a whole amount of at least HK$10.')
      return
    }
    if (value > 100000) {
      setError('Pledges are capped at HK$100,000.')
      return
    }

    onDonate(value)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="donate-modal-title"
        className="panel w-full max-w-lg bg-paper shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Support this fundraiser</p>
            <h2 id="donate-modal-title" className="display mt-2 text-3xl">Choose an amount.</h2>
            <p className="mt-2 text-sm text-muted">{fundraiserTitle}</p>
          </div>
          <button type="button" className="btn btn-outline px-3 py-2" onClick={onClose} aria-label="Close donation dialog">
            Close
          </button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setAmount(String(value))
                  setError('')
                }}
                aria-pressed={amount === String(value)}
                className={`rounded-sm border py-2 text-sm ${
                  amount === String(value) ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
                }`}
              >
                {formatMoney(value)}
              </button>
            ))}
          </div>

          <label className="block text-sm">
            <span className="text-muted">Custom amount (HK$)</span>
            <input
              autoFocus
              type="number"
              min="10"
              max="100000"
              step="1"
              className={`input mt-1 ${error ? 'input-error' : ''}`}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setError('')
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'donation-error' : undefined}
            />
          </label>
          {error && <p id="donation-error" className="text-sm text-accent" role="alert">{error}</p>}

          <div className="flex gap-3">
            <button type="button" className="btn btn-outline flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-accent flex-1">
              Support {amount && Number(amount) > 0 ? formatMoney(amount) : ''}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
