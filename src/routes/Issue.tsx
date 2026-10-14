import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Member } from '../../shared/types'
import { parseQrUrl } from '../../shared/types'
import { getLotWithItem, getMember, type LotView } from '../lib/data'
import { queueOp } from '../lib/db'
import { useOnlineStatus } from '../lib/sync'
import { formatDue } from '../lib/mock'
import { IconBox, IconCheck } from '../components/icons'
import { Empty, ErrorBox, Loading, OfflineBanner, QueuedNote } from '../components/ScreenStates'

type DueKey = '14' | 'event' | 'term' | '90'

const DUE_OPTIONS: { key: DueKey; label: string; hint: string }[] = [
  { key: '14', label: '14 days', hint: 'Default loan' },
  { key: 'event', label: 'Event +3', hint: 'Competition buffer' },
  { key: 'term', label: 'Term end', hint: 'Course kit' },
  { key: '90', label: '90 days', hint: 'Research loan' },
]

function dueIso(key: DueKey): string {
  const d = new Date()
  if (key === '14') d.setDate(d.getDate() + 14)
  else if (key === 'event') d.setDate(d.getDate() + 17)
  else if (key === 'term') d.setMonth(d.getMonth() + 4)
  else d.setDate(d.getDate() + 90)
  return d.toISOString()
}

interface Success {
  memberFirst: string
  itemName: string
  lotShort: string
  dueLabel: string
  queued: boolean
}

function lotShort(id: string): string {
  const parts = id.split('-')
  return parts.length > 1 ? `#${parts[parts.length - 1]}` : id
}

function announce(message: string): void {
  const el = document.getElementById('marvel-live')
  if (el) el.textContent = message
}

/** Short haptic tick on the commit event — same frame as the success card. */
function tick(ms: number | number[] = 15): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // haptics are best-effort
  }
}

/**
 * /issue — item card + member card + due chips + pinned Issue button.
 * Offline: queues the issue op and says so. Success states the loan plainly.
 */
