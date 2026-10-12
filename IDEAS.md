# Survey — Integration ideas

## Data this app can provide
- `survey_pages` kind=plan: Pencil markups in the Takeoffs world frame per `floor_id` → Takeoffs can render them as a read-only "Survey ink" layer (B-TODO).
- `survey_pages` kind=photo: site photos with floor/room tags + the ink on them → Portal files / Tasks gallery / PM Brief "Site photos" card.
- `projects.metadata.survey_summary` (counts, last session, photo list with public URLs).
- Session timeline (`survey_sessions.started_at/ended_at`, engineer) → Board "last contact" (`SonorBoardLog.logContact({kind:'site'})` on survey close — §22).

## Data this app could consume
- Takeoffs rooms (`takeoffs_floors.content.areas`) → room picker on a page instead of free text; tap a room on the plan page to tag the page.
- `plan_notes` pickup items → a tick-list panel while on site.
- Leads / enquiries brief → first page pre-filled with the client's brief for the meeting.

## Requests to other projects
- Takeoffs: an optional "Survey ink" overlay layer per floor (read `survey_pages` where kind='plan' and floor_id = floor).
- Project Master brief.html: a "Site surveys" card from `metadata.survey_summary` (photos grid + link to the survey).
- Tasks: log the survey as a site visit (`kind:'site'`) when it closes.

## Later (v0.2+)
Handwriting → text (on-device OCR for a page), lasso move/resize, shapes/arrows/text boxes, page templates (cinema room sheet, rack survey sheet),
export a survey to PDF via `sonor-pdf-luxury.js`, dark paper option, Pencil double-tap → eraser (when Safari exposes it).
