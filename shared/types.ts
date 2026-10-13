// MARVEL V1 — CONTRACT (single source of truth).
// Every agent imports from here. No unilateral changes: edit only by team agreement.
// Spec: BUILD_NOTES.md Sections 0-13.

export const APP_QR_BASE = 'https://marv.inv';

/** One amber accent, status always icon + text. */
export const ACCENT_AMBER = '#B45309';

// ---------------------------------------------------------------- taxonomy
export const TAXONOMY_10 = [
  { code3: 'PAS', name: 'Passive (R/C/L)' },
  { code3: 'ACT', name: 'Active/IC' },
  { code3: 'DIO', name: 'Diode/Transistor' },
  { code3: 'MOD', name: 'Module/Sensor' },
  { code3: 'BRD', name: 'Dev Board' },
  { code3: 'WIR', name: 'Wire/Cable/Connector' },
  { code3: 'HTL', name: 'Hand Tool' },
  { code3: 'PTL', name: 'Power Tool' },
  { code3: 'MEA', name: 'Measure/Test' },
  { code3: 'MAC', name: 'Machine/Asset' },
] as const;

export type CategoryCode3 = (typeof TAXONOMY_10)[number]['code3'];
export type CategoryName = (typeof TAXONOMY_10)[number]['name'];

export interface Category {
  id: string;
  name: CategoryName;
  code3: CategoryCode3;
  parent_id: string | null;
  icon: string;
}

// ---------------------------------------------------------------- items
export type StockType = 'consumable' | 'returnable' | 'asset';
export type ItemStatus = 'available' | 'borrowed' | 'broken';

export interface Item {
  id: string;
  /** e.g. MRV-PAS-10K-001, MRV-BRD-NANO-001, MRV-MEA-MULTI-001 */
  sku: string;
  name: string;
  category_id: string;
  specs: Record<string, string>;
  uom: string;
  min_qty: number;
  max_qty: number;
  photo_urls: string[];
  datasheet_url: string | null;
  supplier: string | null;
  last_rate: number | null;
  type: StockType;
  /** grams per unit — set ONLY for filament + solder wire (Spoolman math). */
  unit_weight_g: number | null;
  replacement_cost: number;
}

// ---------------------------------------------------------------- locations
export type LocationType = 'Lab' | 'Rack' | 'Shelf' | 'Bin';

export interface Location {
  id: string;
  /** e.g. MRV-R1-S2-B3 — printed BIG, laminated, stuck on rack/shelf/bin. */
  code: string;
  name: string;
  parent_id: string | null;
  type: LocationType;
  photo_url: string | null;
  /** cached pathstring e.g. Lab/Rack-1/Shelf-2/Bin-3 */
  path: string;
}

// ---------------------------------------------------------------- stock + ledger (InvenTree copy: single ledger table)
export interface StockLot {
  id: string;
  item_id: string;
  /** where it IS now */
  location_id: string;
  /** where it SHOULD live (printed on the item QR) */
  home_location_id: string;
  /** one row per pouch/strip, not per part */
  qty: number;
  batch: string | null;
}

export type LedgerAction =
  | 'created'
  | 'add'
  | 'remove'
  | 'move'
  | 'count'
  | 'issue'
  | 'return'
  | 'adjust';

export interface Ledger {
  id: string;
  lot_id: string;
  item_id: string;
  action: LedgerAction;
  delta_qty: number;
  from_loc: string | null;
  to_loc: string | null;
  by_user: string;
  note: string;
  photo_url: string | null;
  ts: string;
}

/** Every adjustment REQUIRES a reason. No silent edits. */
export const ADJUST_REASONS = ['lost', 'broken', 'found', 'recount'] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

// ---------------------------------------------------------------- loans (Snipe-IT copy)
export type LoanStatus = 'open' | 'returned' | 'overdue' | 'lost';
export type Condition = 'Good' | 'Damaged' | 'Dead';

