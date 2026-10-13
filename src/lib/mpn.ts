import type { CategoryName } from '../../shared/types';

export interface MpnHit {
  mpn: string;
  name: string;
  specs: Record<string, string>;
  category: CategoryName;
  datasheet_url: string | null;
  supplier: string | null;
}

function sheet(key: string): string {
  return `https://marv.inv/datasheet/${key}`;
}

const TABLE: Record<string, MpnHit> = {
  BC547: {
    mpn: 'BC547',
    name: 'Transistor BC547 NPN',
    specs: { type: 'NPN', package: 'TO-92' },
    category: 'Diode/Transistor',
    datasheet_url: sheet('BC547'),
    supplier: 'LCSC',
  },
  NE555: {
    mpn: 'NE555',
    name: 'Timer IC NE555',
    specs: { type: 'Timer', package: 'DIP-8' },
    category: 'Active/IC',
    datasheet_url: sheet('NE555'),
    supplier: 'LCSC',
  },
  ARDUINONANO: {
    mpn: 'Arduino Nano',
    name: 'Arduino Nano ATmega328P',
    specs: { mcu: 'ATmega328P', usb: 'Mini-B' },
    category: 'Dev Board',
    datasheet_url: sheet('ARDUINONANO'),
    supplier: 'LCSC',
  },
  NANO: {
    mpn: 'Nano',
    name: 'Arduino Nano ATmega328P',
    specs: { mcu: 'ATmega328P', usb: 'Mini-B' },
    category: 'Dev Board',
    datasheet_url: sheet('NANO'),
    supplier: 'LCSC',
  },
  ESP32: {
    mpn: 'ESP32',
    name: 'ESP32 devkit',
    specs: { wifi: '2.4GHz', bluetooth: 'BLE' },
    category: 'Dev Board',
    datasheet_url: sheet('ESP32'),
    supplier: 'LCSC',
  },
  ESP32DEVKIT: {
    mpn: 'ESP32',
    name: 'ESP32 devkit',
    specs: { wifi: '2.4GHz', bluetooth: 'BLE' },
    category: 'Dev Board',
    datasheet_url: sheet('ESP32'),
    supplier: 'LCSC',
  },
  '10K0603': {
    mpn: '10K-0603',
    name: 'Resistor 10k 0603',
    specs: { resistance: '10k', package: '0603' },
    category: 'Passive (R/C/L)',
    datasheet_url: sheet('10K0603'),
    supplier: 'LCSC',
  },
  '104': {
    mpn: '104',
    name: 'Capacitor 100nF ceramic',
    specs: { capacitance: '100nF', package: '0805' },
    category: 'Passive (R/C/L)',
    datasheet_url: sheet('104'),
    supplier: 'LCSC',
  },
  LM35: {
    mpn: 'LM35',
    name: 'Temp sensor LM35',
    specs: { output: '10mV/C', package: 'TO-92' },
    category: 'Module/Sensor',
    datasheet_url: sheet('LM35'),
    supplier: 'LCSC',
  },
  DHT11: {
    mpn: 'DHT11',
    name: 'Humidity sensor DHT11',
    specs: { humidity: '20-90%RH', temperature: '0-50C' },
    category: 'Module/Sensor',
    datasheet_url: sheet('DHT11'),
    supplier: 'LCSC',
  },
  HCSR04: {
    mpn: 'HC-SR04',
    name: 'Ultrasonic sensor HC-SR04',
    specs: { range: '2-400cm', supply: '5V' },
    category: 'Module/Sensor',
    datasheet_url: sheet('HCSR04'),
    supplier: 'LCSC',
  },
};

function norm(mpn: string): string {
  return mpn.trim().toUpperCase().replace(/[\s_-]+/g, '');
}

function mockLookup(raw: string): MpnHit {
  const key = norm(raw);
  const hit = TABLE[key];
  if (hit) return { ...hit, specs: { ...hit.specs } };
  return {
    mpn: raw.trim(),
    name: raw.trim() ? `Part ${raw.trim().toUpperCase()}` : 'Unknown part',
    specs: { mpn: raw.trim() },
    category: 'Passive (R/C/L)',
    datasheet_url: key ? sheet(key) : null,
    supplier: null,
  };
}

async function fetchLive(mpn: string, apiKey: string): Promise<MpnHit | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch('https://api.nexar.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', token: apiKey },
      body: JSON.stringify({
        query: 'query($q:String!){supSearchMpn(q:$q limit:1){results{part{mpn manufacturer{name} datasheets{url}}}}}',
        variables: { q: mpn },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { supSearchMpn?: { results?: { part?: { mpn?: string; manufacturer?: { name?: string }; datasheets?: { url?: string }[] } }[] } };
    };
    const part = body.data?.supSearchMpn?.results?.[0]?.part;
    if (!part?.mpn) return null;
    const maker = part.manufacturer?.name ?? '';
    return {
      mpn: part.mpn,
      name: maker ? `${part.mpn} ${maker}` : part.mpn,
      specs: { mpn: part.mpn, maker },
      category: mockLookup(part.mpn).category,
      datasheet_url: part.datasheets?.[0]?.url ?? sheet(norm(part.mpn)),
      supplier: 'Octopart',
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function lookupMpn(mpn: string): Promise<MpnHit> {
  const clean = mpn.trim();
  if (!clean) return mockLookup('unknown');
  const apiKey = import.meta.env.VITE_OCTOPART_KEY as string | undefined;
  if (apiKey) {
    const live = await fetchLive(clean, apiKey);
    if (live) return live;
  }
  return mockLookup(clean);
}
