// MARVEL V1 data API — pure Supabase calls over the shared contract.
// Contract: ../../shared/types.ts (import types only via `import type`).
// Offline queuing is another agent's job: every mutating function accepts an
// idempotency key (opId). Ledger writers skip duplicates by note match:
// the key is embedded as `[op:<opId>]` in the ledger note.

import { fail, ok } from '../../shared/types';
import type {
  ApiResult,
  Condition,
  Item,
  Ledger,
  Loan,
  Location,
  Member,
  QrKind,
  Request,
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
