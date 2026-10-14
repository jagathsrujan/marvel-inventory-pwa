// MARVEL V1 — Dues (MONITOR): overdue-first ranked list + wa.me reminders.
// Desk face (>=1024px): table member / item / project / coordinator / days / fine.
// Contract: types from '../../shared/types'. Fine: Rs 10/day, Dead = replacement_cost.
import { useEffect, useMemo, useState } from 'react';
import { DeskLayout } from '../components/DeskLayout';
import { DataTable } from '../components/DataTable';
import type { DataTableColumn } from '../components/DataTable';
import { daysLate, isMisplaced, waReminderLink } from '../../shared/types';
import type { Item, Loan, Location, Member, Project, StockLot } from '../../shared/types';

const PAGE_SIZE = 50;
const FINE_PER_DAY = 10;

interface DueRow {
  loan: Loan;
  member: Member;
  item: Item;
  project: Project | null;
  coordinatorName: string;
  lateDays: number;
  fine: number;
}

interface MisplacedRow {
  lot: StockLot;
  itemName: string;
  locCode: string;
  homeCode: string;
}

// ---------------------------------------------------------------- mock seed
// Real MARVEL names for coordinators (public): Adrian, Varsha, Jagruthi.
function mockSeed(): { dues: Array<DueRow>; misplaced: Array<MisplacedRow> } {
  const members: Array<Member> = [
    { id: 'm-arjun', card_qr: 'M/STU-2024-084', name: 'Arjun Rao', college_email: 'arjun@uvce.edu', phone: '919845001122', course_year: '3rd year', track: 'project', dues_count: 2 },
    { id: 'm-meera', card_qr: 'M/STU-2024-091', name: 'Meera Kulkarni', college_email: 'meera@uvce.edu', phone: '919845003344', course_year: '2nd year', track: 'equipment_support', dues_count: 1 },
    { id: 'm-kiran', card_qr: 'M/STU-2023-112', name: 'Kiran Shetty', college_email: 'kiran@uvce.edu', phone: '', course_year: '4th year', track: 'competition', dues_count: 1 },
    { id: 'm-adrian', card_qr: 'M/COORD-001', name: 'Adrian', college_email: 'adrian@uvcemarvel.in', phone: '919845005566', course_year: 'Coordinator', track: 'project', dues_count: 0 },
    { id: 'm-varsha', card_qr: 'M/COORD-002', name: 'Varsha', college_email: 'varsha@uvcemarvel.in', phone: '919845007788', course_year: 'Coordinator', track: 'project', dues_count: 0 },
  ];
  const items: Array<Item> = [
    { id: 'i-nano', sku: 'MRV-BRD-NANO-001', name: 'Arduino Nano clone', category_id: 'BRD', specs: {}, uom: 'pcs', min_qty: 2, max_qty: 20, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 450, type: 'returnable', unit_weight_g: null, replacement_cost: 650 },
    { id: 'i-multi', sku: 'MRV-MEA-MULTI-001', name: 'Digital multimeter DT-830D', category_id: 'MEA', specs: {}, uom: 'pcs', min_qty: 1, max_qty: 8, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 850, type: 'returnable', unit_weight_g: null, replacement_cost: 850 },
    { id: 'i-esp32', sku: 'MRV-BRD-ESP32-001', name: 'ESP32 DevKit V1', category_id: 'BRD', specs: {}, uom: 'pcs', min_qty: 2, max_qty: 20, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 650, type: 'returnable', unit_weight_g: null, replacement_cost: 800 },
    { id: 'i-solder', sku: 'MRV-HTL-SOLD-001', name: 'Soldering station + iron', category_id: 'HTL', specs: {}, uom: 'pcs', min_qty: 1, max_qty: 6, photo_urls: [], datasheet_url: null, supplier: null, last_rate: 1500, type: 'returnable', unit_weight_g: null, replacement_cost: 1800 },
  ];
  const projects: Array<Project> = [
    { id: 'p-line', name: 'Line follower bot', track: 'project', member_ids: ['m-arjun'], coordinator_id: 'm-adrian', budget_cap: 5000, status: 'active' },
    { id: 'p-weather', name: 'Weather station', track: 'equipment_support', member_ids: ['m-meera'], coordinator_id: 'm-varsha', budget_cap: 3000, status: 'active' },
  ];
  const byMember = new Map(members.map((m) => [m.id, m]));
  const byItem = new Map(items.map((i) => [i.id, i]));
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };
  const daysAhead = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };
  const mkLoan = (
    id: string,
    itemId: string,
    memberId: string,
    projectId: string | null,
    issuedDaysAgo: number,
    dueInDays: number,
    status: Loan['status'],
    conditionOut: Loan['condition_out'],
  ): Loan => ({
    id,
    lot_id: `lot-${id}`,
    item_id: itemId,
    qty: 1,
    member_id: memberId,
    project_id: projectId,
    issued_by: 'm-adrian',
    issued_at: daysAgo(issuedDaysAgo),
    due_at: dueInDays < 0 ? daysAgo(-dueInDays) : daysAhead(dueInDays),
    returned_at: null,
    condition_in: 'Good',
    condition_out: conditionOut,
    fine: 0,
    status,
  });
  const loans: Array<Loan> = [
    mkLoan('ln-1', 'i-nano', 'm-arjun', 'p-line', 30, -12, 'overdue', null),
    mkLoan('ln-2', 'i-multi', 'm-meera', 'p-weather', 22, -5, 'overdue', null),
    mkLoan('ln-3', 'i-esp32', 'm-kiran', null, 10, 4, 'open', null),
    mkLoan('ln-4', 'i-solder', 'm-arjun', 'p-line', 40, -20, 'overdue', 'Dead'),
  ];
  const dues: Array<DueRow> = loans.map((loan) => {
    const member = byMember.get(loan.member_id) ?? members[0];
    const item = byItem.get(loan.item_id) ?? items[0];
    const project = loan.project_id ? (byProject.get(loan.project_id) ?? null) : null;
    const coordinatorName = project
      ? (byMember.get(project.coordinator_id)?.name ?? 'Coordinator')
      : 'No project';
    const lateDays = daysLate(loan.due_at);
    const fine = loan.condition_out === 'Dead' || loan.status === 'lost' ? item.replacement_cost : lateDays * FINE_PER_DAY;
    return { loan, member, item, project, coordinatorName, lateDays, fine };
  });
  dues.sort((a, b) => b.lateDays - a.lateDays || b.fine - a.fine);

  const locations: Array<Location> = [
    { id: 'l-r1s2b3', code: 'R1-S2-B3', name: 'Rack 1 Shelf 2 Bin 3', parent_id: null, type: 'Bin', photo_url: null, path: 'Lab/Rack-1/Shelf-2/Bin-3' },
    { id: 'l-r1s1b1', code: 'R1-S1-B1', name: 'Rack 1 Shelf 1 Bin 1', parent_id: null, type: 'Bin', photo_url: null, path: 'Lab/Rack-1/Shelf-1/Bin-1' },
    { id: 'l-r2s1b1', code: 'R2-S1-B1', name: 'Rack 2 Shelf 1 Bin 1', parent_id: null, type: 'Bin', photo_url: null, path: 'Lab/Rack-2/Shelf-1/Bin-1' },
  ];
  const locCode = new Map(locations.map((l) => [l.id, l.code]));
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const lots: Array<StockLot> = [
    { id: 'lot-a', item_id: 'i-nano', location_id: 'l-r2s1b1', home_location_id: 'l-r1s1b1', qty: 1, batch: null },
    { id: 'lot-b', item_id: 'i-multi', location_id: 'l-r1s2b3', home_location_id: 'l-r2s1b1', qty: 1, batch: null },
    { id: 'lot-c', item_id: 'i-esp32', location_id: 'l-r1s2b3', home_location_id: 'l-r1s2b3', qty: 5, batch: null },
  ];
  const misplaced: Array<MisplacedRow> = lots.filter(isMisplaced).map((lot) => ({
    lot,
    itemName: itemName.get(lot.item_id) ?? lot.item_id,
    locCode: locCode.get(lot.location_id) ?? lot.location_id,
    homeCode: locCode.get(lot.home_location_id) ?? lot.home_location_id,
  }));
  return { dues, misplaced };
}

