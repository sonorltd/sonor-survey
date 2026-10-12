# Survey — Claude Code Context (v0.2.1)

> **Current version: 0.2.1** · **Spine version: 1.3** (SONOR-APP-SPINE.md — kit-served, graphite, SonorHeader; SonorShell adoption = B-318 sweep)
> Inherits: `../CLAUDE.md` (master rules) · Brand source: `../Branding - CORE/brand-core.xml`
> Born 2026-10-12 via `register-app.sh` (Bryn: "a survey app, essentially a notepad like Notability … Apple Pencil … markup plans during client meetings and site survey … link end to end for the project, with survey photos and plan markups, plus notes" — "a bit like Takeoffs in principle but a bit more basic").

## What this is
The iPad site-survey / client-meeting notepad. One survey = a `survey_sessions` row on a project; its pages are `survey_pages`
rows of five kinds — **blank / lined / grid** notes, **plan** (the ACTIVE Takeoffs plan for a floor, drawn on in the Takeoffs
world frame) and **photo** (camera / library → `site-photos`, drawn on). Ink is vector (pressure, palm rejection, highlighter,
stroke eraser, undo/redo). Offline-first: an IndexedDB outbox queues every write and flushes in order when signal returns.
Closing a survey (or ⬆ Publish) writes `projects.metadata.survey_summary` through the merge RPC, so the PM Brief page / Board
can show the survey + photos without this app.

## Architecture (MODULAR-FIRST)
`dashboard/sonor-survey.html` is a thin shell. App-local modules in `data/` (edit HERE — not synced masters):
| Module | Owns |
|---|---|
| `survey-config.js` | page spaces (note **1414×1000 landscape** by default, portrait toggle in the add menu · **plan 1400×900 = Takeoffs frame, never change** · photo = image px), pen palette (ink + 10 service colours), widths, session kinds |
| `survey-ink.js` | the ink engine — **objects layer** (images dropped / pasted / inserted: Select tool moves + corner-resizes, aspect locked, ⌫ removes, undo-able), static `SurveyInk.renderPage()` shared by thumbnails + the PDF, pan clamp (a scroll can never lose the page) — Pointer Events (pen draws; one finger pans, two pinch; `fingerDraws` opt-in; touch ignored 1.5 s after a pen contact = palm), coalesced events, pressure width, highlighter (multiply), stroke eraser, undo/redo, thumbnails. Direct-object: points stored in PAGE units, view transform only at render |
| `survey-store.js` | Supabase + IndexedDB (`sonor-survey` db: `outbox` / `cache` / `blobs`). Local-first writes; `page.ink` ops coalesce per page and are CAS on `survey_pages.version` with a stroke-level merge on conflict (union by stroke id minus erased ids); `publishSummary()` → `sonor_merge_project_metadata` |
| `survey-plan.js` | floors (`takeoffs_floors`) + active plan (`takeoffs_floor_plans` → signed URL from `takeoffs-plans`), pdf.js render, fit `k = min(1400/W, 900/H)` anchored top-left (identical to Takeoffs `loadBackgroundImage`), plan PNG cached in IDB for offline; photo downscale (EXIF-safe) |
| `survey-checklist.js` | checklist pages: template copy → `metadata.checklist` (ticks · answers · measurements · yes/no, add items on the spot), paper DOM sheet (Scribble-friendly) |
| `survey-pdf.js` | survey / meeting REPORT on `sonor-pdf-luxury.js` (cover with first photo as hero · summary + contents · one A4 per page via renderPage · checklist tick tables, paginated); WinAnsi-safe text (`pd`), tick drawn as a path (no ✓ glyph in Gilroy) |
| `survey-app.js` | UI: project bar → sessions → page strip → canvas; page meta (title / floor / room); add-page menu; camera inputs; autosave 1.2 s; sync chip |
| `sw.js` + `manifest.webmanifest` | installable PWA (Add to Home Screen on the iPad), app shell cached; Supabase never cached. `CACHE_VERSION` is bump site 2 |

