# 30 item trial protocol

Goal: validate capture flow, Laya local taxonomy accuracy, and timing budgets before 2 day blitz. Timebox: 2 hours, 2 volunteers, 1 phone, 1 M220.

## Setup

- Location Qrs stuck on 6 bins, codes R1-S2-B1 to R1-S2-B6, each photographed once.
- Phone charged, Pwa open at `/capture`, offline queue badge visible.
- M220 paired to this phone only, one 40x30mm roll loaded.
- Pouches, tie tags, marker, temp slips numbered 1 to 30.
- Copy `trial-log.csv` open for logging, stopwatch ready.
- Keyword fallback map printed: `104/10k` to Passive, `Nano/Esp32` to Dev Board, `Bc547/2n2222` to Diode/Transistor.

## Item set

One round is 5 items. Run 6 rounds for 30 total.

- Round item 1: resistor strip, example 10k, 4.7k, 1k, 330R, 100R, 47k.
- Round item 2: Ic tube or strip, example Ne555, Lm358, Bc547 strip, 7805, Atmega328, Cd4017.
- Round item 3: dev board, example Arduino Nano, Uno, Esp32, Esp8266, Mega, Stm32 Nucleo.
- Round item 4: sensor or module, example Hc-Sr04, Dht11, Lm35, L298n, Hc-05, 16x2 Lcd.
- Round item 5: tool, example multimeter, soldering iron, wire stripper, helping hands,hot glue gun, precision screwdriver set.

Use real Marvel shelf stock. If an exact part is missing, substitute same category and note it.

## Per item steps

1. Scan home shelf Qr or pick code. Record home code in log notes on first use per bin.
2. Pouch and tag with temp number.
3. Open `/capture`, photo 3x: pouch wide, marking close-up, shelf.
4. Speak 10s note: name, qty estimate, home code, rate if known.
5. Run Mpn first: type marking, check Octopart or Lcsc autofill if available.
6. Record Laya suggestion: category, confidence p, merge suggestion if any.
7. Record keyword fallback suggestion for same input.
8. Coordinator taps Approve or Merge. Record decision and time.
9. Print M220 sticker, stick and tape. Confirm print_ok.

Target per item is 45 to 60s. Note overruns with reason.

## Per item log fields

Log one row per item in `trial-log.csv`:

- `item`: short name, example Nano-3.
- `mpn`: marking typed, example Bc547.
- `method`: laya, keyword, or manual.
- `time_s`: seconds from home scan to sticker stuck.
- `category_ok`: true or false against 10 cat taxonomy.
- `merge_ok`: true, false, or na.
- `notes`: taxonomy gap, Mpn miss, print fail, voice miss.

Also note per item: Laya p value, keyword result, final category. Keep in notes if csv is tight, example `laya Dio 0.91 vs kw Dio, merge #42 rejected`.

## Taxonomy gap review

- Locked taxonomy: Passive (R/C/L), Active/Ic, Diode/Transistor, Module/Sensor, Dev Board, Wire/Cable/Connector, Hand Tool, Power Tool, Measure/Test, Machine/Asset.
- After each round, list items where neither Laya nor keyword gave correct category.
- Mark gap as naming fix, keyword add, or request new subcode. Coordinators cannot create categories in V1, only request.
- End of trial: top 3 gaps with example items and proposed keyword or prompt fix.

## Pass bar

- Search under 10s for Mpn and name queries, online and cached offline.
- Issue under 30s: scan item, scan member, due date, done.
- Return under 30s: scan, condition, shelf check, done.
- Offline queue survives reload: queue 2 issues offline, reload page, count still 2, sync on reconnect.
- One sticker prints from M220 with home code readable, example `to R1-S2-B3`.
- wa.me opens from one dues row with prefilled text and correct digits.
- Capture median under 60s per item across 30 items.
- Laya auto suggest usable when p above 0.85, else manual pick forced. If Laya accuracy below keyword, keep keyword fallback.

## Exit artefacts

- Filled `trial-log.csv` with 30 rows.
- Gap list with 3 fixes max.
- Go or no go for blitz, plus print and net issues noted.
