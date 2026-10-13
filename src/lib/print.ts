export interface LabelData {
  title: string;
  sku: string;
  home: string;
  qrText: string;
}

const ESC = 0x1b;
const GS = 0x1d;

function encoder(): TextEncoder {
  return new TextEncoder();
}

function escInit(): number[] {
  return [ESC, 0x40];
}

function alignCenter(): number[] {
  return [ESC, 0x61, 0x01];
}

function textSize(w: number, h: number): number[] {
  const n = ((w - 1) << 4) | (h - 1);
  return [GS, 0x21, n & 0xff];
}

function line(s: string): number[] {
  return [...encoder().encode(`${s}\n`)];
}

function feed(n: number): number[] {
  return [ESC, 0x64, n & 0xff];
}

function cut(): number[] {
  return [GS, 0x56, 0x41, 0x00];
}

function qrStore(data: Uint8Array, fn: number, extra: number[] = []): number[] {
  const len = data.length + extra.length + 1;
  return [GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, fn, ...extra, ...data];
}

function qrCommands(text: string): number[] {
  const bytes = encoder().encode(text);
  return [
    ...qrStore(new Uint8Array([0x02]), 0x31, [0x02]),
    ...qrStore(new Uint8Array([0x04]), 0x31, [0x04]),
    ...qrStore(bytes, 0x31, [0x00]),
    GS,
    0x28,
    0x6b,
    0x03,
    0x00,
    0x31,
    0x51,
    0x30,
  ];
}

function m220CharsPerLine(): number {
  return 24;
}

function chunkTitle(title: string): string[] {
  const width = m220CharsPerLine();
  const clean = title.trim();
  if (clean.length <= width) return [clean];
  const lines: string[] = [];
  let rest = clean;
  while (rest.length > 0 && lines.length < 3) {
    if (rest.length <= width) {
      lines.push(rest);
      break;
    }
    const slice = rest.slice(0, width);
    const cutAt = slice.lastIndexOf(' ');
    const head = cutAt > 8 ? slice.slice(0, cutAt) : slice;
    lines.push(head);
    rest = rest.slice(head.length).trimStart();
  }
  return lines;
}

export function buildEscPosLabel(label: LabelData): Uint8Array {
  const bytes: number[] = [];
  bytes.push(...escInit(), ...alignCenter());
  bytes.push(...textSize(2, 2));
  for (const t of chunkTitle(label.title)) bytes.push(...line(t));
  bytes.push(...textSize(1, 1));
  bytes.push(...line(label.sku));
  bytes.push(...textSize(2, 2));
  const home = label.home.replace(/\s+/g, '').toUpperCase();
  bytes.push(...line(home ? `> ${home}` : '> unplaced'));
  bytes.push(...textSize(1, 1));
  if (label.qrText.trim()) bytes.push(...qrCommands(label.qrText.trim()));
  bytes.push(...feed(4), ...cut());
  return new Uint8Array(bytes);
}

export function isBluetoothPrintSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'bluetooth' in navigator;
}

interface BluetoothDeviceLike {
  gatt?: {
    connect: () => Promise<{
      getPrimaryService: (uuid: string) => Promise<{
        getCharacteristic: (uuid: string) => Promise<{
          writeValueWithoutResponse?: (v: Uint8Array) => Promise<void>;
          writeValue?: (v: Uint8Array) => Promise<void>;
        }>;
      }>;
    }>;
  };
}

const M220_SERVICE_UUID = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const M220_WRITE_UUID = '49535343-8841-43f4-a8d4-ecbe34729bb3';

function chunkBytes(data: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) out.push(data.slice(i, i + size));
  return out;
}

export async function printLabelM220(label: LabelData): Promise<void> {
  if (!isBluetoothPrintSupported()) {
    throw new Error('Bluetooth printing is not supported on this device. Use the lab android.');
  }
  const nav = navigator as unknown as {
    bluetooth: {
      requestDevice: (opts: unknown) => Promise<BluetoothDeviceLike>;
    };
  };
  const device = await nav.bluetooth.requestDevice({
    filters: [{ namePrefix: 'M220' }, { namePrefix: 'Phomemo' }],
    optionalServices: [M220_SERVICE_UUID],
  });
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Could not connect to printer.');
  const service = await server.getPrimaryService(M220_SERVICE_UUID);
  const char = await service.getCharacteristic(M220_WRITE_UUID);
  const payload = buildEscPosLabel(label);
  for (const chunk of chunkBytes(payload, 100)) {
    if (char.writeValueWithoutResponse) await char.writeValueWithoutResponse(chunk);
    else if (char.writeValue) await char.writeValue(chunk);
    else throw new Error('Printer characteristic is not writable.');
  }
}
