import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isStaffRole, staffSignIn, staffSignOut, useRole } from '../../lib/auth';
import { ErrorBox, Loading } from '../../components/ScreenStates';
import { useOnlineStatus } from '../../lib/sync';
import { adminListLowStock, adminOpenCounts, adminPendingRequestCount } from '../../lib/api';
import { queueCount } from '../../lib/db';
import { Members } from './Members';
import { Ops } from './Ops';
import { Audit } from './Audit';
import { Settings } from './Settings';

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'members', label: 'Members' },
  { to: 'requests', label: 'Requests' },
  { to: 'stock', label: 'Stock' },
  { to: 'audit', label: 'Audit' },
  { to: 'settings', label: 'Settings' },
];

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await staffSignIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <section aria-labelledby="admin-login-title">
      <style>{CSS}</style>
      <h1 id="admin-login-title" className="screen-title">Admin console</h1>
      <p className="meta">Staff only — sign in with your volunteer or faculty login.</p>
      <form className="card" onSubmit={submit}>
        <label className="field" htmlFor="admin-email">Staff email</label>
        <input
          id="admin-email"
          className="text"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@uvce.edu"
        />
        <label className="field" htmlFor="admin-pass">Password</label>
        <input
          id="admin-pass"
          className="text"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="pinned">
          <button type="submit" className="btn-primary" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Overview() {
  const online = useOnlineStatus();
  const [open, setOpen] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [fines, setFines] = useState(0);
  const [pending, setPending] = useState(0);
  const [low, setLow] = useState(0);
  const [queued, setQueued] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    (async () => {
      try {
        const [c, p, l, q] = await Promise.all([
          adminOpenCounts(),
          adminPendingRequestCount(),
          adminListLowStock(),
          queueCount().catch(() => 0),
        ]);
        if (!live) return;
        if (c.ok && c.data) {
          setOpen(c.data.open);
          setOverdue(c.data.overdue);
          setFines(c.data.fines);
        }
        if (p.ok && p.data != null) setPending(p.data);
        if (l.ok && l.data) setLow(l.data.length);
        setQueued(q);
        setError(c.ok && p.ok && l.ok ? null : 'Some cards failed to load — counts may be stale.');
        setLoading(false);
      } catch (e) {
        if (!live) return;
        setError(e instanceof Error ? e.message : 'Could not load dashboard.');
        setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [online]);

  if (loading) return <Loading label="Loading dashboard" rows={4} />;
  if (error && open === 0 && pending === 0 && low === 0) {
    return <ErrorBox title="Dashboard failed" body={error} onRetry={() => window.location.reload()} />;
  }

  const cards = [
    { label: 'Open loans', value: open, to: 'requests', note: 'currently out' },
    { label: 'Overdue', value: overdue, to: 'requests', note: `Rs ${fines} fines` },
    { label: 'Pending requests', value: pending, to: 'requests', note: 'needs a decision' },
    { label: 'Low stock lines', value: low, to: 'stock', note: 'at or below min' },
    { label: 'Queued offline', value: queued, to: 'settings', note: online ? 'syncs when due' : 'waiting for net' },
  ];

  return (
    <section aria-labelledby="admin-overview-title">
      <style>{CSS}</style>
      <h2 id="admin-overview-title" className="card-title">Today in the lab</h2>
      {error ? <p className="meta" role="status">{error}</p> : null}
      <div className="kpi-grid">
        {cards.map((c) => (
          <NavLink key={c.label} to={`/admin/${c.to}`} className="kpi">
            <span className="kpi-value tnum">{c.value}</span>
            <span className="kpi-label">{c.label}</span>
            <span className="meta">{c.note}</span>
          </NavLink>
        ))}
      </div>
    </section>
  );
}

const CSS = `
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@media (min-width: 1024px) { .kpi-grid { grid-template-columns: repeat(5, 1fr); } }
.kpi { display: flex; flex-direction: column; gap: 2px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; text-decoration: none; color: inherit; }
.kpi-value { font-size: 28px; font-weight: 700; }
.kpi-label { font-size: 15px; font-weight: 600; }
.ad-tabs { display: flex; gap: 4px; overflow-x: auto; margin: 12px 0 16px; }
.ad-tabs a { flex: none; min-height: 48px; display: inline-flex; align-items: center; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); color: var(--ink-soft); font-size: 15px; font-weight: 600; text-decoration: none; }
.ad-tabs a[aria-current="page"] { color: var(--accent-ink); border-color: var(--accent); background: var(--accent-wash); }
`;

export function Admin() {
  const { session, role, loading, error } = useRole();
  const location = useLocation();
  const base = '/admin/';

  if (loading) return <Loading label="Checking staff access" rows={2} />;
  if (!session) return <Login />;
  if (error) return <ErrorBox title="Access check failed" body={error} onRetry={() => window.location.reload()} />;
  if (!isStaffRole(role)) {
    return (
      <ErrorBox
        title="Staff only"
        body="This console is for admins and storekeepers. Your login has member access — use scan, issue, and dues instead."
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="screen-title">Admin console</h1>
          <p className="meta">Signed in as {role}.</p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          style={{ width: 'auto', paddingInline: 12 }}
          onClick={() => void staffSignOut()}
        >
          Sign out
        </button>
      </div>
      <nav className="ad-tabs" aria-label="Admin sections">
        {TABS.map((t) => {
          const to = `/admin/${t.to}`;
          const active =
            location.pathname === to || (t.to === 'overview' && location.pathname === '/admin');
          return (
            <NavLink key={t.to} to={to} aria-current={active ? 'page' : undefined}>
              {t.label}
            </NavLink>
          );
        })}
      </nav>
      <span style={{ display: 'none' }}>{base}</span>
      <Routes>
        <Route path="overview" element={<Overview />} />
        <Route path="members" element={<Members />} />
        <Route path="requests" element={<Ops initialTab="requests" />} />
        <Route path="stock" element={<Ops initialTab="stock" />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </div>
  );
}

export default Admin;
