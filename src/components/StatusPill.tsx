import type { ItemStatus } from '../../shared/types'
import { IconWrench } from './icons'

interface Props {
  status: ItemStatus
  /** Shown for overdue, e.g. daysLate=3 renders "Overdue 3 days". */
  daysLate?: number
}

/**
 * Status pill — icon + text always, never color alone (dust + sunlight wash
 * out hue; colorblind-safe). Exported for other agents' screens.
 * available = green dot + "Available", borrowed = amber dot + "Borrowed",
 * overdue = red dot + "Overdue N days", broken = gray wrench + "Broken".
 */
export default function StatusPill({ status, daysLate = 0 }: Props) {
  if (status === 'broken') {
    return (
      <span className="status-pill status-broken">
        <IconWrench size={14} />
        Broken
      </span>
    )
  }
  if (status === 'borrowed' && daysLate > 0) {
    return (
      <span className="status-pill status-overdue">
        <span className="status-dot" aria-hidden="true" />
        Overdue {daysLate} {daysLate === 1 ? 'day' : 'days'}
      </span>
    )
  }
  if (status === 'borrowed') {
    return (
      <span className="status-pill status-borrowed">
        <span className="status-dot" aria-hidden="true" />
        Borrowed
      </span>
    )
  }
  return (
    <span className="status-pill status-available">
      <span className="status-dot" aria-hidden="true" />
      Available
    </span>
  )
}
