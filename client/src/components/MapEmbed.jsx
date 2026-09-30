// Google Maps embed by address. No API key is needed for this simple embed;
// the full Maps JavaScript API (draggable pins) is planned once we have a key.
export default function MapEmbed({ query, className = 'h-64' }) {
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(`${query}, Hong Kong`)}&z=16&output=embed`

  return (
    <iframe
      title={`Map of ${query}`}
      src={src}
      loading="lazy"
      className={`w-full rounded-sm border border-line grayscale-[30%] ${className}`}
    />
  )
}
