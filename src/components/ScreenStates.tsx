import type { ReactNode } from 'react'
import { IconAlert, IconBox, IconClock, IconCloudOff, IconInbox } from './icons'

/** Skeleton rows for loading — never a blank screen. */
export function Loading({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <span className="live-region">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel skel-row" aria-hidden="true" />
      ))}
      <div className="skel skel-line" style={{ width: '60%' }} aria-hidden="true" />
    </div>
  )
}

/** Empty state that teaches what belongs + a call to action. */
export function Empty({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <IconInbox size={40} />
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  )
}

/** Error state: what broke + retry. Never a dead end. */
export function ErrorBox({
  title = 'Something failed',
  body,
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string
  body: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="error-box" role="alert">
      <IconAlert size={40} />
      <h2>{title}</h2>
      <p>{body}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  )
}

/** Offline banner + queue count. Shown on every mutating screen when offline. */
export function OfflineBanner({ queued }: { queued: number }) {
  return (
    <div className="banner-offline" role="status">
      <IconCloudOff size={18} />
      <span>
        Offline — changes queue on this phone
        {queued > 0 ? ` (${queued} waiting to sync)` : ''}.
      </span>
    </div>
  )
}

/** Queued-row marker: clock icon + "syncs when online". */
export function QueuedNote({ label = 'Saved offline, syncs when online' }: { label?: string }) {
  return (
    <p className="meta" role="status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <IconClock size={14} />
      {label}
    </p>
  )
}

/** Item-not-found state for scan misses. */
export function NotFound({
  title = 'No match found',
  body,
  onRetry,
}: {
  title?: string
  body: string
  onRetry?: () => void
}) {
  return (
    <div className="empty">
      <IconBox size={40} />
      <h2>{title}</h2>
      <p>{body}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Scan again
        </button>
      )}
    </div>
  )
}
