// Used for both "seats booked / capacity" and "raised / goal".
export default function ProgressBar({ value, max, barClassName = 'bg-accent' }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full transition-all duration-500 ${barClassName}`} style={{ width: `${percent}%` }} />
    </div>
  )
}
