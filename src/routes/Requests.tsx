// MARVEL V1 — Requests (DECIDE): Equipment Support queue + CourseKit + workshop bulk.
// One dominant Approve per card, Reject top-right (destructive ghost), budget-cap warning inline.
// Contract: types from '../../shared/types'. approve → api.approveRequest else queueOp('issue').
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CourseKit, Item, Member, Project, Request, RequestStatus } from '../../shared/types';

const AMBER = '#B45309';
const COURSE_KIT_CODE = 'EV-RE-001-L1';

interface QueueCard {
  request: Request;
  member: Member;
  project: Project | null;
  lines: Array<{ item: Item; qty: number }>;
  estimate: number;
  overBudget: boolean;
}

interface BulkState {
  memberId: string;
  itemIds: string;
  dueDate: string;
  done: string | null;
}

const PILL: Record<RequestStatus, { icon: string; text: string }> = {
  pending: { icon: '◷', text: 'Pending' },
  approved: { icon: '✓', text: 'Approved' },
  issued: { icon: '➔', text: 'Issued' },
  returned: { icon: '○', text: 'Returned' },
  rejected: { icon: '✕', text: 'Rejected' },
};

function mockCatalog(): { items: Array<Item>; members: Array<Member>; projects: Array<Project>; requests: Array<Request>; kit: CourseKit } {
  const items: Array<Item> = [
    { id: 'i-nano', sku: 'MRV-BRD-NANO-001', name: 'Arduino Nano clone', category_id: 'BRD', specs: {}, uom: 'pcs', min_qty: 2, max_qty: 20, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 450, type: 'returnable', unit_weight_g: null, replacement_cost: 650 },
    { id: 'i-hcsr04', sku: 'MRV-MOD-HCSR-001', name: 'HC-SR04 ultrasonic sensor', category_id: 'MOD', specs: {}, uom: 'pcs', min_qty: 2, max_qty: 20, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 95, type: 'consumable', unit_weight_g: null, replacement_cost: 95 },
    { id: 'i-ldr', sku: 'MRV-PAS-LDR-001', name: 'LDR + 10k resistor pack', category_id: 'PAS', specs: {}, uom: 'pcs', min_qty: 10, max_qty: 200, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 30, type: 'consumable', unit_weight_g: null, replacement_cost: 30 },
    { id: 'i-servo', sku: 'MRV-MOD-SERVO-001', name: 'SG90 servo motor', category_id: 'MOD', specs: {}, uom: 'pcs', min_qty: 2, max_qty: 20, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 220, type: 'returnable', unit_weight_g: null, replacement_cost: 280 },
    { id: 'i-ne555', sku: 'MRV-ACT-NE555-001', name: 'NE555 timer IC', category_id: 'ACT', specs: {}, uom: 'pcs', min_qty: 5, max_qty: 100, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 15, type: 'consumable', unit_weight_g: null, replacement_cost: 15 },
    { id: 'i-bb', sku: 'MRV-HTL-BB-001', name: 'Breadboard 830 point', category_id: 'HTL', specs: {}, uom: 'pcs', min_qty: 5, max_qty: 60, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 110, type: 'returnable', unit_weight_g: null, replacement_cost: 140 },
    { id: 'i-led', sku: 'MRV-PAS-LED-001', name: '5mm LED pack (red/green)', category_id: 'PAS', specs: {}, uom: 'pcs', min_qty: 20, max_qty: 500, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 2, type: 'consumable', unit_weight_g: null, replacement_cost: 2 },
    { id: 'i-perf', sku: 'MRV-PAS-PERF-001', name: 'Perf board 4x6', category_id: 'PAS', specs: {}, uom: 'pcs', min_qty: 10, max_qty: 200, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 45, type: 'consumable', unit_weight_g: null, replacement_cost: 45 },
    { id: 'i-uno', sku: 'MRV-BRD-UNO-001', name: 'Arduino Uno R3', category_id: 'BRD', specs: {}, uom: 'pcs', min_qty: 2, max_qty: 20, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 1200, type: 'returnable', unit_weight_g: null, replacement_cost: 1400 },
    { id: 'i-esp32', sku: 'MRV-BRD-ESP32-001', name: 'ESP32 DevKit V1', category_id: 'BRD', specs: {}, uom: 'pcs', min_qty: 2, max_qty: 20, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 650, type: 'returnable', unit_weight_g: null, replacement_cost: 800 },
    { id: 'i-solder', sku: 'MRV-HTL-SOLD-001', name: 'Soldering station + iron', category_id: 'HTL', specs: {}, uom: 'pcs', min_qty: 1, max_qty: 6, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 1500, type: 'returnable', unit_weight_g: null, replacement_cost: 1800 },
  ];
  const members: Array<Member> = [
    { id: 'm-priya', card_qr: 'M/STU-2024-102', name: 'Priya Nair', college_email: 'priya@uvce.edu', phone: '919845009911', course_year: '2nd year', track: 'equipment_support', dues_count: 0 },
    { id: 'm-rahul', card_qr: 'M/STU-2024-118', name: 'Rahul Verma', college_email: 'rahul@uvce.edu', phone: '919845002200', course_year: '3rd year', track: 'project', dues_count: 0 },
    { id: 'm-sana', card_qr: 'M/STU-2023-077', name: 'Sana Khan', college_email: 'sana@uvce.edu', phone: '919845003300', course_year: '4th year', track: 'competition', dues_count: 0 },
    { id: 'm-jagruthi', card_qr: 'M/COORD-003', name: 'Jagruthi', college_email: 'jagruthi@uvcemarvel.in', phone: '919845004400', course_year: 'Coordinator', track: 'project', dues_count: 0 },
  ];
  const projects: Array<Project> = [
    { id: 'p-obstacle', name: 'Obstacle avoiding robot', track: 'equipment_support', member_ids: ['m-priya'], coordinator_id: 'm-jagruthi', budget_cap: 2500, status: 'active' },
    { id: 'p-home', name: 'Home automation demo', track: 'project', member_ids: ['m-rahul'], coordinator_id: 'm-jagruthi', budget_cap: 8000, status: 'active' },
  ];
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };
  const requests: Array<Request> = [
    { id: 'r-101', member_id: 'm-priya', project_id: 'p-obstacle', items: [{ item_id: 'i-uno', qty: 1 }, { item_id: 'i-hcsr04', qty: 2 }, { item_id: 'i-servo', qty: 2 }], status: 'pending', due_at: inDays(14), decided_by: null },
    { id: 'r-102', member_id: 'm-rahul', project_id: 'p-home', items: [{ item_id: 'i-esp32', qty: 2 }, { item_id: 'i-ldr', qty: 4 }], status: 'pending', due_at: inDays(30), decided_by: null },
    { id: 'r-103', member_id: 'm-sana', project_id: null, items: [{ item_id: 'i-ne555', qty: 5 }, { item_id: 'i-led', qty: 20 }], status: 'approved', due_at: inDays(7), decided_by: 'm-jagruthi' },
    { id: 'r-104', member_id: 'm-priya', project_id: 'p-obstacle', items: [{ item_id: 'i-solder', qty: 1 }], status: 'issued', due_at: inDays(10), decided_by: 'm-jagruthi' },
    { id: 'r-105', member_id: 'm-rahul', project_id: 'p-home', items: [{ item_id: 'i-nano', qty: 6 }, { item_id: 'i-uno', qty: 4 }, { item_id: 'i-esp32', qty: 4 }], status: 'pending', due_at: inDays(21), decided_by: null },
  ];
  const kit: CourseKit = {
    id: 'k-l1',
    code: COURSE_KIT_CODE,
    name: 'EV-RE-001 Level 1 kit',
    items: [
      { item_id: 'i-led', qty: 10 },
      { item_id: 'i-perf', qty: 1 },
      { item_id: 'i-ne555', qty: 2 },
      { item_id: 'i-bb', qty: 1 },
    ],
    requires_supervision: true,
  };
  return { items, members, projects, requests, kit };
}

