import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'

function cameraErrorMessage(error) {
  if (!window.isSecureContext) {
    return 'Camera access requires HTTPS or localhost.'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser does not support camera access.'
  }
  switch (error?.name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Allow camera access or enter the ticket code manually.'
    case 'NotFoundError':
      return 'No camera was found on this device.'
    case 'NotReadableError':
      return 'The camera is already in use by another application.'
    case 'OverconstrainedError':
      return 'This camera does not support the requested settings.'
    default:
      return error?.message || 'Unable to start the camera.'
  }
}

export default function CameraQrScanner({ onScan, disabled = false }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const startingRef = useRef(false)
  const handledRef = useRef(false)
  const mountedRef = useRef(true)
  const onScanRef = useRef(onScan)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const releaseVideo = useCallback(() => {
    const video = videoRef.current
    const stream = video?.srcObject
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      video.srcObject = null
    }
  }, [])

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    startingRef.current = false
    releaseVideo()
    if (mountedRef.current) setStatus('idle')
  }, [releaseVideo])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controlsRef.current?.stop()
      controlsRef.current = null
      const video = videoRef.current
      const stream = video?.srcObject
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
        video.srcObject = null
      }
    }
  }, [])

  useEffect(() => {
    if (!disabled) return
    stopScanner()
  }, [disabled, stopScanner])

  async function startScanner() {
    if (startingRef.current || controlsRef.current) return
    if (!window.isSecureContext) {
      setError(cameraErrorMessage())
      setStatus('error')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(cameraErrorMessage())
      setStatus('error')
      return
    }

    startingRef.current = true
    handledRef.current = false
    setError('')
    setStatus('starting')

    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 250,
      tryPlayVideoTimeout: 8000,
    })

    try {
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result, _error, scannerControls) => {
          if (!result || handledRef.current) return
          handledRef.current = true
          scannerControls.stop()
          controlsRef.current = null
          releaseVideo()
          if (!mountedRef.current) return
          setStatus('idle')
          onScanRef.current(result.getText())
        },
      )

      if (!mountedRef.current) {
        controls.stop()
        releaseVideo()
        return
      }
      controlsRef.current = controls
      setStatus('scanning')
    } catch (cameraError) {
      if (!mountedRef.current) return
      setError(cameraErrorMessage(cameraError))
      setStatus('error')
      releaseVideo()
    } finally {
      startingRef.current = false
    }
  }

  const scanning = status === 'scanning'
  const starting = status === 'starting'

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-sm border border-line bg-ink/90">
        <video
          ref={videoRef}
          className={`aspect-video w-full object-cover ${scanning ? 'block' : 'hidden'}`}
          muted
          playsInline
          autoPlay
        />
        {!scanning && (
          <div className="grid aspect-video place-items-center px-6 text-center">
            <div>
              <p className="font-mono text-xs tracking-[0.14em] text-paper/60 uppercase">
                {starting ? 'Starting camera' : status === 'error' ? 'Camera unavailable' : 'Camera off'}
              </p>
              <p className="mt-3 max-w-xs text-sm text-paper/80">
                {starting
                  ? 'Allow camera access when your browser asks.'
                  : 'Start the camera and point it at the QR code on the attendee’s ticket.'}
              </p>
            </div>
          </div>
        )}
        {scanning && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="size-52 rounded-sm border-2 border-paper/90 shadow-[0_0_0_999px_rgba(32,32,32,0.35)]" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {scanning ? (
          <button type="button" className="btn btn-outline" onClick={stopScanner}>
            Stop camera
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-dark"
            disabled={disabled || starting}
            onClick={startScanner}
          >
            {starting ? 'Starting camera…' : 'Start camera'}
          </button>
        )}
        <p role="status" aria-live="polite" className="self-center text-sm text-muted">
          {scanning ? 'Scanning…' : disabled ? 'Checking ticket…' : 'Camera inactive.'}
        </p>
      </div>

      {error && <p role="alert" className="rounded-sm bg-peach/50 p-3 text-sm text-accent">{error}</p>}
    </div>
  )
}
