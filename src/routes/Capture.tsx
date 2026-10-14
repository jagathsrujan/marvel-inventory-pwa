import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CategoryName, QueuedOp } from '../../shared/types';
import { TAXONOMY_10, isMisplaced, parseQrUrl, qrUrl } from '../../shared/types';
import { cleanupText, decideCategory } from '../lib/ai';
import type { DecideResult } from '../lib/ai';
import { lookupMpn } from '../lib/mpn';
import type { MpnHit } from '../lib/mpn';
import { useVoiceNote } from '../lib/voice';
import { isBluetoothPrintSupported, printLabelM220 } from '../lib/print';
import { ErrorBox, OfflineBanner } from '../components/ScreenStates';

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

const HOME_RE = /^R\d+-S\d+-B\d+$/i;

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
    <main className="cap-shell" aria-live="polite">
      <h1>Capture item</h1>
      {offline ? <OfflineBanner queued={queueState === 'saving' ? 1 : 0} /> : null}

      <ol className="cap-steps" aria-label="Capture progress">
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={i < step ? 'cap-done' : undefined}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section aria-label="Home">
          <h2>Set home shelf</h2>
          <p>Scan the shelf QR first — it becomes the home location.</p>
          <label className="field">
            Scan shelf QR photo
            <input type="file" className="file" accept="image/*" capture="environment" onChange={(e) => void handleQrFile(e.target.files?.[0])} />
          </label>
          {scanError ? (
            <p className="field-error" role="alert">{scanError}</p>
          ) : null}
          <label className="field">
            Or type shelf code
            <input
              ref={qrInputRef}
              className="text"
              value={home}
              onChange={(e) => {
                setHome(e.target.value);
                setHomeError(null);
              }}
              placeholder="R1-S2-B3"
              inputMode="text"
              autoCapitalize="characters"
            />
          </label>
          {home && !homeValid ? (
            <p className="field-error" role="alert">Use the R1-S2-B3 format.</p>
          ) : null}
          {homeError ? <p className="field-error" role="alert">{homeError}</p> : null}
          <fieldset className="cap-box">
            <legend className="meta">Pick from tree</legend>
            {TREE.map((t) => (
              <button
                key={t.code}
                type="button"
                className="cap-tree-btn"
                aria-pressed={t.code === normHome(home)}
                onClick={() => setHome(t.code)}
              >
                {t.code} — {t.label}
              </button>
            ))}
          </fieldset>
          <div className="btn-row">
            <span />
            <button type="button" className="btn-primary" onClick={() => (homeValid ? setStep(1) : setHomeError('Set a home shelf first — scan, type, or pick.'))}>
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section aria-label="Photos">
          <h2>Add photos and voice note</h2>
          <p>{photoCount} of 3 photos added — at least 1 is required.</p>
          {PHOTO_SLOTS.map((slot) => (
            <div key={slot.key} className="cap-box">
              <div className="row-title">{slot.label}</div>
              {photos[slot.key] ? (
                <img src={photos[slot.key] as string} alt={`${slot.label} preview`} className="cap-photo" />
              ) : (
                <p className="meta">No photo yet.</p>
              )}
              <label className="field">
                {photos[slot.key] ? 'Replace photo' : 'Take photo'}
                <input type="file" className="file" accept="image/*" capture="environment" onChange={onPhotoChange(slot.key)} />
              </label>
            </div>
          ))}

          <div className="cap-box">
            <div className="row-title">Voice note (10s)</div>
            {voice.supported ? (
              <div className="cap-voice-row">
                {!voice.listening ? (
                  <button type="button" className="btn-secondary cap-btn" onClick={voice.start}>Record note</button>
                ) : (
                  <button type="button" className="btn-primary cap-btn" onClick={voice.stop}>Stop recording</button>
                )}
                <span className="meta" role="status">
                  {voice.listening ? 'Listening…' : voice.transcript ? 'Recorded' : 'Not recorded'}
                </span>
              </div>
            ) : (
              <p className="meta">Voice input is not supported here — type the note below.</p>
            )}
            <label className="field">
              Note text
              <textarea
                className="text cap-note"
                value={note || voice.transcript}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="10k resistor strip, approx 40 left"
              />
            </label>
          </div>

          <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="btn-primary" onClick={() => { setStep(2); runDraft(); }}>Continue</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-label="AI draft">
          <h2>Check AI draft</h2>
          {aiState === 'loading' ? <p role="status">Drafting category…</p> : null}
          {aiState === 'error' ? (
            <ErrorBox
              title="Draft failed"
              body={aiError ?? 'Pick a category below.'}
              onRetry={retryAi}
              retryLabel="Retry draft"
            />
          ) : null}
          {aiState === 'done' && draft ? (
            <div className="cap-box">
              <div className="row-title">{cleaned?.name ?? 'Unnamed item'}</div>
              {category ? (
                <span className="pill pill-offline cap-pill">
                  {category} · {Math.round(draft.p * 100)}%
                </span>
              ) : (
                <p className="field-error" role="status">
                  Low confidence ({Math.round(draft.p * 100)}%) — pick a category below.
                </p>
              )}
              {draft.merge_with_id && draft.merge_p > 0.85 ? (
                <p className="banner-offline cap-merge" role="alert">
                  {Math.round(draft.merge_p * 100)}% match — Merge?
                </p>
              ) : null}
              <label className="field">
                Category
                <select
                  className="text"
                  value={category ?? ''}
                  onChange={(e) => setCategory((e.target.value as CategoryName) || null)}
                >
                  <option value="">Pick a category</option>
                  {TAXONOMY_10.map((t) => (
                    <option key={t.code3} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                MPN or marking
                <span className="cap-mpn-row">
                  <input className="text" value={mpn} onChange={(e) => setMpn(e.target.value)} placeholder="BC547" />
                  <button type="button" className={mpn.trim() ? 'btn-secondary cap-btn' : 'btn-primary cap-btn'} disabled={!mpn.trim() || mpnState === 'loading'} onClick={() => void handleMpnFill()}>
                    {mpnState === 'loading' ? 'Filling…' : 'Fill specs'}
                  </button>
                </span>
              </label>
              {mpnState === 'error' ? <p className="field-error" role="alert">MPN lookup failed — continue manually.</p> : null}
              {mpnHit ? (
                <dl className="cap-hit">
                  <dt>{mpnHit.name}</dt>
                  <dd>{Object.entries(mpnHit.specs).map(([k, v]) => `${k}: ${v}`).join(' · ')}</dd>
                </dl>
              ) : null}
            </div>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn-primary" onClick={() => setStep(3)}>Continue</button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-label="Review">
          <h2>Review and approve</h2>
          <dl className="cap-review">
            <div><dt>Name</dt><dd>{cleaned?.name ?? 'Unnamed item'}</dd></div>
            <div><dt>Category</dt><dd>{category ?? 'Not set'}</dd></div>
            <div><dt>Home</dt><dd>{homeValid ? normHome(home) : 'Not set'}</dd></div>
            <div><dt>Photos</dt><dd>{photoCount} attached</dd></div>
            <div><dt>MPN</dt><dd>{(mpnHit?.mpn ?? mpn) || 'None'}</dd></div>
            <div>
              <dt>Placement check</dt>
              <dd>
                {isMisplaced({ location_id: normHome(home), home_location_id: normHome(home) }) ? 'Misplaced' : 'Home set — print and stick the label on the pouch.'}
              </dd>
            </div>
          </dl>
          {!canApprove ? (
            <p className="field-error" role="status">
              Approve is disabled until a home shelf{photoCount < 1 ? ' and at least 1 photo' : ''} is set.
            </p>
          ) : null}
          {queueState === 'saved' ? <p role="status">Saved to queue — prints next.</p> : null}
          {queueState === 'error' ? <p className="field-error" role="alert">{queueError}</p> : null}
          {printState === 'printed' ? <p role="status">Sticker sent to printer.</p> : null}
          {printState === 'error' ? (
            <p className="field-error" role="alert">
              {isBluetoothPrintSupported() ? 'Printer unreachable — retry from the labels screen.' : 'Bluetooth printing is not supported on this device — use the lab android.'}
            </p>
          ) : null}
          <div className="pinned cap-approve">
            <button type="button" className="btn-secondary cap-btn" onClick={() => setStep(2)}>Back</button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleApprove()}
              disabled={!canApprove || queueState === 'saving'}
              title={!canApprove ? 'Set home and add 1 photo to approve' : 'Save capture and print sticker'}
            >
              {queueState === 'saving' ? 'Approving…' : 'Approve item'}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
