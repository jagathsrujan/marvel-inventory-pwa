-- MARVEL V1 seed (Supabase / Postgres). Run AFTER 0001_marvel_v1.sql.
-- Real MARVEL catalogue: 10 taxonomy categories, location tree, 13 items+lots,
-- 5 demo members, 1 project, 1 course kit, 1 pending request.
-- Re-runnable: unique inserts use ON CONFLICT DO NOTHING, the rest use NOT EXISTS guards.

-- ------------------------------------------------------------------ categories
insert into public.categories (name, code3, parent_id, icon) values
  ('Passive (R/C/L)', 'PAS', null, 'resistor'),
  ('Active/IC', 'ACT', null, 'chip'),
  ('Diode/Transistor', 'DIO', null, 'diode'),
  ('Module/Sensor', 'MOD', null, 'sensor'),
  ('Dev Board', 'BRD', null, 'board'),
  ('Wire/Cable/Connector', 'WIR', null, 'cable'),
  ('Hand Tool', 'HTL', null, 'wrench'),
  ('Power Tool', 'PTL', null, 'drill'),
  ('Measure/Test', 'MEA', null, 'meter'),
  ('Machine/Asset', 'MAC', null, 'printer')
on conflict (code3) do nothing;

-- ------------------------------------------------------------------ locations
insert into public.locations (code, name, parent_id, type, photo_url, path) values
  ('MRV-LAB-1', 'MARVEL Lab', null, 'Lab', null, 'MRV-LAB-1')
on conflict (code) do nothing;

insert into public.locations (code, name, parent_id, type, photo_url, path)
select v.code, v.name, l.id, v.type, null, 'MRV-LAB-1/' || v.code
from (values ('MRV-R1', 'Rack 1', 'Rack'), ('MRV-R2', 'Rack 2', 'Rack')) as v(code, name, type)
join public.locations l on l.code = 'MRV-LAB-1'
on conflict (code) do nothing;

insert into public.locations (code, name, parent_id, type, photo_url, path)
select v.code, v.name, l.id, 'Shelf', null, 'MRV-LAB-1/MRV-R1/' || v.code
from (values ('MRV-R1-S1', 'Rack 1 Shelf 1'), ('MRV-R1-S2', 'Rack 1 Shelf 2')) as v(code, name)
join public.locations l on l.code = 'MRV-R1'
on conflict (code) do nothing;

insert into public.locations (code, name, parent_id, type, photo_url, path)
select v.code, v.name, l.id, 'Bin', null, 'MRV-LAB-1/MRV-R1/MRV-R1-S2/' || v.code
from (values ('MRV-R1-S2-B1', 'Shelf 2 Bin 1'), ('MRV-R1-S2-B2', 'Shelf 2 Bin 2'), ('MRV-R1-S2-B3', 'Shelf 2 Bin 3')) as v(code, name)
join public.locations l on l.code = 'MRV-R1-S2'
on conflict (code) do nothing;

-- ------------------------------------------------------------------ members
insert into public.members (card_qr, name, college_email, phone, course_year, track, dues_count) values
  ('M/STU-2024-084', 'Arjun', 'arjun@uvce.edu', '+919845011111', 'BE 3rd yr', 'student', 0),
  ('M/STU-2024-091', 'Diya', 'diya@uvce.edu', '+919845022222', 'BE 2nd yr', 'equipment_support', 0),
  ('M/CRD-2023-011', 'Adrian', 'adrian@uvce.edu', '+919845033333', 'Coordinator', 'project', 0),
  ('M/CRD-2023-014', 'Varsha', 'varsha@uvce.edu', '+919845044444', 'Coordinator', 'project', 0),
  ('M/CRD-2024-002', 'Jagruthi', 'jagruthi@uvce.edu', '+919845055555', 'Coordinator', 'equipment_support', 0)
on conflict (card_qr) do nothing;

