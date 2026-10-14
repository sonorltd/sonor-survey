# Survey — headless smoke tests (Playwright, container-run)

Run from a folder with `playwright` installed, with a static server on 127.0.0.1:8765 whose root contains `APP - Survey/`
(e.g. `cd Sonor && python3 -m http.server 8765`). Chromium path is the container's; swap `executablePath` for a local one.
All tests use the Bungalow Trial test project (`ce20bee2-…`, `metadata.is_test`).

| file | covers |
|---|---|
| smoke.mjs | boot · draw · erase · undo · offline queue |
| v2.mjs | pan sanity (bg clip) · image objects · checklist · report |
| v3–v5.mjs | landscape · history · Takeoffs link |
| v6.mjs | iPad touch: Devices palette taps always place · Select drags · Pin photo tool |
| v7.mjs | marks + photo pin + stroke → thumbnail + report PDF (marks rendered) |
| v8.mjs | Select tool: mark → mark → object reselect, drag, Esc, PDF builds |
| v9.mjs | v0.5.0 report: 5 pinned photos → P-tags on plan, icon legend, thumbnail grid, device schedule |
| tk*.mjs / plan.mjs / thumb.mjs | Takeoffs survey-ink layer against live Pages · plan page load · thumbnails |
| v10.mjs | v0.5.1: pins on a NOTES page → P-tags in app (labels, thumb badges, pin chip), Retake keeps id/pin/tag, Open P2 button, PDF with permanent cover |
| v11.mjs | v0.6.0: service-ordered palette, Text tool create/edit, Pins menu → RFI/client sheet + numbering, PDF pins lists, plan_notes mirror |
| v12.mjs | v0.7.0 field chrome: bars, finder search/filters, context strip per tool, More/Survey/page menus, saving sheet, Finish flow, Focus mode |
| ipad.mjs | v0.9.0: iPad landscape / portrait / iPhone viewports — scrollHeight == innerHeight (no page scroll), bar heights, screenshots |
| v13.mjs | v0.9.1: two devices on one survey — marks + stroke + new page arrive on the second within seconds (realtime) |
| v14.mjs | v0.10.0: Received photos sheet (pre-visit · from · via · notes) → credited notes page + categorised photo pages, badges, PDF labels |
| leena.mjs | v0.10.2: loads the live Leena (31 Prestbury Road) session — 1 notes + 2 plan (client-marked) + 6 pre-visit photo pages, screenshots each, builds the report |
| seed-leena-previsit.py | one-off data seed (2026-10-13): Takeoffs floors + client-marked KRA plans + credited pre-visit notes/photo pages written straight to Supabase in the app's own shapes. `--dry` previews, `--resume` re-uses uploads. Needs a local `.key` (anon) — never commit it |
| offline.mjs | v0.10.3: cold install → warm-up → **network off → refresh the deep link** — shell + vendor libs from the SW, project list from the device cache, session/pages/photos/plans from IndexedDB; draw offline (outbox), Remove-page confirm sheet, back online → outbox flushes, report builds with grouped contents |
| seed-woodbrook-previsit.py | one-off (2026-10-13): pre-visit session for ENQ - 1 Woodbrook Road — credited notes page (Deborah / OnTheGo, WhatsApp) + assessment checklist page with RFI 1–3 as pins; no plans / photos (walk-round job) |
| seed-woodbrook-footprint.py | one-off (2026-10-13): OSM building outline → 1:100 A3 footprint PDF (reportlab) → takeoffs_floors GF + active plan revision "OSM footprint (indicative)" + a survey plan page in the 14 Oct session. Pattern for any no-plans job: Nominatim lookup → api.openstreetmap.org/api/0.6/map bbox → outline in metres |
| seed-woodbrook-floors.py | one-off (2026-10-13): agent floorplan (J&H / Giraffe360, 2048 px, from Bryn) cropped per floor → 1:100 A3 sheets (woodbrook-plans/) → takeoffs_floors B / GF / 1F / 2F / EXT + active plan revisions; footprint demoted; survey plan pages 40–80 in the 14 Oct session. Scale basis: GF hallway 52'9" = 568 px → 35.3 px/m |
| ipad2.mjs | v0.10.4: iPad 12.9 landscape (1366 px, touch) on the Woodbrook GF plan — project bar collapses to one row (51 px), stage 823 px, plan sheet fills it |
| objects.mjs | v0.11.0: 🧱 Objects tool — 45 grouped chips (Fabric / M&E / Existing / Furniture / External / Hazard), place steel + 2 radiators + existing TV + a projector; marks carry kind 'object' in graphite; report shows DEVICE SCHEDULE (projector only) and SITE OBJECTS separately, per-page SITE OBJECTS ON THIS PAGE |
| strokes.mjs | v0.11.1 SMOOTH PEN: 12 lines of 120 points written back-to-back on the TEST project, PerformanceObserver longtask = [] through autosave + realtime echo; pan preview = CSS transform while the finger moves, cleared on lift |

**Rule (2026-10-14):** write-tests run on the Bungalow Trial test project (`ce20bee2…`) only — never a live job's session. A survey may be in progress on the iPad at that moment (Woodbrook was, 13:17 — the test strokes were on the GF plan for 90 s before cleanup; Bryn's 12 marks were untouched).
| taps.mjs | v0.11.2 (test project): Devices tool — clean tap places, drag / long-press never does, tap on a mark selects, second tap < 450 ms removes (undoable), slow re-tap keeps; stabiliser strong cuts a jittered path 1572 → 667 page units; 4 canvas layers (pred) |
| place.mjs | v0.11.3 (test project, synthetic pen/touch pointers): Pencil tap places · finger tap never places · finger drag on a mark moves it · finger drag on empty pans · Pencil tap on the same device selects (no stack) · second tap (pen or finger) removes · 🔒 off = one-shot back to pen · chip dragged UP onto the plan places (ghost) · sideways on a chip = strip scroll |
