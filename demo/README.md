# Survey — sandboxed demo (31 Prestbury Road)

A shareable, self-contained demo of the Survey app on one example job. `demo-data/survey-demo.js` replaces the whole back end
with an in-memory stand-in for the Supabase client, seeded from `demo-data/demo-snapshot.json` (anonymised: "Private client",
no contact details, credits say "Client"). Photos and the two client-marked plans are static files in `assets/` (plans
pre-rasterised to JPEG, so no PDF rendering). No anon key, no project list, no cross-app links, no realtime, no service
worker — the red "Demo · nothing saves" tag says so. Drawing, devices, objects, pins, photos and the report all work locally.

- Hosted copy for a link: claude.ai artifact (published 2026-10-15) — file downloads (the report PDF) are inert there.
- GitHub Pages: https://sonorltd.github.io/sonor-survey/demo/ after push — everything works, incl. Export report.
- Refresh the snapshot: `tests/make-demo-snapshot.py` (reads the live project, scrubs, writes demo-data + assets).

The app files are loaded from `../data/` (the real ones) so the demo never drifts from the app.
