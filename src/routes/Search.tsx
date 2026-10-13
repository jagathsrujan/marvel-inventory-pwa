// MARVEL V1 — Search (EXPLORE): oversized pill + mic + MPN hint, chips + type filter,
// photo rows with home code + qty pill + icon+text status. Offline searches local cache.
// Contract: imports types only from '../../shared/types'. No unilateral changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { TAXONOMY_10 } from '../../shared/types';
import type { Item, ItemStatus, StockType } from '../../shared/types';

const AMBER = '#B45309';
const PAGE_SIZE = 50;
const QUERY_KEY = 'marvel.search.query';
const CACHE_KEY = 'marvel.search.cache.v1';

interface SearchRow {
  item: Item;
  qty: number;
  homeCode: string;
  status: ItemStatus;
}

type TypeFilter = 'all' | StockType;

// ---------------------------------------------------------------- mock data
// Used only when neither api.searchItems nor a Dexie searchCache is present.
// Real MARVEL catalogue seeds (Section 2.7): BC547, Nano, 104 cap, NE555…
function mockRows(): Array<SearchRow> {
  const m = (
    id: string,
    sku: string,
    name: string,
    category_id: string,
    type: StockType,
    qty: number,
    homeCode: string,
    status: ItemStatus,
    last_rate: number | null,
    replacement_cost: number,
    photo_urls: Array<string> = [],
  ): SearchRow => ({
    item: {
      id,
      sku,
      name,
      category_id,
      specs: {},
      uom: 'pcs',
      min_qty: 5,
      max_qty: 200,
      photo_urls,
      datasheet_url: null,
      supplier: null,
      last_rate,
      type,
      unit_weight_g: null,
      replacement_cost,
    },
    qty,
    homeCode,
    status,
  });
  return [
    m('i-bc547', 'MRV-DIO-BC547-001', 'BC547 NPN transistor strip', 'DIO', 'consumable', 42, 'R1-S2-B3', 'available', 2, 2),
    m('i-nano', 'MRV-BRD-NANO-001', 'Arduino Nano clone', 'BRD', 'returnable', 3, 'R1-S1-B1', 'borrowed', 450, 650),
    m('i-104', 'MRV-PAS-104-001', '104 ceramic capacitor strip (100nF)', 'PAS', 'consumable', 120, 'R1-S2-B1', 'available', 1, 1),
    m('i-ne555', 'MRV-ACT-NE555-001', 'NE555 timer IC tube', 'ACT', 'consumable', 18, 'R1-S2-B4', 'available', 15, 15),
    m('i-multi', 'MRV-MEA-MULTI-001', 'Digital multimeter DT-830D', 'MEA', 'returnable', 2, 'R2-S1-B1', 'borrowed', 850, 850),
    m('i-uno', 'MRV-BRD-UNO-001', 'Arduino Uno R3', 'BRD', 'returnable', 4, 'R1-S1-B2', 'available', 1200, 1400),
    m('i-esp32', 'MRV-BRD-ESP32-001', 'ESP32 DevKit V1', 'BRD', 'returnable', 5, 'R1-S1-B3', 'available', 650, 800),
    m('i-solder', 'MRV-HTL-SOLD-001', 'Soldering station + iron', 'HTL', 'returnable', 3, 'R2-S2-B1', 'available', 1500, 1800),
    m('i-cr10', 'MRV-MAC-CR10-001', 'Creality CR-10 Smart Pro', 'MAC', 'asset', 1, 'LAB-A', 'available', null, 45000),
    m('i-dso', 'MRV-MEA-DSO-001', 'Keysight DSO 2-ch oscilloscope', 'MEA', 'asset', 1, 'LAB-B', 'borrowed', null, 95000),
    m('i-lm35', 'MRV-MOD-LM35-001', 'LM35 temperature sensor', 'MOD', 'consumable', 9, 'R1-S3-B2', 'available', 120, 120),
    m('i-hcsr04', 'MRV-MOD-HCSR-001', 'HC-SR04 ultrasonic sensor', 'MOD', 'consumable', 7, 'R1-S3-B3', 'broken', 95, 95),
  ];
}