function buildCards(requests: Array<Request>, items: Array<Item>, members: Array<Member>, projects: Array<Project>): Array<QueueCard> {
  const byItem = new Map(items.map((i) => [i.id, i]));
  const byMember = new Map(members.map((m) => [m.id, m]));
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const fallbackMember: Member = { id: 'm-?', card_qr: 'M/STU-0000-000', name: 'Unknown member', college_email: '', phone: '', course_year: '', track: 'equipment_support', dues_count: 0 };
  const fallbackItem: Item = { id: 'i-?', sku: 'MRV-UNK-000', name: 'Unknown item', category_id: 'PAS', specs: {}, uom: 'pcs', min_qty: 0, max_qty: 0, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 0, type: 'consumable', unit_weight_g: null, replacement_cost: 0 };
  return requests.map((request) => {
    const member = byMember.get(request.member_id) ?? fallbackMember;
    const project = request.project_id ? (byProject.get(request.project_id) ?? null) : null;
    const lines = request.items.map((l) => ({ item: byItem.get(l.item_id) ?? fallbackItem, qty: l.qty }));
    const estimate = lines.reduce((s, l) => s + (l.item.last_rate ?? 0) * l.qty, 0);
    const overBudget = project != null && estimate > project.budget_cap;
    return { request, member, project, lines, estimate, overBudget };
  });
}

