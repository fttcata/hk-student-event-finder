// Label + input slot + validation message, shared by every form.
export default function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-accent">{error}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
