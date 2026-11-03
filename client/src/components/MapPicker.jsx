import { useEffect, useRef } from 'react'

const FALLBACK = { lat: 22.3193, lng: 114.1694 }

export default function MapPicker({ latitude, longitude, onPick, className = 'h-64' }) {
  const container = useRef(null)
  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key || !container.current) return undefined
    const render = () => {
      if (!window.google?.maps || !container.current) return
      const center = { lat: Number(latitude) || FALLBACK.lat, lng: Number(longitude) || FALLBACK.lng }
      const map = new window.google.maps.Map(container.current, { center, zoom: 14 })
      const marker = latitude != null && longitude != null ? new window.google.maps.Marker({ map, position: center }) : null
      map.addListener('click', (event) => {
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
        if (marker) marker.setPosition(point)
        else new window.google.maps.Marker({ map, position: point })
        onPick(point)
      })
    }
    if (window.google?.maps) render()
    else {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`
      script.async = true
      script.onload = render
      document.head.appendChild(script)
      return () => script.remove()
    }
    return undefined
  }, [latitude, longitude, onPick])
  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return <div className={`grid place-items-center rounded-sm border border-dashed border-line p-4 text-center text-sm text-muted ${className}`}>Add VITE_GOOGLE_MAPS_API_KEY to enable click-to-pin Google Maps.</div>
  }
  return <div ref={container} className={`w-full rounded-sm border border-line ${className}`} />
}