function calcFine(loan: Loan, item: Item, lateDays: number): number {
  if (loan.condition_out === 'Dead' || loan.status === 'lost') return item.replacement_cost;
  return lateDays * FINE_PER_DAY;
}

function reminderText(name: string, itemName: string, dueAt: string, fine: number): string {
  const date = new Date(dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `Hi ${name}, ${itemName} due since ${date}, fine Rs ${fine}. — MARVEL lab`;
}

function formatDue(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ------------------------------------------------- defensive optional modules
async function loadOptional(path: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function tryRemoteDues(): Promise<{ dues: Array<DueRow>; misplaced: Array<MisplacedRow> } | null> {
  const g = globalThis as unknown as Record<string, any>;
  for (const api of [g['marvelApi'], g['api']]) {
    try {
      const fn = api?.listLoans ?? api?.getDues ?? api?.listDues;
      if (typeof fn === 'function') {
        const res = await fn();
        const data = res && typeof res === 'object' && 'data' in res ? res.data : res;
        if (Array.isArray(data) && data.length > 0 && 'member' in (data[0] ?? {})) {
          return { dues: data as Array<DueRow>, misplaced: mockSeed().misplaced };
        }
      }
    } catch {
      // fall through to mocks
    }
  }
  for (const p of ['../lib/api.js', '../services/api.js']) {
    const mod = await loadOptional(p);
    const fn = (mod?.['api'] as any)?.listLoans ?? mod?.['listLoans'];
    if (typeof fn === 'function') {
      try {
        const res = await fn();
        const data = res && typeof res === 'object' && 'data' in res ? res.data : res;
        if (Array.isArray(data) && data.length > 0 && 'member' in (data[0] ?? {})) {
          return { dues: data as Array<DueRow>, misplaced: mockSeed().misplaced };
        }
      } catch {
        // keep falling through
      }
    }
  }
  return null;
}

// ------------------------------------------------------------- inline pieces
function OfflineBanner({ count }: { count: number }) {
  return (
    <p className="mv-offline" role="status">
      <span aria-hidden="true">◌</span> Offline — {count} cached dues
    </p>
  );
}

function LoanPill({ lateDays, status }: { lateDays: number; status: Loan['status'] }) {
  if (status === 'returned') return <span className="mv-pill"><span aria-hidden="true">○</span> Returned</span>;
  if (status === 'lost') return <span className="mv-pill"><span aria-hidden="true">✕</span> Lost</span>;
  if (lateDays > 0) return <span className="mv-pill mv-bad"><span aria-hidden="true">●</span> Overdue {lateDays} days</span>;
  return <span className="mv-pill"><span aria-hidden="true">◐</span> Borrowed</span>;
}

export function Dues() {
  const [dues, setDues] = useState<Array<DueRow>>([]);
  const [misplaced, setMisplaced] = useState<Array<MisplacedRow>>([]);
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [query, setQuery] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
          const remote = await tryRemoteDues();
          if (!live) return;
          const seed = remote ?? mockSeed();
          // Recompute fines from contract rule so mocks never drift.
          const recomputed = seed.dues.map((d) => ({ ...d, fine: calcFine(d.loan, d.item, d.lateDays) }));
          recomputed.sort((a, b) => b.lateDays - a.lateDays || b.fine - a.fine);
          setDues(recomputed);
          setMisplaced(seed.misplaced);
          setPhase('success');
          setError(null);
          setVisibleCount(PAGE_SIZE);
        } catch (e) {
          if (!live) return;
          setPhase('error');
          setError(e instanceof Error ? e.message : 'Could not load dues.');
        }
      })();
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dues.filter((d) => {
      if (overdueOnly && d.lateDays <= 0) return false;
      if (!needle) return true;
      return [d.member.name, d.item.name, d.item.sku, d.project?.name ?? '', d.coordinatorName]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [dues, query, overdueOnly]);

  const visible = filtered.slice(0, visibleCount);
  const selected = dues.find((d) => d.loan.id === selectedId) ?? visible[0] ?? null;

  const columns: Array<DataTableColumn<DueRow>> = useMemo(
    () => [
      { key: 'member', label: 'Member', getValue: (r) => r.member.name, render: (r) => <span>{r.member.name}</span> },
      { key: 'item', label: 'Item', getValue: (r) => r.item.name, render: (r) => <span>{r.item.name}</span> },
      { key: 'project', label: 'Project', getValue: (r) => r.project?.name ?? 'No project', render: (r) => <span>{r.project?.name ?? 'No project'}</span> },
      { key: 'coordinator', label: 'Coordinator', getValue: (r) => r.coordinatorName, render: (r) => <span>{r.coordinatorName}</span> },
      { key: 'days', label: 'Days late', sortable: true, align: 'right', getValue: (r) => r.lateDays, render: (r) => <span className="tnum">{r.lateDays}</span> },
      { key: 'fine', label: 'Fine', align: 'right', getValue: (r) => r.fine, render: (r) => <span className="tnum">Rs {r.fine}</span> },
      {
        key: 'remind',
        label: 'Reminder',
        render: (r) =>
          r.member.phone ? (
            <a
              className="mv-remind"
              href={waReminderLink(r.member.phone, reminderText(r.member.name, r.item.name, r.loan.due_at, r.fine))}
              target="_blank"
              rel="noreferrer"
            >
              Remind
            </a>
          ) : (
            <button type="button" className="mv-remind" disabled title="No phone number on file">
              Remind
            </button>
          ),
      },
    ],
    [],
  );

  return (
    <section className="mv-screen wide" aria-labelledby="dues-title">
      <h1 id="dues-title">Dues</h1>
      {offline ? <OfflineBanner count={dues.length} /> : null}
      <DeskLayout
        filters={
          <div className="mv-filters">
            <h2>Filters</h2>
            <label htmlFor="dues-q">Search member or item</label>
            <input
              id="dues-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Arjun, Nano, multimeter"
            />
            <label className="mv-check" htmlFor="dues-overdue">
              <input
                id="dues-overdue"
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
              />
              Overdue only
            </label>
            <button
              type="button"
              className="mv-ghost"
              disabled={!query && !overdueOnly}
              title={!query && !overdueOnly ? 'No filters to clear' : undefined}
              onClick={() => {
                setQuery('');
                setOverdueOnly(false);
              }}
            >
              Clear
            </button>
            <p className="mv-meta" aria-live="polite">
              {phase === 'loading' ? 'Loading dues…' : `${filtered.length} due${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>
        }
        rows={
          <div>
            {phase === 'loading' ? (
              <div aria-busy="true" aria-label="Loading dues">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="mv-skel skel-row" />
                ))}
              </div>
            ) : null}
            {phase === 'error' ? (
              <div className="mv-error" role="alert">
                <p>Could not load dues{error ? ` — ${error}` : ''}.</p>
                <button type="button" className="mv-ghost" onClick={() => window.location.reload()}>
                  Retry
                </button>
              </div>
            ) : null}
            {phase === 'success' && filtered.length === 0 ? (
              <div className="mv-empty">
                <p>No dues. Lab is clean.</p>
              </div>
            ) : null}
            {phase === 'success' && visible.length > 0 ? (
              <>
                <div className="mv-show-narrow" role="list" aria-label="Dues list">
                  {visible.map((d) => (
                    <div className="mv-card flat" role="listitem" key={d.loan.id}>
                      <h3>{d.member.name} — {d.item.name}</h3>
                      <div className="mv-meta">
                        Due {formatDue(d.loan.due_at)} · {d.lateDays} days late · Fine Rs {d.fine}
                      </div>
                      <div className="mv-meta">{d.project?.name ?? 'No project'} · {d.coordinatorName}</div>
                      <div className="mv-rowline">
                        <LoanPill lateDays={d.lateDays} status={d.loan.status} />
                        {d.member.phone ? (
                          <a
                            className="mv-remind"
                            href={waReminderLink(d.member.phone, reminderText(d.member.name, d.item.name, d.loan.due_at, d.fine))}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Remind
                          </a>
                        ) : (
                          <button type="button" className="mv-remind" disabled title="No phone number on file">
                            Remind
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mv-show-wide">
                  <DataTable<DueRow>
                    columns={columns}
                    rows={visible}
                    getRowId={(r) => r.loan.id}
                    caption="Dues ranked overdue first"
                    emptyText="No dues. Lab is clean."
                    defaultSortKey="days"
                  />
                </div>
                {filtered.length > visibleCount ? (
                  <div className="mv-actions">
                    <button type="button" className="mv-ghost" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                      Show more ({filtered.length - visibleCount} left)
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        }
        detail={
          <div className="mv-detail">
            <h2>Detail</h2>
            {selected ? (
              <div>
                <p><strong>{selected.member.name}</strong> — {selected.item.name}</p>
                <p className="mv-meta">
                  {selected.project?.name ?? 'No project'} · Coordinator {selected.coordinatorName}
                </p>
                <p className="mv-meta">
                  Due {formatDue(selected.loan.due_at)} · {selected.lateDays} days late · Fine Rs {selected.fine}
                </p>
                <p>
                  <LoanPill lateDays={selected.lateDays} status={selected.loan.status} />
                </p>
                {selected.loan.condition_out === 'Dead' ? (
                  <p className="mv-meta">Dead condition — fine equals replacement cost Rs {selected.item.replacement_cost}.</p>
                ) : null}
                <p>
                  {selected.member.phone ? (
                    <a
                      className="mv-remind"
                      href={waReminderLink(selected.member.phone, reminderText(selected.member.name, selected.item.name, selected.loan.due_at, selected.fine))}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setSelectedId(selected.loan.id)}
                    >
                      Remind
                    </a>
                  ) : (
                    <button type="button" className="mv-remind" disabled title="No phone number on file">
                      Remind
                    </button>
                  )}{' '}
                  <button type="button" className="mv-ghost" onClick={() => setSelectedId(selected.loan.id)}>
                    Select
                  </button>
                </p>
              </div>
            ) : (
              <p className="mv-meta">Select a due to see detail.</p>
            )}
            <h2 className="mv-section">Misplaced</h2>
            {misplaced.length === 0 ? (
              <p className="mv-meta">All lots are home.</p>
            ) : (
              <ul className="mv-meta mv-list">
                {misplaced.map((m) => (
                  <li key={m.lot.id}>
                    {m.itemName} — reported at {m.locCode}, home {m.homeCode}
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      />
    </section>
  );
}

export default Dues;
