import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { formatMoney } from '../utils/format.js'

export default function TicketCheckoutModal({ event, quantity, onClose, onSuccess }) {
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const paid = event.price > 0

  async function submit(eventObject) {
    eventObject.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await apiPost(`/events/${event.id}/tickets`, { quantity, ...card })
      onSuccess(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true">
      <form className="panel w-full max-w-md space-y-4" onSubmit={submit}>
        <div className="flex items-start justify-between"><div><p className="eyebrow">Ticket checkout</p><h2 className="display mt-1 text-2xl">{paid ? 'Confirm payment' : 'Claim Free Ticket'}</h2></div><button type="button" className="text-xl" onClick={onClose} aria-label="Close">×</button></div>
        <p className="text-sm text-muted">{quantity} ticket{quantity === 1 ? '' : 's'} · {paid ? formatMoney(event.price * quantity) : 'Free'}</p>
        {paid && <div className="grid gap-3"><input className="input" placeholder="Card number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} required /><div className="grid grid-cols-2 gap-3"><input className="input" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} required /><input className="input" placeholder="CVC" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} required /></div></div>}
        {error && <p className="text-sm text-accent">{error}</p>}
        <button className="btn btn-accent w-full" disabled={saving}>{saving ? 'Processing…' : paid ? `Pay ${formatMoney(event.price * quantity)}` : 'Claim Free Ticket'}</button>
      </form>
    </div>
  )
}
