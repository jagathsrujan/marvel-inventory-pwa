import { Suspense, lazy, type ComponentType } from 'react'
import { useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import OfflineBadge from './components/OfflineBadge'
import { ErrorBox, Loading } from './components/ScreenStates'
import { queueCount } from './lib/db'
import { useOnlineStatus, useSyncQueue } from './lib/sync'
import Issue from './routes/Issue'
import Return from './routes/Return'
import Scan from './routes/Scan'

/**
 * App shell — HashRouter (offline-safe: no server rewrites needed), header
 * with title + OfflineBadge, BottomNav, lazy sibling routes.
 *
 * Sibling routes (Capture / Search / Dues / Requests / Labels, owned by other
 * agents) load lazily so the shell paints fast. If a chunk fails at runtime
 * (missing file, or offline before it was cached) the route shows a recovery
 * card instead of a blank screen — a missing sibling never breaks this build.
 */

function RouteFallback({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <ErrorBox
        title={title}
        body={body}
        onRetry={() => window.location.reload()}
        retryLabel="Reload"
      />
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <NavLink className="btn-secondary" to="/scan" style={{ textDecoration: 'none' }}>
          Back to scan
        </NavLink>
      </div>
    </div>
  )
}

function guarded(
  load: () => Promise<{ default: ComponentType }>,
  title: string,
): React.LazyExoticComponent<ComponentType> {
  return lazy(() =>
    load()
      .then((m) => ({ default: m.default }))
      .catch(() => ({
        default: () => (
          <RouteFallback
            title={title}
            body="This screen could not load. Check connection and reload — scan, issue, and return still work."
          />
        ),
      })),
  )
}

const Capture = guarded(() => import('./routes/Capture'), 'Capture unavailable')
const Search = guarded(() => import('./routes/Search'), 'Search unavailable')
const Dues = guarded(() => import('./routes/Dues'), 'Dues unavailable')
const Requests = guarded(() => import('./routes/Requests'), 'Requests unavailable')
const Labels = guarded(() => import('./routes/Labels'), 'Labels unavailable')
const Admin = guarded(() => import('./routes/admin/Admin'), 'Admin unavailable')

function More() {
  return (
    <div>
      <h1 className="screen-title">Library</h1>
      <p className="meta">Capture, dues, requests, and labels live here.</p>
      <div className="card-flat">
        <NavLink className="row" to="/capture" viewTransition>
          <span className="row-title">Capture new item</span>
        </NavLink>
        <NavLink className="row" to="/dues" viewTransition>
          <span className="row-title">Dues</span>
        </NavLink>
        <NavLink className="row" to="/requests" viewTransition>
          <span className="row-title">Requests</span>
        </NavLink>
        <NavLink className="row" to="/labels" viewTransition>
          <span className="row-title">Labels</span>
        </NavLink>
        <NavLink className="row" to="/admin" viewTransition>
          <span className="row-title">Admin console</span>
        </NavLink>
      </div>
    </div>
  )
}

function Shell() {
  useSyncQueue()
  const online = useOnlineStatus()
  const [pending, setPending] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  // Scroll edge effect: header gets its hairline + soft shadow only while
  // content is actually scrolling underneath it (Apple scroll-edge rule).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    let live = true
    const tick = async () => {
      const n = await queueCount().catch(() => 0)
      if (live) setPending(n)
    }
    void tick()
    const t = window.setInterval(tick, 5000)
    window.addEventListener('focus', tick)
    return () => {
      live = false
      window.clearInterval(t)
      window.removeEventListener('focus', tick)
    }
  }, [online])

  return (
    <div className="app desk">
      <span id="marvel-live" className="live-region" role="status" aria-live="polite" />
      <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
        <div>
          <p className="app-eyebrow">Makerspace inventory</p>
          <p className="app-title">MARVEL Inventory</p>
        </div>
        <OfflineBadge pending={pending} />
      </header>
      <main className="app-main">
        <Suspense fallback={<Loading label="Loading screen" rows={3} />}>
          <Routes>
            <Route path="/" element={<Navigate to="/scan" replace />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/issue" element={<Issue />} />
            <Route path="/return" element={<Return />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/search" element={<Search />} />
            <Route path="/dues" element={<Dues />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/admin/*" element={<Admin />} />
            <Route path="/more" element={<More />} />
            <Route path="*" element={<Navigate to="/scan" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
