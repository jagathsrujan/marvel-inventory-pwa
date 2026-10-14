import { useOnlineStatus } from '../lib/sync'
import { IconClock, IconCloud } from './icons'

interface Props {
  /** Queued op count. When omitted, OfflineBadge reads its own count. */
  pending?: number
}

/**
 * Persistent connectivity pill for the app header.
 * Green "Online" / amber "Offline — N queued". role="status" so screen
 * readers announce transitions. Exported for other agents' screens.
 */
export default function OfflineBadge({ pending }: Props) {
  const online = useOnlineStatus()
  const queued = pending ?? 0

  if (online && queued === 0) {
    return (
      <span className="pill pill-online" role="status" aria-label="Online">
        <IconCloud size={14} />
        Online
      </span>
    )
  }

  if (online) {
    return (
      <span
        key={queued}
        className="pill pill-offline bump"
        role="status"
        aria-label={`Online, ${queued} ops waiting to sync`}
      >
        <IconClock size={14} />
        {queued} queued
      </span>
    )
  }

  return (
    <span
      key={queued}
      className="pill pill-offline bump"
      role="status"
      aria-label={queued > 0 ? `Offline, ${queued} ops queued` : 'Offline'}
    >
      <IconClock size={14} />
      {queued > 0 ? `Offline — ${queued} queued` : 'Offline'}
    </span>
  )
}
