// Google Maps embed by address. No API key is needed for this simple embed;
// the full Maps JavaScript API (draggable pins) is planned once we have a key.
export default function MapEmbed({ query, className = 'h-56 sm:h-64' }) {
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(`${query}, Hong Kong`)}&z=16&output=embed`

  return (
    <div className={`relative min-w-0 overflow-hidden rounded-sm border border-line bg-sage ${className}`}>
      <iframe
        title={`Map of ${query}`}
        src={src}
        loading="lazy"
        className="absolute inset-0 size-full border-0 grayscale-[30%]"
      />
    </div>
  )
}
