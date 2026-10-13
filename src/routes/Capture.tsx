import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import type { CategoryName, QueuedOp } from '../../shared/types';
import { TAXONOMY_10, isMisplaced, parseQrUrl, qrUrl } from '../../shared/types';
import { cleanupText, decideCategory } from '../lib/ai';
import type { DecideResult } from '../lib/ai';
import { lookupMpn } from '../lib/mpn';
import type { MpnHit } from '../lib/mpn';
import { useVoiceNote } from '../lib/voice';
import { isBluetoothPrintSupported, printLabelM220 } from '../lib/print';

type QueueOpFn = (op: Omit<QueuedOp, 'id' | 'created_at' | 'attempts' | 'last_error'>) => Promise<void>;

const DB_MODULE = '../lib/db';

async function loadQueueOp(): Promise<QueueOpFn> {
  try {
    const mod = (await import(/* @vite-ignore */ DB_MODULE)) as { queueOp?: unknown };
    if (typeof mod.queueOp === 'function') return mod.queueOp as QueueOpFn;
  } catch {
    void 0;
  }
  return async () => {
    void 0;
  };
}

const ACCENT = '#B45309';
const HOME_RE = /^R\d+-S\d+-B\d+$/i;

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 48,
  fontSize: 16,
  padding: '10px 12px',
  border: '1px solid #ccc',
  borderRadius: 8,
  boxSizing: 'border-box',
  fontFamily: 'system-ui, sans-serif',
};

const btnPrimary: CSSProperties = {
  width: '100%',
  minHeight: 48,
  background: ACCENT,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'system-ui, sans-serif',
};

const btnGhost: CSSProperties = {
  ...btnPrimary,
  background: '#fff',
  color: ACCENT,
  border: `1px solid ${ACCENT}`,
};

const btnDisabled: CSSProperties = {
  ...btnPrimary,
  background: '#d6d3d1',
  color: '#78716c',
};

const TREE: { code: string; label: string }[] = [
  { code: 'R1-S1-B1', label: 'Rack 1 / Shelf 1 / Bin 1' },
  { code: 'R1-S1-B2', label: 'Rack 1 / Shelf 1 / Bin 2' },
  { code: 'R1-S2-B3', label: 'Rack 1 / Shelf 2 / Bin 3' },
  { code: 'R2-S1-B1', label: 'Rack 2 / Shelf 1 / Bin 1' },
];

const STEP_LABELS = ['Home', 'Photos', 'Draft', 'Review'];

interface PhotoSlot {
  key: 'pouch' | 'marking' | 'shelf';
  label: string;
}

const PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'pouch', label: 'Pouch wide' },
  { key: 'marking', label: 'Marking close-up' },
  { key: 'shelf', label: 'Shelf photo' },
];

type PhotoMap = Record<PhotoSlot['key'], string | null>;

