import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { QueuedOp } from '../../shared/types';
import { qrUrl } from '../../shared/types';
import { isBluetoothPrintSupported, printLabelM220 } from '../lib/print';
import { ItemLabel, LocationLabel } from '../components/QrSheet';
import { ErrorBox, OfflineBanner } from '../components/ScreenStates';

type QueueOpFn = (op: Omit<QueuedOp, 'id' | 'created_at' | 'attempts' | 'last_error'>) => Promise<void>;

const DB_MODULE = '../lib/db';

async function loadQueueOp(): Promise<QueueOpFn | null> {
  try {
    const mod = (await import(/* @vite-ignore */ DB_MODULE)) as { queueOp?: unknown };
    if (typeof mod.queueOp === 'function') return mod.queueOp as QueueOpFn;
  } catch {
    void 0;
  }
  return null;
}

interface SheetItem {
  id: string;
  title: string;
  sku: string;
  home: string;
}

interface SheetLocation {
  code: string;
  name: string;
}

const SEED_ITEMS: SheetItem[] = [
  { id: 'lot-bc547-1', title: 'Transistor BC547 NPN', sku: 'MRV-DIO-BC547-001', home: 'R1-S2-B3' },
  { id: 'lot-nano-3', title: 'Arduino Nano ATmega328P', sku: 'MRV-BRD-NANO-003', home: 'R2-S1-B1' },
  { id: 'lot-dht11-1', title: 'Humidity sensor DHT11', sku: 'MRV-MOD-DHT11-001', home: 'R1-S1-B2' },
];

const SEED_LOCATIONS: SheetLocation[] = [
  { code: 'R1-S2-B3', name: 'Rack 1 / Shelf 2 / Bin 3' },
  { code: 'R2-S1-B1', name: 'Rack 2 / Shelf 1 / Bin 1' },
];

type QrMap = Record<string, string | null>;

async function toQr(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, { width: 160, margin: 1 });
  } catch {
    return null;
  }
}

export default function Labels() {
  const [items] = useState<SheetItem[]>(SEED_ITEMS);
  const [locations] = useState<SheetLocation[]>(SEED_LOCATIONS);
  const [qr, setQr] = useState<QrMap>({});
  const [qrState, setQrState] = useState<'loading' | 'done' | 'error'>('loading');
  const [sku, setSku] = useState('');
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => (typeof navigator === 'undefined' ? false : !navigator.onLine));

  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  useEffect(() => {
    let live = true;
    const jobs: [string, string][] = [
      ...items.map((i): [string, string] => [`i:${i.id}`, qrUrl('i', i.id)]),
      ...locations.map((l): [string, string] => [`l:${l.code}`, qrUrl('l', l.code)]),
    ];
    Promise.all(jobs.map(async ([key, text]) => [key, await toQr(text)] as const))
      .then((pairs) => {
        if (!live) return;
        setQr(Object.fromEntries(pairs.map(([k, v]) => [k, v])));
        setQrState('done');
      })
      .catch(() => {
        if (live) setQrState('error');
      });
    return () => {
      live = false;
    };
  }, [items, locations]);

  const handleSend = useCallback(
    async (item: SheetItem) => {
      setPrintMsg(null);
      setSending(item.id);
      try {
        await printLabelM220({ title: item.title, sku: item.sku, home: item.home, qrText: qrUrl('i', item.id) });
        setPrintMsg(`Sent ${item.sku} to M220.`);
      } catch {
        setPrintMsg(
          isBluetoothPrintSupported()
            ? `Printer unreachable for ${item.sku} — keep the phone near the M220 and retry.`
            : 'Bluetooth printing is not supported on this device — use the lab android.',
        );
      } finally {
        setSending(null);
      }
    },
    [],
  );

  const handleLookup = useCallback(async () => {
    const clean = sku.trim().toUpperCase();
    if (!clean) return;
    const queueOp = await loadQueueOp();
    if (!queueOp) {
      setPrintMsg('Queue is unavailable in this preview — sku kept on screen only.');
      return;
    }
    try {
      await queueOp({ type: 'count', payload: { sku: clean } });
      setPrintMsg(`Queued lookup for ${clean}.`);
    } catch {
      setPrintMsg(`Could not queue ${clean} — retry when online.`);
    }
  }, [sku]);

  return (
    <main className="mv-sheet-shell" aria-live="polite">
      <h1>Label sheet</h1>
      {offline ? <OfflineBanner queued={0} /> : null}

      <div className="mv-no-print mv-toolbar">
        <button type="button" className="btn-primary mv-flex" onClick={() => window.print()}>Print sheet</button>
        <span className="mv-queue">
          <input className="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="MRV-BRD-NANO-001" aria-label="Sku to queue" />
          <button type="button" className="btn-secondary mv-queue-btn" onClick={() => void handleLookup()}>Queue sku</button>
        </span>
      </div>
      {printMsg ? <p role="status">{printMsg}</p> : null}

      {qrState === 'loading' ? <p role="status">Drawing QR codes…</p> : null}
      {qrState === 'error' ? (
        <ErrorBox
          title="QR drawing failed"
          body="Labels show without codes. Retry by reloading."
          onRetry={() => window.location.reload()}
          retryLabel="Reload"
        />
      ) : null}
      {items.length === 0 && locations.length === 0 ? (
        <div className="empty">
          <p>No labels yet — capture an item first.</p>
          <a className="mv-link" href="/capture">Open capture</a>
        </div>
      ) : null}

      <section aria-label="Item labels" className="mv-sheet">
        <h2>Item labels</h2>
        <div className="mv-labels">
          {items.map((item) => (
            <div key={item.id} className="card mv-label">
              <ItemLabel title={item.title} sku={item.sku} home={item.home} qrDataUrl={qr[`i:${item.id}`] ?? null} />
              <button
                type="button"
                onClick={() => void handleSend(item)}
                disabled={sending === item.id}
                className="btn-secondary mv-no-print mv-send"
              >
                {sending === item.id ? 'Sending…' : 'Send to M220'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Location labels" className="mv-sheet mv-loc">
        <h2>Location labels</h2>
        <div className="mv-locations">
          {locations.map((loc) => (
            <LocationLabel key={loc.code} code={loc.code} name={loc.name} qrDataUrl={qr[`l:${loc.code}`] ?? null} laminatedNote />
          ))}
        </div>
      </section>
    </main>
  );
}
