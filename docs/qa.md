# Qa acceptance checklist

Scope is V1 only: 7 screens, offline queue, M220 print, wa.me reminder. Tested on lab Android Chrome and desk browser.

## How to use

- Check each state per screen before sign off. Happy path only fails review.
- Time search, issue, return with `src/lib/perf.ts` budgets.
- Log defects with screen, state, repro, expected.

## Scan `/scan`

- Loading: skeleton viewfinder and last scan card shimmer, never blank.
- Empty: text teaches next step, example Scan an item Qr to begin, no items scanned yet, with Open search button.
- Error: camera blocked shows Upload photo instead button, bad Qr shows Shelf Qr unreadable, type code or pick from list.
- Offline: amber banner Offline, N queued, last scan card still renders from cache.
- Success: item card with photo, name, home code, qty pill, Issue and Return buttons.
- Disabled: Issue disabled when qty is 0 with reason Qty 0 at this lot.
- Overflow: long item names truncate, full name on tap. Last scan list caps at 20 with View all.

## Issue `/issue`

- Loading: skeleton item and member cards with Saving issue text on submit.
- Empty: no item scanned shows Scan item to start, no member shows Scan id or continue with email.
- Error: unknown Qr, member not found, qty 0 each show reason plus retry or search link.
- Offline: banner plus queued row with clock icon and Syncs when online, success copy says Queued.
- Success: haptic plus green check, copy names member, item, due date, example Arjun owes Nano 3, due Nov 2. Replacement cost shown in red text.
- Disabled: Issue pinned button disabled until item plus member plus due date exist, reason shown inline.
- Overflow: member dues history paginates at 50, long project names truncate.
- Timing: scan to done under 30s per `perf.ts` budget issue.

## Return `/return`

- Loading: loan card skeleton, Mark returned shows spinner.
- Empty: no open loan for item shows No open loan, check item Qr with link to dues.
- Error: shelf scan fail allows typed code, photo upload fail allows retry without losing condition pick.
- Offline: return queues, loan row shows clock icon, fine marked estimate until sync.
- Success: check plus condition recorded, copy says Returned, shelf verdict Correct home or Wrong, home is R1-S2-B3.
- Disabled: Return disabled until condition picked, photo required when Damaged or Dead.
- Overflow: late fine uses tabular figures, long member names truncate.
- Timing: scan to done under 30s per `perf.ts` budget return.

## Capture `/capture`

- Loading: draft card skeleton after voice submit, Saving draft text.
- Empty: step 1 with no home shows Scan shelf Qr or pick code, photo slots show Pouch, Marking, Shelf labels.
- Error: voice fail allows typed note, Mpn lookup fail allows manual form, camera fail allows upload.
- Offline: draft saves to queue, badge count bumps, Approve prints only when printer reachable else queues print.
- Success: Approve commits item, M220 sticker prints with home code, copy shows Sticker printed, stick and tape.
- Disabled: Approve disabled until home plus 1 photo exist, inline reason lists what is missing. Never auto saves.
- Overflow: spec text wraps with full text on tap, merge candidate list caps at 5.
- Timing: home scan to sticker under 60s target, Approve tap under 5s after draft.

## Search `/search`

- Loading: skeleton rows with Searching items text.
- Empty: no results shows Try Bc547, Nano, 104 with Clear filters button.
- Error: index fail shows Search failed, retry, offline fallback still lists cached items.
- Offline: banner Offline, N cached items, results marked cached.
- Success: rows show photo thumb, name, home code, qty pill, borrowed rows show amber dot plus Borrowed.
- Disabled: voice mic disabled on unsupported browser with Type instead hint.
- Overflow: results paginate at 50, chips scroll horizontally.
- Timing: query to usable results under 10s per `perf.ts` budget search.

## Dues `/dues`

- Loading: skeleton rows ranked placeholder.
- Empty: No dues, lab is clean with link to issue.
- Error: load fail shows Could not load dues, retry.
- Offline: banner plus cached list with Last synced time.
- Success: overdue first ranking, each row member, item, days late, fine, Send reminder opens wa.me with prefilled text.
- Disabled: reminder disabled when phone missing, reason No phone on file shown.
- Overflow: list paginates at 50, desk adds project and coordinator columns.
- Timing: wa.me opens in under 5s on lab Android.

## Requests `/requests`

- Loading: queue skeleton cards.
- Empty: No pending requests with link to equipment support form.
- Empty states per status filter show matching copy, example No approved requests.
- Error: approve or reject fail shows Not saved, retry, card keeps state.
- Offline: decisions queue with clock icon, status pill shows Queued.
- Success: Approve shows budget cap warning inline when over cap, card moves to approved.
- Disabled: Approve disabled without coordinator role, reason shown. Reject requires note.
- Overflow: item lines cap at 5 with View all toggle, long names truncate.

## Timing harness

Use `mark`, `measure`, `timeOp` from `src/lib/perf.ts`. Budgets in ms:

| Flow | Budget | How to time |
|---|---|---|
| Search | 10000 | mark at query submit, measure at first usable row render |
| Issue | 30000 | mark at item scan, measure at success check |
| Return | 30000 | mark at item scan, measure at shelf verdict |
| Capture | 60000 target | mark at home scan, measure at sticker stuck |
| wa.me open | 5000 target | mark at reminder tap, measure at wa.me navigation |
| Offline reload | queue intact | queue 2 ops offline, reload, assert count still 2 |

Record device, net state, item, ms, pass or fail. Fail needs 3 reruns before sign off.

## Cross cutting

- Offline badge in header on every mutating screen: green Online, amber Offline, N queued.
- Status always icon plus text, never color alone.
- Sentence case, one verb per button. Zero placeholder as label.
- Focus rings visible, full keyboard path for issue and return on desk, live region announces Issue saved and Back online, N synced.
- 200 percent zoom safe, 320px width keeps pinned action reachable.

## Not building in V1

- Native Play Store app.
- Vision recognition for parts.
- Voice kiosk in lab.
- Biometric login.
- Solenoids or locks on bins.
- Whatsapp api auto bot, manual wa.me only.
- Billing and Gst.
- Bom and build orders.
- Purchase order workflow.
- Depreciation.
- Multi company scoping.
- Machine booking relay.
- Push notifications.
- Usb scanner support ships in V1.5, smart bins in V2.
