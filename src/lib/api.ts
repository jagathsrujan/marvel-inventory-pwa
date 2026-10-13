// MARVEL V1 data API — pure Supabase calls over the shared contract.
// Contract: ../../shared/types.ts (import types only via `import type`).
// Offline queuing is another agent's job: every mutating function accepts an
// idempotency key (opId). Ledger writers skip duplicates by note match:
// the key is embedded as `[op:<opId>]` in the ledger note.

import { fail, ok } from '../../shared/types';
import type {
  ApiResult,
  Category,
  Condition,
  Item,
  Ledger,
  LedgerAction,
  Loan,
  Location,
  Member,
  MemberTrack,
  Profile,
  Project,
  QrKind,
  Request,
  StaffRole,
  StockLot,
} from '../../shared/types';
import { supabase } from './supabase';

// ------------------------------------------------------------------ results
export interface IssueResult {
  loan: Loan | null;
  ledger: Ledger;
}

export interface ResolveQrResult {
  kind: QrKind;
  item: Item | null;
  lot: StockLot | null;
  location: Location | null;
  member: Member | null;
  lots: StockLot[];
}

// ------------------------------------------------------------------ helpers
function requireNote(note: string): void {
  if (!note || note.trim().length === 0) throw new Error('note/reason is required');
}

function opNote(note: string, opId?: string): string {
  return opId ? `${note} [op:${opId}]` : note;
}

function msg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function priorLedger(opId: string, lotId: string): Promise<Ledger | null> {
  const { data, error } = await supabase
    .from('ledger')
    .select('*')
    .eq('lot_id', lotId)
    .like('note', `%[op:${opId}]%`)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as Ledger;
}

async function getLot(lotId: string): Promise<{ lot: StockLot; item: Item }> {
  const { data: lot, error: lotErr } = await supabase.from('stock_lots').select('*').eq('id', lotId).single();
  if (lotErr || !lot) throw new Error(lotErr ? msg(lotErr) : 'Lot not found');
  const typedLot = lot as StockLot;
  const { data: item, error: itemErr } = await supabase.from('items').select('*').eq('id', typedLot.item_id).single();
  if (itemErr || !item) throw new Error(itemErr ? msg(itemErr) : 'Item not found');
  return { lot: typedLot, item: item as Item };
}

async function locationCode(id: string): Promise<string> {
  const { data } = await supabase.from('locations').select('code').eq('id', id).single();
  return ((data as { code?: string } | null)?.code ?? id) as string;
}

async function bumpDues(memberId: string, delta: number): Promise<void> {
  const { data } = await supabase.from('members').select('dues_count').eq('id', memberId).single();
  const current = Number(((data as { dues_count?: number } | null)?.dues_count ?? 0) as number);
  await supabase
    .from('members')
    .update({ dues_count: Math.max(0, current + delta) })
    .eq('id', memberId);
}

