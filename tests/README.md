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
