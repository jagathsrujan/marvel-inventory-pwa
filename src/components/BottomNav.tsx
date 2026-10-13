import { NavLink } from 'react-router-dom'
import { IconIssue, IconMore, IconReturn, IconScan, IconSearch } from './icons'

/**
 * Bottom tab bar — 5 entries, 48px minimum targets.
 * Capture / Search / Dues / Requests / Labels live behind More until their
 * owning agents ship them; entries point at real routes when present.
 */
const TABS = [
  { to: '/scan', label: 'Scan', Icon: IconScan },
  { to: '/search', label: 'Search', Icon: IconSearch },
  { to: '/issue', label: 'Issue', Icon: IconIssue },
  { to: '/return', label: 'Return', Icon: IconReturn },
  { to: '/more', label: 'More', Icon: IconMore },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to}>
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
