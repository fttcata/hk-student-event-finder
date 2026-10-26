const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function formatCountdown(msLeft) {
  const days = Math.floor(msLeft / DAY)
  const hours = Math.floor((msLeft % DAY) / HOUR)
  const minutes = Math.floor((msLeft % HOUR) / MINUTE)
  const seconds = Math.floor((msLeft % MINUTE) / SECOND)

  return [
    ...(days > 0 ? [`${days}d`] : []),
    `${hours}h`,
    `${minutes}m`,
    `${seconds}s`,
  ].join(' ')
}

export default function CountdownTimer({ targetTime, now }) {
  const msLeft = targetTime - now

  if (!Number.isFinite(msLeft)) {
    return <p className="font-mono text-xs text-muted">Registration time unavailable</p>
  }

  if (msLeft <= 0) {
    return <p className="font-mono text-xs text-accent">Registration closed</p>
  }

  const countdown = formatCountdown(msLeft)
  return (
    <p
      role="timer"
      aria-label={`Registration closes in ${countdown}`}
      className="font-mono text-xs text-muted"
    >
      Registration closes in {countdown}
    </p>
  )
}
