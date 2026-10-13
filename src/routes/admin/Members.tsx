import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { Member, MemberTrack } from '../../../shared/types';
import { qrUrl } from '../../../shared/types';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { Empty, ErrorBox, Loading, OfflineBanner } from '../../components/ScreenStates';
import { useOnlineStatus } from '../../lib/sync';
import { ItemLabel } from '../../components/QrSheet';
import { isBluetoothPrintSupported, printLabelM220 } from '../../lib/print';
import {
  adminBulkCreateMembers,
  adminDeactivateMember,
  adminListMembers,
  adminOpenLoansForMember,
  adminReactivateMember,
} from '../../lib/api';
import type { AdminMemberInput, BulkRowResult } from '../../lib/api';
import { useRole } from '../../lib/auth';

const TRACKS: Array<MemberTrack> = ['student', 'project', 'competition', 'research', 'equipment_support'];

interface Draft extends AdminMemberInput {
  key: number;
}

function NewMemberForm({ onCreated }: { onCreated: (m: Member) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [course, setCourse] = useState('');
  const [track, setTrack] = useState<MemberTrack>('student');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Member | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [printMsg, setPrintMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPrintMsg(null);
    const { adminCreateMember } = await import('../../lib/api');
    const res = await adminCreateMember({
      name,
      college_email: email,
      phone,
      course_year: course,
      track,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Create failed.');
      return;
    }
    setCreated(res.data);
    onCreated(res.data);
    try {
      setQr(await QRCode.toDataURL(qrUrl('m', res.data.id), { width: 160, margin: 1 }));
    } catch {
      setQr(null);
    }
    setName('');
    setEmail('');
    setPhone('');
    setCourse('');
  }

  async function sendToPrinter() {
    if (!created) return;
    setPrintMsg(null);
    try {
      await printLabelM220({
        title: created.name,
        sku: created.card_qr,
        home: 'ID',
        qrText: qrUrl('m', created.id),
      });
      setPrintMsg(`Sent ${created.card_qr} to M220.`);
    } catch {
      setPrintMsg(
        isBluetoothPrintSupported()
          ? 'Printer unreachable — keep the phone near the M220 and retry.'
          : 'Bluetooth printing is not supported on this device — use the lab android.',
      );
    }
  }

  return (
    <form className="card" onSubmit={submit} aria-label="Onboard a member">
      <h3 className="card-title">Onboard member</h3>
      <label className="field" htmlFor="nm-name">Full name</label>
      <input id="nm-name" className="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Arjun Rao" />
      <label className="field" htmlFor="nm-email">College email</label>
      <input id="nm-email" className="text" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="arjun@uvce.edu" />
      <div className="btn-row">
        <div>
          <label className="field" htmlFor="nm-phone">Phone</label>
          <input id="nm-phone" className="text" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="91984…" />
        </div>
        <div>
          <label className="field" htmlFor="nm-course">Course / year</label>
          <input id="nm-course" className="text" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="3rd year" />
        </div>
      </div>
      <label className="field" htmlFor="nm-track">Track</label>
      <select id="nm-track" className="text" value={track} onChange={(e) => setTrack(e.target.value as MemberTrack)}>
        {TRACKS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="pinned">
        <button type="submit" className="btn-primary" disabled={busy || !name.trim() || !email.trim()}>
          {busy ? 'Creating…' : 'Create member'}
        </button>
      </div>
      {created ? (
        <div style={{ marginTop: 16 }}>
          <p role="status">Created {created.name} — {created.card_qr}.</p>
          <ItemLabel title={created.name} sku={created.card_qr} home="ID sticker" qrDataUrl={qr} />
          <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={() => void sendToPrinter()}>
              Send to M220
            </button>
            <button type="button" className="btn-ghost" onClick={() => window.print()}>
              Print sheet
            </button>
          </div>
          {printMsg ? <p className="meta" role="status">{printMsg}</p> : null}
        </div>
      ) : null}
    </form>
  );
}

function parseCsv(text: string): { rows: Draft[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ['File is empty.'] };
  const head = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const need = ['name', 'email'];
  const missing = need.filter((n) => !head.includes(n));
  if (missing.length > 0) return { rows: [], errors: [`Header needs: ${missing.join(', ')} (got: ${head.join(', ')})`] };
  const idx = (k: string) => head.indexOf(k);
  const rows: Draft[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const email = (cells[idx('email')] ?? '').toLowerCase();
    const name = cells[idx('name')] ?? '';
    if (!name || !email) {
      errors.push(`Row ${i}: name and email are required.`);
      continue;
    }
    if (seen.has(email)) {
      errors.push(`Row ${i}: duplicate email ${email} in file.`);
      continue;
    }
    seen.add(email);
    const trackRaw = (cells[idx('track')] ?? 'student').toLowerCase();
    const track: MemberTrack = (TRACKS as string[]).includes(trackRaw) ? (trackRaw as MemberTrack) : 'student';
    rows.push({
      key: i,
      name,
      college_email: email,
      phone: cells[idx('phone')] ?? '',
      course_year: cells[idx('course_year')] ?? cells[idx('course')] ?? '',
      track,
    });
  }
  return { rows, errors };
}

function BulkImport({ onDone }: { onDone: (members: Member[]) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [results, setResults] = useState<BulkRowResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const { rows, errors } = parseCsv(text);
    setDrafts(rows);
    setParseErrors(errors);
    setResults(null);
  }

  async function run() {
    setBusy(true);
    const res = await adminBulkCreateMembers(drafts);
    setBusy(false);
    if (!res.ok || !res.data) {
      setParseErrors([res.error ?? 'Bulk import failed.']);
      return;
    }
    setResults(res.data);
    onDone(res.data.map((r) => r.member).filter((m): m is Member => m != null));
  }

  return (
    <div className="card">
      <h3 className="card-title">Bulk import (CSV)</h3>
      <p className="meta">Columns: name, email, phone, course_year, track. Duplicates in the file are flagged before import.</p>
      <label className="field" htmlFor="bulk-file">CSV file</label>
      <input
        id="bulk-file"
        className="file"
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {parseErrors.length > 0 ? (
        <ul className="field-error">
          {parseErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      {drafts.length > 0 ? (
        <p className="meta" role="status">{drafts.length} rows ready — {drafts.filter((d) => d.track !== 'student').length} non-student.</p>
      ) : null}
      <div className="pinned">
        <button type="button" className="btn-primary" disabled={busy || drafts.length === 0} onClick={() => void run()}>
          {busy ? 'Importing…' : `Import ${drafts.length} members`}
        </button>
      </div>
      {results ? (
        <div style={{ marginTop: 12 }}>
          <p className="meta" role="status">
            {results.filter((r) => r.ok).length} created, {results.filter((r) => !r.ok).length} failed.
          </p>
          <ul className="meta">
            {results.filter((r) => !r.ok).map((r) => (
              <li key={r.row}>Row {r.row} ({r.email}): {r.error}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function Members() {
  const { role } = useRole();
  const online = useOnlineStatus();
  const [members, setMembers] = useState<Member[]>([]);
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [track, setTrack] = useState<MemberTrack | 'all'>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [kickId, setKickId] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState('');
  const [kickLoans, setKickLoans] = useState(0);
  const [kickBusy, setKickBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  const reload = useCallback(async () => {
    setPhase('loading');
    const res = await adminListMembers({ query, track, activeOnly });
    if (!res.ok || !res.data) {
      setPhase('error');
      setError(res.error ?? 'Could not load members.');
      return;
    }
    setMembers(res.data);
    setPhase('success');
    setError(null);
  }, [query, track, activeOnly]);

  useEffect(() => {
    if (!online) {
      setPhase('error');
      setError('Offline — member directory needs a connection.');
      return;
    }
    void reload();
  }, [online, reload]);

  const kickTarget = useMemo(() => members.find((m) => m.id === kickId) ?? null, [members, kickId]);

  async function openKick(m: Member) {
    setKickId(m.id);
    setKickReason('');
    setKickLoans(0);
    setNotice(null);
    const res = await adminOpenLoansForMember(m.id);
    if (res.ok && res.data) setKickLoans(res.data.length);
  }

  async function confirmKick() {
    if (!kickTarget) return;
    setKickBusy(true);
    const res = await adminDeactivateMember({
      memberId: kickTarget.id,
      reason: `deactivate ${kickReason || 'no reason given'}`,
      byUser: role ?? 'admin',
      forceWithDues: (kickTarget.dues_count ?? 0) > 0 || kickLoans > 0,
    });
    setKickBusy(false);
    if (!res.ok) {
      setNotice(res.error ?? 'Deactivate failed.');
      return;
    }
    setNotice(`${kickTarget.name} deactivated — history kept.`);
    setKickId(null);
    void reload();
  }

  async function reactivate(m: Member) {
    const res = await adminReactivateMember(m.id);
    if (!res.ok) {
      setNotice(res.error ?? 'Reactivate failed.');
      return;
    }
    setNotice(`${m.name} reactivated.`);
    void reload();
  }

  const columns: Array<DataTableColumn<Member>> = useMemo(
    () => [
      { key: 'name', label: 'Name', sortable: true, getValue: (r) => r.name, render: (r) => <span>{r.name}</span> },
      { key: 'email', label: 'Email', getValue: (r) => r.college_email, render: (r) => <span className="truncate" title={r.college_email}>{r.college_email}</span> },
      { key: 'qr', label: 'Card', getValue: (r) => r.card_qr, render: (r) => <span className="tnum">{r.card_qr}</span> },
      { key: 'track', label: 'Track', getValue: (r) => r.track, render: (r) => <span>{r.track}</span> },
      { key: 'dues', label: 'Dues', sortable: true, align: 'right', getValue: (r) => r.dues_count, render: (r) => <span className="tnum">{r.dues_count}</span> },
      {
        key: 'status',
        label: 'Status',
        getValue: (r) => (r.is_active === false ? 'Inactive' : 'Active'),
        render: (r) => (r.is_active === false ? <span>○ Inactive</span> : <span>● Active</span>),
      },
      {
        key: 'action',
        label: 'Kick',
        render: (r) =>
          r.is_active === false ? (
            <button type="button" className="btn-ghost" style={{ minHeight: 48 }} disabled={!isAdmin} title={!isAdmin ? 'Admin only' : undefined} onClick={() => void reactivate(r)}>
              Reactivate
            </button>
          ) : (
            <button type="button" className="btn-danger-ghost" disabled={!isAdmin} title={!isAdmin ? 'Admin only' : undefined} onClick={() => void openKick(r)}>
              Deactivate
            </button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin],
  );

  return (
    <section aria-labelledby="admin-members-title">
      <h2 id="admin-members-title" className="card-title">Members</h2>
      {!online ? <OfflineBanner queued={0} /> : null}
      {notice ? <p className="meta" role="status">{notice}</p> : null}
      <div className="card">
        <label className="field" htmlFor="mem-q">Search name, email, or card</label>
        <input id="mem-q" className="text" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Arjun, uvce.edu, M/STU" />
        <div className="btn-row">
          <div>
            <label className="field" htmlFor="mem-track">Track</label>
            <select id="mem-track" className="text" value={track} onChange={(e) => setTrack(e.target.value as MemberTrack | 'all')}>
              <option value="all">All tracks</option>
              {TRACKS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label className="meta" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 48 }}>
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} style={{ width: 22, height: 22 }} />
              Active only
            </label>
          </div>
        </div>
      </div>

      {phase === 'loading' ? <Loading label="Loading members" rows={4} /> : null}
      {phase === 'error' ? <ErrorBox title="Members failed" body={error ?? ''} onRetry={() => void reload()} /> : null}
      {phase === 'success' && members.length === 0 ? (
        <Empty title="No members found" body="Nobody matches this search — onboard them or clear the filter." />
      ) : null}
      {phase === 'success' && members.length > 0 ? (
        <DataTable<Member> columns={columns} rows={members} getRowId={(r) => r.id} caption={`${members.length} members`} defaultSortKey="name" />
      ) : null}

      <NewMemberForm onCreated={() => void reload()} />
      <BulkImport onDone={() => void reload()} />

      {kickTarget ? (
        <div className="card" role="dialog" aria-label={`Deactivate ${kickTarget.name}`}>
          <h3 className="card-title">Deactivate {kickTarget.name}?</h3>
          <p className="meta">
            Dues: {kickTarget.dues_count} · Open loans: {kickLoans}. History (loans, ledger) is kept.
            {kickTarget.dues_count > 0 || kickLoans > 0
              ? ' Dues or loans are open — deactivating now forces it and records your reason.'
              : ' No open dues or loans.'}
          </p>
          <label className="field" htmlFor="kick-reason">Reason (required, goes on record)</label>
          <input id="kick-reason" className="text" value={kickReason} onChange={(e) => setKickReason(e.target.value)} placeholder="Graduated, lost card…" />
          <div className="btn-row">
            <button type="button" className="btn-ghost" onClick={() => setKickId(null)}>Cancel</button>
            <button type="button" className="btn-danger-ghost" disabled={kickBusy || !kickReason.trim()} onClick={() => void confirmKick()}>
              {kickBusy ? 'Deactivating…' : 'Deactivate'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