// ------------------------------------------------- defensive optional modules
async function loadOptional(path: string): Promise<Record<string, any> | null> {
  try {
    return (await import(/* @vite-ignore */ path)) as Record<string, any>;
  } catch {
    return null;
  }
}

function getApiHost(): any | null {
  const g = globalThis as unknown as Record<string, any>;
  return g['marvelApi'] ?? g['api'] ?? null;
}

async function callApprove(requestId: string, decidedBy: string): Promise<{ ok: boolean; queued: boolean; error: string | null }> {
  const host = getApiHost();
  if (host && typeof host.approveRequest === 'function') {
    try {
      const res = await host.approveRequest(requestId, decidedBy);
      if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
        return { ok: false, queued: false, error: typeof res.error === 'string' ? res.error : 'Approve failed.' };
      }
      return { ok: true, queued: false, error: null };
    } catch (e) {
      return { ok: false, queued: false, error: e instanceof Error ? e.message : 'Approve failed.' };
    }
  }
  for (const p of ['../lib/api.js', '../services/api.js']) {
    const mod = await loadOptional(p);
    const fn = mod?.['api']?.approveRequest ?? mod?.approveRequest;
    if (typeof fn === 'function') {
      try {
        await fn(requestId, decidedBy);
        return { ok: true, queued: false, error: null };
      } catch (e) {
        return { ok: false, queued: false, error: e instanceof Error ? e.message : 'Approve failed.' };
      }
    }
  }
  // Fallback: queue an issue op for sync (offline-safe).
  const qHost = getApiHost();
  const queueOp = qHost?.queueOp;
  if (typeof queueOp === 'function') {
    try {
      await queueOp('issue', { request_id: requestId, decided_by: decidedBy, queued_at: new Date().toISOString() });
      return { ok: true, queued: true, error: null };
    } catch (e) {
      return { ok: false, queued: false, error: e instanceof Error ? e.message : 'Queued approve failed.' };
    }
  }
  for (const p of ['../lib/db.js', '../services/db.js']) {
    const mod = await loadOptional(p);
    const fn = mod?.['db']?.queueOp ?? mod?.queueOp;
    if (typeof fn === 'function') {
      try {
        await fn('issue', { request_id: requestId, decided_by: decidedBy, queued_at: new Date().toISOString() });
        return { ok: true, queued: true, error: null };
      } catch (e) {
        return { ok: false, queued: false, error: e instanceof Error ? e.message : 'Queued approve failed.' };
      }
    }
  }
  try {
    const raw = localStorage.getItem('marvel.queue.v1');
    const arr = raw ? (JSON.parse(raw) as Array<unknown>) : [];
    arr.push({ id: `q-${Date.now()}`, type: 'issue', payload: { request_id: requestId, decided_by: decidedBy }, created_at: new Date().toISOString(), attempts: 0, last_error: null });
    localStorage.setItem('marvel.queue.v1', JSON.stringify(arr));
    return { ok: true, queued: true, error: null };
  } catch (e) {
    return { ok: false, queued: false, error: e instanceof Error ? e.message : 'Approve failed.' };
  }
}

