import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { formatMoney } from '../utils/format.js'

export default function FundraiserDonateModal({ event, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  async function submit(eventObject) {
    eventObject.preventDefault()
    try {
      const result = await apiPost(`/events/${event.id}/donate`, { amount: Number(amount) })
      onSuccess(result)
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  return <div className="fixed inset-0 z-30 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true"><form className="panel w-full max-w-md space-y-4" onSubmit={submit}><div className="flex justify-between"><h2 className="display text-2xl">Support {event.title}</h2><button type="button" onClick={onClose} aria-label="Close">×</button></div><p className="text-sm text-muted">{event.cause || event.description}</p><input className="input" type="number" min="1" step="0.01" placeholder="Custom pledge (HK$)" value={amount} onChange={(e) => setAmount(e.target.value)} required />{error && <p className="text-sm text-accent">{error}</p>}<button className="btn btn-accent w-full">Donate {amount ? formatMoney(amount) : ''}</button></form></div>
}
