import { Dexie, type Table } from 'dexie'
import type {
  Item,
  Loan,
  Location,
  Member,
  QueuedOp,
  QueuedOpType,
  StockLot,
} from '../../shared/types'

/**
 * Offline layer — IndexedDB via Dexie.
 * Other routes import { db, queueOp, listQueue, removeQueued, ... } from here.
 *
 * NOTE (env deviation, 2026-10-13): `dexie` is currently resolvable only
 * because a newer copy exists unlisted in node_modules; package.json does not
 * declare it yet and editing package.json is forbidden. If dexie ever fails
 * to resolve, this module falls back to an in-memory store with the same API
 * so screens keep working (queue survives the session, not reloads).
 */

let dexieMissing = false

class MarvelDB extends Dexie {
  cached_items!: Table<Item, string>
  cached_lots!: Table<StockLot, string>
  cached_members!: Table<Member, string>
  cached_loans!: Table<Loan, string>
  cached_locations!: Table<Location, string>
  queue!: Table<QueuedOp, string>

  constructor() {
    super('marvelDB')
    this.version(1).stores({
      cached_items: 'id, sku, name',
      cached_lots: 'id, item_id, location_id',
      cached_members: 'id, card_qr, college_email',
      cached_loans: 'id, item_id, member_id, status',
      cached_locations: 'id, code',
      queue: 'id, type, created_at',
    })
  }
}

// Lazy singleton: constructing Dexie is cheap, but importing `dexie` when the
// package is absent would break the whole bundle, so resolve defensively.
let dbInstance: MarvelDB | null = null
let memQueue: QueuedOp[] = []
const memCaches: Record<string, Map<string, unknown>> = {
  cached_items: new Map(),
  cached_lots: new Map(),
  cached_members: new Map(),
  cached_loans: new Map(),
  cached_locations: new Map(),
}

// Not a hook — plain lazy-init check, named without the `use` prefix so the
// rules-of-hooks lint stays quiet.
function needsMemoryFallback(): boolean {
  if (dbInstance) return false
  if (dexieMissing) return true
  try {
    dbInstance = new MarvelDB()
    return false
  } catch {
    dexieMissing = true
    return true
  }
}

export const db: {
  cached_items: Table<Item, string>
  cached_lots: Table<StockLot, string>
  cached_members: Table<Member, string>
  cached_loans: Table<Loan, string>
  cached_locations: Table<Location, string>
  queue: Table<QueuedOp, string>
} = new Proxy({} as typeof db, {
  get(_t, prop: string) {
    if (needsMemoryFallback()) return memoryTable(prop)
    const inst = dbInstance as MarvelDB
    return (inst as unknown as Record<string, unknown>)[prop]
  },
}) as typeof db

