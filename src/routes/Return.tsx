import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Condition } from '../../shared/types'
import { daysLate, parseQrUrl } from '../../shared/types'
import { getOpenLoan, type LoanView } from '../lib/data'
import { queueOp } from '../lib/db'
import { useOnlineStatus } from '../lib/sync'
import { currentCodeFor, findLot, formatDue, homeCodeFor } from '../lib/mock'
import { IconBox, IconCheck } from '../components/icons'
import { Empty, ErrorBox, Loading, OfflineBanner, QueuedNote } from '../components/ScreenStates'

type Stage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; loan: LoanView }
  | { kind: 'done'; queued: boolean; statement: string }

const CONDITIONS: Condition[] = ['Good', 'Damaged', 'Dead']

/** Fine preview: Rs 10/day late, +50% of replacement cost if Dead. */
function fineFor(late: number, condition: Condition, replacement: number): number {
  let fine = late * 10
  if (condition === 'Dead') fine += Math.round(replacement * 0.5)
  else if (condition === 'Damaged') fine += Math.round(replacement * 0.1)
  return fine
}

function announce(message: string): void {
  const el = document.getElementById('marvel-live')
  if (el) el.textContent = message
}

/**
 * /return — scan item → loan card → condition → shelf check → pinned Return.
 * Fine is computed, never typed freehand.
 */