export default function Issue() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const online = useOnlineStatus()

  const [lotInput, setLotInput] = useState(params.get('lot') ?? '')
  const [view, setView] = useState<LotView | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [memberQuery, setMemberQuery] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [verified, setVerified] = useState(false)

  const [dueKey, setDueKey] = useState<DueKey>('14')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<Success | null>(null)

  const loadLot = useCallback(async (rawId: string) => {
    const id = rawId.trim()
    if (!id) {
      setView(null)
      setLoadError(null)
      return
    }
    setLoading(true)
    setLoadError(null)
    setSuccess(null)
    try {
      const parsed = parseQrUrl(id)
      const lotId = parsed && parsed.kind === 'i' ? parsed.id : id
      const v = await getLotWithItem(lotId)
      if (!v) {
        setView(null)
        setLoadError(`No item found for “${id}”. Check the sticker code and try again.`)
      } else {
        setView(v)
      }
    } catch {
      setView(null)
      setLoadError('Lookup failed. Check connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initial = params.get('lot')
    if (initial) void loadLot(initial)
  }, [params, loadLot])

  const lookUpMember = async () => {
    const q = memberQuery.trim()
    if (!q) return
    setLookingUp(true)
    setMemberError(null)
    setMember(null)
    setVerified(false)
    setOtpSent(false)
    try {
      const parsed = parseQrUrl(q)
      const id = parsed && parsed.kind === 'm' ? parsed.id : q
      const m = await getMember(id)
      if (!m) {
        setMemberError(`No member found for “${q}”. Check the email or card code.`)
      } else {
        setMember(m)
      }
    } catch {
      setMemberError('Member lookup failed. Try again.')
    } finally {
      setLookingUp(false)
    }
  }

  const verifyOtp = () => {
    if (/^\d{4,}$/.test(otp.trim())) {
      setVerified(true)
      setMemberError(null)
    } else {
      setMemberError('Enter the 4-digit code sent to the college email.')
    }
  }

  const dueAt = useMemo(() => dueIso(dueKey), [dueKey])
  const qtyLeft = view?.qtyLeft ?? 0
  const outOfStock = view !== null && qtyLeft <= 0
  const canSubmit =
    view !== null && member !== null && verified && !outOfStock && !submitting && !loading

  const submit = async () => {
    if (!view || !member) return
    setSubmitting(true)
    setSubmitError(null)
    const payload = {
      lot_id: view.lot.id,
      item_id: view.item.id,
      member_id: member.id,
      qty: 1,
      due_at: dueAt,
      issued_by: 'volunteer',
    }
    try {
      let queued = false
      if (!online) {
        await queueOp('issue', payload)
        queued = true
      }
      const first = member.name.split(' ')[0]
      const done: Success = {
        memberFirst: first,
        itemName: view.item.name,
        lotShort: lotShort(view.lot.id),
        dueLabel: formatDue(dueAt),
        queued,
      }
      setSuccess(done)
      tick()
      announce(
        queued
          ? `Issue saved offline, syncs when online. ${first} owes ${view.item.name}.`
          : `Issue saved. ${first} owes ${view.item.name}, due ${done.dueLabel}.`,
      )
    } catch {
      setSubmitError('Saving failed. Try again — nothing was issued.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    setSuccess(null)
    setMember(null)
    setMemberQuery('')
    setOtp('')
    setOtpSent(false)
    setVerified(false)
    setDueKey('14')
  }

  if (success) {
    return (
      <div>
        <h1 className="screen-title">Issue</h1>
        {!online && <OfflineBanner queued={1} />}
        <div className="success-box" role="status">
          <IconCheck size={40} />
          <h2>Issued</h2>
          <p className="statement">
            {success.memberFirst} owes {success.itemName} {success.lotShort}, due {success.dueLabel}
          </p>
          {success.queued ? (
            <QueuedNote label="Saved offline, syncs when online" />
          ) : (
            <p>Recorded in the ledger.</p>
          )}
          <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={() => navigate('/scan')}>
              Scan next
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={resetFlow}
            >
              New issue
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="operate">
      <div className="operate-flow">
        <h1 className="screen-title">Issue</h1>
        <p className="meta">Scan item, confirm member, pick a due date.</p>
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
                if (e.key === 'Enter') void loadLot(lotInput)
              }}
            />
          </label>
          <div style={{ marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={() => void loadLot(lotInput)}>
              Find item
            </button>
          </div>
        </div>

        {loading && (
          <div className="card">
            <Loading label="Looking up item" rows={2} />
          </div>
        )}

        {loadError && !loading && (
          <ErrorBox title="Item not found" body={loadError} onRetry={() => void loadLot(lotInput)} />
        )}

        {!view && !loading && !loadError && (
          <Empty
            title="No item selected"
            body="Scan an item QR or type the lot code above to begin an issue."
            action={
              <button type="button" className="btn-secondary" onClick={() => navigate('/scan')}>
                Open scanner
              </button>
            }
          />
        )}

        {view && (
          <div className="card" aria-live="polite">
            <div className="row">
              <div className="thumb" aria-hidden="true">
                <IconBox size={28} />
              </div>
              <div className="row-body">
                <p className="row-title truncate" title={view.item.name}>
                  {view.item.name}
                </p>
                <p className="meta tnum">
                  {view.item.sku} · home {view.homeCode} ·{' '}
                  <span className="tnum">{qtyLeft} left</span>
                </p>
                <p className="cost-warning tnum">Lose it = Rs {view.item.replacement_cost}</p>
                {outOfStock && (
                  <p className="field-error">Out of stock — nothing left to issue.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {view && !outOfStock && (
          <div className="card">
            <h2 className="card-title">Member</h2>
            {!member ? (
              <div>
                <label className="field">
                  College email or card QR
                  <input
                    className="text"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="name@uvce.edu or marv.inv/m/…"
                    aria-label="College email or card QR"
                    autoComplete="email"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void lookUpMember()
                    }}
                  />
                </label>
                {memberError && <p className="field-error">{memberError}</p>}
                <div style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void lookUpMember()}
                    disabled={lookingUp || memberQuery.trim() === ''}
                  >
                    {lookingUp ? 'Looking up' : 'Find member'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="row">
                  <div className="row-body">
                    <p className="row-title truncate" title={member.name}>
                      {member.name}
                    </p>
                    <p className="meta truncate">{member.college_email}</p>
                    <p className="meta tnum">
                      Dues: {member.dues_count} · {member.course_year}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setMember(null)
                      setVerified(false)
                      setOtpSent(false)
                      setOtp('')
                    }}
                  >
                    Change
                  </button>
                </div>
                {!verified ? (
                  <div>
                    {!otpSent ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setOtpSent(true)}
                      >
                        Send code
                      </button>
                    ) : (
                      <div>
                        <label className="field">
                          4-digit code
                          <input
                            className="text tnum"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            inputMode="numeric"
                            placeholder="1234"
                            aria-label="4-digit code"
                          />
                        </label>
                        {memberError && <p className="field-error">{memberError}</p>}
                        <div style={{ marginTop: 4 }}>
                          <button type="button" className="btn-secondary" onClick={verifyOtp}>
                            Verify
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="meta" role="status">
                    Identity verified.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {view && !outOfStock && member && verified && (
          <div className="card">
            <h2 className="card-title">Due date</h2>
            <div className="chip-row" role="group" aria-label="Due date presets">
              {DUE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="chip"
                  aria-pressed={dueKey === o.key}
                  onClick={() => setDueKey(o.key)}
                  title={o.hint}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="meta tnum" style={{ marginTop: 4 }}>
              Due {formatDue(dueAt)}
            </p>
          </div>
        )}

        {submitError && <ErrorBox title="Issue failed" body={submitError} onRetry={submit} />}

        {view && !outOfStock && (
          <div className="pinned">
            {!member || !verified ? (
              <p className="field-hint" style={{ margin: '0 0 4px' }}>
                Verify the member above to enable issuing.
              </p>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitting ? 'Saving issue' : `Issue ${view.item.name}`}
            </button>
            {!online && canSubmit && (
              <p className="field-hint" style={{ marginBottom: 0 }}>
                Offline — this issue queues and syncs when online.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="operate-side">
        <div className="card">
          <h2 className="card-title">Before you tap issue</h2>
          <p className="meta">Member sees dues, due date, and replacement cost on their phone.</p>
        </div>
      </div>
    </div>
  )
}