-- ------------------------------------------------------------------ items (13)
insert into public.items (sku, name, category_id, specs, uom, min_qty, max_qty, photo_urls, datasheet_url, supplier, last_rate, type, unit_weight_g, replacement_cost) values
  ('MRV-MAC-CR10-001', 'Creality CR-10 Smart Pro', (select id from public.categories where code3 = 'MAC'),
    '{"bed": "300x300x400mm", "nozzle": "0.4mm"}', 'pcs', 1, 2, '{}', null, 'Creality', 42000, 'asset', null, 42000),
  ('MRV-MAC-ENDV3-001', 'Creality Ender V3', (select id from public.categories where code3 = 'MAC'),
    '{"bed": "220x220x250mm", "nozzle": "0.4mm"}', 'pcs', 1, 2, '{}', null, 'Creality', 23000, 'asset', null, 23000),
  ('MRV-MEA-DSO-001', 'Keysight DSO 2-ch oscilloscope (with signal gen)', (select id from public.categories where code3 = 'MEA'),
    '{"channels": "2", "bandwidth": "100MHz"}', 'pcs', 1, 2, '{}', null, 'Keysight', 95000, 'asset', null, 95000),
  ('MRV-MEA-PSU-001', 'RIGOL DP712 bench power supply', (select id from public.categories where code3 = 'MEA'),
    '{"output": "30V/5A", "channels": "1"}', 'pcs', 1, 2, '{}', null, 'RIGOL', 28000, 'asset', null, 28000),
  ('MRV-BRD-BASYS-001', 'Digilent Basys 3 FPGA board', (select id from public.categories where code3 = 'BRD'),
    '{"fpga": "Artix-7 XC7A35T"}', 'pcs', 1, 6, '{}', null, 'SP Road', 18500, 'returnable', null, 18500),
  ('MRV-BRD-JNANO-001', 'Nvidia Jetson Nano', (select id from public.categories where code3 = 'BRD'),
    '{"ram": "4GB", "ai_perf": "472 GFLOPS"}', 'pcs', 1, 6, '{}', null, 'SP Road', 14500, 'returnable', null, 14500),
  ('MRV-BRD-PI4-001', 'Raspberry Pi 4 8GB', (select id from public.categories where code3 = 'BRD'),
    '{"ram": "8GB", "soc": "BCM2711"}', 'pcs', 2, 10, '{}', null, 'SP Road', 7500, 'returnable', null, 7500),
  ('MRV-BRD-ESP32-001', 'ESP32 / ESP32-CAM / ESP8266 family tray', (select id from public.categories where code3 = 'BRD'),
    '{"boards": "ESP32 DevKit + ESP32-CAM + ESP8266 + ESP01"}', 'pcs', 4, 30, '{}', null, 'SP Road', 650, 'returnable', null, 650),
  ('MRV-BRD-NANO-001', 'Arduino Uno / Nano / Mega family tray', (select id from public.categories where code3 = 'BRD'),
    '{"boards": "Uno + Nano + Mega"}', 'pcs', 4, 30, '{}', null, 'SP Road', 1800, 'returnable', null, 1800),
  ('MRV-HTL-BOSCH-001', 'BOSCH mechanical tool kit', (select id from public.categories where code3 = 'HTL'),
    '{"pieces": "108", "case": "carry case"}', 'pcs', 1, 2, '{}', null, 'Bosch', 6500, 'asset', null, 6500),
  ('MRV-PAS-10K-001', '10k resistor strip (1/4W, 5%)', (select id from public.categories where code3 = 'PAS'),
    '{"value": "10k", "power": "0.25W", "tolerance": "5%"}', 'pcs', 10, 200, '{}', null, 'SP Road', 20, 'consumable', null, 20),
  ('MRV-DIO-BC547-001', 'BC547 NPN transistor strip', (select id from public.categories where code3 = 'DIO'),
    '{"type": "NPN", "package": "TO-92"}', 'pcs', 10, 200, '{}', null, 'SP Road', 150, 'consumable', null, 150),
  ('MRV-ACT-NE555-001', 'NE555 timer IC tube', (select id from public.categories where code3 = 'ACT'),
    '{"package": "DIP-8"}', 'pcs', 5, 100, '{}', null, 'SP Road', 200, 'consumable', null, 200)