export interface Loan {
  id: string;
  lot_id: string;
  item_id: string;
  qty: number;
  member_id: string;
  project_id: string | null;
  issued_by: string;
  issued_at: string;
  due_at: string;
  returned_at: string | null;
  condition_in: Condition;
  condition_out: Condition | null;
  fine: number;
  status: LoanStatus;
}

// ---------------------------------------------------------------- members / projects / kits / requests
export type MemberTrack =
  | 'student'
  | 'project'
  | 'competition'
  | 'research'
  | 'equipment_support';

export interface Member {
  id: string;
  /** e.g. M/STU-2024-084 — sticker on BACK of UVCE ID */
  card_qr: string;
  name: string;
  college_email: string;
  phone: string;
  course_year: string;
  track: MemberTrack;
  dues_count: number;
}

/** Dues rule per track: course = term end, competition = event + 3d,
 *  research = 90d + renewal, default = 14d. */
export type DueTrack = 'course' | 'competition' | 'research' | 'default';

export const TRACK_DUE_DAYS: Record<DueTrack, number> = {
  course: -1, // term end — caller must pass termEnd ISO date
  competition: -2, // event date + 3d — caller must pass eventDate ISO date
  research: 90,
  default: 14,
};

export function dueDateFor(
  track: DueTrack,
  from: Date = new Date(),
  opts: { termEnd?: string; eventDate?: string } = {},
): string {
  const d = new Date(from);
  if (track === 'course' && opts.termEnd) return new Date(opts.termEnd).toISOString();
  if (track === 'competition' && opts.eventDate) {
    const e = new Date(opts.eventDate);
    e.setDate(e.getDate() + 3);
    return e.toISOString();
  }
  if (track === 'course') {
    d.setMonth(d.getMonth() + 4);
    return d.toISOString();
  }
  if (track === 'competition') {
    d.setDate(d.getDate() + 17);
    return d.toISOString();
  }
  d.setDate(d.getDate() + TRACK_DUE_DAYS[track]);
  return d.toISOString();
}

export type ProjectStatus = 'proposed' | 'active' | 'done';

export interface Project {
  id: string;
  name: string;
  track: MemberTrack;
  member_ids: string[];
  coordinator_id: string;
  budget_cap: number;
  status: ProjectStatus;
}

export interface CourseKit {
  id: string;
  /** e.g. EV-RE-001-L1 */
  code: string;
  name: string;
  items: { item_id: string; qty: number }[];
  requires_supervision: boolean;
}

export type RequestStatus = 'pending' | 'approved' | 'issued' | 'returned' | 'rejected';

export interface Request {
  id: string;
  member_id: string;
  project_id: string | null;
  items: { item_id: string; qty: number }[];
  status: RequestStatus;
  due_at: string;
  decided_by: string | null;
}

// ---------------------------------------------------------------- QR schemes (plain URLs — any phone camera works)
export type QrKind = 'i' | 'l' | 'm';

export function qrUrl(kind: QrKind, id: string): string {
  return `${APP_QR_BASE}/${kind}/${id}`;
}

export function parseQrUrl(payload: string): { kind: QrKind; id: string } | null {
  const m = payload.trim().match(/marv\.inv\/([ilm])\/([A-Za-z0-9\-_./]+)\/?$/);
  if (!m) return null;
  return { kind: m[1] as QrKind, id: m[2] };
}

// ---------------------------------------------------------------- offline queue (op log, syncs on reconnect)
export type QueuedOpType = 'issue' | 'return' | 'capture' | 'adjust' | 'move' | 'count';

export interface QueuedOp {
  id: string;
  type: QueuedOpType;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

// ---------------------------------------------------------------- API + UI helpers
export interface ApiResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data, error: null };
}

export function fail<T>(error: string): ApiResult<T> {
  return { ok: false, data: null, error };
}

export function waReminderLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function daysLate(dueAt: string, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(dueAt).getTime();
  return diff > 0 ? Math.floor(diff / 86_400_000) : 0;
}

/** Misplaced = current location != home location. */
export function isMisplaced(lot: Pick<StockLot, 'location_id' | 'home_location_id'>): boolean {
  return lot.location_id !== lot.home_location_id;
}
