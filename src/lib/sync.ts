import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueuedOp } from '../../shared/types'
import { listQueue, markOpFailed, queueCount, removeQueued } from './db'

/** Reactive online/offline flag. Listens to browser online/offline events. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return online
}

export interface SyncState {
  online: boolean
  pending: number
  syncing: boolean
  lastSynced: string | null
  lastError: string | null
  syncNow: () => Promise<void>
}

function announce(message: string): void {
  // Polite live region rendered by App; sync.ts announces through it so
  // screen readers hear replay results.
  const el = document.getElementById('marvel-live')
  if (el) el.textContent = message
}

/**
 * Replay the offline queue.
 * - `runOp` is provided by the owning layer (later: the api.ts agent's real
 *   mutation; today: resolves true immediately so the queue drains).
 * - Replays on `online` events plus a 30s interval while online.
 * - Announces results via the #marvel-live region.
 */
export function useSyncQueue(
  runOp: (op: QueuedOp) => Promise<boolean> = async () => true,
): SyncState {
  const online = useOnlineStatus()
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const runRef = useRef(runOp)
  const syncingRef = useRef(false)

  useEffect(() => {
    runRef.current = runOp
  }, [runOp])

  const refreshCount = useCallback(async () => {
    setPending(await queueCount())
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)
    setLastError(null)
    try {
      const ops = await listQueue()
      let done = 0
      for (const op of ops) {
        try {
          const ok = await runRef.current(op)
          if (ok) {
            await removeQueued(op.id)
            done += 1
          } else {
            await markOpFailed(op.id, 'Server rejected op')
          }
        } catch (err) {
          await markOpFailed(op.id, err instanceof Error ? err.message : 'Sync failed')
        }
      }
      if (done > 0) {
        setLastSynced(new Date().toISOString())
        announce(done === 1 ? 'Back online, 1 op synced' : `Back online, ${done} ops synced`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed'
      setLastError(msg)
      announce(`Sync failed: ${msg}`)
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refreshCount()
    }
  }, [refreshCount])

  // Initial count + replay on reconnect.
  useEffect(() => {
    void refreshCount()
  }, [refreshCount])

  useEffect(() => {
    if (!online) return
    void syncNow()
    const t = window.setInterval(() => void syncNow(), 30_000)
    return () => window.clearInterval(t)
  }, [online, syncNow])

  // Keep the badge fresh when other tabs/screens enqueue.
  useEffect(() => {
    const onStorage = () => void refreshCount()
    const onFocus = () => void refreshCount()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshCount])

  return { online, pending, syncing, lastSynced, lastError, syncNow }
}

/** Standalone runner for non-hook callers. Returns number of ops synced. */
export async function syncQueue(
  runOp: (op: QueuedOp) => Promise<boolean> = async () => true,
): Promise<number> {
  const ops = await listQueue()
  let done = 0
  for (const op of ops) {
    try {
      if (await runOp(op)) {
        await removeQueued(op.id)
        done += 1
      }
    } catch {
      await markOpFailed(op.id, 'Sync failed')
    }
  }
  if (done > 0) announce(done === 1 ? '1 op synced' : `${done} ops synced`)
  return done
}