on conflict (sku) do nothing;

-- ------------------------------------------------------------------ stock lots (one row per pouch/tray/machine)
insert into public.stock_lots (item_id, location_id, home_location_id, qty, batch)
select i.id, l.id, l.id, v.qty, null
from (values
  ('MRV-MAC-CR10-001', 'MRV-LAB-1', 1),
  ('MRV-MAC-ENDV3-001', 'MRV-LAB-1', 1),
  ('MRV-MEA-DSO-001', 'MRV-R1-S1', 1),
  ('MRV-MEA-PSU-001', 'MRV-R1-S1', 1),
  ('MRV-BRD-BASYS-001', 'MRV-R1-S2-B1', 2),
  ('MRV-BRD-JNANO-001', 'MRV-R1-S2-B1', 2),
  ('MRV-BRD-PI4-001', 'MRV-R1-S2-B1', 4),
  ('MRV-BRD-ESP32-001', 'MRV-R1-S2-B2', 12),
  ('MRV-BRD-NANO-001', 'MRV-R1-S2-B2', 15),
  ('MRV-HTL-BOSCH-001', 'MRV-R1-S1', 1),
  ('MRV-PAS-10K-001', 'MRV-R1-S2-B3', 40),
  ('MRV-DIO-BC547-001', 'MRV-R1-S2-B3', 50),
  ('MRV-ACT-NE555-001', 'MRV-R1-S2-B3', 20)
) as v(sku, loc, qty)
join public.items i on i.sku = v.sku
join public.locations l on l.code = v.loc
where not exists (
  select 1 from public.stock_lots s where s.item_id = i.id and s.location_id = l.id
);

-- Seed opening ledger rows (one 'created' per lot that lacks one).
insert into public.ledger (lot_id, item_id, action, delta_qty, from_loc, to_loc, by_user, note)
select l.id, l.item_id, 'created', l.qty, null, loc.code, 'seed', 'V1 seed import'
from public.stock_lots l
join public.locations loc on loc.id = l.location_id
where not exists (
  select 1 from public.ledger g where g.lot_id = l.id and g.action = 'created'
);

-- ------------------------------------------------------------------ project
insert into public.projects (name, track, member_ids, coordinator_id, budget_cap, status)
select 'Smart Bin', 'project',
  array[(select id from public.members where college_email = 'arjun@uvce.edu'),
        (select id from public.members where college_email = 'diya@uvce.edu')],
  (select id from public.members where college_email = 'adrian@uvce.edu'),
  15000, 'active'
where not exists (select 1 from public.projects where name = 'Smart Bin');

-- ------------------------------------------------------------------ course kit
insert into public.course_kits (code, name, items, requires_supervision)
select 'EV-RE-001-L1', 'EV-RE-001 Level 1 kit',
  jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.items where sku = 'MRV-ACT-NE555-001')::text, 'qty', 2),
    jsonb_build_object('item_id', (select id from public.items where sku = 'MRV-PAS-10K-001')::text, 'qty', 1),
    jsonb_build_object('item_id', (select id from public.items where sku = 'MRV-DIO-BC547-001')::text, 'qty', 1)
  ), true
where not exists (select 1 from public.course_kits where code = 'EV-RE-001-L1');

-- ------------------------------------------------------------------ pending request
insert into public.requests (member_id, project_id, items, status, due_at, decided_by)
select (select id from public.members where college_email = 'arjun@uvce.edu'),
  (select id from public.projects where name = 'Smart Bin'),
  jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.items where sku = 'MRV-BRD-NANO-001')::text, 'qty', 1)
  ), 'pending', now() + interval '14 days', null
where not exists (
  select 1 from public.requests r
  join public.members m on m.id = r.member_id
  where m.college_email = 'arjun@uvce.edu' and r.status = 'pending'
);

-- NOTE: profiles rows (id = auth.users id, role, member_id) cannot be seeded here;
-- create them after each user signs up, e.g.:
-- insert into public.profiles (id, role, member_id)
-- values ('<auth-user-uuid>', 'admin', (select id from public.members where college_email = 'adrian@uvce.edu'));