## Data (SUPABASE-FIRST)
- `survey_sessions` (id, project_id → projects, title, kind survey|meeting|snag-walk|handover|other, status open|closed, engineer, started_at, ended_at, summary, metadata)
- `survey_pages` (id, session_id → sessions CASCADE, project_id, seq, kind blank|lined|grid|plan|photo, title, floor_id, floor_code, room, plan_ref jsonb {plan_id, storage_path, mime, page_index, revision_label, bucket}, photo_path, ink jsonb `{v, space:{w,h}, strokes:[{id,tool,c,w,t,pts:[[x,y,p]…]}]}`, thumb_path, **version** (CAS; `_survey_touch` trigger auto-bumps on an ink change that arrives without one — takeoffs_floors law), metadata)
- `survey_templates` (key, name, service_nn, kind checklist|questions, sort, active, items jsonb) — SSOT for checklists + client questions; 12 seeded 2026-10-12 (client questions, cinema, media room, audio, lighting, automation, climate, CCTV, network, infrastructure, takeover). Edit rows to change future pages; existing pages keep their copy.
- `survey_pages.ink.objects[]` = `{id, kind:'image', src, path, x, y, w, h, t}` — image blobs at `site-photos/{project}/survey/{session}/{objId}.jpg`, merged by id like strokes (removed ids ride the erase list).
- RLS: anon SELECT / INSERT / UPDATE, no DELETE. "Remove page" = `metadata.hidden = true`. Test rows carry `metadata.is_test` (§28).
- Storage: `site-photos/{project_id}/survey/{session_id}/{page_id}.jpg` (public bucket; URL via `getPublicUrl`). Plans are READ from `takeoffs-plans` only — this app never uploads a plan.
- Migrations: `survey_app_v0_1_0`, `survey_touch_split`, `survey_v0_2_0_checklists` (2026-10-12).

## Seams
- **Consumes:** `sonor-db.js`, `sonor-app.js` (`sonorSortFloors`), `sonor-brand.js`, `sonor-header.js`, `sonor-project-bar.js` (+ `sonor-project-list.js`, WQ bar), `sonor-icons.js`, `sonor-theme.js` + brand.css + served kit (§1/§2); `takeoffs_floors` / `takeoffs_floor_plans` / bucket `takeoffs-plans` (read-only); pdf.js 3.11.174 (same pin as Takeoffs).
- **Publishes:** `projects.metadata.survey_summary` `{sessions, last_session, pages:{notes,plans,photos}, photos:[{id,path,url,title,floor,room}], url}` (merge RPC only). PM Brief page / Board read it (card = B-xxx below).
- **Downstream (planned):** plan-page ink as a Takeoffs overlay layer (same floor_id + world frame — `survey_pages.kind='plan'` is already the record); photo pages into the Portal / Tasks galleries; note → `plan_notes` pickup / RFI promotion.

## Brand
- **Active theme: graphite** (GRAPHITE-FIRST). Paper (the page itself) is white in every theme — §11 document-preview law; app chrome never goes paper.
- Pen palette = ink + the 10 service colours (hex literals are allowed in the ink engine: they are DATA on the canvas, not chrome).
## Brand Overrides
None.

## Drawing model
**Drawing model: direct-object (ADAPTER_INVARIANTS)** — strokes are stored as page-unit points (plan pages = Takeoffs world frame), identity view transform at rest, rendering is the only place the view scale is applied. No Fabric; a page is one Canvas 2D stack (bg / ink / live). Round-trip = `survey_pages.ink` → `SurveyInk.setPage` → `thumbnail()` (smoke 2026-10-12: draw → reload → 2 strokes back, pinch does not draw, eraser removes by stroke, offline queue 2 → 0).

## Rules (app-specific)
1. Plan space 1400×900 + the top-left fit are Takeoffs' — changing either breaks the overlay seam.
2. Never write `survey_pages.version` by hand from the app except through `SurveyStore.applyInk` (CAS). Never delete; hide.
3. Camera input is `<input capture="environment">` — no getUserMedia (Safari PWA quirks). Photos are downscaled to 1600 px before they leave the device.
4. Stroke records are append-only with ids; erases are id lists — this is what makes offline merge safe. Do not re-index strokes.
5. Publish via the merge RPC only (never `UPDATE projects SET metadata`).

## Feature timeline
- **v0.2.1 (2026-10-12)** — header version badge (window.APP_VERSION + appVersion), thumbnail label = title (kind only when untitled); project-bar 1.11.1 / wq-bar 1.4.6 neutral pills via sync; PM brief.html v1.5.0 "Site surveys" card reads survey_sessions / survey_pages live.
- **v0.2.0 (2026-10-12)** — bg clip bug fixed (page 'scrolling around' / striped paper on Mac); landscape notes default; drop / paste / insert images as movable objects; checklist pages from `survey_templates` (12 templates); luxury PDF report (📄 Report). Headless-verified: pan sanity, object move / resize / delete / undo / cloud round-trip, checklist tick + value, 4-page report rasterised.
- **v0.1.0 (2026-10-12)** — born: sessions, five page kinds, Pencil ink engine, Takeoffs plan pages, photo pages → site-photos, IndexedDB outbox + CAS/merge sync, PWA shell, survey_summary publish. Smoke-tested headless (iPad Pro 11 profile) against SON-2026-BGTRL (is_test).

## Bump sites (5)
`dashboard/sonor-survey.html` `APP_VERSION` · `dashboard/sw.js` `CACHE_VERSION` · `data/survey-config.js` `version` · this banner · Supabase `app_versions` (`survey`).
