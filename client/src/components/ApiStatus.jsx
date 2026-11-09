// Shows whether events came from the live MySQL API or the demo fallback.
const STATUS = {
  loading: { dot: 'bg-muted', text: 'Checking API…' },
  api: { dot: 'bg-leaf', text: 'Live data · MySQL API connected' },
  demo: { dot: 'bg-accent', text: 'API offline · showing demo events' },
}

export default function ApiStatus({ source }) {
  const status = STATUS[source]
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-muted">
      <span className={`size-2 rounded-full ${status.dot}`} /> {status.text}
    </p>
  )
}
