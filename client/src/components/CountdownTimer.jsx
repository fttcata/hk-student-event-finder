import { useEffect, useState } from 'react'

function remaining(target) {
  return Math.max(0, new Date(target).getTime() - Date.now())
}

export default function CountdownTimer({ target, label = 'Booking closes in' }) {
  const [milliseconds, setMilliseconds] = useState(() => remaining(target))

  useEffect(() => {
    setMilliseconds(remaining(target))
    const timer = window.setInterval(() => setMilliseconds(remaining(target)), 1000)
    return () => window.clearInterval(timer)
  }, [target])

  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const expired = milliseconds === 0

  return (
    <div className={`rounded-sm border p-3 ${expired ? 'border-accent/40 bg-accent/10' : 'border-line bg-white/50'}`}>
      <p className="font-mono text-xs text-muted">{expired ? 'Booking window expired' : label}</p>
      <p className="mt-1 font-mono text-lg font-semibold" aria-live="polite">
        {expired ? '00:00:00' : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
      </p>
    </div>
  )
}
