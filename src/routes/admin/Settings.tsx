import { useEffect, useState } from 'react';
import { TAXONOMY_10 } from '../../../shared/types';
import type { QueuedOp } from '../../../shared/types';
import { Empty, ErrorBox, Loading } from '../../components/ScreenStates';
import { listQueue, markOpFailed, queueCount, removeQueued } from '../../lib/db';
import { isBluetoothPrintSupported } from '../../lib/print';
import { useSyncQueue } from '../../lib/sync';

export function Settings() {
  const { syncNow, syncing, lastSynced, lastError } = useSyncQueue();
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [q, c] = await Promise.all([listQueue(), queueCount()]);
      setQueue(q);
      setCount(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retryAll() {
    setNotice(null);
    await syncNow();
    await reload();
    setNotice('Sync attempted — failed ops stay listed with their error.');
  }

  async function drop(id: string) {
    await removeQueued(id);
    await reload();
  }

  async function failOp(id: string) {
    await markOpFailed(id, 'Discarded by admin');
    await reload();
  }

  return (
    <section aria-labelledby="admin-settings-title">
      <h2 id="admin-settings-title" className="card-title">Settings & health</h2>
      {notice ? <p className="meta" role="status">{notice}</p> : null}

      <div className="card">
        <h3 className="card-title">Offline queue ({count})</h3>
        <p className="meta">
          {lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString('en-IN')}. ` : 'Never synced this session. '}
          {lastError ? `Last error: ${lastError}` : ''}
        </p>
        <div className="btn-row">
          <button type="button" className="btn-primary" disabled={syncing} onClick={() => void retryAll()}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => void reload()}>Refresh</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {loading ? <Loading label="Reading queue" rows={2} /> : null}
          {!loading && error ? <ErrorBox title="Queue failed" body={error} onRetry={() => void reload()} /> : null}
          {!loading && !error && queue.length === 0 ? (
            <Empty title="Queue is empty" body="No offline ops waiting — every change has synced." />
          ) : null}
          {!loading && !error && queue.length > 0 ? (
            <ul className="meta">
              {queue.slice(0, 20).map((op) => (
                <li key={op.id}>
                  {op.type} · {new Date(op.created_at).toLocaleString('en-IN')} · tries {op.attempts}
                  {op.last_error ? ` — ${op.last_error}` : ''}
                  {' '}
                  <button type="button" className="btn-ghost" style={{ width: 'auto', minHeight: 32 }} onClick={() => void drop(op.id)}>Discard</button>
                  {' '}
                  <button type="button" className="btn-ghost" style={{ width: 'auto', minHeight: 32 }} onClick={() => void failOp(op.id)}>Mark failed</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Print station</h3>
        <p className="meta">
          {isBluetoothPrintSupported()
            ? 'Bluetooth is available — this device can drive the M220.'
            : 'No Bluetooth here — use the designated lab android as the print station.'}
        </p>
      </div>

      <div className="card">
        <h3 className="card-title">Locked taxonomy (10)</h3>
        <p className="meta">Coordinators cannot create categories — they can only request. Admins edit these in Supabase directly.</p>
        <ul className="meta">
          {TAXONOMY_10.map((t) => (
            <li key={t.code3}>{t.code3} — {t.name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
