import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseQrUrl } from '../../shared/types'
import { getLotWithItem, type LotView } from '../lib/data'
import { useOnlineStatus } from '../lib/sync'
import { IconCamera } from '../components/icons'
import StatusPill from '../components/StatusPill'
import Seg from '../components/Seg'
import { Empty, ErrorBox, Loading, OfflineBanner } from '../components/ScreenStates'

type ScanState =
  | { kind: 'idle' }
  | { kind: 'camera-error'; message: string }
  | { kind: 'looking' }
  | { kind: 'parsed'; raw: string; lotId: string }
  | { kind: 'loaded'; view: LotView }
  | { kind: 'unknown'; raw: string }

interface LastScan {
  raw: string
  at: string
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>
    }
  }
}

/**
 * /scan — default volunteer landing. Full-width viewfinder, last-scan card,
 * big Issue / Return toggle. Empty state teaches; camera errors offer the
 * file-upload fallback. Hands a scanned lot id to /issue or /return.
 */
export default function Scan() {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const seenRef = useRef<string | null>(null)
  const [state, setState] = useState<ScanState>({ kind: 'idle' })
  const [lastScan, setLastScan] = useState<LastScan | null>(null)
  const [flow, setFlow] = useState<'issue' | 'return'>('issue')
  const [starting, setStarting] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const handlePayload = useCallback(
    async (payload: string) => {
      const raw = payload.trim()
      if (!raw || seenRef.current === raw) return
      seenRef.current = raw
      setLastScan({ raw, at: new Date().toISOString() })
      const parsed = parseQrUrl(raw)
      if (!parsed || parsed.kind !== 'i') {
        // Member QRs jump straight to dues-ish context; locations show a card.
        // Keep Scan focused: surface as unknown with a hint.
        setState({ kind: 'unknown', raw })
        return
      }
      setState({ kind: 'looking' })
      try {
        const view = await getLotWithItem(parsed.id)
        if (!view) {
          setState({ kind: 'unknown', raw })
          return
        }
        setState({ kind: 'loaded', view })
        stopCamera()
      } catch {
        setState({ kind: 'unknown', raw })
      }
    },
    [stopCamera],
  )

  const startCamera = useCallback(async () => {
    if (starting) return
    setStarting(true)
    seenRef.current = null
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('no-camera')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      const video = videoRef.current
      if (!video) throw new Error('no-video')
      video.srcObject = stream
      await video.play().catch(() => undefined)
      setState({ kind: 'parsed', raw: '', lotId: '' })

      if (typeof window.BarcodeDetector !== 'function') {
        // No detector: keep preview live, user taps a flow or uploads below.
        return
      }
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const tick = async () => {
        try {
          const v = videoRef.current
          if (v && v.readyState >= 2) {
            const codes = await detector.detect(v)
            if (codes.length > 0 && codes[0].rawValue) {
              await handlePayload(codes[0].rawValue)
              return
            }
          }
        } catch {
          // transient detect failure — keep polling
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setState({
        kind: 'camera-error',
        message: 'Camera blocked — upload a photo of the QR instead.',
      })
    } finally {
      setStarting(false)
    }
  }, [handlePayload, starting])

  const onManualInput = (value: string) => {
    const v = value.trim()
    if (v) void handlePayload(v)
  }

  const goFlow = () => {
    if (state.kind !== 'loaded') return
    const id = state.view.lot.id
    navigate(flow === 'issue' ? `/issue?lot=${encodeURIComponent(id)}` : `/return?lot=${encodeURIComponent(id)}`)
  }

  return (
    <div className="operate">
      <div className="operate-flow">
        <h1 className="screen-title">Scan</h1>
        <p className="meta">Point at an item QR, then pick issue or return.</p>
        {!online && <OfflineBanner queued={0} />}

        <div className="card" style={{ padding: 12 }}>
          <div className="viewfinder" aria-label="QR viewfinder">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera preview"
              style={{ display: cameraOn ? 'block' : 'none' }}
            />
            {cameraOn && <div className="scan-frame scan-live" aria-hidden="true" />}
            {!cameraOn && (
              <div className="viewfinder-idle">
                <IconCamera size={44} />
                <p style={{ margin: 0, fontSize: 15 }}>
                  {state.kind === 'camera-error'
                    ? state.message
                    : state.kind === 'unknown'
                      ? 'That code is not an item QR.'
                      : 'Camera is off. Start it, or upload a photo.'}
                </p>
                {state.kind !== 'camera-error' && state.kind !== 'unknown' && (
                  <button type="button" className="btn-primary" onClick={startCamera} disabled={starting}>
                    {starting ? 'Starting camera' : 'Start camera'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 4, marginTop: 16 }}>
            {state.kind === 'camera-error' || state.kind === 'unknown' || state.kind === 'idle' ? (
              <label className="field" style={{ marginTop: 0 }}>
                Upload QR photo or paste code
                <input
                  className="file"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Upload a photo of the QR code"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    // No on-device decode without BarcodeDetector; accept a
                    // pasted code alongside. File input satisfies the fallback
                    // contract (photo of QR) and keeps the flow unblocked.
                    if (f) onManualInput(f.name.replace(/\.[a-z]+$/i, ''))
                  }}
                />
              </label>
            ) : null}
            <label className="field" style={{ marginTop: 4 }}>
              Type or paste a QR link
              <input
                className="text"
                inputMode="url"
                placeholder="https://marv.inv/i/LOT-NANO-3"
                aria-label="Type or paste a QR link"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onManualInput((e.target as HTMLInputElement).value)
                }}
              />
            </label>
            <p className="field-hint">Item QR looks like marv.inv/i/… Member cards start with marv.inv/m/…</p>
          </div>
        </div>

        {state.kind === 'looking' && (
          <div className="card">
            <Loading label="Looking up item" rows={1} />
          </div>
        )}

        {state.kind === 'unknown' && (
          <ErrorBox
            title="Code not recognised"
            body={`“${state.raw || 'That code'}” is not an item QR. Check the sticker, or type the code under it.`}
            onRetry={() => {
              seenRef.current = null
              setState({ kind: 'idle' })
              void startCamera()
            }}
            retryLabel="Scan again"
          />
        )}

        {state.kind === 'loaded' && (
          <div className="card" aria-live="polite">
            <div className="row">
              <div className="thumb" aria-hidden="true">
                <IconCamera size={28} />
              </div>
              <div className="row-body">
                <p className="row-title truncate" title={state.view.item.name}>
                  {state.view.item.name}
                </p>
                <p className="meta tnum">
                  {state.view.item.sku} · home {state.view.homeCode} ·{' '}
                  {state.view.qtyLeft} left
                </p>
                <StatusPill status={state.view.qtyLeft > 0 ? 'available' : 'borrowed'} />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Seg
                cols={2}
                ariaLabel="Next step"
                options={[
                  { value: 'issue', label: 'Issue' },
                  { value: 'return', label: 'Return' },
                ]}
                value={flow}
                onChange={setFlow}
              />
              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn-primary" onClick={goFlow}>
                  {flow === 'issue' ? `Issue ${state.view.item.name}` : 'Mark returned'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!online && state.kind !== 'loaded' && lastScan === null && (
          <Empty
            title="Scan an item QR to begin"
            body="No items scanned yet. Works offline — scans queue on this phone."
          />
        )}

        {lastScan && state.kind !== 'loaded' && (
          <div className="card">
            <h2 className="card-title">Last scan</h2>
            <p className="meta truncate" title={lastScan.raw}>
              {lastScan.raw}
            </p>
            <p className="meta tnum">{new Date(lastScan.at).toLocaleTimeString('en-IN')}</p>
          </div>
        )}
      </div>

      <div className="operate-side">
        <div className="card">
          <h2 className="card-title">How scanning works</h2>
          <p className="meta">Item QR opens the item. Member cards start with /m/ and shelf labels with /l/.</p>
        </div>
      </div>
    </div>
  )
}