// ------------------------------------------------- defensive optional modules
// Files compile standalone: every external module (api / db / badges) loads via
// dynamic import with an inline fallback. Static literals are avoided so the
// bundler never hard-resolves a file that may not exist yet.
async function loadOptional(path: string): Promise<Record<string, any> | null> {
  try {
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, any>;
    return mod;
  } catch {
    return null;
  }
}

const API_CANDIDATES = ['../lib/api.js', '../services/api.js', '../../shared/api.js'];
const DB_CANDIDATES = ['../lib/db.js', '../services/db.js', '../../shared/db.js'];

async function apiSearchItems(query: string): Promise<Array<SearchRow> | null> {
  const g = globalThis as unknown as Record<string, any>;
  const injected = g['marvelApi'] ?? g['api'];
  if (injected && typeof injected.searchItems === 'function') {
    const res = await injected.searchItems(query);
    const data = res && typeof res === 'object' && 'data' in res ? res.data : res;
    if (Array.isArray(data)) return data as Array<SearchRow>;
  }
  for (const p of API_CANDIDATES) {
    const mod = await loadOptional(p);
    const fn = mod?.['api']?.searchItems ?? mod?.searchItems;
    if (typeof fn === 'function') {
      const res = await fn(query);
      const data = res && typeof res === 'object' && 'data' in res ? res.data : res;
      if (Array.isArray(data)) return data as Array<SearchRow>;
    }
  }
  return null;
}

async function cacheSearchItems(query: string): Promise<{ rows: Array<SearchRow>; count: number } | null> {
  const g = globalThis as unknown as Record<string, any>;
  const stores = [g['db'], g['marvelDb']];
  for (const db of stores) {
    try {
      const table = db?.searchCache ?? db?.items;
      if (table && typeof table.toArray === 'function') {
        const all = (await table.toArray()) as Array<SearchRow>;
        return { rows: filterRows(all, query, 'all', 'all'), count: all.length };
      }
      if (Array.isArray(table)) return { rows: filterRows(table, query, 'all', 'all'), count: table.length };
    } catch {
      // fall through to next candidate
    }
  }
  for (const p of DB_CANDIDATES) {
    const mod = await loadOptional(p);
    const table = mod?.['db']?.searchCache ?? mod?.searchCache ?? mod?.['db']?.items;
    try {
      if (table && typeof table.toArray === 'function') {
        const all = (await table.toArray()) as Array<SearchRow>;
        return { rows: filterRows(all, query, 'all', 'all'), count: all.length };
      }
    } catch {
      // keep trying candidates
    }
  }
  return null;
}

function filterRows(rows: Array<SearchRow>, q: string, category: string, type: TypeFilter): Array<SearchRow> {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (category !== 'all' && r.item.category_id !== category) return false;
    if (type !== 'all' && r.item.type !== type) return false;
    if (!needle) return true;
    const hay = [r.item.name, r.item.sku, r.item.id, r.homeCode, ...Object.values(r.item.specs ?? {})]
      .join(' ')
      .toLowerCase();
    return needle.split(/\s+/).every((w) => hay.includes(w));
  });
}

function readLocalCache(): Array<SearchRow> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY) ?? localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<SearchRow>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalCache(rows: Array<SearchRow>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows.slice(0, 200)));
  } catch {
    // storage full or blocked — cache is best-effort
  }
}

// ------------------------------------------------------------- inline pieces
function OfflineBanner({ count }: { count: number }) {
  return (
    <p className="mv-offline" role="status">
      <span aria-hidden="true">◌</span> Offline — {count} cached items
    </p>
  );
}

function StatusPill({ status }: { status: ItemStatus }) {
  const map: Record<ItemStatus, { icon: string; text: string }> = {
    available: { icon: '●', text: 'Available' },
    borrowed: { icon: '◐', text: 'Borrowed' },
    broken: { icon: '✕', text: 'Broken' },
  };
  const s = map[status];
  return (
    <span className={`mv-pill mv-${status}`}>
      <span aria-hidden="true">{s.icon}</span> {s.text}
    </span>
  );
}

