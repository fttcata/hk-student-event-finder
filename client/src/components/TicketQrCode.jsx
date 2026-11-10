import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function TicketQrCode({ value }) {
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, { margin: 1, width: 180 })
      .then((url) => {
        if (active) setDataUrl(url)
      })
      .catch(() => {
        if (active) setDataUrl('')
      })
    return () => {
      active = false
    }
  }, [value])

  if (!dataUrl) return null
  return <img src={dataUrl} alt={`QR code for ticket ${value}`} className="size-36 rounded-sm bg-white p-2" />
}
