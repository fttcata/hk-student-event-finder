export default function TicketCounter({ available, total, value, onChange, max = 4 }) {
  const limit = Math.max(0, Math.min(max, available ?? max))
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Tickets</p>
        <p className="text-xs text-muted">{available == null ? 'Unlimited availability' : `${available} of ${total} remaining`}</p>
      </div>
      <select className="input w-24" value={value} disabled={limit === 0} onChange={(event) => onChange(Number(event.target.value))}>
        {Array.from({ length: limit }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
      </select>
    </div>
  )
}