// ------------------------------------------------------------------ stock
export async function addStock(params: {
  lotId: string;
  qty: number;
  note: string;
  byUser: string;
  opId?: string;
}): Promise<ApiResult<StockLot>> {
  try {
    requireNote(params.note);
    if (params.qty <= 0) return fail('qty must be > 0');
    if (params.opId) {
      const prior = await priorLedger(params.opId, params.lotId);
      if (prior) {
        const { data } = await supabase.from('stock_lots').select('*').eq('id', params.lotId).single();
        return ok(data as StockLot);
      }
    }
    const { lot } = await getLot(params.lotId);
    const next = lot.qty + params.qty;
    const { data: updated, error: upErr } = await supabase
      .from('stock_lots')
      .update({ qty: next })
      .eq('id', params.lotId)
      .select('*')
      .single();
    if (upErr || !updated) return fail(msg(upErr ?? 'Update failed'));
    const { error: ledErr } = await supabase.from('ledger').insert({
      lot_id: params.lotId,
      item_id: lot.item_id,
      action: 'add',
      delta_qty: params.qty,
      from_loc: null,
      to_loc: await locationCode(lot.location_id),
      by_user: params.byUser,
      note: opNote(params.note, params.opId),
      photo_url: null,
    });
    if (ledErr) return fail(msg(ledErr));
    return ok(updated as StockLot);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function removeStock(params: {
  lotId: string;
  qty: number;
  note: string;
  byUser: string;
  opId?: string;
}): Promise<ApiResult<StockLot>> {
  try {
    requireNote(params.note);
    if (params.qty <= 0) return fail('qty must be > 0');
    if (params.opId) {
      const prior = await priorLedger(params.opId, params.lotId);
      if (prior) {
        const { data } = await supabase.from('stock_lots').select('*').eq('id', params.lotId).single();
        return ok(data as StockLot);
      }
    }
    const { lot } = await getLot(params.lotId);
    if (lot.qty < params.qty) return fail('Insufficient qty in lot');
    const { data: updated, error: upErr } = await supabase
      .from('stock_lots')
      .update({ qty: lot.qty - params.qty })
      .eq('id', params.lotId)
      .select('*')
      .single();
    if (upErr || !updated) return fail(msg(upErr ?? 'Update failed'));
    const { error: ledErr } = await supabase.from('ledger').insert({
      lot_id: params.lotId,
      item_id: lot.item_id,
      action: 'remove',
      delta_qty: -params.qty,
      from_loc: await locationCode(lot.location_id),
      to_loc: null,
      by_user: params.byUser,
      note: opNote(params.note, params.opId),
      photo_url: null,
    });
    if (ledErr) return fail(msg(ledErr));
    return ok(updated as StockLot);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function moveStock(params: {
  lotId: string;
  toLocationId: string;
  qty?: number;
  note: string;
  byUser: string;
  opId?: string;
}): Promise<ApiResult<StockLot>> {
  try {
    requireNote(params.note);
    if (params.opId) {
      const prior = await priorLedger(params.opId, params.lotId);
      if (prior) {
        const { data } = await supabase.from('stock_lots').select('*').eq('id', params.lotId).single();
        return ok(data as StockLot);
      }
    }
    const { lot } = await getLot(params.lotId);
    const moveQty = params.qty ?? lot.qty;
    if (moveQty <= 0) return fail('qty must be > 0');
    if (moveQty > lot.qty) return fail('Insufficient qty in lot');
    const fromCode = await locationCode(lot.location_id);
    const toCode = await locationCode(params.toLocationId);
    let resultLot: StockLot;
    if (moveQty === lot.qty) {
      const { data, error } = await supabase
        .from('stock_lots')
        .update({ location_id: params.toLocationId })
        .eq('id', params.lotId)
        .select('*')
        .single();
      if (error || !data) return fail(msg(error ?? 'Move failed'));
      resultLot = data as StockLot;
    } else {
      const { error: decErr } = await supabase
        .from('stock_lots')
        .update({ qty: lot.qty - moveQty })
        .eq('id', params.lotId);
      if (decErr) return fail(msg(decErr));
      const { data, error } = await supabase
        .from('stock_lots')
        .insert({
          item_id: lot.item_id,
          location_id: params.toLocationId,
          home_location_id: lot.home_location_id,
          qty: moveQty,
          batch: lot.batch,
        })
        .select('*')
        .single();
      if (error || !data) return fail(msg(error ?? 'Move failed'));
      resultLot = data as StockLot;
    }
    const { error: ledErr } = await supabase.from('ledger').insert({
      lot_id: params.lotId,
      item_id: lot.item_id,
      action: 'move',
      delta_qty: 0,
      from_loc: fromCode,
      to_loc: toCode,
      by_user: params.byUser,
      note: opNote(params.note, params.opId),
      photo_url: null,
    });
    if (ledErr) return fail(msg(ledErr));
    return ok(resultLot);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function countStock(params: {
  lotId: string;
  qty: number;
  note: string;
  byUser: string;
  opId?: string;
}): Promise<ApiResult<StockLot>> {
  try {
    requireNote(params.note);
    if (params.qty < 0) return fail('qty must be >= 0');
    if (params.opId) {
      const prior = await priorLedger(params.opId, params.lotId);
      if (prior) {
        const { data } = await supabase.from('stock_lots').select('*').eq('id', params.lotId).single();
        return ok(data as StockLot);
      }
    }
    const { lot } = await getLot(params.lotId);
    const { data: updated, error: upErr } = await supabase
      .from('stock_lots')
      .update({ qty: params.qty })
      .eq('id', params.lotId)
      .select('*')
      .single();
    if (upErr || !updated) return fail(msg(upErr ?? 'Update failed'));
    const { error: ledErr } = await supabase.from('ledger').insert({
      lot_id: params.lotId,
      item_id: lot.item_id,
      action: 'count',
      delta_qty: params.qty - lot.qty,
      from_loc: await locationCode(lot.location_id),
      to_loc: await locationCode(lot.location_id),
      by_user: params.byUser,
      note: opNote(params.note, params.opId),
      photo_url: null,
    });
    if (ledErr) return fail(msg(ledErr));
    return ok(updated as StockLot);
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------ issue / return
export async function issueItem(params: {
  lotId: string;
  memberId: string;
  qty: number;
  dueAt: string;
  issuedBy: string;
  projectId?: string | null;
  note: string;
  opId?: string;
}): Promise<ApiResult<IssueResult>> {
  try {
    requireNote(params.note);
    if (params.qty <= 0) return fail('qty must be > 0');
    const { lot, item } = await getLot(params.lotId);
    if (params.opId) {
      const prior = await priorLedger(params.opId, params.lotId);
      if (prior) {
        if (item.type === 'consumable') return ok({ loan: null, ledger: prior });
        const { data: open } = await supabase
          .from('loans')
          .select('*')
          .eq('lot_id', params.lotId)
          .eq('member_id', params.memberId)
          .eq('status', 'open')
          .order('issued_at', { ascending: false })
          .limit(1);
        const loan = (open && open.length > 0 ? (open[0] as Loan) : null) as Loan | null;
        return ok({ loan, ledger: prior });
      }
    }
    if (lot.qty < params.qty) return fail('Insufficient qty in lot');
    const shelfCode = await locationCode(lot.location_id);
    const memberLoc = `m/${params.memberId}`;
    if (item.type === 'consumable') {
      const { error: upErr } = await supabase
        .from('stock_lots')
        .update({ qty: lot.qty - params.qty })
        .eq('id', params.lotId);
      if (upErr) return fail(msg(upErr));
      const { data: ledger, error: ledErr } = await supabase
        .from('ledger')
        .insert({
          lot_id: params.lotId,
          item_id: lot.item_id,
          action: 'remove',
          delta_qty: -params.qty,
          from_loc: shelfCode,
          to_loc: memberLoc,
          by_user: params.issuedBy,
          note: opNote(params.note, params.opId),
          photo_url: null,
        })
        .select('*')
        .single();
      if (ledErr || !ledger) return fail(msg(ledErr ?? 'Ledger write failed'));
      return ok({ loan: null, ledger: ledger as Ledger });
    }
    const { error: upErr } = await supabase
      .from('stock_lots')
      .update({ qty: lot.qty - params.qty })
      .eq('id', params.lotId);
    if (upErr) return fail(msg(upErr));
    const { data: ledger, error: ledErr } = await supabase
      .from('ledger')
      .insert({
        lot_id: params.lotId,
        item_id: lot.item_id,
        action: 'move',
        delta_qty: -params.qty,
        from_loc: shelfCode,
        to_loc: memberLoc,
        by_user: params.issuedBy,
        note: opNote(params.note, params.opId),
        photo_url: null,
      })
      .select('*')
      .single();
    if (ledErr || !ledger) return fail(msg(ledErr ?? 'Ledger write failed'));
    const { data: loan, error: loanErr } = await supabase
      .from('loans')
      .insert({
        lot_id: params.lotId,
        item_id: lot.item_id,
        qty: params.qty,
        member_id: params.memberId,
        project_id: params.projectId ?? null,
        issued_by: params.issuedBy,
        due_at: params.dueAt,
        condition_in: 'Good',
        fine: 0,
        status: 'open',
      })
      .select('*')
      .single();
    if (loanErr || !loan) return fail(msg(loanErr ?? 'Loan write failed'));
    await bumpDues(params.memberId, 1);
    return ok({ loan: loan as Loan, ledger: ledger as Ledger });
  } catch (e) {
    return fail(msg(e));
  }
}

export async function returnItem(params: {
  loanId: string;
  conditionOut: Condition;
  returnedToLocationId: string;
  fine?: number;
  photoUrl?: string | null;
  note: string;
  byUser: string;
  opId?: string;
}): Promise<ApiResult<Loan>> {
  try {
    requireNote(params.note);
    const { data: rawLoan, error: loanErr } = await supabase.from('loans').select('*').eq('id', params.loanId).single();
    if (loanErr || !rawLoan) return fail(msg(loanErr ?? 'Loan not found'));
    const loan = rawLoan as Loan;
    if (loan.status !== 'open' && loan.status !== 'overdue') return ok(loan);
    if (params.opId) {
      const prior = await priorLedger(params.opId, loan.lot_id);
      if (prior) {
        const { data } = await supabase.from('loans').select('*').eq('id', params.loanId).single();
        return ok(data as Loan);
      }
    }
    const { data: rawLot } = await supabase.from('stock_lots').select('*').eq('id', loan.lot_id).single();
    if (!rawLot) return fail('Lot not found');
    const lot = rawLot as StockLot;
    const shelfCode = await locationCode(params.returnedToLocationId);
    const { error: upErr } = await supabase
      .from('stock_lots')
      .update({ qty: lot.qty + loan.qty, location_id: params.returnedToLocationId })
      .eq('id', loan.lot_id);
    if (upErr) return fail(msg(upErr));
    const { error: ledErr } = await supabase.from('ledger').insert({
      lot_id: loan.lot_id,
      item_id: loan.item_id,
      action: 'return',
      delta_qty: loan.qty,
      from_loc: `m/${loan.member_id}`,
      to_loc: shelfCode,
      by_user: params.byUser,
      note: opNote(params.note, params.opId),
      photo_url: params.photoUrl ?? null,
    });
    if (ledErr) return fail(msg(ledErr));
    const { data: updated, error: retErr } = await supabase
      .from('loans')
      .update({
        returned_at: new Date().toISOString(),
        condition_out: params.conditionOut,
        fine: params.fine ?? 0,
        status: 'returned',
      })
      .eq('id', params.loanId)
      .select('*')
      .single();
    if (retErr || !updated) return fail(msg(retErr ?? 'Return failed'));
    await bumpDues(loan.member_id, -1);
    return ok(updated as Loan);
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------ requests
export async function createRequest(params: {
  memberId: string;
  projectId?: string | null;
  items: Array<{ item_id: string; qty: number }>;
  dueAt: string;
}): Promise<ApiResult<Request>> {
  try {
    if (params.items.length === 0) return fail('Request needs at least one item');
    const { data: pending } = await supabase
      .from('requests')
      .select('*')
      .eq('member_id', params.memberId)
      .eq('status', 'pending');
    const match = ((pending ?? []) as Request[]).find(
      (r) => JSON.stringify(r.items) === JSON.stringify(params.items),
    );
    if (match) return ok(match);
    const { data, error } = await supabase
      .from('requests')
      .insert({
        member_id: params.memberId,
        project_id: params.projectId ?? null,
        items: params.items,
        status: 'pending',
        due_at: params.dueAt,
        decided_by: null,
      })
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Create failed'));
    return ok(data as Request);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function approveRequest(
  requestId: string,
  decidedBy: string,
  opId?: string,
): Promise<ApiResult<Request>> {
  void opId;
  try {
    const { data: raw, error: getErr } = await supabase.from('requests').select('*').eq('id', requestId).single();
    if (getErr || !raw) return fail(msg(getErr ?? 'Request not found'));
    const existing = raw as Request;
    if (existing.status !== 'pending') return ok(existing);
    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'approved', decided_by: decidedBy })
      .eq('id', requestId)
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Approve failed'));
    return ok(data as Request);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function rejectRequest(
  requestId: string,
  decidedBy: string,
  reason: string,
  opId?: string,
): Promise<ApiResult<Request>> {
  void opId;
  try {
    requireNote(reason);
    const { data: raw, error: getErr } = await supabase.from('requests').select('*').eq('id', requestId).single();
    if (getErr || !raw) return fail(msg(getErr ?? 'Request not found'));
    const existing = raw as Request;
    if (existing.status !== 'pending') return ok(existing);
    // Contract Request has no note field, so the validated reason is kept by
    // the caller (UI toast / offline-queue payload) while decided_by records who.
    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'rejected', decided_by: decidedBy })
      .eq('id', requestId)
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Reject failed'));
    return ok(data as Request);
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------ QR / search / dues
export async function resolveQr(kind: QrKind, id: string): Promise<ApiResult<ResolveQrResult>> {
  try {
    if (kind === 'i') {
      const { lot, item } = await getLot(id);
      const { data: loc } = await supabase.from('locations').select('*').eq('id', lot.location_id).single();
      const { data: lots } = await supabase.from('stock_lots').select('*').eq('item_id', lot.item_id);
      return ok({
        kind,
        item,
        lot,
        location: (loc as Location | null) ?? null,
        member: null,
        lots: ((lots ?? []) as StockLot[]),
      });
    }
    if (kind === 'l') {
      const { data: loc, error } = await supabase.from('locations').select('*').eq('code', id).single();
      if (error || !loc) return fail('Location not found');
      const location = loc as Location;
      const { data: lots } = await supabase.from('stock_lots').select('*').eq('location_id', location.id);
      return ok({ kind, item: null, lot: null, location, member: null, lots: ((lots ?? []) as StockLot[]) });
    }
    const { data: member, error } = await supabase.from('members').select('*').eq('id', id).single();
    if (error || !member) return fail('Member not found');
    return ok({ kind, item: null, lot: null, location: null, member: member as Member, lots: [] });
  } catch (e) {
    return fail(msg(e));
  }
}

export async function searchItems(q: string): Promise<ApiResult<Item[]>> {
  try {
    const needle = q.trim();
    if (needle.length === 0) return ok([]);
    const like = `%${needle.replace(/[%_]/g, '')}%`;
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .or(`name.ilike.${like},sku.ilike.${like}`)
      .limit(50);
    if (error) return fail(msg(error));
    return ok((data ?? []) as Item[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function listOverdueLoans(): Promise<ApiResult<Loan[]>> {
  try {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .in('status', ['open', 'overdue'])
      .lt('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(200);
    if (error) return fail(msg(error));
    return ok((data ?? []) as Loan[]);
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------ admin console (0002)
export interface AdminMemberInput {
  name: string;
  college_email: string;
  phone?: string;
  course_year?: string;
  track: MemberTrack;
}

function memberCardQr(email: string): string {
  const year = new Date().getFullYear();
  const slug = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6) || 'STU';
  const rand = Math.floor(100 + Math.random() * 900);
  return `M/STU-${year}-${slug}-${rand}`;
}

export async function adminListMembers(params?: {
  query?: string;
  track?: MemberTrack | 'all';
  activeOnly?: boolean;
}): Promise<ApiResult<Member[]>> {
  try {
    let q = supabase.from('members').select('*').order('name', { ascending: true }).limit(200);
    if (params?.activeOnly) q = q.eq('is_active', true);
    if (params?.track && params.track !== 'all') q = q.eq('track', params.track);
    const needle = params?.query?.trim();
    if (needle) {
      const like = `%${needle.replace(/[%_]/g, '')}%`;
      q = q.or(`name.ilike.${like},college_email.ilike.${like},card_qr.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) return fail(msg(error));
    return ok((data ?? []) as Member[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminCreateMember(input: AdminMemberInput): Promise<ApiResult<Member>> {
  try {
    if (!input.name.trim()) return fail('name is required');
    if (!input.college_email.trim()) return fail('college_email is required');
    const { data, error } = await supabase
      .from('members')
      .insert({
        card_qr: memberCardQr(input.college_email),
        name: input.name.trim(),
        college_email: input.college_email.trim().toLowerCase(),
        phone: input.phone?.trim() ?? '',
        course_year: input.course_year?.trim() ?? '',
        track: input.track,
        dues_count: 0,
      })
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Create failed'));
    return ok(data as Member);
  } catch (e) {
    return fail(msg(e));
  }
}

export interface BulkRowResult {
  row: number;
  email: string;
  ok: boolean;
  error: string | null;
  member: Member | null;
}

export async function adminBulkCreateMembers(
  rows: AdminMemberInput[],
): Promise<ApiResult<BulkRowResult[]>> {
  try {
    const results: BulkRowResult[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const res = await adminCreateMember(r);
      results.push({
        row: i + 1,
        email: r.college_email,
        ok: res.ok,
        error: res.error,
        member: res.data,
      });
    }
    return ok(results);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminDeactivateMember(params: {
  memberId: string;
  reason: string;
  byUser: string;
  opId?: string;
  forceWithDues?: boolean;
}): Promise<ApiResult<Member>> {
  try {
    requireNote(params.reason);
    const { data: raw, error: getErr } = await supabase
      .from('members')
      .select('*')
      .eq('id', params.memberId)
      .single();
    if (getErr || !raw) return fail(msg(getErr ?? 'Member not found'));
    const member = raw as Member;
    if (!params.forceWithDues && (member.dues_count ?? 0) > 0) {
      return fail(`Member has ${member.dues_count} open dues — clear them first or force with a reason.`);
    }
    const { data: open } = await supabase
      .from('loans')
      .select('id')
      .eq('member_id', params.memberId)
      .in('status', ['open', 'overdue'])
      .limit(1);
    if (!params.forceWithDues && open && open.length > 0) {
      return fail('Member has open loans — collect returns first or force with a reason.');
    }
    const { data, error } = await supabase
      .from('members')
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq('id', params.memberId)
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Deactivate failed'));
    await supabase.from('profiles').update({ role: 'member' }).eq('member_id', params.memberId);
    return ok(data as Member);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminReactivateMember(memberId: string): Promise<ApiResult<Member>> {
  try {
    const { data, error } = await supabase
      .from('members')
      .update({ is_active: true, deactivated_at: null })
      .eq('id', memberId)
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Reactivate failed'));
    return ok(data as Member);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminSetRole(params: {
  userId: string;
  role: StaffRole;
}): Promise<ApiResult<Profile>> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ role: params.role })
      .eq('id', params.userId)
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Role update failed'));
    return ok(data as Profile);
  } catch (e) {
    return fail(msg(e));
  }
}

export interface OpenLoanCount {
  open: number;
  overdue: number;
  fines: number;
}

export async function adminOpenCounts(): Promise<ApiResult<OpenLoanCount>> {
  try {
    const { data, error } = await supabase
      .from('loans')
      .select('id, status, due_at')
      .in('status', ['open', 'overdue'])
      .limit(500);
    if (error) return fail(msg(error));
    const rows = (data ?? []) as Array<{ status: string; due_at: string }>;
    const now = Date.now();
    let overdue = 0;
    for (const r of rows) {
      if (r.status === 'overdue' || new Date(r.due_at).getTime() < now) overdue += 1;
    }
    return ok({ open: rows.length, overdue, fines: overdue * 10 });
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminPendingRequestCount(): Promise<ApiResult<number>> {
  try {
    const { count, error } = await supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) return fail(msg(error));
    return ok(count ?? 0);
  } catch (e) {
    return fail(msg(e));
  }
}

export interface LowStockRow {
  lot: StockLot;
  item: Item;
  locationCode: string;
}

export async function adminListLowStock(): Promise<ApiResult<LowStockRow[]>> {
  try {
    const { data: lots, error: lotsErr } = await supabase.from('stock_lots').select('*').limit(500);
    if (lotsErr) return fail(msg(lotsErr));
    const lotRows = (lots ?? []) as StockLot[];
    if (lotRows.length === 0) return ok([]);
    const itemIds = [...new Set(lotRows.map((l) => l.item_id))];
    const locIds = [...new Set(lotRows.map((l) => l.location_id))];
    const [{ data: items }, { data: locs }] = await Promise.all([
      supabase.from('items').select('*').in('id', itemIds),
      supabase.from('locations').select('id, code').in('id', locIds),
    ]);
    const byItem = new Map(((items ?? []) as Item[]).map((i) => [i.id, i]));
    const byLoc = new Map(((locs ?? []) as Array<{ id: string; code: string }>).map((l) => [l.id, l.code]));
    const rows: LowStockRow[] = [];
    for (const lot of lotRows) {
      const item = byItem.get(lot.item_id);
      if (!item) continue;
      if (lot.qty <= item.min_qty) {
        rows.push({ lot, item, locationCode: byLoc.get(lot.location_id) ?? lot.location_id });
      }
    }
    rows.sort((a, b) => a.lot.qty - b.lot.qty);
    return ok(rows);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminListAudit(params?: {
  lotId?: string;
  itemId?: string;
  action?: LedgerAction | 'all';
  limit?: number;
}): Promise<ApiResult<Ledger[]>> {
  try {
    let q = supabase.from('ledger').select('*').order('ts', { ascending: false }).limit(params?.limit ?? 50);
    if (params?.lotId) q = q.eq('lot_id', params.lotId);
    if (params?.itemId) q = q.eq('item_id', params.itemId);
    if (params?.action && params.action !== 'all') q = q.eq('action', params.action);
    const { data, error } = await q;
    if (error) return fail(msg(error));
    return ok((data ?? []) as Ledger[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminListCategories(): Promise<ApiResult<Category[]>> {
  try {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) return fail(msg(error));
    return ok((data ?? []) as Category[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminOpenLoansForMember(memberId: string): Promise<ApiResult<Loan[]>> {
  try {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', memberId)
      .in('status', ['open', 'overdue'])
      .order('due_at', { ascending: true })
      .limit(50);
    if (error) return fail(msg(error));
    return ok((data ?? []) as Loan[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminListRequests(status?: Request['status'] | 'all'): Promise<ApiResult<Request[]>> {
  try {
    let q = supabase.from('requests').select('*').order('due_at', { ascending: true }).limit(200);
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return fail(msg(error));
    return ok((data ?? []) as Request[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminListProjects(): Promise<ApiResult<Project[]>> {
  try {
    const { data, error } = await supabase.from('projects').select('*').order('name').limit(200);
    if (error) return fail(msg(error));
    return ok((data ?? []) as Project[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminGetItemsByIds(ids: string[]): Promise<ApiResult<Item[]>> {
  try {
    if (ids.length === 0) return ok([]);
    const { data, error } = await supabase.from('items').select('*').in('id', ids);
    if (error) return fail(msg(error));
    return ok((data ?? []) as Item[]);
  } catch (e) {
    return fail(msg(e));
  }
}

export async function adminUpdateItem(params: {
  itemId: string;
  min_qty?: number;
  max_qty?: number;
  replacement_cost?: number;
  supplier?: string | null;
  last_rate?: number | null;
}): Promise<ApiResult<Item>> {
  try {
    const patch: Record<string, unknown> = {};
    if (params.min_qty !== undefined) patch.min_qty = params.min_qty;
    if (params.max_qty !== undefined) patch.max_qty = params.max_qty;
    if (params.replacement_cost !== undefined) patch.replacement_cost = params.replacement_cost;
    if (params.supplier !== undefined) patch.supplier = params.supplier;
    if (params.last_rate !== undefined) patch.last_rate = params.last_rate;
    if (Object.keys(patch).length === 0) return fail('Nothing to update');
    const { data, error } = await supabase
      .from('items')
      .update(patch)
      .eq('id', params.itemId)
      .select('*')
      .single();
    if (error || !data) return fail(msg(error ?? 'Update failed'));
    return ok(data as Item);
  } catch (e) {
    return fail(msg(e));
  }
}

export interface MisplacedRow {
  lot: StockLot;
  itemName: string;
  locCode: string;
  homeCode: string;
}

export async function adminListMisplaced(): Promise<ApiResult<MisplacedRow[]>> {
  try {
    const { data: lots, error } = await supabase.from('stock_lots').select('*').limit(500);
    if (error) return fail(msg(error));
    const lotRows = ((lots ?? []) as StockLot[]).filter((l) => l.location_id !== l.home_location_id);
    if (lotRows.length === 0) return ok([]);
    const itemIds = [...new Set(lotRows.map((l) => l.item_id))];
    const locIds = [...new Set(lotRows.flatMap((l) => [l.location_id, l.home_location_id]))];
    const [{ data: items }, { data: locs }] = await Promise.all([
      supabase.from('items').select('id, name').in('id', itemIds),
      supabase.from('locations').select('id, code').in('id', locIds),
    ]);
    const byItem = new Map(((items ?? []) as Array<{ id: string; name: string }>).map((i) => [i.id, i.name]));
    const byLoc = new Map(((locs ?? []) as Array<{ id: string; code: string }>).map((l) => [l.id, l.code]));
    return ok(
      lotRows.map((lot) => ({
        lot,
        itemName: byItem.get(lot.item_id) ?? lot.item_id,
        locCode: byLoc.get(lot.location_id) ?? lot.location_id,
        homeCode: byLoc.get(lot.home_location_id) ?? lot.home_location_id,
      })),
    );
  } catch (e) {
    return fail(msg(e));
  }
}