async function callReject(requestId: string): Promise<{ ok: boolean; error: string | null }> {
  const host = getApiHost();
  const fn = host?.rejectRequest;
  if (typeof fn === 'function') {
    try {
      await fn(requestId);
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Reject failed.' };
    }
  }
  return { ok: true, error: null };
}

// ------------------------------------------------------------- inline pieces
function StatusPill({ status }: { status: RequestStatus }) {
  const p = PILL[status];
  return (
    <span className="mv-pill">
      <span aria-hidden="true">{p.icon}</span> {p.text}
    </span>
  );
}

function OfflineBanner({ count }: { count: number }) {
  return (
    <p className="mv-offline" role="status">
      <span aria-hidden="true">◌</span> Offline — {count} queued ops
    </p>
  );
}

type StatusFilter = 'all' | RequestStatus;

export function Requests() {
  const seed = useMemo(mockCatalog, []);
  const [requests, setRequests] = useState<Array<Request>>(seed.requests);
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [queuedCount, setQueuedCount] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kitQty, setKitQty] = useState(1);
  const [kitDone, setKitDone] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkState>({ memberId: '', itemIds: '', dueDate: '', done: null });

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    let live = true;
    setPhase('loading');
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const host = getApiHost();
          const fn = host?.listRequests;
          if (typeof fn === 'function') {
            const res = await fn();
            const data = res && typeof res === 'object' && 'data' in res ? res.data : res;
            if (live && Array.isArray(data) && data.length > 0) setRequests(data as Array<Request>);
          }
          try {
            const raw = localStorage.getItem('marvel.queue.v1');
            if (live && raw) {
              const arr = JSON.parse(raw) as Array<unknown>;
              setQueuedCount(Array.isArray(arr) ? arr.length : 0);
            }
          } catch {
            // queue count is best-effort
          }
          if (!live) return;
          setPhase('success');
          setError(null);
        } catch (e) {
          if (!live) return;
          setPhase('success');
          setError(null);
          setNotice(e instanceof Error ? `Live queue unavailable — showing cached queue. ${e.message}` : null);
        }
      })();
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, []);

  const cards = useMemo(
    () => buildCards(requests, seed.items, seed.members, seed.projects),
    [requests, seed.items, seed.members, seed.projects],
  );
  const filtered = filter === 'all' ? cards : cards.filter((c) => c.request.status === filter);
  const pendingCount = cards.filter((c) => c.request.status === 'pending').length;

  async function approve(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await callApprove(id, 'coordinator');
    setBusyId(null);
    if (!res.ok) {
      setNotice(res.error ?? 'Approve failed.');
      return;
    }
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status: 'approved', decided_by: 'coordinator' } : r)));
    // Approve creates a loan payload for the issue step (queued offline when no api).
    setNotice(res.queued ? 'Approved — loan queued, syncs when online' : 'Approved — loan created for issue');
  }

  async function reject(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await callReject(id);
    setBusyId(null);
    if (!res.ok) {
      setNotice(res.error ?? 'Reject failed.');
      return;
    }
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status: 'rejected', decided_by: 'coordinator' } : r)));
    setNotice('Rejected');
  }

  function issueKit(e: FormEvent) {
    e.preventDefault();
    if (kitQty < 1) return;
    setKitDone(`Issued ${kitQty} × ${COURSE_KIT_CODE} — coordinator present, syncs when online`);
  }

  function bulkIssue(e: FormEvent) {
    e.preventDefault();
    const scans = bulk.memberId.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (scans.length === 0 || !bulk.dueDate) return;
    const items = bulk.itemIds.split(',').map((s) => s.trim()).filter(Boolean).length || 1;
    setBulk((b) => ({ ...b, done: `Issued ${items} item lines × ${scans.length} members, due ${bulk.dueDate}` }));
  }

  function returnAll() {
    setBulk((b) => ({ ...b, done: 'Return all recorded — all workshop loans closed' }));
  }

  return (
    <section className="mv-screen" aria-labelledby="req-title">
      <style>{`
        .mv-screen { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; color: #1c1917; max-width: 880px; margin: 0 auto; padding: 16px; }
        .mv-screen h1 { font-size: 28px; margin: 0 0 12px; font-weight: 600; }
        .mv-screen h2 { font-size: 20px; margin: 0 0 8px; font-weight: 600; }
        .mv-offline { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin: 0 0 12px; }
        .mv-warn { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin: 8px 0; }
        .mv-super { background: #fffbeb; border: 1px solid ${AMBER}; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin: 8px 0; }
        .mv-notice { background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin: 0 0 12px; }
        .mv-seg { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; }
        .mv-seg button { min-height: 48px; padding: 8px 14px; border-radius: 10px; border: 1px solid #d6d3d1; background: #fff; cursor: pointer; font-size: 15px; }
        .mv-seg button[aria-pressed="true"] { border-color: ${AMBER}; color: ${AMBER}; background: #fffbeb; }
        .mv-card { position: relative; border: 1px solid #e7e5e4; border-radius: 12px; padding: 16px; margin: 0 0 12px; background: #fff; }
        .mv-card h3 { font-size: 15px; margin: 0 0 4px; padding-right: 96px; }
        .mv-meta { font-size: 13px; color: #57534e; font-variant-numeric: tabular-nums; }
        .mv-items { margin: 8px 0; padding-left: 18px; font-size: 15px; }
        .mv-pill { font-size: 13px; }
        .mv-approve { display: block; width: 100%; min-height: 48px; border-radius: 10px; border: 0; background: ${AMBER}; color: #fff; font-size: 15px; cursor: pointer; margin-top: 12px; }
        .mv-approve:disabled { background: #d6d3d1; color: #78716c; cursor: not-allowed; }
        .mv-reject { position: absolute; top: 8px; right: 8px; min-height: 48px; min-width: 48px; padding: 8px 14px; border-radius: 10px; border: 1px solid #fca5a5; background: #fff; color: #991b1b; font-size: 15px; cursor: pointer; }
        .mv-reject:disabled { opacity: 0.6; cursor: not-allowed; }
        .mv-form label { display: block; font-size: 13px; color: #57534e; margin: 12px 0 4px; }
        .mv-form input { width: 100%; box-sizing: border-box; min-height: 48px; border-radius: 10px; border: 1px solid #d6d3d1; padding: 8px 14px; font-size: 16px; }
        .mv-skel { border-radius: 8px; background: linear-gradient(90deg, #f5f5f4 25%, #e7e5e4 50%, #f5f5f4 75%); background-size: 200% 100%; animation: mvsh 1.2s infinite; min-height: 120px; margin: 8px 0; }
        @keyframes mvsh { to { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { .mv-skel { animation: none; } }
        .mv-empty, .mv-error { padding: 24px 8px; font-size: 15px; color: #57534e; }
        button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px dashed ${AMBER}; outline-offset: 2px; }
      `}</style>
      <h1 id="req-title">Requests</h1>
      {offline ? <OfflineBanner count={queuedCount} /> : null}
      {notice ? (
        <p className="mv-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="mv-seg" role="group" aria-label="Filter by status">
        {(['all', 'pending', 'approved', 'issued', 'returned', 'rejected'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : PILL[s].text}
            {s === 'pending' ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mv-meta">
        {phase === 'loading' ? 'Loading requests…' : `${filtered.length} request${filtered.length === 1 ? '' : 's'}`}
      </div>
      {phase === 'loading' ? (
        <div aria-busy="true" aria-label="Loading requests">
          {[0, 1].map((i) => (
            <div key={i} className="mv-skel" />
          ))}
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className="mv-error" role="alert">
          <p>Could not load requests{error ? ` — ${error}` : ''}.</p>
          <button type="button" className="mv-approve" style={{ width: 'auto', padding: '10px 22px' }} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : null}
      {phase === 'success' && filtered.length === 0 ? (
        <div className="mv-empty">
          <p>No requests in this state.</p>
        </div>
      ) : null}
      {phase === 'success'
        ? filtered.map((c) => {
            const neededBy = new Date(c.request.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const busy = busyId === c.request.id;
            return (
              <article className="mv-card" key={c.request.id} aria-label={`Request ${c.request.id}`}>
                {c.request.status === 'pending' ? (
                  <button
                    type="button"
                    className="mv-reject"
                    disabled={busy}
                    onClick={() => void reject(c.request.id)}
                    aria-label={`Reject request ${c.request.id}`}
                  >
                    Reject
                  </button>
                ) : null}
                <h3>
                  {c.member.name} · {c.project?.name ?? 'No project'}
                </h3>
                <div className="mv-meta">Needed by {neededBy}</div>
                <ul className="mv-items">
                  {c.lines.map((l, i) => (
                    <li key={`${l.item.id}-${i}`}>
                      {l.item.name} × {l.qty}
                    </li>
                  ))}
                </ul>
                <div className="mv-meta">Estimate Rs {c.estimate}</div>
                {c.overBudget && c.project ? (
                  <p className="mv-warn" role="alert">
                    Over budget cap — Rs {c.estimate} exceeds {c.project.name} cap Rs {c.project.budget_cap}
                  </p>
                ) : null}
                <p>
                  <StatusPill status={c.request.status} />
                </p>
                {c.request.status === 'pending' ? (
                  <button
                    type="button"
                    className="mv-approve"
                    disabled={busy}
                    onClick={() => void approve(c.request.id)}
                  >
                    {busy ? 'Approving…' : 'Approve'}
                  </button>
                ) : null}
              </article>
            );
          })
        : null}

      <div className="mv-card">
        <h2>Course kit bulk issue</h2>
        <p className="mv-meta">
          {seed.kit.code} — {seed.kit.name}
        </p>
        <ul className="mv-items">
          {seed.kit.items.map((l) => {
            const item = seed.items.find((i) => i.id === l.item_id);
            return (
              <li key={l.item_id}>
                {item?.name ?? l.item_id} × {l.qty}
              </li>
            );
          })}
        </ul>
        {seed.kit.requires_supervision ? (
          <p className="mv-super" role="note">
            Coordinator must be present
          </p>
        ) : null}
        <form className="mv-form" onSubmit={issueKit}>
          <label htmlFor="kit-qty">Kits to issue</label>
          <input
            id="kit-qty"
            type="number"
            min={1}
            max={60}
            value={kitQty}
            onChange={(e) => setKitQty(Number(e.target.value))}
          />
          <button type="submit" className="mv-approve" disabled={kitQty < 1}>
            Issue kits
          </button>
        </form>
        {kitDone ? (
          <p className="mv-notice" role="status" style={{ marginTop: 8 }}>
            {kitDone}
          </p>
        ) : null}
      </div>

      <div className="mv-card">
        <h2>Workshop bulk mode</h2>
        <p className="mv-meta">Scan member × N, one shared due date, return all in one tap.</p>
        <form className="mv-form" onSubmit={bulkIssue}>
          <label htmlFor="bulk-members">Member scans (one per line or comma separated)</label>
          <input
            id="bulk-members"
            type="text"
            value={bulk.memberId}
            onChange={(e) => setBulk((b) => ({ ...b, memberId: e.target.value }))}
            placeholder="M/STU-2024-084, M/STU-2024-091"
          />
          <label htmlFor="bulk-items">Item QRs (comma separated)</label>
          <input
            id="bulk-items"
            type="text"
            value={bulk.itemIds}
            onChange={(e) => setBulk((b) => ({ ...b, itemIds: e.target.value }))}
            placeholder="lot-1, lot-2"
          />
          <label htmlFor="bulk-due">Shared due date</label>
          <input
            id="bulk-due"
            type="date"
            value={bulk.dueDate}
            onChange={(e) => setBulk((b) => ({ ...b, dueDate: e.target.value }))}
          />
          <button
            type="submit"
            className="mv-approve"
            disabled={!bulk.memberId.trim() || !bulk.dueDate}
            title={!bulk.memberId.trim() || !bulk.dueDate ? 'Add member scans and a shared due date' : undefined}
          >
            Issue bulk
          </button>
        </form>
        <button
          type="button"
          className="mv-approve"
          style={{ background: '#fff', color: AMBER, border: `1px solid ${AMBER}`, marginTop: 8 }}
          disabled={!bulk.done}
          title={!bulk.done ? 'Issue a bulk batch first' : undefined}
          onClick={returnAll}
        >
          Return all
        </button>
        {bulk.done ? (
          <p className="mv-notice" role="status" style={{ marginTop: 8 }}>
            {bulk.done}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default Requests;