function normHome(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

export default function Capture() {
  const [step, setStep] = useState(0);
  const [home, setHome] = useState('');
  const [homeError, setHomeError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoMap>({ pouch: null, marking: null, shelf: null });
  const [note, setNote] = useState('');
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DecideResult | null>(null);
  const [cleaned, setCleaned] = useState<{ name: string; specs: Record<string, string> } | null>(null);
  const [category, setCategory] = useState<CategoryName | null>(null);
  const [mpn, setMpn] = useState('');
  const [mpnState, setMpnState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [mpnHit, setMpnHit] = useState<MpnHit | null>(null);
  const [queueState, setQueueState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [queueError, setQueueError] = useState<string | null>(null);
  const [printState, setPrintState] = useState<'idle' | 'printing' | 'printed' | 'error'>('idle');
  const [offline, setOffline] = useState(() => (typeof navigator === 'undefined' ? false : !navigator.onLine));
  const voice = useVoiceNote(10);
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  const runDraft = useCallback(() => {
    setAiState('loading');
    setAiError(null);
    const transcript = note || voice.transcript;
    let cancelled = false;
    Promise.resolve()
      .then(() => cleanupText(transcript || mpn || 'unnamed item'))
      .then((c) => decideCategory({ transcript, mpn, marking: '' }).then((d) => ({ c, d })))
      .then(({ c, d }) => {
        if (cancelled) return;
        setCleaned(c);
        setDraft(d);
        setCategory(d.category);
        setAiState('done');
      })
      .catch(() => {
        if (cancelled) return;
        setAiError('Draft failed — pick a category below.');
        setAiState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [note, voice.transcript, mpn]);

  const photoCount = PHOTO_SLOTS.filter((s) => photos[s.key]).length;
  const homeValid = HOME_RE.test(normHome(home));
  const canApprove = homeValid && photoCount >= 1;

  const handleQrFile = useCallback(async (file: File | undefined) => {
    setScanError(null);
    if (!file) return;
    const BD = (window as unknown as { BarcodeDetector?: new (opts?: unknown) => { detect: (img: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) {
      setScanError('Scanner unavailable — type R1-S2-B3 or pick from list.');
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const det = new BD({ formats: ['qr_code'] });
      const found = await det.detect(bmp);
      const raw = found[0]?.rawValue ?? '';
      const loc = parseQrUrl(raw);
      if (loc && loc.kind === 'l') {
        setHome(loc.id.toUpperCase());
        setHomeError(null);
      } else if (raw.trim()) {
        setScanError(`QR is not a shelf code — got ${raw.trim().slice(0, 40)}. Type R1-S2-B3 instead.`);
      } else {
        setScanError('No QR found in that photo — type R1-S2-B3 or pick from list.');
      }
    } catch {
      setScanError('Shelf QR unreadable — type R1-S2-B3 or pick from list.');
    }
  }, []);

  const retryAi = useCallback(() => {
    setAiState('idle');
    setDraft(null);
  }, []);

  const handleMpnFill = useCallback(async () => {
    const clean = mpn.trim();
    if (!clean) return;
    setMpnState('loading');
    setMpnHit(null);
    try {
      const hit = await lookupMpn(clean);
      setMpnHit(hit);
      setMpnState('done');
      if (hit.name) setCleaned((prev) => (prev ? { ...prev, name: hit.name, specs: { ...prev.specs, ...hit.specs } } : { name: hit.name, specs: { ...hit.specs } }));
      setCategory((prev) => prev ?? hit.category);
    } catch {
      setMpnState('error');
    }
  }, [mpn]);

  const handleApprove = useCallback(async () => {
    if (!canApprove) return;
    setQueueState('saving');
    setQueueError(null);
    try {
      const queueOp = await loadQueueOp();
      const sku = `MRV-TMP-${Date.now().toString(36).toUpperCase()}`;
      await queueOp({
        type: 'capture',
        payload: {
          sku,
          name: cleaned?.name ?? 'Unnamed item',
          category: category ?? 'manual',
          home: normHome(home),
          photos: Object.fromEntries(Object.entries(photos).filter(([, v]) => v)),
          note: note || voice.transcript,
          mpn: mpnHit?.mpn ?? mpn,
          specs: { ...(cleaned?.specs ?? {}), ...(mpnHit?.specs ?? {}) },
        },
      });
      setQueueState('saved');
      try {
        await printLabelM220({
          title: cleaned?.name ?? 'Unnamed item',
          sku,
          home: normHome(home),
          qrText: qrUrl('i', sku),
        });
        setPrintState('printed');
      } catch {
        setPrintState('error');
      }
    } catch {
      setQueueState('error');
      setQueueError('Saving failed — retry when online.');
    }
  }, [canApprove, cleaned, category, home, photos, note, voice.transcript, mpnHit, mpn]);

  const onPhotoChange = (key: PhotoSlot['key']) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos((prev) => ({ ...prev, [key]: url }));
  };

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }} aria-live="polite">
      <h1 style={{ fontSize: 28, margin: '8px 0' }}>Capture item</h1>
      {offline ? (
        <p role="status" style={{ background: '#fef3c7', border: '1px solid #b45309', padding: 8, borderRadius: 8 }}>
          Offline — capture queues and syncs later
        </p>
      ) : null}

      <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: '12px 0' }} aria-label="Capture progress">
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 13,
              padding: '6px 4px',
              borderRadius: 8,
              background: i === step ? ACCENT : i < step ? '#fef3c7' : '#f5f5f4',
              color: i === step ? '#fff' : '#44403c',
            }}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section aria-label="Home">
          <h2 style={{ fontSize: 20 }}>Set home shelf</h2>
          <p style={{ fontSize: 15 }}>Scan the shelf QR first — it becomes the home location.</p>
          <label style={{ display: 'block', marginTop: 12, fontSize: 15 }}>
            Scan shelf QR photo
            <input type="file" accept="image/*" capture="environment" onChange={(e) => void handleQrFile(e.target.files?.[0])} style={{ marginTop: 6 }} />
          </label>
          {scanError ? (
            <p role="alert" style={{ color: '#991b1b' }}>{scanError}</p>
          ) : null}
          <label style={{ display: 'block', marginTop: 12, fontSize: 15 }}>
            Or type shelf code
            <input
              ref={qrInputRef}
              value={home}
              onChange={(e) => {
                setHome(e.target.value);
                setHomeError(null);
              }}
              placeholder="R1-S2-B3"
              inputMode="text"
              autoCapitalize="characters"
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
          {home && !homeValid ? (
            <p role="alert" style={{ color: '#991b1b' }}>Use the R1-S2-B3 format.</p>
          ) : null}
          {homeError ? <p role="alert" style={{ color: '#991b1b' }}>{homeError}</p> : null}
          <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, marginTop: 12 }}>
            <legend style={{ fontSize: 14 }}>Pick from tree</legend>
            {TREE.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setHome(t.code)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 8px',
                  margin: '4px 0',
                  borderRadius: 8,
                  border: t.code === normHome(home) ? `2px solid ${ACCENT}` : '1px solid #ddd',
                  background: '#fff',
                  minHeight: 48,
                  fontSize: 15,
                }}
              >
                {t.code} — {t.label}
              </button>
            ))}
          </fieldset>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => (homeValid ? setStep(1) : setHomeError('Set a home shelf first — scan, type, or pick.'))} style={{ ...btnPrimary, width: 160 }}>
              Continue
            </button>
          </div>
          {homeError && !homeValid ? null : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section aria-label="Photos">
          <h2 style={{ fontSize: 20 }}>Add photos and voice note</h2>
          <p style={{ fontSize: 15 }}>{photoCount} of 3 photos added — at least 1 is required.</p>
          {PHOTO_SLOTS.map((slot) => (
            <div key={slot.key} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, marginTop: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{slot.label}</div>
              {photos[slot.key] ? (
                <img src={photos[slot.key] as string} alt={`${slot.label} preview`} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginTop: 8 }} />
              ) : (
                <p style={{ fontSize: 14, color: '#57534e' }}>No photo yet.</p>
              )}
              <label style={{ display: 'block', marginTop: 8, fontSize: 15 }}>
                {photos[slot.key] ? 'Replace photo' : 'Take photo'}
                <input type="file" accept="image/*" capture="environment" onChange={onPhotoChange(slot.key)} style={{ marginTop: 6 }} />
              </label>
            </div>
          ))}

          <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, marginTop: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Voice note (10s)</div>
            {voice.supported ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {!voice.listening ? (
                  <button type="button" onClick={voice.start} style={{ ...btnGhost, width: 160 }}>Record note</button>
                ) : (
                  <button type="button" onClick={voice.stop} style={{ ...btnPrimary, width: 160 }}>Stop recording</button>
                )}
                <span role="status" style={{ fontSize: 14, alignSelf: 'center' }}>
                  {voice.listening ? 'Listening…' : voice.transcript ? 'Recorded' : 'Not recorded'}
                </span>
              </div>
            ) : (
              <p style={{ fontSize: 14 }}>Voice input is not supported here — type the note below.</p>
            )}
            <label style={{ display: 'block', marginTop: 8, fontSize: 15 }}>
              Note text
              <textarea
                value={note || voice.transcript}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="10k resistor strip, approx 40 left"
                style={{ ...inputStyle, minHeight: 72 }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setStep(0)} style={{ ...btnGhost, width: 120 }}>Back</button>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => { setStep(2); runDraft(); }} style={{ ...btnPrimary, width: 160 }}>Continue</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-label="AI draft">
          <h2 style={{ fontSize: 20 }}>Check AI draft</h2>
          {aiState === 'loading' ? <p role="status">Drafting category…</p> : null}
          {aiState === 'error' ? (
            <div role="alert" style={{ border: '1px solid #991b1b', borderRadius: 8, padding: 10 }}>
              <p>{aiError}</p>
              <button type="button" onClick={retryAi} style={{ ...btnGhost, width: 160, marginTop: 8 }}>Retry draft</button>
            </div>
          ) : null}
          {aiState === 'done' && draft ? (
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{cleaned?.name ?? 'Unnamed item'}</div>
              {category ? (
                <span style={{ display: 'inline-block', marginTop: 8, background: '#fef3c7', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 999, padding: '4px 12px', fontSize: 14 }}>
                  {category} · {Math.round(draft.p * 100)}%
                </span>
              ) : (
                <p role="status" style={{ color: '#991b1b' }}>
                  Low confidence ({Math.round(draft.p * 100)}%) — pick a category below.
                </p>
              )}
              {draft.merge_with_id && draft.merge_p > 0.85 ? (
                <p role="alert" style={{ background: '#fef3c7', padding: 8, borderRadius: 8 }}>
                  {Math.round(draft.merge_p * 100)}% match — Merge?
                </p>
              ) : null}
              <label style={{ display: 'block', marginTop: 12, fontSize: 15 }}>
                Category
                <select
                  value={category ?? ''}
                  onChange={(e) => setCategory((e.target.value as CategoryName) || null)}
                  style={{ ...inputStyle, marginTop: 6 }}
                >
                  <option value="">Pick a category</option>
                  {TAXONOMY_10.map((t) => (
                    <option key={t.code3} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block', marginTop: 12, fontSize: 15 }}>
                MPN or marking
                <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input value={mpn} onChange={(e) => setMpn(e.target.value)} placeholder="BC547" style={inputStyle} />
                  <button type="button" onClick={() => void handleMpnFill()} disabled={!mpn.trim() || mpnState === 'loading'} style={{ ...(mpn.trim() ? btnGhost : btnDisabled), width: 120 }}>
                    {mpnState === 'loading' ? 'Filling…' : 'Fill specs'}
                  </button>
                </span>
              </label>
              {mpnState === 'error' ? <p role="alert" style={{ color: '#991b1b' }}>MPN lookup failed — continue manually.</p> : null}
              {mpnHit ? (
                <dl style={{ fontSize: 14, background: '#fafaf9', borderRadius: 8, padding: 8 }}>
                  <dt style={{ fontWeight: 600 }}>{mpnHit.name}</dt>
                  <dd style={{ margin: '4px 0' }}>{Object.entries(mpnHit.specs).map(([k, v]) => `${k}: ${v}`).join(' · ')}</dd>
                </dl>
              ) : null}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setStep(1)} style={{ ...btnGhost, width: 120 }}>Back</button>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setStep(3)} style={{ ...btnPrimary, width: 160 }}>Continue</button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-label="Review">
          <h2 style={{ fontSize: 20 }}>Review and approve</h2>
          <dl style={{ fontSize: 15, border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <div><dt style={{ fontWeight: 600 }}>Name</dt><dd style={{ margin: '2px 0 8px' }}>{cleaned?.name ?? 'Unnamed item'}</dd></div>
            <div><dt style={{ fontWeight: 600 }}>Category</dt><dd style={{ margin: '2px 0 8px' }}>{category ?? 'Not set'}</dd></div>
            <div><dt style={{ fontWeight: 600 }}>Home</dt><dd style={{ margin: '2px 0 8px' }}>{homeValid ? normHome(home) : 'Not set'}</dd></div>
            <div><dt style={{ fontWeight: 600 }}>Photos</dt><dd style={{ margin: '2px 0 8px' }}>{photoCount} attached</dd></div>
            <div><dt style={{ fontWeight: 600 }}>MPN</dt><dd style={{ margin: '2px 0 8px' }}>{(mpnHit?.mpn ?? mpn) || 'None'}</dd></div>
            <div>
              <dt style={{ fontWeight: 600 }}>Placement check</dt>
              <dd style={{ margin: '2px 0 8px' }}>
                {isMisplaced({ location_id: normHome(home), home_location_id: normHome(home) }) ? 'Misplaced' : 'Home set — print and stick the label on the pouch.'}
              </dd>
            </div>
          </dl>
          {!canApprove ? (
            <p role="status" style={{ color: '#991b1b' }}>
              Approve is disabled until a home shelf{photoCount < 1 ? ' and at least 1 photo' : ''} is set.
            </p>
          ) : null}
          {queueState === 'saved' ? <p role="status">Saved to queue — prints next.</p> : null}
          {queueState === 'error' ? <p role="alert" style={{ color: '#991b1b' }}>{queueError}</p> : null}
          {printState === 'printed' ? <p role="status">Sticker sent to printer.</p> : null}
          {printState === 'error' ? (
            <p role="alert" style={{ color: '#991b1b' }}>
              {isBluetoothPrintSupported() ? 'Printer unreachable — retry from the labels screen.' : 'Bluetooth printing is not supported on this device — use the lab android.'}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setStep(2)} style={{ ...btnGhost, width: 120 }}>Back</button>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={!canApprove || queueState === 'saving'}
              title={!canApprove ? 'Set home and add 1 photo to approve' : 'Save capture and print sticker'}
              style={{ ...(canApprove ? btnPrimary : btnDisabled), width: 200 }}
            >
              {queueState === 'saving' ? 'Approving…' : 'Approve item'}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