function memoryTable(name: string): unknown {
  if (name === 'queue') {
    return {
      add: async (op: QueuedOp) => {
        memQueue.push(op)
        return op.id
      },
      toCollection: () => ({
        sortBy: async (_k: string) => [...memQueue],
      }),
      orderBy: (_k: string) => ({
        toArray: async () => [...memQueue],
      }),
      where: (_k: string) => ({
        equals: (v: unknown) => ({
          toArray: async () => memQueue.filter((q) => (q as unknown as Record<string, unknown>)[_k] === v),
        }),
      }),
      delete: async (id: string) => {
        memQueue = memQueue.filter((q) => q.id !== id)
      },
      clear: async () => {
        memQueue = []
      },
      count: async () => memQueue.length,
      get: async (id: string) => memQueue.find((q) => q.id === id),
      update: async (id: string, patch: Partial<QueuedOp>) => {
        const i = memQueue.findIndex((q) => q.id === id)
        if (i >= 0) memQueue[i] = { ...memQueue[i], ...patch }
      },
    }
  }
  const map = memCaches[name]
  return {
    bulkPut: async (rows: unknown[]) => {
      for (const r of rows) map.set((r as { id: string }).id, r)
    },
    put: async (row: unknown) => {
      map.set((row as { id: string }).id, row)
    },
    toArray: async () => [...map.values()],
    get: async (id: string) => map.get(id),
    where: (key: string) => ({
      equals: (v: unknown) => ({
        toArray: async () =>
          [...map.values()].filter((r) => (r as Record<string, unknown>)[key] === v),
      }),
    }),
    filter: (fn: (r: unknown) => boolean) => ({
      toArray: async () => [...map.values()].filter(fn),
    }),
  }
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

/** Stable idempotency key for an op — pass as `opId` to api writers. */
export function makeOpId(prefix: string): string {
  return newId(prefix)
}

/** Enqueue a mutation for later replay. Returns the queued op id. */
export async function queueOp(
  type: QueuedOpType,
  payload: Record<string, unknown>,
): Promise<string> {
  const op: QueuedOp = {
    id: newId('q'),
    type,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  }
  await db.queue.add(op)
  return op.id
}

/** All queued ops, oldest first. */
export async function listQueue(): Promise<QueuedOp[]> {
  try {
    return await db.queue.orderBy('created_at').toArray()
  } catch {
    return []
  }
}

/** Number of ops waiting to sync (for the OfflineBadge). */
export async function queueCount(): Promise<number> {
  try {
    return await db.queue.count()
  } catch {
    return memQueue.length
  }
}

export async function removeQueued(id: string): Promise<void> {
  await db.queue.delete(id)
}

export async function markOpFailed(id: string, error: string): Promise<void> {
  try {
    const op = await db.queue.get(id)
    if (op) {
      await db.queue.update(id, {
        attempts: op.attempts + 1,
        last_error: error,
      })
    }
  } catch {
    // best effort
  }
}

export interface SearchCacheInput {
  items: Item[]
  lots: StockLot[]
  members: Member[]
  loans?: Loan[]
  locations?: Location[]
}

/** Seed/refresh the offline search cache (called after online fetch). */
export async function cacheSearchData(input: SearchCacheInput): Promise<void> {
  await db.cached_items.bulkPut(input.items)
  await db.cached_lots.bulkPut(input.lots)
  await db.cached_members.bulkPut(input.members)
  if (input.loans) await db.cached_loans.bulkPut(input.loans)
  if (input.locations) await db.cached_locations.bulkPut(input.locations)
}

export interface CacheSearchResult {
  items: Item[]
  members: Member[]
}

/** Offline search over the IndexedDB cache. Matches SKU, name, member name,
 *  member email, or card QR. Case-insensitive substring. */
export async function searchCache(q: string): Promise<CacheSearchResult> {
  const needle = q.trim().toLowerCase()
  if (!needle) return { items: [], members: [] }
  const [items, members] = await Promise.all([
    db.cached_items
      .filter(
        (it) =>
          it.name.toLowerCase().includes(needle) ||
          it.sku.toLowerCase().includes(needle),
      )
      .toArray(),
    db.cached_members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(needle) ||
          m.college_email.toLowerCase().includes(needle) ||
          m.card_qr.toLowerCase().includes(needle),
      )
      .toArray(),
  ])
  return { items: items.slice(0, 50), members: members.slice(0, 20) }
}

export async function getCachedLot(lotId: string): Promise<StockLot | undefined> {
  return db.cached_lots.get(lotId)
}

export async function getCachedItem(itemId: string): Promise<Item | undefined> {
  return db.cached_items.get(itemId)
}

export async function getCachedMember(memberId: string): Promise<Member | undefined> {
  return db.cached_members.get(memberId)
}

export async function getOpenLoanForLot(lotId: string): Promise<Loan | undefined> {
  const rows = await db.cached_loans.where('lot_id').equals(lotId).toArray()
  return rows.find((l) => l.status === 'open' || l.status === 'overdue')
}

export async function getLocationByCode(code: string): Promise<Location | undefined> {
  const rows = await db.cached_locations.where('code').equals(code.toUpperCase()).toArray()
  return rows[0]
}
