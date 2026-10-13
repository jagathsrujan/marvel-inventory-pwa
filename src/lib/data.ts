/**
 * Data bridge: prefers the real src/lib/api.ts (Supabase reads owned by
 * another agent), otherwise falls back to the local mock arrays + IndexedDB
 * cache. All api.ts access is a guarded dynamic import so this module — and
 * any screen importing it — keeps working standalone.
 *
 * Real api.ts shape (read 2026-10-14, do not drift):
 *   resolveQr(kind, id) -> ApiResult<{ item, lot, location, member, lots }>
 *   searchItems(q)      -> ApiResult<Item[]>
 *   issueItem / returnItem (mutations; sync.ts replays the queue through them)
 * Member lookup has no dedicated getter — resolveQr('m', id) covers it.
 */
import type { Item, Loan, Member, StockLot } from '../../shared/types'
import {
  findItem,
  findLot,
  findMember,
  homeCodeFor,
  MOCK_ITEMS,
  MOCK_LOANS,
  MOCK_LOTS,
  MOCK_MEMBERS,
} from './mock'
import { getCachedItem, getCachedLot, getCachedMember, getOpenLoanForLot } from './db'

export interface LotView {
  lot: StockLot
  item: Item
  homeCode: string
  qtyLeft: number
}

export interface LoanView extends Loan {
  member: Member
  item: Item
}

interface ApiResultLike<T> {
  ok: boolean
  data: T | null
}

interface ResolveQrData {
  item: Item | null
  lot: StockLot | null
  location: { code: string } | null
  member: Member | null
}

type ApiShape = Record<string, unknown>

let apiPromise: Promise<ApiShape | null> | null = null

function loadApi(): Promise<ApiShape | null> {
  if (!apiPromise) {
    apiPromise = import('./api')
      .then((m) => (m ?? null) as ApiShape | null)
      .catch(() => null)
  }
  return apiPromise
}

function unwrap<T>(res: unknown): T | null {
  if (res && typeof res === 'object' && (res as ApiResultLike<T>).ok) {
    return (res as ApiResultLike<T>).data
  }
  return null
}

async function callApi<T>(fnName: string, ...args: unknown[]): Promise<T | null> {
  try {
    const api = await loadApi()
    const fn = api?.[fnName]
    if (typeof fn !== 'function') return null
    const res = await (fn as (...a: unknown[]) => Promise<unknown>)(...args)
    return unwrap<T>(res)
  } catch {
    return null
  }
}

export async function getLotWithItem(lotId: string): Promise<LotView | null> {
  // Real API resolves a lot through the item QR path.
  const data = await callApi<ResolveQrData>('resolveQr', 'i', lotId)
  if (data?.lot && data.item) {
    return {
      lot: data.lot,
      item: data.item,
      homeCode: data.location?.code ?? data.lot.home_location_id,
      qtyLeft: data.lot.qty,
    }
  }

  const cachedLot = await getCachedLot(lotId).catch(() => undefined)
  const lot = cachedLot ?? findLot(lotId)
  if (!lot) return null
  const cachedItem = await getCachedItem(lot.item_id).catch(() => undefined)
  const item = cachedItem ?? findItem(lot.item_id)
  if (!item) return null
  return { lot, item, homeCode: homeCodeFor(lot), qtyLeft: lot.qty }
}

export async function getMember(idOrEmail: string): Promise<Member | null> {
  const q = idOrEmail.trim()
  // Real API keys members by id — try it for id-like input.
  const data = await callApi<ResolveQrData>('resolveQr', 'm', q)
  if (data?.member) return data.member

  const cached = await getCachedMember(q).catch(() => undefined)
  if (cached) return cached
  return findMember(q) ?? null
}

export async function getOpenLoan(lotId: string): Promise<LoanView | null> {
  const cached = await getOpenLoanForLot(lotId).catch(() => undefined)
  const loan = cached ?? MOCK_LOANS.find((l) => l.lot_id === lotId && (l.status === 'open' || l.status === 'overdue'))
  if (!loan) return null
  const member =
    (await getCachedMember(loan.member_id).catch(() => undefined)) ??
    findMember(loan.member_id)
  const item =
    (await getCachedItem(loan.item_id).catch(() => undefined)) ?? findItem(loan.item_id)
  if (!member || !item) return null
  return { ...loan, member, item }
}

export async function searchItems(q: string): Promise<Item[]> {
  const items = await callApi<Item[]>('searchItems', q)
  if (items) return items
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  return MOCK_ITEMS.filter(
    (i) => i.name.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle),
  ).slice(0, 20)
}

export { MOCK_ITEMS, MOCK_LOTS, MOCK_MEMBERS }
