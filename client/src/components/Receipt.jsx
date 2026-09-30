import { Link } from 'react-router-dom'

// Confirmation shown after a ticket booking or a pledge, with the unique reference code.
export default function Receipt({ heading, reference, rows, email }) {
  return (
    <div className="panel border-leaf bg-sage/60">
      <p className="eyebrow text-teal">Confirmed ✓</p>
      <h3 className="display mt-3 text-2xl">{heading}</h3>

      <p className="mt-5 text-xs text-muted">Reference</p>
      <p className="font-mono text-2xl tracking-widest">{reference}</p>

      <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-xs text-muted">A receipt will be emailed to {email}.</p>
      <Link to="/dashboard" className="btn btn-dark mt-5 w-full">
        View in dashboard
      </Link>
    </div>
  )
}