export default function Return() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const online = useOnlineStatus()

  const [lotInput, setLotInput] = useState(params.get('lot') ?? '')
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [condition, setCondition] = useState<Condition>('Good')
  const [photoName, setPhotoName] = useState<string | null>(null)
  const [shelfInput, setShelfInput] = useState('')
  const [shelfVerdict, setShelfVerdict] = useState<
    { ok: boolean; message: string } | null
  >(null)
  const [submitting, setSubmitting] = useState(false)

  const loadLoan = useCallback(async (rawId: string) => {
    const id = rawId.trim()
    if (!id) {
      setStage({ kind: 'idle' })
      return
    }
    setStage({ kind: 'loading' })
    setShelfVerdict(null)
    setCondition('Good')
    setPhotoName(null)
    try {
      const parsed = parseQrUrl(id)
      const lotId = parsed && parsed.kind === 'i' ? parsed.id : id
      const loan = await getOpenLoan(lotId)
      if (!loan) {
        setStage({
          kind: 'error',
          message: `No open loan for “${id}”. It may already be returned, or the code is wrong.`,
        })
        return
      }
      setStage({ kind: 'ready', loan })
    } catch {
      setStage({ kind: 'error', message: 'Lookup failed. Try again.' })
    }
  }, [])

  useEffect(() => {
    const initial = params.get('lot')
    if (initial) void loadLoan(initial)
  }, [params, loadLoan])

  const checkShelf = () => {
    if (stage.kind !== 'ready') return
    const code = shelfInput.trim().toUpperCase()
    if (!code) {
      setShelfVerdict({ ok: false, message: 'Scan a shelf or type its code.' })
      return
    }
    const lot = findLot(stage.loan.lot_id)
    const home = lot ? homeCodeFor(lot).toUpperCase() : ''
    const current = lot ? currentCodeFor(lot).toUpperCase() : ''
    if (code === home) {
      setShelfVerdict({ ok: true, message: 'Correct home' })
    } else if (code === current) {
      setShelfVerdict({ ok: false, message: `Wrong shelf, home is ${home || 'unknown'}` })
    } else {
      setShelfVerdict({ ok: false, message: `Wrong shelf, home is ${home || 'unknown'}` })
    }
  }

  const submit = async () => {
    if (stage.kind !== 'ready') return
    if (condition !== 'Good' && !photoName) return
    setSubmitting(true)
    try {
      const payload = {
        loan_id: stage.loan.id,
        lot_id: stage.loan.lot_id,
        condition_out: condition,
        photo: photoName,
        shelf_code: shelfInput.trim() || null,
        fine,
      }
      let queued = false
      if (!online) {
        await queueOp('return', payload)
        queued = true
      }
      const statement = `${stage.loan.member.name.split(' ')[0]} returned ${stage.loan.item.name}`
      setStage({ kind: 'done', queued, statement })
      announce(queued ? `${statement}. Saved offline, syncs when online.` : `${statement}.`)
    } finally {
      setSubmitting(false)
    }
  }

  if (stage.kind === 'done') {
    return (
      <div>
        <h1 className="screen-title">Return</h1>
        {!online && <OfflineBanner queued={1} />}
        <div className="success-box" role="status">
          <IconCheck size={40} />
          <h2>Returned</h2>
          <p className="statement">{stage.statement}</p>
          {stage.queued ? (
            <QueuedNote label="Saved offline, syncs when online" />
          ) : (
            <p>Ledger updated, shelf count restored.</p>
          )}
          <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={() => navigate('/scan')}>
              Scan next
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={() => setStage({ kind: 'idle' })}
            >
              New return
            </button>
          </div>
        </div>
      </div>
    )
  }

  const loan = stage.kind === 'ready' ? stage.loan : null
  const late = loan ? daysLate(loan.due_at) : 0
  const fine = loan ? fineFor(late, condition, loan.item.replacement_cost) : 0
  const needsPhoto = condition !== 'Good'
  const canSubmit =
    stage.kind === 'ready' && (!needsPhoto || photoName !== null) && !submitting

  return (
    <div className="operate">
      <div className="operate-flow">
        <h1 className="screen-title">Return</h1>
        <p className="meta">Scan item, note condition, confirm the shelf.</p>
        {!online && <OfflineBanner queued={0} />}

        <div className="card">
          <label className="field" style={{ marginTop: 0 }}>
            Item lot or QR link
            <input
              className="text"
              value={lotInput}
              onChange={(e) => setLotInput(e.target.value)}
              placeholder="LOT-NANO-3 or https://marv.inv/i/…"
              aria-label="Item lot or QR link"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadLoan(lotInput)
              }}
            />
          </label>
          <div style={{ marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={() => void loadLoan(lotInput)}>
              Find loan
            </button>
          </div>
        </div>

        {stage.kind === 'loading' && (
          <div className="card">
            <Loading label="Looking up loan" rows={2} />
          </div>
        )}

        {stage.kind === 'error' && (
          <ErrorBox title="No open loan" body={stage.message} onRetry={() => void loadLoan(lotInput)} />
        )}

        {stage.kind === 'idle' && (
          <Empty
            title="No loan selected"
            body="Scan a borrowed item QR or type the lot code above to begin a return."
            action={
              <button type="button" className="btn-secondary" onClick={() => navigate('/scan')}>
                Open scanner
              </button>
            }
          />
        )}

        {loan && (
          <div className="card" aria-live="polite">
            <div className="row">
              <div className="thumb" aria-hidden="true">
                <IconBox size={28} />
              </div>
              <div className="row-body">
                <p className="row-title truncate" title={loan.item.name}>
                  {loan.item.name}
                </p>
                <p className="meta truncate">
                  {loan.member.name} · since {formatDue(loan.issued_at)}
                </p>
                <p className="meta tnum">
                  Due {formatDue(loan.due_at)}
                  {late > 0 ? ` · ${late} ${late === 1 ? 'day' : 'days'} late` : ' · on time'}
                </p>
              </div>
            </div>
          </div>
        )}

        {loan && (
          <div className="card">
            <h2 className="card-title">Condition</h2>
            <div className="seg cols-3" role="group" aria-label="Return condition">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={condition === c}
                  onClick={() => setCondition(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {needsPhoto && (
              <div>
                <label className="field">
                  Damage photo (required)
                  <input
                    className="file"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Damage photo, required when not good"
                    onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
                  />
                </label>
                {!photoName && (
                  <p className="field-error">Add a photo before returning as {condition.toLowerCase()}.</p>
                )}
              </div>
            )}
            <p className="meta tnum" style={{ marginTop: 4 }}>
              Fine: Rs {fine}
              {late > 0 ? ` (${late} late ${late === 1 ? 'day' : 'days'} × Rs 10${condition !== 'Good' ? ' + condition' : ''})` : condition !== 'Good' ? ' (condition)' : ' (on time, good)'}
            </p>
          </div>
        )}

        {loan && (
          <div className="card">
            <h2 className="card-title">Shelf check</h2>
            <label className="field">
              Scan shelf or type code
              <input
                className="text tnum"
                value={shelfInput}
                onChange={(e) => setShelfInput(e.target.value)}
                placeholder="R1-S2-B3"
                aria-label="Scan shelf or type code"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') checkShelf()
                }}
              />
            </label>
            <div style={{ marginTop: 4 }}>
              <button type="button" className="btn-secondary" onClick={checkShelf}>
                Check shelf
              </button>
            </div>
            {shelfVerdict && (
              <p
                role="status"
                className={shelfVerdict.ok ? 'meta' : 'field-error'}
                style={shelfVerdict.ok ? { color: 'var(--good)', fontWeight: 600 } : undefined}
              >
                {shelfVerdict.message}
              </p>
            )}
          </div>
        )}

        {loan && (
          <div className="pinned">
            {needsPhoto && !photoName && (
              <p className="field-hint" style={{ margin: '0 0 4px' }}>
                A photo is required for {condition.toLowerCase()} returns.
              </p>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitting ? 'Saving return' : 'Mark returned'}
            </button>
            {!online && canSubmit && (
              <p className="field-hint" style={{ marginBottom: 0 }}>
                Offline — this return queues and syncs when online.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="operate-side">
        <div className="card">
          <h2 className="card-title">Fines write themselves</h2>
          <p className="meta">Rs 10 per late day, plus condition cost. Never typed freehand.</p>
        </div>
      </div>
    </div>
  )
}