const STATUS_META: Record<ItemStatus, { icon: string; text: string }> = {
  available: { icon: '●', text: 'Available' },
  borrowed: { icon: '◐', text: 'Borrowed' },
  broken: { icon: '✕', text: 'Broken' },
};

export function Search() {
  const [query, setQuery] = useState(() => {
    try {
      return sessionStorage.getItem(QUERY_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [category, setCategory] = useState('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [results, setResults] = useState<Array<SearchRow>>(() => readLocalCache());
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('success');
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [cachedCount, setCachedCount] = useState(() => readLocalCache().length || mockRows().length);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [micOn, setMicOn] = useState(false);
  const [remoteBadge, setRemoteBadge] = useState<ComponentType<{ offline: boolean; count: number }> | null>(null);
  const [remotePill, setRemotePill] = useState<ComponentType<{ status: string }> | null>(null);
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const searchSeq = useRef(0);

  // Persist query so back keeps it.
  useEffect(() => {
    try {
      sessionStorage.setItem(QUERY_KEY, query);
    } catch {
      // private mode — query simply will not survive back
    }
  }, [query]);

  // Track online / offline.
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Defensive remote UI overrides (OfflineBadge / StatusPill if the host app owns them).
  useEffect(() => {
    let live = true;
    void loadOptional('../components/OfflineBadge.js').then((m) => {
      const c = m?.['default'] ?? m?.['OfflineBadge'];
      if (live && typeof c === 'function') setRemoteBadge(() => c as ComponentType<{ offline: boolean; count: number }>);
    });
    void loadOptional('../components/StatusPill.js').then((m) => {
      const c = m?.['default'] ?? m?.['StatusPill'];
      if (live && typeof c === 'function') setRemotePill(() => c as ComponentType<{ status: string }>);
    });
    return () => {
      live = false;
    };
  }, []);

  // Mic support: WebSpeech only; button hides otherwise.
  const micSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    return typeof w['SpeechRecognition'] === 'function' || typeof w['webkitSpeechRecognition'] === 'function';
  }, []);

  function dictate() {
    const w = window as unknown as Record<string, any>;
    const Ctor = w['SpeechRecognition'] ?? w['webkitSpeechRecognition'];
    if (typeof Ctor !== 'function') return;
    try {
      if (micOn) {
        recogRef.current?.stop();
        return;
      }
      const recog = new Ctor();
      recog.lang = 'en-IN';
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      setMicOn(true);
      recog.onresult = (ev: any) => {
        const text = ev?.results?.[0]?.[0]?.transcript;
        if (typeof text === 'string' && text.trim()) setQuery(text.trim());
      };
      recog.onend = () => setMicOn(false);
      recog.onerror = () => setMicOn(false);
      recogRef.current = recog;
      recog.start();
    } catch {
      setMicOn(false);
    }
  }

  // Live search with debounce: api → Dexie cache → local mock.
  useEffect(() => {
    const id = searchSeq.current + 1;
    searchSeq.current = id;
    setPhase('loading');
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const fromApi = await apiSearchItems(query);
          if (searchSeq.current !== id) return;
          if (fromApi) {
            const rows = filterRows(fromApi, query, category, typeFilter);
            setResults(rows);
            setCachedCount(fromApi.length);
            writeLocalCache(fromApi);
            setPhase('success');
            setError(null);
            setVisibleCount(PAGE_SIZE);
            return;
          }
          const fromCache = await cacheSearchItems(query);
          if (searchSeq.current !== id) return;
          if (fromCache) {
            const rows = filterRows(fromCache.rows, query, category, typeFilter);
            setResults(rows);
            setCachedCount(fromCache.count);
            setPhase('success');
            setError(null);
            setVisibleCount(PAGE_SIZE);
            return;
          }
          const rows = filterRows(mockRows(), query, category, typeFilter);
          if (offline) {
            const cached = readLocalCache();
            const base = cached.length > 0 ? cached : mockRows();
            setCachedCount(base.length);
            setResults(filterRows(base, query, category, typeFilter));
          } else {
            setResults(rows);
            setCachedCount(mockRows().length);
            writeLocalCache(mockRows());
          }
          setPhase('success');
          setError(null);
          setVisibleCount(PAGE_SIZE);
        } catch (e) {
          if (searchSeq.current !== id) return;
          setPhase('error');
          setError(e instanceof Error ? e.message : 'Search failed.');
        }
      })();
    }, 220);
    return () => window.clearTimeout(t);
  }, [query, category, typeFilter, offline]);

  const visible = results.slice(0, visibleCount);
  const canSearch = query.trim().length > 0 || category !== 'all' || typeFilter !== 'all';
  const Badge = remoteBadge;
  const Pill = remotePill;

  return (
    <section className="mv-screen" aria-labelledby="search-title">
      <style>{`
        .mv-screen { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; color: #1c1917; max-width: 880px; margin: 0 auto; padding: 16px; }
        .mv-screen h1 { font-size: 28px; margin: 0 0 12px; font-weight: 600; }
        .mv-offline { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin: 0 0 12px; }
        .mv-pillrow { display: flex; gap: 8px; align-items: center; }
        .mv-searchpill { flex: 1; min-height: 56px; border-radius: 999px; border: 2px solid #d6d3d1; padding: 0 22px; font-size: 20px; width: 100%; box-sizing: border-box; }
        .mv-searchpill:focus-visible { outline: 2px dashed ${AMBER}; outline-offset: 2px; border-color: ${AMBER}; }
        .mv-mic { min-width: 56px; min-height: 56px; border-radius: 999px; border: 2px solid #d6d3d1; background: #fff; font-size: 15px; cursor: pointer; }
        .mv-mic[aria-pressed="true"] { border-color: ${AMBER}; color: ${AMBER}; }
        .mv-hint { font-size: 13px; color: #78716c; margin: 8px 2px 0; }
        .mv-chips { display: flex; gap: 8px; overflow-x: auto; padding: 12px 2px; }
        .mv-chip { flex: 0 0 auto; min-height: 48px; padding: 8px 16px; border-radius: 999px; border: 1px solid #d6d3d1; background: #fff; font-size: 15px; cursor: pointer; }
        .mv-chip[aria-pressed="true"] { background: ${AMBER}; border-color: ${AMBER}; color: #fff; }
        .mv-seg { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; }
        .mv-seg button { min-height: 48px; padding: 8px 14px; border-radius: 10px; border: 1px solid #d6d3d1; background: #fff; cursor: pointer; font-size: 15px; }
        .mv-seg button[aria-pressed="true"] { border-color: ${AMBER}; color: ${AMBER}; background: #fffbeb; }
        .mv-actions { display: flex; gap: 8px; margin: 4px 0 12px; }
        .mv-primary { min-height: 48px; padding: 10px 22px; border-radius: 10px; border: 0; background: ${AMBER}; color: #fff; font-size: 15px; cursor: pointer; }
        .mv-primary:disabled { background: #d6d3d1; color: #78716c; cursor: not-allowed; }
        .mv-ghost { min-height: 48px; padding: 10px 18px; border-radius: 10px; border: 1px solid #d6d3d1; background: #fff; font-size: 15px; cursor: pointer; }
        .mv-row { display: flex; gap: 12px; align-items: center; padding: 12px 4px; border-bottom: 1px solid #e7e5e4; }
        .mv-thumb { width: 48px; height: 48px; border-radius: 8px; background: #f5f5f4; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #78716c; overflow: hidden; }
        .mv-thumb img { width: 48px; height: 48px; object-fit: cover; }
        .mv-name { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46vw; }
        .mv-meta { font-size: 13px; color: #57534e; font-variant-numeric: tabular-nums; }
        .mv-qty { margin-left: auto; flex: 0 0 auto; background: #f5f5f4; border-radius: 999px; padding: 6px 12px; font-size: 13px; font-variant-numeric: tabular-nums; }
        .mv-pill { font-size: 13px; white-space: nowrap; }
        .mv-skel { border-radius: 8px; background: linear-gradient(90deg, #f5f5f4 25%, #e7e5e4 50%, #f5f5f4 75%); background-size: 200% 100%; animation: mvsh 1.2s infinite; min-height: 64px; margin: 8px 0; }
        @keyframes mvsh { to { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { .mv-skel { animation: none; } }
        .mv-empty, .mv-error { padding: 24px 8px; font-size: 15px; color: #57534e; }
        button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px dashed ${AMBER}; outline-offset: 2px; }
      `}</style>
      <h1 id="search-title">Search</h1>
      {offline ? (
        Badge ? (
          <Badge offline={offline} count={cachedCount} />
        ) : (
          <OfflineBanner count={cachedCount} />
        )
      ) : null}
      <div className="mv-pillrow">
        <label htmlFor="mv-q" className="mv-sr" style={{ position: 'absolute', left: -9999 }}>
          Search items
        </label>
        <input
          id="mv-q"
          className="mv-searchpill"
          type="search"
          autoComplete="off"
          placeholder="Search parts, tools, machines"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-describedby="mv-hint"
        />
        {micSupported ? (
          <button type="button" className="mv-mic" onClick={dictate} aria-pressed={micOn} aria-label="Dictate search">
            Mic
          </button>
        ) : null}
      </div>
      <p className="mv-hint" id="mv-hint">
        try BC547, Nano, 104
      </p>
      <div className="mv-chips" role="group" aria-label="Category">
        <button
          type="button"
          className="mv-chip"
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {TAXONOMY_10.map((c) => (
          <button
            key={c.code3}
            type="button"
            className="mv-chip"
            aria-pressed={category === c.code3}
            onClick={() => setCategory(category === c.code3 ? 'all' : c.code3)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="mv-seg" role="group" aria-label="Stock type">
        {(['all', 'consumable', 'returnable', 'asset'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>
            {t === 'all' ? 'All types' : t}
          </button>
        ))}
      </div>
      <div className="mv-actions">
        <button type="button" className="mv-primary" disabled={!canSearch} title={canSearch ? undefined : 'Type a name or MPN, or pick a category'}>
          Search
        </button>
        <button
          type="button"
          className="mv-ghost"
          disabled={!canSearch}
          onClick={() => {
            setQuery('');
            setCategory('all');
            setTypeFilter('all');
          }}
        >
          Clear
        </button>
      </div>
      {!canSearch ? <p className="mv-hint">Type a name or MPN, or pick a category to begin.</p> : null}
      <div aria-live="polite" className="mv-meta">
        {phase === 'loading' ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
      </div>
      {phase === 'loading' ? (
        <div aria-busy="true" aria-label="Loading results">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mv-skel" />
          ))}
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className="mv-error" role="alert">
          <p>Search failed{error ? ` — ${error}` : ''}.</p>
          <button type="button" className="mv-primary" onClick={() => setQuery((q) => q + ' ')}>
            Retry
          </button>
        </div>
      ) : null}
      {phase === 'success' && results.length === 0 ? (
        <div className="mv-empty">
          <p>No matches — try MPN or category</p>
        </div>
      ) : null}
      {phase === 'success' && visible.length > 0 ? (
        <div role="list" aria-label="Results">
          {visible.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <div className="mv-row" role="listitem" key={r.item.id}>
                <span className="mv-thumb" aria-hidden="true">
                  {r.item.photo_urls[0] ? (
                    <img src={r.item.photo_urls[0]} alt="" loading="lazy" />
                  ) : (
                    <span>{r.item.sku.slice(4, 7)}</span>
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="mv-name" title={r.item.name}>
                    {r.item.name}
                  </span>
                  <br />
                  <span className="mv-meta">
                    {r.homeCode} · {r.item.sku}
                  </span>
                  <br />
                  {Pill ? (
                    <Pill status={r.status} />
                  ) : (
                    <StatusPill status={r.status} />
                  )}
                  <span className="mv-sr" style={{ position: 'absolute', left: -9999 }}>
                    {meta.text}
                  </span>
                </span>
                <span className="mv-qty">Qty {r.qty}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {phase === 'success' && results.length > visibleCount ? (
        <div className="mv-actions">
          <button type="button" className="mv-ghost" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Show more ({results.length - visibleCount} left)
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default Search;
