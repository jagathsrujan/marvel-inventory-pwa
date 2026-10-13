import { useEffect, useState } from 'react';
import type { Ledger, LedgerAction } from '../../../shared/types';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { Empty, ErrorBox, Loading } from '../../components/ScreenStates';
import { adminListAudit } from '../../lib/api';

const ACTIONS: Array<LedgerAction | 'all'> = ['all', 'created', 'add', 'remove', 'move', 'count', 'issue', 'return', 'adjust'];

const COLUMNS: Array<DataTableColumn<Ledger>> = [
  {
    key: 'ts',
    label: 'When',
    sortable: true,
    getValue: (r) => r.ts,
    render: (r) => (
      <span className="tnum">{new Date(r.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    ),
  },
  { key: 'action', label: 'Action', getValue: (r) => r.action, render: (r) => <span>{r.action}</span> },
  { key: 'delta', label: 'Delta', align: 'right', getValue: (r) => r.delta_qty, render: (r) => <span className="tnum">{r.delta_qty}</span> },
  { key: 'route', label: 'From → to', getValue: (r) => `${r.from_loc ?? ''} ${r.to_loc ?? ''}`, render: (r) => <span className="tnum">{r.from_loc ?? '—'} → {r.to_loc ?? '—'}</span> },
  { key: 'by', label: 'By', getValue: (r) => r.by_user, render: (r) => <span>{r.by_user}</span> },
  { key: 'note', label: 'Reason', getValue: (r) => r.note, render: (r) => <span className="truncate" title={r.note}>{r.note}</span> },
];

export function Audit() {
  const [rows, setRows] = useState<Ledger[]>([]);
  const [action, setAction] = useState<LedgerAction | 'all'>('all');
  const [lotId, setLotId] = useState('');
  const [itemId, setItemId] = useState('');
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setPhase('loading');
    const res = await adminListAudit({
      action,
      lotId: lotId.trim() || undefined,
      itemId: itemId.trim() || undefined,
      limit: 50,
    });
    if (!res.ok || !res.data) {
      setPhase('error');
      setError(res.error ?? 'Could not load audit log.');
      return;
    }
    setRows(res.data);
    setPhase('success');
    setError(null);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return (
    <section aria-labelledby="admin-audit-title">
      <h2 id="admin-audit-title" className="card-title">Audit log</h2>
      <p className="meta">Append-only ledger — every stock change with who and why. Read-only here.</p>
      <div className="chip-row" role="group" aria-label="Filter by action">
        {ACTIONS.map((a) => (
          <button key={a} type="button" className="chip" aria-pressed={action === a} onClick={() => setAction(a)}>
            {a}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <div>
          <label className="field" htmlFor="audit-lot">Lot id</label>
          <input id="audit-lot" className="text" value={lotId} onChange={(e) => setLotId(e.target.value)} placeholder="optional" />
        </div>
        <div>
          <label className="field" htmlFor="audit-item">Item id</label>
          <input id="audit-item" className="text" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn-secondary" onClick={() => void reload()}>Apply filters</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {phase === 'loading' ? <Loading label="Loading audit" rows={5} /> : null}
        {phase === 'error' ? <ErrorBox title="Audit failed" body={error ?? ''} onRetry={() => void reload()} /> : null}
        {phase === 'success' && rows.length === 0 ? (
          <Empty title="No ledger rows" body="Nothing matches these filters — widen the action or clear the ids." />
        ) : null}
        {phase === 'success' && rows.length > 0 ? (
          <DataTable<Ledger> columns={COLUMNS} rows={rows} getRowId={(r) => r.id} caption="Latest 50 ledger rows" defaultSortKey="ts" />
        ) : null}
      </div>
    </section>
  );
}
