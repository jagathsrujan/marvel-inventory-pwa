import type { Item, Loan, Location, Member, StockLot } from '../../shared/types'

/**
 * Standalone fallback data so Scan / Issue / Return work without src/lib/api.ts
 * (owned by another agent) and without network. Every row matches the contract
 * in shared/types.ts. Seeded from MARVEL ground truth (BUILD_NOTES §2.7):
 * real catalogue items, rack codes, and coordinator names.
 */

export const MOCK_LOCATIONS: Location[] = [
  { id: 'loc-lab', code: 'MRV-LAB', name: 'MARVEL lab', parent_id: null, type: 'Lab', photo_url: null, path: 'MARVEL lab' },
  { id: 'loc-r1', code: 'MRV-R1', name: 'Rack 1', parent_id: 'loc-lab', type: 'Rack', photo_url: null, path: 'MARVEL lab/Rack 1' },
  { id: 'loc-r1-s2', code: 'MRV-R1-S2', name: 'Rack 1 Shelf 2', parent_id: 'loc-r1', type: 'Shelf', photo_url: null, path: 'MARVEL lab/Rack 1/Shelf 2' },
  { id: 'loc-r1-s2-b3', code: 'R1-S2-B3', name: 'Bin 3', parent_id: 'loc-r1-s2', type: 'Bin', photo_url: null, path: 'MARVEL lab/Rack 1/Shelf 2/Bin 3' },
  { id: 'loc-r2-s1-b1', code: 'R2-S1-B1', name: 'Bin 1', parent_id: 'loc-r1', type: 'Bin', photo_url: null, path: 'MARVEL lab/Rack 2/Shelf 1/Bin 1' },
]

export const MOCK_ITEMS: Item[] = [
  {
    id: 'item-nano',
    sku: 'MRV-BRD-NANO-001',
    name: 'Arduino Nano',
    category_id: 'cat-brd',
    specs: { mcu: 'ATmega328P', pins: '30' },
    uom: 'pcs',
    min_qty: 2,
    max_qty: 20,
    photo_urls: [],
    datasheet_url: null,
    supplier: 'SP Road',
    last_rate: 450,
    type: 'returnable',
    unit_weight_g: null,
    replacement_cost: 650,
  },
  {
    id: 'item-multi',
    sku: 'MRV-MEA-MULTI-001',
    name: 'Digital multimeter',
    category_id: 'cat-mea',
    specs: { ranges: 'AC/DC V, A, ohms' },
    uom: 'pcs',
    min_qty: 1,
    max_qty: 10,
    photo_urls: [],
    datasheet_url: null,
    supplier: 'SP Road',
    last_rate: 700,
    type: 'returnable',
    unit_weight_g: null,
    replacement_cost: 850,
  },
  {
    id: 'item-esp32',
    sku: 'MRV-BRD-ESP32-001',
    name: 'ESP32 devkit',
    category_id: 'cat-brd',
    specs: { radio: 'WiFi + BLE' },
    uom: 'pcs',
    min_qty: 2,
    max_qty: 15,
    photo_urls: [],
    datasheet_url: null,
    supplier: 'Robu.in',
    last_rate: 550,
    type: 'returnable',
    unit_weight_g: null,
    replacement_cost: 750,
  },
  {
    id: 'item-10k',
    sku: 'MRV-PAS-10K-001',
    name: '10k resistor strip',
    category_id: 'cat-pas',
    specs: { marking: '103', tolerance: '5%' },
    uom: 'pcs',
    min_qty: 50,
    max_qty: 500,
    photo_urls: [],
    datasheet_url: null,
    supplier: 'SP Road',
    last_rate: 10,
    type: 'consumable',
    unit_weight_g: null,
    replacement_cost: 20,
  },
  {
    id: 'item-solder',
    sku: 'MRV-HTL-SOLD-001',
    name: 'Soldering station',
    category_id: 'cat-htl',
    specs: { wattage: '60W' },
    uom: 'pcs',
    min_qty: 1,
    max_qty: 6,
    photo_urls: [],
    datasheet_url: null,
    supplier: 'SP Road',
    last_rate: 1200,
    type: 'returnable',
    unit_weight_g: null,
    replacement_cost: 1500,
  },
]

export const MOCK_LOTS: StockLot[] = [
  { id: 'LOT-NANO-3', item_id: 'item-nano', location_id: 'loc-r1-s2-b3', home_location_id: 'loc-r1-s2-b3', qty: 4, batch: null },
  { id: 'LOT-MULTI-1', item_id: 'item-multi', location_id: 'loc-r2-s1-b1', home_location_id: 'loc-r2-s1-b1', qty: 2, batch: null },
  { id: 'LOT-ESP32-2', item_id: 'item-esp32', location_id: 'loc-r1-s2-b3', home_location_id: 'loc-r1-s2-b3', qty: 3, batch: null },
  { id: 'LOT-10K-1', item_id: 'item-10k', location_id: 'loc-r1-s2-b3', home_location_id: 'loc-r1-s2-b3', qty: 180, batch: 'strip-50' },
  { id: 'LOT-SOLD-1', item_id: 'item-solder', location_id: 'loc-r2-s1-b1', home_location_id: 'loc-r2-s1-b1', qty: 2, batch: null },
]

export const MOCK_MEMBERS: Member[] = [
  {
    id: 'M/STU-2024-084',
    card_qr: 'M/STU-2024-084',
    name: 'Arjun Rao',
    college_email: 'arjun.rao@uvce.edu',
    phone: '919845012345',
    course_year: 'BE 3rd year',
    track: 'project',
    dues_count: 1,
  },
  {
    id: 'M/STU-2024-112',
    card_qr: 'M/STU-2024-112',
    name: 'Meera Nair',
    college_email: 'meera.nair@uvce.edu',
    phone: '919845067890',
    course_year: 'BE 2nd year',
    track: 'student',
    dues_count: 0,
  },
]

const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()

export const MOCK_LOANS: Loan[] = [
  {
    id: 'loan-nano-arjun',
    lot_id: 'LOT-NANO-3',
    item_id: 'item-nano',
    qty: 1,
    member_id: 'M/STU-2024-084',
    project_id: null,
    issued_by: 'volunteer-1',
    issued_at: tenDaysAgo,
    due_at: twoDaysAgo,
    returned_at: null,
    condition_in: 'Good',
    condition_out: null,
    fine: 0,
    status: 'overdue',
  },
]

export function findItem(id: string): Item | undefined {
  return MOCK_ITEMS.find((i) => i.id === id)
}

export function findLot(id: string): StockLot | undefined {
  return MOCK_LOTS.find((l) => l.id === id)
}

export function findMember(idOrEmail: string): Member | undefined {
  const needle = idOrEmail.trim().toLowerCase()
  return MOCK_MEMBERS.find(
    (m) =>
      m.id.toLowerCase() === needle ||
      m.card_qr.toLowerCase() === needle ||
      m.college_email.toLowerCase() === needle,
  )
}

export function homeCodeFor(lot: StockLot): string {
  return MOCK_LOCATIONS.find((l) => l.id === lot.home_location_id)?.code ?? lot.home_location_id
}

export function currentCodeFor(lot: StockLot): string {
  return MOCK_LOCATIONS.find((l) => l.id === lot.location_id)?.code ?? lot.location_id
}

export function formatDue(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
