import { useEffect, useMemo, useState } from 'react';
import type {
  Item,
  Member,
  Project,
  Request,
  RequestStatus,
} from '../../../shared/types';
import { isMisplaced } from '../../../shared/types';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { Empty, ErrorBox, Loading, OfflineBanner } from '../../components/ScreenStates';
import { useOnlineStatus } from '../../lib/sync';
import {
  addStock,
  adminGetItemsByIds,
  adminListLowStock,
  adminListMisplaced,
  adminListProjects,
  adminListRequests,
  adminUpdateItem,
  approveRequest,
  countStock,
  moveStock,
  rejectRequest,
  removeStock,
} from '../../lib/api';
import type { LowStockRow, MisplacedRow } from '../../lib/api';
import { makeOpId, queueOp } from '../../lib/db';
import { useRole } from '../../lib/auth';

const REQ_FILTERS: Array<RequestStatus | 'all'> = ['all', 'pending', 'approved', 'issued', 'returned', 'rejected'];

function RequestsTab() {
  const { memberId } = useRole();
  const online = useOnlineStatus();
  const [requests, setRequests] = useState<Request[]>([]);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [projects, setProjects] = useState<Map<string, Project>>(new Map());
  const [items, setItems] = useState<Map<string, Item>>(new Map());
  const [filter, setFilter] = useState<RequestStatus | 'all'>('pending');
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = async () => {
    setPhase('loading');
    const res = await adminListRequests(filter);
    if (!res.ok || !res.data) {
      setPhase('error');
      setError(res.error ?? 'Could not load requests.');
      return;
    }
    setRequests(res.data);
    const memberIds = [...new Set(res.data.map((r) => r.member_id))];
    const itemIds = [...new Set(res.data.flatMap((r) => r.items.map((l) => l.item_id)))];
    const [memRes, projRes, itemRes] = await Promise.all([
      (async () => {
        const { supabase } = await import('../../lib/supabase');
        const { data } = await supabase.from('members').select('*').in('id', memberIds.length > 0 ? memberIds : ['00000000-0000-0000-0000-000000000000']);
        return (data ?? []) as Member[];
      })(),
      adminListProjects(),
      adminGetItemsByIds(itemIds),
    ]);
    setMembers(new Map(memRes.map((m) => [m.id, m])));
    if (projRes.ok && projRes.data) setProjects(new Map(projRes.data.map((p) => [p.id, p])));
    if (itemRes.ok && itemRes.data) setItems(new Map(itemRes.data.map((i) => [i.id, i])));
    setPhase('success');
    setError(null);
  };

  useEffect(() => {
    if (!online) {
      setPhase('error');
      setError('Offline — the request queue needs a connection.');
      return;
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, filter]);

  async function decide(id: string, approve: boolean) {
    setBusyId(id);
    setNotice(null);
    const decidedBy = memberId ?? 'admin';
    try {
      const res = approve
        ? await approveRequest(id, decidedBy)
        : await rejectRequest(id, decidedBy, 'rejected from admin console');
      if (!res.ok) {
        if (!online) {
          await queueOp('issue', { request_id: id, decided_by: decidedBy, queued_at: new Date().toISOString() });
          setNotice('Offline — decision queued, syncs when online.');
        } else {
          setNotice(res.error ?? 'Decision failed.');
        }
      } else {
        setNotice(approve ? 'Approved.' : 'Rejected.');
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  const cards = useMemo(
    () =>
      requests.map((r) => {
        const member = members.get(r.member_id);
        const project = r.project_id ? (projects.get(r.project_id) ?? null) : null;
        const lines = r.items.map((l) => ({ item_id: l.item_id, item: items.get(l.item_id), qty: l.qty }));
        const estimate = lines.reduce((s, l) => s + (l.item?.last_rate ?? 0) * l.qty, 0);
        const overBudget = project != null && estimate > Number(project.budget_cap);
        return { r, member, project, lines, estimate, overBudget };
      }),
    [requests, members, projects, items],
  );

  return (
    <div>
      <div className="chip-row" role="group" aria-label="Filter requests">
        {REQ_FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      {notice ? <p className="meta" role="status">{notice}</p> : null}
      {phase === 'loading' ? <Loading label="Loading requests" rows={3} /> : null}
      {phase === 'error' ? <ErrorBox title="Requests failed" body={error ?? ''} onRetry={() => void reload()} /> : null}
      {phase === 'success' && cards.length === 0 ? (
        <Empty title="No requests here" body="Nothing in this state — try another filter." />
      ) : null}
      {phase === 'success'
        ? cards.map(({ r, member, project, lines, estimate, overBudget }) => (
            <article key={r.id} className="card" aria-label={`Request ${r.id}`}>
              <h3 className="card-title">{member?.name ?? r.member_id} · {project?.name ?? 'No project'}</h3>
              <p className="meta">Needed by {new Date(r.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {r.status}</p>
              <ul className="meta">
                {lines.map((l, i) => (
                  <li key={i}>{l.item?.name ?? l.item_id} × {l.qty}</li>
                ))}
              </ul>
              <p className="meta">Estimate Rs {estimate}</p>
              {overBudget && project ? (
                <p className="field-error" role="alert">Over budget cap — Rs {estimate} exceeds {project.name} cap Rs {project.budget_cap}</p>
              ) : null}
              {r.status === 'pending' ? (
                <div className="btn-row">
                  <button type="button" className="btn-primary" disabled={busyId === r.id} onClick={() => void decide(r.id, true)}>
                    {busyId === r.id ? 'Working…' : 'Approve'}
                  </button>
                  <button type="button" className="btn-danger-ghost" disabled={busyId === r.id} onClick={() => void decide(r.id, false)}>
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))
        : null}
    </div>
  );
}

function StockTab() {
  const { role } = useRole();
  const online = useOnlineStatus();
  const [low, setLow] = useState<LowStockRow[]>([]);
  const [misplaced, setMisplaced] = useState<MisplacedRow[]>([]);
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [lotId, setLotId] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editMin, setEditMin] = useState('');
  const [editCost, setEditCost] = useState('');

  const reload = async () => {
    setPhase('loading');
    const [l, m] = await Promise.all([adminListLowStock(), adminListMisplaced()]);
    if (!l.ok || !l.data || !m.ok || !m.data) {
      setPhase('error');
      setError(l.error ?? m.error ?? 'Could not load stock.');
      return;
    }
    setLow(l.data);
    setMisplaced(m.data);
    setPhase('success');
    setError(null);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function runAdjust(kind: 'add' | 'remove' | 'count' | 'move') {
    if (!lotId.trim()) {
      setNotice('Enter a lot id first.');
      return;
    }
    if (!note.trim()) {
      setNotice('A reason is required — no silent edits.');
      return;
    }
    setBusy(true);
    setNotice(null);
    const byUser = role ?? 'admin';
    const opId = makeOpId('admin');
    try {
      if (!online) {
        await queueOp(kind === 'move' ? 'move' : kind === 'count' ? 'count' : 'adjust', {
          lotId: lotId.trim(),
          qty: Number(qty),
          toLocationId: toLoc.trim() || undefined,
          note: note.trim(),
          byUser,
          opId,
        });
        setNotice('Offline — adjustment queued, syncs when online.');
        return;
      }
      const res =
        kind === 'add'
          ? await addStock({ lotId: lotId.trim(), qty: Number(qty), note: note.trim(), byUser, opId })
          : kind === 'remove'
            ? await removeStock({ lotId: lotId.trim(), qty: Number(qty), note: note.trim(), byUser, opId })
            : kind === 'count'
              ? await countStock({ lotId: lotId.trim(), qty: Number(qty), note: note.trim(), byUser, opId })
              : await moveStock({ lotId: lotId.trim(), toLocationId: toLoc.trim(), note: note.trim(), byUser, opId });
      if (!res.ok) {
        setNotice(res.error ?? 'Adjustment failed.');
        return;
      }
      setNotice('Saved — ledger updated.');
      setNote('');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveItemEdit(row: LowStockRow) {
    const res = await adminUpdateItem({
      itemId: row.item.id,
      min_qty: editMin === '' ? undefined : Number(editMin),
      replacement_cost: editCost === '' ? undefined : Number(editCost),
    });
    if (!res.ok) {
      setNotice(res.error ?? 'Item update failed.');
      return;
    }
    setNotice(`Updated ${row.item.sku}.`);
    setEditId(null);
    await reload();
  }

  const columns: Array<DataTableColumn<LowStockRow>> = useMemo(
    () => [
      { key: 'sku', label: 'SKU', getValue: (r) => r.item.sku, render: (r) => <span className="tnum">{r.item.sku}</span> },
      { key: 'name', label: 'Item', getValue: (r) => r.item.name, render: (r) => <span>{r.item.name}</span> },
      { key: 'qty', label: 'Qty', sortable: true, align: 'right', getValue: (r) => r.lot.qty, render: (r) => <span className="tnum">{r.lot.qty} / min {r.item.min_qty}</span> },
      { key: 'loc', label: 'Location', getValue: (r) => r.locationCode, render: (r) => <span>{r.locationCode}</span> },
      {
        key: 'edit',
        label: 'Reorder',
        render: (r) =>
          editId === r.item.id ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <input aria-label="Min qty" className="text" style={{ width: 72 }} value={editMin} onChange={(e) => setEditMin(e.target.value)} inputMode="numeric" />
              <input aria-label="Replacement cost" className="text" style={{ width: 88 }} value={editCost} onChange={(e) => setEditCost(e.target.value)} inputMode="numeric" />
              <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => void saveItemEdit(r)}>Save</button>
            </span>
          ) : (
            <button type="button" className="btn-ghost" style={{ width: 'auto' }} onClick={() => { setEditId(r.item.id); setEditMin(String(r.item.min_qty)); setEditCost(String(r.item.replacement_cost)); }}>
              Edit
            </button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editId, editMin, editCost],
  );

  return (
    <div>
      {!online ? <OfflineBanner queued={0} /> : null}
      {notice ? <p className="meta" role="status">{notice}</p> : null}
      {phase === 'loading' ? <Loading label="Loading stock" rows={4} /> : null}
      {phase === 'error' ? <ErrorBox title="Stock failed" body={error ?? ''} onRetry={() => void reload()} /> : null}
      {phase === 'success' && low.length === 0 ? (
        <Empty title="No low stock" body="Every line is above its reorder minimum." />
      ) : null}
      {phase === 'success' && low.length > 0 ? (
        <DataTable<LowStockRow> columns={columns} rows={low} getRowId={(r) => r.lot.id} caption={`${low.length} low-stock lines`} defaultSortKey="qty" />
      ) : null}

      {misplaced.length > 0 ? (
        <div className="card">
          <h3 className="card-title">Misplaced ({misplaced.length})</h3>
          <ul className="meta">
            {misplaced.map((m) => (
              <li key={m.lot.id}>
                {m.itemName} — at {m.locCode}, home {m.homeCode}
                {isMisplaced(m.lot) ? '' : ' (now home)'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form className="card" aria-label="Stock adjustment" onSubmit={(e) => e.preventDefault()}>
        <h3 className="card-title">Adjust / move / count</h3>
        <label className="field" htmlFor="adj-lot">Lot id</label>
        <input id="adj-lot" className="text" value={lotId} onChange={(e) => setLotId(e.target.value)} placeholder="Scan a lot, paste its id" />
        <div className="btn-row">
          <div>
            <label className="field" htmlFor="adj-qty">Qty</label>
            <input id="adj-qty" className="text" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="field" htmlFor="adj-toloc">To location id (move only)</label>
            <input id="adj-toloc" className="text" value={toLoc} onChange={(e) => setToLoc(e.target.value)} placeholder="location uuid" />
          </div>
        </div>
        <label className="field" htmlFor="adj-note">Reason (required)</label>
        <input id="adj-note" className="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="lost / broken / found / recount" />
        <div className="btn-row">
          {(['add', 'remove', 'count', 'move'] as const).map((k) => (
            <button key={k} type="button" className={k === 'add' ? 'btn-primary' : 'btn-secondary'} disabled={busy} onClick={() => void runAdjust(k)}>
              {k}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

export function Ops({ initialTab = 'requests' }: { initialTab?: 'requests' | 'stock' }) {
  const [tab, setTab] = useState<'requests' | 'stock'>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  return (
    <section aria-labelledby="admin-ops-title">
      <h2 id="admin-ops-title" className="card-title">{tab === 'requests' ? 'Requests' : 'Stock'}</h2>
      <div className="chip-row" role="group" aria-label="Ops section">
        <button type="button" className="chip" aria-pressed={tab === 'requests'} onClick={() => setTab('requests')}>Requests</button>
        <button type="button" className="chip" aria-pressed={tab === 'stock'} onClick={() => setTab('stock')}>Stock</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {tab === 'requests' ? <RequestsTab /> : <StockTab />}
      </div>
    </section>
  );
}
