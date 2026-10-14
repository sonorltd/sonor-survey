/* Sonor Survey — APP (app-local, v0.7.0 — field chrome: context strip, survey/more/page menus, saving state wording; was v0.6.0 — Text tool, 📌 Pins menu (RFI / client / note / snag / dim → Takeoffs plan_notes), service order, hi-res plans)
 * Shell + UI: project bar → sessions → pages (strip) → one ink canvas (or a checklist sheet). Takeoffs in principle, more basic.
 * v0.2.0: landscape notes, drop / paste / insert images as movable objects, checklist pages from survey_templates, luxury PDF report.
 */
(function () {
  'use strict';
  var CFG = window.__SURVEY_CONFIG__, $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  var supa, ink, S = { pid: null, project: null, sessions: [], session: null, pages: [], page: null, floors: null, erased: [], saveT: null, images: {}, bitmaps: {}, templates: null, portrait: false };
  try { S.portrait = localStorage.getItem('sonor_survey_portrait') === '1'; } catch (e) { }

  // ---------- boot ----------
  function boot() {
    var db = new window.SonorDB(); supa = db.client;
    window.SurveyStore.init(supa);
    var qp = new URLSearchParams(location.search).get('pid');
    if (qp && /^[0-9a-f-]{36}$/i.test(qp)) { try { localStorage.setItem('sonor_active_project_id::survey', qp); } catch (e) { } }
    window.SonorProjectBar.init({ supa: supa, appKey: 'survey', host: $('#projectBarHost') });
    document.addEventListener('sonor:project-changed', function (e) { onProject(e.detail.currentId, e.detail.project); });
    ink = window.SurveyInk.create({ host: $('#svCanvas'), onChange: onInk });
    ink.setColour(CFG.inks[0].c); ink.setWidth(CFG.widths[1].w);
    buildToolbar(); wireUi(); wireDrop();
    window.SurveyStore.onStatus(renderSync);
    if (window.SonorIcons) window.SonorIcons.auto(document.body);
    try { navigator.serviceWorker && navigator.serviceWorker.register('./sw.js'); } catch (e) { }
    var cur = null; try { cur = localStorage.getItem('sonor_active_project_id::survey'); } catch (e) { }
    if (cur && !S.pid) setTimeout(function () { if (!S.pid) onProject(cur, null); }, 800);
  }

  // ---------- project / sessions ----------
  async function onProject(pid, project) {
    if (!pid || pid === S.pid) return;
    S.pid = pid; S.project = project; S.session = null; S.pinFloor = null; S.page = null; S.floors = null; S.images = {};
    showEmpty();
    $('#svPages').innerHTML = '';
    S.sessions = await window.SurveyStore.listSessions(pid);
    renderSessions();
    // v0.8.0 deep links (sonor-survey-link.js): ?session=&page= open that page · ?action=new starts a survey — once, then forgotten
    var q = new URLSearchParams(location.search), want = S.deepOnce ? null : { session: q.get('session'), page: q.get('page'), action: q.get('action') }; S.deepOnce = true;
    if (want && want.action === 'new') { try { history.replaceState(null, '', location.pathname + '?pid=' + pid); } catch (e) { } return newSession(); }
    var open = (want && want.session && S.sessions.find(function (s) { return s.id === want.session; })) || S.sessions.find(function (s) { return s.status === 'open'; }) || S.sessions[0];
    if (open) await openSession(open.id);
    if (want && want.page && S.pages.some(function (p) { return p.id === want.page; })) openPage(want.page);
  }
  async function projectRow() {
    if (S.project && S.project.id === S.pid) return S.project;
    var PB = window.SonorProjectBar, bp = PB && PB.getProject ? PB.getProject(S.pid) : null; if (bp) { S.project = bp; return bp; }   // v0.10.3 offline: the bar's (cached) row first
    try { var r = await Promise.race([supa.from('projects').select('id,ref,name,client_name,address,postcode').eq('id', S.pid).maybeSingle(), new Promise(function (res) { setTimeout(function () { res({}); }, 6000); })]); if (r.data) S.project = r.data; } catch (e) { }
    return S.project || { id: S.pid, name: '' };
  }
  function renderSessions() {
    var sel = $('#svSession'); sel.innerHTML = '';
    if (!S.sessions.length) { sel.innerHTML = '<option value="">No surveys yet — + New</option>'; return; }
    S.sessions.forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = (s.status === 'closed' ? '✓ ' : '') + s.title + ' · ' + fmtDate(s.started_at) + (s.engineer ? ' · ' + s.engineer : ''); sel.appendChild(o); });
    if (S.session) sel.value = S.session.id;
  }
  async function newSession() {
    if (!S.pid) return toast('Pick a project first');
    var eng = ''; try { eng = localStorage.getItem('sonor_survey_engineer') || ''; } catch (e) { }
    var kind = $('#svKind').value || 'survey';
    var label = (CFG.sessionKinds.find(function (k) { return k[0] === kind; }) || ['', 'Site survey'])[1];
    var row = await window.SurveyStore.createSession(S.pid, { title: label + ' ' + fmtDate(new Date().toISOString()), kind: kind, engineer: eng || null });
    S.sessions.unshift(row); renderSessions(); await openSession(row.id);
    await addPage('blank');
  }
  async function openSession(sid) {
    S.session = S.sessions.find(function (s) { return s.id === sid; }) || null; if (!S.session) return;
    S.pinFloor = null; loadPinFloor();   // v0.7.0 pin numbers are project-wide — know the floor before the first pin lands
    $('#svSession').value = sid; $('#svKind').value = S.session.kind || 'survey';
    $('#svClose').textContent = S.session.status === 'closed' ? '↩ Reopen survey' : '✓ Complete survey';
    S.pages = (await window.SurveyStore.listPages(S.pid, sid)).filter(function (p) { return !(p.metadata && p.metadata.hidden); });
    renderStrip();
    window.SurveyStore.subscribePages(sid, onRemotePage);   // v0.9.1 — the iPad's marks land on the Mac (and back) as they are saved
    if (S.pages.length) openPage(S.pages[0].id); else showEmpty();
    warmOffline(sid);   // v0.10.3 pull this survey's photos + plans into IndexedDB while there is signal, so a refresh with none still shows every page
  }
  // v0.9.1 — a page row changed in the cloud (another device, or our own echo)
  async function onRemotePage(row, ev) {
    if (!row || !S.session || row.session_id !== S.session.id) return;
    var ST = window.SurveyStore, own = S.pages.find(function (x) { return x.id === row.id; });
    if ((row.version || 0) <= ST.knownVersion(row.id) && ev !== 'INSERT') { if (own && (row.version || 0) > (own.version || 0)) own.version = row.version; return; }   // our own write echoed back (or older): take the version for the next CAS base, never repaint
    ST.noteVersion(row.id, row.version);
    var p = S.pages.find(function (x) { return x.id === row.id; });
    if (row.metadata && row.metadata.hidden) { if (p) { S.pages = S.pages.filter(function (x) { return x !== p; }); renderStrip(); if (S.page === p) { S.page = null; if (S.pages.length) openPage(S.pages[0].id); else showEmpty(); } } return; }
    if (!p) { S.pages.push(row); renderStrip(); if (S.page) openPage(S.page.id); return; }
    var wasOpen = S.page === p, localDirty = wasOpen && !!S.saveT;
    var merged = row.ink;
    if (localDirty) { var pg = ink.getPage(); merged = ST.mergeInk(row.ink, { strokes: pg.strokes, objects: pg.objects, marks: pg.marks }, S.erased); }
    ['title', 'room', 'floor_code', 'metadata', 'version', 'photo_path'].forEach(function (k) { p[k] = row[k]; }); p.ink = merged;
    var el = thumbEl(p.id); if (el) thumbFor(p, el);
    if (wasOpen) {
      var pg2 = ink.getPage(), haveImgs = (merged.objects || []).every(function (o) { return o.kind !== 'image' || (pg2 && pg2.images && pg2.images[o.src]); });
      if (haveImgs && p.kind !== 'checklist') { ink.replaceContent(merged); renderPageMeta(); refreshTags(); }
      else openPage(p.id);
    } else renderStrip();
  }
  async function toggleClose() {
    if (!S.session) return;
    var closed = S.session.status !== 'closed';
    var patch = closed ? { status: 'closed', ended_at: new Date().toISOString() } : { status: 'open', ended_at: null };
    Object.assign(S.session, patch); await window.SurveyStore.updateSession(S.pid, S.session.id, patch);
    renderSessions(); $('#svClose').textContent = closed ? '↩ Reopen survey' : '✓ Complete survey';
    toast(closed ? 'Survey completed — summary published to the project' : 'Survey reopened');
    if (closed) setTimeout(function () { window.SurveyStore.publishSummary(S.pid); }, 1500);
  }

  // ---------- pages ----------
  function noteSpace() { return S.portrait ? CFG.spaces.notePortrait : CFG.spaces.note; }
  function nextSeq() { return S.pages.length ? Math.max.apply(null, S.pages.map(function (p) { return p.seq || 0; })) + 10 : 10; }
  async function addPage(kind, extra) {
    if (!S.session) { await newSession(); if (!S.session) return; if (kind === 'blank' && !extra) return; }
    var fields = Object.assign({ kind: kind, seq: nextSeq(), ink: { v: 1, space: kind === 'plan' ? CFG.spaces.plan : noteSpace(), strokes: [], objects: [] } }, extra || {});
    var row = await window.SurveyStore.createPage(S.pid, S.session.id, fields);
    S.pages.push(row); renderStrip(); await openPage(row.id);
    return row;
  }
  async function addPlanPage() {
    if (!S.pid) return toast('Pick a project first');
    if (!S.floors) S.floors = await window.SurveyPlan.listFloors(supa, S.pid);
    var items = [];
    for (var i = 0; i < S.floors.length; i++) { var f = S.floors[i], pl = await window.SurveyPlan.activePlan(supa, S.pid, f.floor_id); items.push({ floor: f, plan: pl }); }
    var body = document.createElement('div'); body.className = 'sv-floorlist';
    if (!items.length) body.innerHTML = '<p class="muted">No Takeoffs floors on this project yet. Add floors + plans in Takeoffs, or drop a photo of the drawing onto a blank page.</p>';
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-floor-btn'; b.disabled = !it.plan;
      b.innerHTML = '<b>' + esc(it.floor.code) + '</b> ' + esc(it.floor.name || '') + (it.plan ? ' <span class="muted">· ' + esc(it.plan.revision_label || '') + ' ' + esc(it.plan.filename || '') + '</span>' : ' <span class="muted">· no plan uploaded</span>');
      b.onclick = async function () { closeModal(); await addPage('plan', { floor_id: it.floor.floor_id, floor_code: it.floor.code, title: it.floor.name || it.floor.code, plan_ref: { plan_id: it.plan.id, storage_path: it.plan.storage_path, mime: it.plan.mime_type, page_index: it.plan.page_index || 1, revision_label: it.plan.revision_label, bucket: CFG.buckets.plans } }); };
      body.appendChild(b);
    });
    openModal('Plan page — which floor?', body);
  }
  async function addChecklistPage() {
    if (!S.pid) return toast('Pick a project first');
    if (!S.templates) S.templates = await window.SurveyStore.listTemplates();
    var body = document.createElement('div'); body.className = 'sv-floorlist';
    if (!S.templates.length) body.innerHTML = '<p class="muted">No templates available (offline and none cached). A blank checklist is still possible.</p>';
    S.templates.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-floor-btn'; if (t.service_nn) b.style.setProperty('--svc', svcColour(t.service_nn));
      b.innerHTML = (t.service_nn ? '<span class="sv-svc-dot"></span>' : '') + '<b>' + esc(t.name) + '</b> <span class="muted">· ' + (t.items || []).length + ' items</span>';
      b.onclick = async function () { closeModal(); var cl = window.SurveyChecklist.fromTemplate(t); await addPage('checklist', { title: t.name, metadata: { checklist: cl } }); };
      body.appendChild(b);
    });
    var blank = document.createElement('button'); blank.type = 'button'; blank.className = 'btn sv-floor-btn'; blank.innerHTML = '<b>Blank checklist</b> <span class="muted">· build it on the spot</span>';
    blank.onclick = async function () { closeModal(); await addPage('checklist', { title: 'Checklist', metadata: { checklist: { template_key: null, name: 'Checklist', kind: 'checklist', items: [] } } }); };
    body.appendChild(blank);
    openModal('Checklist — pick a template', body);
  }
  async function addPhotoPage(file, pin, extra) {   // extra: { category, credit:{from, via}, title }
    if (!file) return; extra = extra || {};
    var ph = await window.SurveyPlan.preparePhoto(file, CFG.spaces.photoMax, CFG.photoJpegQuality);
    var id = window.SurveyStore.uuid();
    if (!S.session) await newSession();
    var path = window.SurveyStore.photoPath(S.pid, S.session.id, id);
    await window.SurveyStore.blobSet('photo:' + id, ph.blob);
    var meta = { w: ph.w, h: ph.h, bytes: ph.blob.size }; if (pin) meta.plan_pin = pin; if (extra.category && extra.category !== 'survey') meta.category = extra.category; if (extra.credit) meta.credit = extra.credit;
    var catDef = (CFG.photoCategories || []).find(function (c) { return c.key === (extra.category || 'survey'); }), nSame = S.pages.filter(function (p) { return p.kind === 'photo' && ((p.metadata || {}).category || 'survey') === (extra.category || 'survey'); }).length + 1;
    var row = await addPage('photo', { id: id, photo_path: path, title: extra.title || ((catDef && catDef.short ? catDef.label + ' photo ' : 'Photo ') + nSame), floor_code: pin ? pin.floor_code : undefined, ink: { v: 1, space: { w: ph.w, h: ph.h }, strokes: [], objects: [] }, metadata: meta });
    await window.SurveyStore.stashPhoto(S.pid, S.session.id, id, ph.blob);
    return row;
  }
  // v0.10.0 — RECEIVED / PRE-VISIT photos: one sheet (category · from · via) then the library picker; every page carries the credit
  function openReceivedSheet() {
    if (!S.pid) return toast('Pick a project first');
    var body = document.createElement('div'); body.className = 'sv-recv';
    var last = {}; try { last = JSON.parse(localStorage.getItem('sonor_survey_recv') || '{}'); } catch (e) { }
    body.innerHTML = '<label>Category<select id="rcCat">' + (CFG.photoCategories || []).filter(function (c) { return c.key !== 'survey'; }).map(function (c) { return '<option value="' + c.key + '"' + (c.key === (last.category || 'pre-visit') ? ' selected' : '') + '>' + esc(c.label) + ' — ' + esc(c.hint) + '</option>'; }).join('') + '</select></label>' +
      '<label>From<input id="rcFrom" placeholder="Who sent them (e.g. Paul Murphy)" value="' + esc(last.from || '') + '"></label>' +
      '<label>Via<select id="rcVia">' + ['WhatsApp', 'Email', 'Text', 'AirDrop', 'Other'].map(function (v) { return '<option' + (v === (last.via || 'WhatsApp') ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></label>' +
      '<label>Notes they sent (paste the message)<textarea id="rcNotes" rows="4" placeholder="Anything they wrote with the photos — becomes a notes page in this survey, credited to them"></textarea></label>' +
      '<div class="sv-pin-actions"><span class="muted">Pick the photos next — one page each, titled "Pre-visit photo 1…", credited to the sender.</span><button type="button" class="btn" id="rcNotesOnly" title="Just the message, no photos">Save notes only</button><button type="button" class="btn btn-primary" id="rcGo">Choose photos…</button></div>';
    $('#rcNotesOnly', body).onclick = async function () { var o = { category: $('#rcCat', body).value, from: $('#rcFrom', body).value.trim(), via: $('#rcVia', body).value, notes: $('#rcNotes', body).value.trim() }; if (!o.notes) return toast('Paste their message first'); closeModal(); if (!S.session) await newSession(); await addReceivedNotes(o); };
    $('#rcGo', body).onclick = function () { var o = { category: $('#rcCat', body).value, from: $('#rcFrom', body).value.trim(), via: $('#rcVia', body).value, notes: $('#rcNotes', body).value.trim() }; try { localStorage.setItem('sonor_survey_recv', JSON.stringify(o)); } catch (e) { } S.pendingReceived = o; closeModal(); $('#svPhotoLib').click(); };
    openModal('Received photos', body); setTimeout(function () { $('#rcFrom', body).focus(); }, 30);
  }
  // the sender's message → a NOTES page (blank paper + one text object), credited in the title and in metadata, so it prints in the report and can be marked up
  async function addReceivedNotes(rc) {
    var cd = (CFG.photoCategories || []).find(function (c) { return c.key === rc.category; }) || { label: 'Received' };
    var title = cd.label + ' notes' + (rc.from ? ' — ' + rc.from : '') + (rc.via ? ' (' + rc.via + ')' : '');
    var sp = CFG.spaces.note, size = CFG.textSizes.M, lines = rc.notes.split(/\r?\n/).length;
    var row = await addPage('blank', { title: title, metadata: { category: rc.category, credit: { from: rc.from || null, via: rc.via || null }, received_notes: true }, ink: { v: 1, space: sp, strokes: [], marks: [], objects: [{ id: 't_' + window.SurveyStore.uuid().replace(/-/g, '').slice(0, 12), kind: 'text', text: rc.notes, size: size, c: '#141414', x: 60, y: 60, w: sp.w - 120, h: Math.round(lines * size * 1.25), t: Date.now() }] } });
    return row;
  }
  // image dropped / pasted / inserted → an OBJECT on the current page (or a new blank page if none)
  async function insertImage(file, at) {
    if (!file || !/^image\//.test(file.type)) return;
    if (!S.page || S.page.kind === 'checklist') { await addPage('blank'); }
    var pg = ink.getPage(); if (!pg) return;
    var ph = await window.SurveyPlan.preparePhoto(file, CFG.spaces.objectMax, CFG.photoJpegQuality);
    var id = 'o_' + window.SurveyStore.uuid().replace(/-/g, '').slice(0, 12);
    await window.SurveyStore.blobSet('photo:' + id, ph.blob);
    var bm = await window.SurveyPlan.loadBitmap(ph.blob); pg.images[id] = bm; S.bitmaps[id] = bm;
    var w = Math.min(pg.space.w * 0.42, ph.w), h = w * ph.h / ph.w;
    var c = at || ink.viewCentrePage(); var x = Math.max(0, Math.min(pg.space.w - w, c[0] - w / 2)), y = Math.max(0, Math.min(pg.space.h - h, c[1] - h / 2));
    ink.setTool('select'); setToolBtn('select');
    ink.addObject({ id: id, kind: 'image', src: id, path: window.SurveyStore.photoPath(S.pid, S.session.id, id), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    await window.SurveyStore.stashPhoto(S.pid, S.session.id, id, ph.blob);
  }
  // The ONE pin record shared with Tasks snags / Portal / Takeoffs 📌 Pin Photo (plan_pin): page units ARE Takeoffs canvas units.
  function pinFor(planPage, mark) {
    var sp = planPage.ink.space, pr = planPage.plan_ref || {};
    return { source: 'survey', project_id: S.pid, floor_id: planPage.floor_id || null, floor_code: planPage.floor_code || null, plan_id: pr.plan_id || null, sheet_revision: pr.revision_label || null,
      x_pct: Math.round(mark.x / sp.w * 10000) / 10000, y_pct: Math.round(mark.y / sp.h * 10000) / 10000, canvas_x: mark.x, canvas_y: mark.y,
      page_id: planPage.id, session_id: S.session.id, mark_id: mark.id, mark_code: mark.code, timestamp: new Date().toISOString() };
  }
  async function photoAtMark(file, markId) {
    var plan = S.page, mk = (ink.getPage().marks || []).find(function (m) { return m.id === markId; }); if (!plan || !mk) return addPhotoPage(file);
    var pin = pinFor(plan, mk), planId = plan.id;
    var row = await addPhotoPage(file, pin);          // opens the photo page
    if (row) { var pp = S.pages.find(function (x) { return x.id === planId; }); if (pp) { var m2 = (pp.ink.marks || []).find(function (m) { return m.id === markId; }); if (m2) { m2.photo_page_id = row.id; await window.SurveyStore.saveInk(S.pid, S.session.id, pp, []); var el = thumbEl(pp.id); if (el) thumbFor(pp, el); } } }
    return row;
  }
  // ---------- photo tags (P1…Pn) — one numbering for app, thumbnails, PDF ----------
  function tags() { return window.SurveyInk.photoTags(S.pages); }
  function refreshTags() {
    var t = tags(); S.tags = t;
    if (ink && ink.setLabels) ink.setLabels(t.tag);
    $$('#svPages .sv-thumb').forEach(function (el) { var p = S.pages.find(function (x) { return x.id === el.dataset.id; }); if (!p) return; var cd = (CFG.photoCategories || []).find(function (c) { return c.key === ((p.metadata || {}).category || 'survey'); }), cb = $('.sv-thumb-cat', el); if (p.kind === 'photo' && cd && cd.short) { if (!cb) { cb = document.createElement('span'); cb.className = 'sv-thumb-cat'; $('.sv-thumb-img', el).appendChild(cb); } cb.textContent = cd.short; } else if (cb) cb.remove(); var tg = $('.sv-thumb-tag', el); if (p.kind === 'photo' && t.tag[p.id]) { if (!tg) { tg = document.createElement('span'); tg.className = 'sv-thumb-tag'; $('.sv-thumb-img', el).appendChild(tg); } tg.textContent = t.tag[p.id]; } else if (tg) tg.remove(); });
    if (S.page) renderPinChip();
    return t;
  }
  // Replace a photo page's image (retake / change) — same page id, same pin, same tag; ink kept when the frame matches
  async function replacePhoto(pageId, file) {
    var p = S.pages.find(function (x) { return x.id === pageId; }); if (!p || !file) return;
    var ph = await window.SurveyPlan.preparePhoto(file, CFG.spaces.photoMax, CFG.photoJpegQuality);
    var same = p.ink && p.ink.space && p.ink.space.w === ph.w && p.ink.space.h === ph.h, hadInk = ((p.ink.strokes || []).length + (p.ink.objects || []).length) > 0;
    if (!same && hadInk && !confirm('The new photo is a different shape — the markup on this photo will be cleared. Continue?')) return;
    if (S.page === p) { S.noFlushOnce = true; }
    delete S.bitmaps[p.id];
    await window.SurveyStore.blobSet('photo:' + p.id, ph.blob);
    var meta = Object.assign({}, p.metadata || {}, { w: ph.w, h: ph.h, bytes: ph.blob.size, replaced_at: new Date().toISOString() });
    var ink2 = same ? p.ink : { v: 1, space: { w: ph.w, h: ph.h }, strokes: [], objects: [], marks: [] };
    p.metadata = meta; p.ink = ink2;
    await window.SurveyStore.updatePage(S.pid, S.session.id, p.id, { metadata: meta, ink: ink2 });
    await window.SurveyStore.stashPhoto(S.pid, S.session.id, p.id, ph.blob);
    var el = thumbEl(p.id); if (el) thumbFor(p, el);
    if (S.page === p) await openPage(p.id);
    var pb = (S.tags || tags()).pinnedBy[p.id]; if (pb) { var pp = S.pages.find(function (x) { return x.id === pb.pageId; }); var el2 = pp && thumbEl(pp.id); if (el2) thumbFor(pp, el2); }
    toast('Photo replaced');
  }
  // ---------- v0.6.0 TEXT tool — a floating editor over the page; commits as a text OBJECT (SonorInk paints it everywhere) ----------
  function textSize() { var a = $('.sv-w.active'); return CFG.textSizes[(a && a.textContent) || 'M'] || 32; }
  function activeColour() { var a = $('.sv-swatch.active'); return (a && a.dataset.c) || '#141414'; }
  function openTextEditor(obj, pt) {
    closeTextEditor(true);
    var pg = ink.getPage(); if (!pg) return;
    var ed = document.createElement('textarea'); ed.className = 'sv-text-ed'; ed.placeholder = 'Type… (Enter = done, Shift+Enter = new line)'; ed.value = obj ? obj.text : '';
    var size = obj ? obj.size : textSize(), c = obj ? obj.c : activeColour(), x = obj ? obj.x : pt[0], y = obj ? obj.y : pt[1], w = obj ? obj.w : Math.min(pg.space.w - x - 10, 520);
    var r = ink.pageToScreen ? ink.pageToScreen(x, y) : null, host = $('#svCanvas').getBoundingClientRect();
    var sc = ink.getScale ? ink.getScale() : 1;
    ed.style.left = ((r ? r[0] : host.width / 2) ) + 'px'; ed.style.top = ((r ? r[1] : host.height / 2)) + 'px'; ed.style.width = Math.max(160, w * sc) + 'px'; ed.style.fontSize = Math.max(12, size * sc) + 'px'; ed.style.color = c;
    S.textEd = { el: ed, obj: obj, x: x, y: y, w: w, size: size, c: c, at: Date.now() };
    ed.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeTextEditor(); } else if (e.key === 'Escape') { e.preventDefault(); closeTextEditor(true); } e.stopPropagation(); };
    ed.onblur = function () { if (S.textEd && S.textEd.el === ed && Date.now() - S.textEd.at < 400) { setTimeout(function () { try { ed.focus(); } catch (e) { } }, 0); return; } setTimeout(function () { if (S.textEd && S.textEd.el === ed) closeTextEditor(); }, 80); };
    $('#svCanvas').appendChild(ed); ed.focus();
  }
  function closeTextEditor(cancel) {
    var te = S.textEd; if (!te) return; S.textEd = null; var txt = te.el.value.replace(/\s+$/, ''); te.el.remove();
    if (cancel) return;
    if (te.obj) { if (!txt) ink.select(te.obj.id), ink.removeSelected(); else if (txt !== te.obj.text) ink.updateObject(te.obj.id, { text: txt }); return; }
    if (!txt) return;
    var lines = txt.split('\n').length;
    ink.addObject({ id: 't_' + window.SurveyStore.uuid().replace(/-/g, '').slice(0, 12), kind: 'text', text: txt, size: te.size, c: te.c, x: Math.round(te.x), y: Math.round(te.y), w: Math.round(te.w), h: Math.round(lines * te.size * 1.25) });
    ink.select(null);
  }
  // ---------- v0.6.0 PINS (RFI / client / note / snag / dim) — numbered per type across the session; text via a sheet ----------
  // numbered per PROJECT (RFI 7 stays RFI 7 across survey sessions — it's the same RFI in Takeoffs Plan Notes): session pages + the published summary of earlier sessions
  function nextPinNumber(kind) { var n = 0; (S.pinFloor && S.pinFloor[kind]) && (n = S.pinFloor[kind]); S.pages.forEach(function (p) { ((p.ink && p.ink.marks) || []).forEach(function (m) { if (m.kind === 'pin' && m.pin === kind && m.n > n) n = m.n; }); }); var pg = ink.getPage(); ((pg && pg.marks) || []).forEach(function (m) { if (m.kind === 'pin' && m.pin === kind && m.n > n) n = m.n; }); return n + 1; }
  async function loadPinFloor() {   // highest pin number per type already published for this project (other sessions)
    S.pinFloor = {}; try { var r = await Promise.race([supa.from('projects').select('metadata').eq('id', S.pid).maybeSingle(), new Promise(function (res) { setTimeout(function () { res({}); }, 6000); })]); var pins = (r.data && r.data.metadata && r.data.metadata.survey_summary && r.data.metadata.survey_summary.pins) || []; pins.forEach(function (q) { if (!S.session || q.session_id !== S.session.id) S.pinFloor[q.pin] = Math.max(S.pinFloor[q.pin] || 0, q.n || 0); }); } catch (e) { }
  }
  function pinDef(kind) { return CFG.pins.find(function (p) { return p.pin === kind; }); }
  function pinLabel(m) { return ((window.SonorInk && window.SonorInk.PIN_LABEL[m.pin]) || 'PIN') + (m.n ? ' ' + m.n : ''); }
  function openPinSheet(mark) {
    var d = pinDef(mark.pin) || {}, body = document.createElement('div'); body.className = 'sv-pin-sheet';
    body.innerHTML = '<p class="muted">' + esc(d.hint || '') + '</p><textarea class="sv-pin-text" rows="3" placeholder="' + esc(d.label || 'Pin') + ' — what\'s the note?"></textarea>' +
      (d.pin === 'rfi' ? '<input class="sv-pin-to" placeholder="To (architect / client / contractor)">' : '') +
      '<div class="sv-pin-actions"><button type="button" class="btn sv-pin-cancel">Remove pin</button><button type="button" class="btn btn-primary sv-pin-ok">Save ' + esc(pinLabel(mark)) + '</button></div>';
    var ta = $('.sv-pin-text', body), to = $('.sv-pin-to', body); ta.value = mark.text || ''; if (to) to.value = mark.to || '';
    $('.sv-pin-ok', body).onclick = function () { var patch = { text: ta.value.trim() }; if (to) patch.to = to.value.trim() || null; ink.updateMark(mark.id, patch); closeModal(); refreshMarkUi(); };
    $('.sv-pin-cancel', body).onclick = function () { closeModal(); if (!mark.text && !ta.value.trim()) ink.removeMark(mark.id); };
    ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.sv-pin-ok', body).click(); } e.stopPropagation(); };
    openModal(pinLabel(mark) + ' · ' + (d.label || ''), body); setTimeout(function () { ta.focus(); }, 30);
  }
  function refreshMarkUi() {
    var mk = ink.selectedMark && ink.selectedMark();
    $('#svMarkPhoto').hidden = !mk; $('#svMarkOpen').hidden = !(mk && mk.photo_page_id);
    if (mk) { var has = !!(mk.photo_page_id && S.pages.some(function (x) { return x.id === mk.photo_page_id; })); $('#svMarkPhoto .lbl').textContent = has ? 'Retake' : 'Photo here'; $('#svMarkPhoto').title = has ? 'Retake the photo pinned here (keeps the pin + tag)' : 'Take a photo pinned to the selected mark'; var tg = has && S.tags && S.tags.tag[mk.photo_page_id]; $('#svMarkOpen .lbl').textContent = tg ? 'Open ' + tg : 'Pinned photo'; }
    $('#svDelObj').hidden = !((ink.getTool() === 'select' || ink.getTool() === 'mark') && (ink.selected() || mk));
    var isPin = !!(mk && mk.kind === 'pin'); $('#svPinEdit').hidden = !isPin; if (isPin) $('#svPinEdit .lbl').textContent = 'Edit ' + pinLabel(mk); if (mk && mk.kind === 'pin') { $('#svMarkPhoto').hidden = false; }
    var so = ink.selected && ink.selected(); $('#svTextEdit').hidden = !(so && so.kind === 'text');
  }
  // v0.10.3 OFFLINE WARM-UP — the thumbnails already touch every page, but a photo taken on the other device or a plan not
  // yet opened here would be missing with no signal. Idle-time, one at a time, never blocks the pen.
  async function warmOffline(sid) {
    if (!navigator.onLine) return;
    var list = S.pages.slice();
    for (var i = 0; i < list.length; i++) {
      var p = list[i]; if (!S.session || S.session.id !== sid) return;
      try {
        if (p.kind === 'photo' && p.photo_path && !S.bitmaps[p.id] && !(await window.SurveyStore.photoBlob(p.id))) await imageFor(p.id, p.photo_path);
        else if (p.kind === 'plan' && p.plan_ref && !S.images['plan:' + p.plan_ref.plan_id]) { var key = 'plan:' + p.plan_ref.plan_id; S.images[key] = await window.SurveyPlan.loadImage(supa, { id: p.plan_ref.plan_id, storage_path: p.plan_ref.storage_path, mime_type: p.plan_ref.mime, filename: '', page_index: p.plan_ref.page_index }); }
      } catch (e) { }
      await new Promise(function (r) { setTimeout(r, 250); });
    }
  }
  async function imageFor(key, path) {
    if (S.bitmaps[key]) return S.bitmaps[key];
    var blob = await window.SurveyStore.photoBlob(key);
    if (!blob && path) { try { var r = await fetch(window.SurveyStore.photoUrl(path)); if (r.ok) { blob = await r.blob(); try { await window.SurveyStore.blobSet('photo:' + key, blob); } catch (e) { } } } catch (e) { } }
    if (!blob) return null;
    var bm = await window.SurveyPlan.loadBitmap(blob); S.bitmaps[key] = bm; return bm;
  }
  // Everything the renderer needs for a page row: background image (plan / photo) + object bitmaps
  async function pageModel(p) {
    var m = { space: p.ink.space, strokes: p.ink.strokes || [], objects: p.ink.objects || [], marks: p.ink.marks || [], images: {}, paper: p.kind, image: null, imageFit: null, labels: (S.tags || tags()).tag };
    try {
      if (p.kind === 'plan' && p.plan_ref) {
        var key = 'plan:' + p.plan_ref.plan_id;
        if (!S.images[key]) S.images[key] = await window.SurveyPlan.loadImage(supa, { id: p.plan_ref.plan_id, storage_path: p.plan_ref.storage_path, mime_type: p.plan_ref.mime, filename: '', page_index: p.plan_ref.page_index });
        m.image = S.images[key].image; m.imageFit = S.images[key].fit; m.paper = 'image';
      } else if (p.kind === 'photo') { var bm = await imageFor(p.id, p.photo_path); if (bm) { m.image = bm; m.imageFit = { x: 0, y: 0, w: p.ink.space.w, h: p.ink.space.h }; m.paper = 'image'; } }
    } catch (e) { console.warn('[Survey] page image', e.message); }
    for (var i = 0; i < m.objects.length; i++) { var o = m.objects[i]; try { var b = await imageFor(o.src, o.path); if (b) m.images[o.src] = b; } catch (e) { } }
    return m;
  }
  function showEmpty() { $('#svEmpty').hidden = false; $('#svCanvas').hidden = true; $('#svCheck').hidden = true; }
  async function openPage(id) {
    flushSave();
    var p = S.pages.find(function (x) { return x.id === id; }); if (!p) return;
    S.page = p; S.erased = [];
    $('#svEmpty').hidden = true;
    $$('#svPages .sv-thumb').forEach(function (el) { el.classList.toggle('active', el.dataset.id === id); });
    renderPageMeta();
    if (p.kind === 'checklist') {
      $('#svCanvas').hidden = true; $('#svCheck').hidden = false;
      window.SurveyChecklist.mount($('#svCheck'), p, { onChange: function (cl) { var meta = Object.assign({}, p.metadata || {}, { checklist: cl }); p.metadata = meta; window.SurveyStore.updatePage(S.pid, S.session.id, p.id, { metadata: meta }); var el = thumbEl(p.id); if (el) thumbFor(p, el); } });
      return;
    }
    $('#svCheck').hidden = true; $('#svCanvas').hidden = false;
    var m = await pageModel(p);
    if (S.page !== p) return;
    if (!m.image && (p.kind === 'photo' || p.kind === 'plan')) toast('Could not load the ' + p.kind + ' image' + (navigator.onLine ? '' : ' (offline)'));
    ink.setPage(m); updateUndo(); refreshTags();
  }
  function thumbEl(id) { return $$('#svPages .sv-thumb').find(function (e) { return e.dataset.id === id; }); }
  function renderStrip() {
    var host = $('#svPages'); host.innerHTML = '';
    S.pages.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); }).forEach(function (p) {
      var el = document.createElement('div'); el.className = 'sv-thumb' + (S.page && S.page.id === p.id ? ' active' : ''); el.dataset.id = p.id;
      var lbl = p.title || (p.kind === 'checklist' ? ((p.metadata || {}).checklist || {}).name : null) || (p.floor_code ? p.floor_code : null);   // v0.2.1: the title replaces the kind, not prefixes it
      el.innerHTML = '<div class="sv-thumb-img"><img alt=""></div><div class="sv-thumb-lbl">' + (lbl ? esc(lbl) : '<span class="sv-thumb-kind">' + esc(p.kind) + '</span>') + '</div>';
      el.onclick = function () { openPage(p.id); };
      host.appendChild(el); thumbFor(p, el);
    });
    refreshTags();
    var add = document.createElement('button'); add.type = 'button'; add.className = 'btn sv-thumb-add'; add.textContent = '＋ Page'; add.onclick = function (e) { openAddMenu(e.currentTarget); };
    host.appendChild(add);
  }
  async function thumbFor(p, el) {
    var img = $('img', el); if (!img) return;
    if (p.kind === 'checklist') {
      var pr = window.SurveyChecklist.progress((p.metadata || {}).checklist); var c = document.createElement('canvas'); c.width = 120; c.height = 85; var x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 120, 85); x.fillStyle = '#1a1814'; x.font = 'bold 11px DM Sans, sans-serif'; x.fillText('☑ ' + pr.done + ' / ' + pr.total, 10, 22);
      x.strokeStyle = '#c9d3e6'; for (var i = 0; i < 4; i++) { x.beginPath(); x.moveTo(10, 36 + i * 12); x.lineTo(110, 36 + i * 12); x.stroke(); }
      img.src = c.toDataURL('image/png'); return;
    }
    var m = await pageModel(p); img.src = window.SurveyInk.renderPage(m, null, 120, { minStroke: 2.5 }).toDataURL('image/png');
  }
  function renderPageMeta() {
    var p = S.page; $('#svTitle').value = p.title || ''; $('#svRoom').value = p.room || '';
    var fl = $('#svFloor'); fl.innerHTML = '<option value="">Floor</option>';
    (S.floors || []).forEach(function (f) { var o = document.createElement('option'); o.value = f.code; o.textContent = f.code + (f.name ? ' · ' + f.name : ''); fl.appendChild(o); });
    if (p.floor_code && !$$('option', fl).some(function (o) { return o.value === p.floor_code; })) { var o = document.createElement('option'); o.value = p.floor_code; o.textContent = p.floor_code; fl.appendChild(o); }
    fl.value = p.floor_code || ''; fl.disabled = p.kind === 'plan';
    renderPinChip();
    var isPhoto = p.kind === 'photo'; $('#svPhotoRetake').hidden = !isPhoto; $('#svPhotoChange').hidden = !isPhoto;
    var pc2 = $('#svPhotoCat'), pf = $('#svPhotoFrom'); pc2.hidden = !isPhoto; pf.hidden = !isPhoto;
    if (isPhoto) { if (!pc2.options.length) (CFG.photoCategories || []).forEach(function (c) { var o = document.createElement('option'); o.value = c.key; o.textContent = c.label; o.title = c.hint; pc2.appendChild(o); }); pc2.value = (p.metadata || {}).category || 'survey'; var cr = (p.metadata || {}).credit || {}; pf.value = [cr.from, cr.via].filter(Boolean).join(' · '); }
    if (!S.floors && S.pid) window.SurveyPlan.listFloors(supa, S.pid).then(function (f) { S.floors = f; if (S.page === p) renderPageMeta(); });
  }
  function renderPinChip() {
    var p = S.page, pc = $('#svPinChip'); if (!p) { pc.hidden = true; return; }
    var t = S.tags || tags(), tg = p.kind === 'photo' ? t.tag[p.id] : null, pb = t.pinnedBy[p.id], pin = p.metadata && p.metadata.plan_pin;
    pc.hidden = !(tg || pin);
    if (pc.hidden) return;
    var where = pb ? S.pages.find(function (x) { return x.id === pb.pageId; }) : null;
    pc.textContent = (tg ? tg : '') + (pin || where ? (tg ? ' · ' : '') + '📍 ' + (where ? (where.title || where.floor_code || (where.kind === 'plan' ? 'Plan' : 'Notes')) : (pin.floor_code || 'plan')) + (pin && pin.mark_code && pin.mark_code !== 'photo' ? ' · ' + pin.mark_code.toUpperCase() : '') : '');
    pc.title = pb ? 'Pinned on ' + (where ? (where.title || where.floor_code || 'page') : 'the plan') + ' — tap to jump to the pin' : 'Photo ' + tg;
    pc.onclick = function () { var dest = (pb && pb.pageId) || (pin && pin.page_id), mid = (pb && pb.markId) || (pin && pin.mark_id); if (dest) openPage(dest).then(function () { if (mid) { setTool('select'); ink.selectMark(mid); refreshMarkUi(); } }); };
  }
  function savePageMeta() {
    if (!S.page) return;
    var patch = { title: $('#svTitle').value.trim() || null, room: $('#svRoom').value.trim() || null };
    if (S.page.kind !== 'plan') patch.floor_code = $('#svFloor').value || null;
    if (S.page.kind === 'photo') {   // v0.10.0 category + credit live in metadata (merge, never replace)
      var cat = $('#svPhotoCat').value || 'survey', raw = $('#svPhotoFrom').value.trim(), parts = raw.split(/\s*[·|,]\s*/), credit = raw ? { from: parts[0] || null, via: parts[1] || null } : null;
      var meta = Object.assign({}, S.page.metadata || {}); if (cat === 'survey') delete meta.category; else meta.category = cat; if (credit) meta.credit = credit; else delete meta.credit;
      if (JSON.stringify(meta) !== JSON.stringify(S.page.metadata || {})) patch.metadata = meta;
    }
    var changed = Object.keys(patch).some(function (k) { return k === 'metadata' || (S.page[k] || null) !== patch[k]; }); if (!changed) return;
    Object.assign(S.page, patch); window.SurveyStore.updatePage(S.pid, S.session.id, S.page.id, patch); renderStrip();
  }
  async function hidePage() {
    if (!S.page) return;
    var p = S.page, meta = Object.assign({}, p.metadata || {}, { hidden: true, hidden_at: new Date().toISOString() });
    await window.SurveyStore.updatePage(S.pid, S.session.id, p.id, { metadata: meta });
    if (p.kind === 'photo') { S.pages.forEach(function (x) { var hit = ((x.ink && x.ink.marks) || []).filter(function (m) { return m.photo_page_id === p.id; }); if (hit.length) { hit.forEach(function (m) { delete m.photo_page_id; }); window.SurveyStore.saveInk(S.pid, S.session.id, x, []); } }); }
    S.pages = S.pages.filter(function (x) { return x.id !== p.id; }); S.page = null; renderStrip();
    if (S.pages.length) openPage(S.pages[0].id); else showEmpty();
    toast('Page removed');
  }

  // ---------- ink → autosave ----------
  function onInk(op) {
    if (!S.page) return;
    if (op.type === 'text-tap') { setTimeout(function () { openTextEditor(op.object, op.pt); }, 30); return; }   // after the pointer sequence, so the tap's own focus change can't blur the editor
    if (op.type === 'erase') op.ids.forEach(function (id) { S.erased.push(id); });
    if (op.type === 'add') { var i = S.erased.indexOf(op.stroke.id); if (i >= 0) S.erased.splice(i, 1); }
    if (op.type === 'object') { if (op.action === 'remove') S.erased.push(op.object.id); else { var j = S.erased.indexOf(op.object.id); if (j >= 0) S.erased.splice(j, 1); } }
    if (op.type === 'mark') { if (op.action === 'remove') S.erased.push(op.mark.id); else { var k = S.erased.indexOf(op.mark.id); if (k >= 0) S.erased.splice(k, 1); }
      if (op.action === 'add' && op.mark.kind === 'photo' && !op.undo && !op.mark.photo_page_id) { S.pendingPhotoMark = op.mark.id; setTimeout(function () { $('#svPhotoIn').click(); }, 50); }
      if (op.action === 'add' && op.mark.kind === 'pin' && !op.undo && !op.mark.n) { op.mark.n = nextPinNumber(op.mark.pin); setTimeout(function () { openPinSheet(op.mark); }, 30); }
      refreshMarkUi(); }
    updateUndo(); $('#svDelObj').hidden = !(ink.getTool() === 'select' && ink.selected());
    clearTimeout(S.saveT); S.saveT = setTimeout(flushSave, CFG.autosaveMs);
  }
  function flushSave() {
    clearTimeout(S.saveT); if (S.noFlushOnce) { S.noFlushOnce = false; return; }
    if (!S.page || !S.session || S.page.kind === 'checklist') return;
    var pg = ink.getPage(); if (!pg) return;
    S.page.ink = { v: 1, space: pg.space, strokes: pg.strokes, objects: (pg.objects || []).map(function (o) { return o.kind === 'text' ? { id: o.id, kind: 'text', text: o.text, size: o.size, c: o.c, x: o.x, y: o.y, w: o.w, h: o.h, t: o.t } : { id: o.id, kind: o.kind, src: o.src, path: o.path, x: o.x, y: o.y, w: o.w, h: o.h, t: o.t }; }), marks: pg.marks || [] };
    var er = S.erased; S.erased = [];
    window.SurveyStore.saveInk(S.pid, S.session.id, S.page, er);
    queueThumb(S.page);
  }
  // v0.11.1 SMOOTH PEN — the thumbnail used to be rendered right inside the autosave (1.2 s after the last stroke): a full page
  // render + toDataURL on the main thread, landing exactly when the next line was being written. Now it waits for the pen to
  // lift, then for an idle slot, and never more than one render in flight.
  function queueThumb(p) {
    clearTimeout(S.thumbT);
    S.thumbT = setTimeout(function tick() {
      if (ink.isDrawing && ink.isDrawing()) { S.thumbT = setTimeout(tick, 400); return; }
      var run = function () { var el = thumbEl(p.id); if (el) thumbFor(p, el); };
      if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 4000 }); else setTimeout(run, 250);
    }, 600);
  }
  window.addEventListener('pagehide', flushSave); document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });

  // ---------- history (survey_page_history — every superseded version, trigger-written) ----------
  async function showHistory() {
    if (!S.page) return; if (!navigator.onLine) return toast('History needs a connection');
    flushSave(); await window.SurveyStore.flush();
    var rows = await window.SurveyStore.listHistory(S.page.id), p = S.page;
    try { var vr = await supa.from('survey_pages').select('version').eq('id', p.id).maybeSingle(); if (vr.data) p.version = vr.data.version; } catch (e) { }
    var body = document.createElement('div'); body.className = 'sv-floorlist';
    var cur = document.createElement('div'); cur.className = 'muted'; cur.textContent = 'Current: v' + (p.version || 1) + ' · ' + ((p.ink.strokes || []).length) + ' strokes · ' + ((p.ink.objects || []).length) + ' images' + (p.plan_ref && p.plan_ref.revision_label ? ' · plan ' + p.plan_ref.revision_label : ''); body.appendChild(cur);
    if (!rows.length) { var e = document.createElement('p'); e.className = 'muted'; e.textContent = 'No earlier versions yet — every save from now on is kept.'; body.appendChild(e); }
    rows.forEach(function (h) {
      var b = document.createElement('div'); b.className = 'sv-hist';
      var cl = h.checklist ? window.SurveyChecklist.progress(h.checklist) : null;
      b.innerHTML = '<div><b>v' + h.version + '</b> <span class="muted">' + esc(new Date(h.saved_at).toLocaleString('en-GB')) + ' · ' + ((h.ink && h.ink.strokes) || []).length + ' strokes · ' + ((h.ink && h.ink.objects) || []).length + ' images' + (cl ? ' · checklist ' + cl.done + '/' + cl.total : '') + '</span></div>';
      var act = document.createElement('div'); act.className = 'row gap';
      var view = document.createElement('button'); view.type = 'button'; view.className = 'btn btn-sm'; view.textContent = 'View';
      view.onclick = async function () { var m = await pageModel(Object.assign({}, p, { ink: h.ink })); var c = window.SurveyInk.renderPage(m, null, 480, { minStroke: 2 }); var img = document.createElement('img'); img.src = c.toDataURL('image/png'); img.style.cssText = 'max-width:100%;border:1px solid var(--border);border-radius:6px;margin-top:8px'; var old = b.querySelector('img'); if (old) old.remove(); else b.appendChild(img); };
      var rest = document.createElement('button'); rest.type = 'button'; rest.className = 'btn btn-sm'; rest.textContent = 'Restore';
      rest.onclick = async function () { if (!rest.dataset.armed) { rest.dataset.armed = '1'; rest.textContent = 'Restore — sure?'; setTimeout(function () { delete rest.dataset.armed; rest.textContent = 'Restore'; }, 6000); return; }
        closeModal(); if (p.kind === 'checklist') { var meta = Object.assign({}, p.metadata || {}, { checklist: h.checklist }); p.metadata = meta; await window.SurveyStore.updatePage(S.pid, S.session.id, p.id, { metadata: meta }); openPage(p.id); }
        else { var er = (p.ink.strokes || []).map(function (x) { return x.id; }).concat((p.ink.objects || []).map(function (x) { return x.id; })); p.ink = JSON.parse(JSON.stringify(h.ink)); await window.SurveyStore.saveInk(S.pid, S.session.id, p, er); S.noFlushOnce = true; openPage(p.id); }
        toast('Restored v' + h.version + ' as a new version'); };
      act.appendChild(view); act.appendChild(rest); b.appendChild(act); body.appendChild(b);
    });
    openModal('History — ' + (p.title || p.kind), body);
  }

  // ---------- report ----------
  async function exportReport() {
    if (!S.session) return toast('Open a survey first');
    flushSave(); toast('Building the report…');
    try {
      var proj = await projectRow(), eng = ''; try { eng = localStorage.getItem('sonor_survey_engineer') || ''; } catch (e) { }
      var pages = [], cover = null;
      for (var i = 0; i < S.pages.length; i++) { var p = S.pages[i]; var m = p.kind === 'checklist' ? null : await pageModel(p); pages.push({ row: p, model: m }); if (!cover && p.kind === 'photo') cover = await window.SurveyStore.photoBlob(p.id); }
      var bytes = await window.SurveyPdf.report({ project: proj, session: S.session, pages: pages, engineer: eng || S.session.engineer, coverBlob: cover });
      var name = ((proj.ref || proj.name || 'survey') + ' — ' + (S.session.title || 'Survey') + '.pdf').replace(/[\/\\:]/g, '-');
      window.SurveyPdf.download(bytes, name); toast('Report ready — ' + Math.round(bytes.length / 1024) + ' KB');
    } catch (e) { console.error(e); toast('Report failed: ' + e.message); }
  }

  // ---------- toolbar ----------
  function svcColour(nn) { var c = CFG.inks.find(function (i) { return i.n.indexOf(nn) === 0; }); return c ? c.c : ((CFG.extraColours || {})[nn] || '#98989D'); }
  function buildToolbar() {
    var sw = $('#svColours'); CFG.inks.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sv-swatch' + (i === 0 ? ' active' : ''); b.style.setProperty('--c', c.c); b.title = c.n; b.dataset.c = c.c; var nn = /^(\d\d) /.exec(c.n); b.dataset.nn = nn ? nn[1] : ''; b.textContent = nn ? nn[1] : '';   // v0.7.0 the service number sits IN the swatch
      b.onclick = function () { ink.setColour(c.c); $$('.sv-swatch').forEach(function (x) { x.classList.toggle('active', x === b); }); $('#svInkName').textContent = c.n; if (/eraser|pan|select/.test(ink.getTool())) setTool('pen'); };
      sw.appendChild(b);
    });
    var ws = $('#svWidths'); CFG.widths.forEach(function (w, i) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-w' + (i === 1 ? ' active' : ''); b.textContent = w.k; b.title = 'Width ' + w.w; b.onclick = function () { ink.setWidth(w.w); $$('.sv-w').forEach(function (x) { x.classList.toggle('active', x === b); }); }; ws.appendChild(b); });
    $('#svInkName').textContent = CFG.inks[0].n;
    setTimeout(function () { setToolBtn('pen'); }, 0);   // v0.7.0 the context strip reflects the initial tool
    var pal = $('#svMarks'), lastNn = null; CFG.marks.forEach(function (d) {
      if (lastNn !== null && d.nn !== lastNn) { var gap = document.createElement('span'); gap.className = 'sv-mark-gap'; pal.appendChild(gap); } lastNn = d.nn;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-mark-chip'; b.dataset.code = d.code;
      var col = d.nn ? svcColour(d.nn) : '#1C1C1E'; b.style.setProperty('--mk', col); b.innerHTML = '<span class="sv-mark-dot">' + esc(d.glyph) + '</span>' + esc(d.label);
      b.onclick = function () { var def = Object.assign({}, d, { c: col }); $$('.sv-mark-chip:not(.sv-obj-chip)').forEach(function (x) { x.classList.toggle('active', x === b); }); ink.setMarkDef(def); ink.setTool('mark'); setToolBtn('mark'); };
      pal.appendChild(b);
    });
    // v0.11.0 🧱 OBJECTS palette — site objects (radiator, steel, loft hatch, existing kit…), grouped, graphite, kind 'object'
    var opal = $('#svObjects'), lastGroup = null; (CFG.objects || []).forEach(function (d) {
      if (lastGroup !== null && d.group !== lastGroup) { var ogap = document.createElement('span'); ogap.className = 'sv-mark-gap'; opal.appendChild(ogap); } 
      if (d.group !== lastGroup) { var gl = document.createElement('span'); gl.className = 'sv-obj-group'; gl.textContent = d.group; opal.appendChild(gl); } lastGroup = d.group;
      var ob = document.createElement('button'); ob.type = 'button'; ob.className = 'btn sv-mark-chip sv-obj-chip'; ob.dataset.code = d.code; ob.title = d.hint || d.label;
      ob.style.setProperty('--mk', CFG.objectColour || '#6E6E73'); ob.innerHTML = '<span class="sv-mark-dot sv-obj-dot">' + esc(d.glyph) + '</span>' + esc(d.label);
      ob.onclick = function () { var def = { code: d.code, kind: 'object', label: d.label, glyph: d.glyph, c: CFG.objectColour || '#6E6E73', nn: null, block_code: null }; $$('.sv-obj-chip').forEach(function (x) { x.classList.toggle('active', x === ob); }); ink.setMarkDef(def); ink.setTool('mark'); setToolBtn('object'); };
      opal.appendChild(ob);
    });
    var pm = $('#svPinsMenu'); CFG.pins.forEach(function (d) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-pin-item'; b.style.setProperty('--mk', d.c); b.innerHTML = '<span class="sv-mark-dot sv-pin-dot">' + esc(d.glyph) + '</span><span><b>' + esc(d.label) + '</b><small>' + esc(d.hint || '') + '</small></span>';
      b.onclick = function () { setTool('pin:' + d.pin); }; pm.appendChild(b);
    });
    $('#svPinEdit').onclick = function () { var mk = ink.selectedMark(); if (mk && mk.kind === 'pin') openPinSheet(mk); };
    $('#svTextEdit').onclick = function () { var o = ink.selected(); if (o && o.kind === 'text') openTextEditor(o); };
    var ks = $('#svKind'); CFG.sessionKinds.forEach(function (k) { var o = document.createElement('option'); o.value = k[0]; o.textContent = k[1]; ks.appendChild(o); });
    $('#svPortrait').classList.toggle('active', S.portrait);
  }
  // v0.7.0 CONTEXT STRIP: inks + widths for drawing tools, device chips for Devices, nothing for the rest — one strip, never a stack of bars
  var TOOL_NAMES = { pen: 'Pen', hl: 'Highlighter', eraser: 'Eraser', mark: 'Devices', object: 'Objects — what is there (radiators, steels, existing kit)', photopin: 'Photo — tap where you are standing', select: 'Select', pan: 'Pan', text: 'Text — tap the page' };
  function setToolBtn(t) {
    var base = /^pin:/.test(t) ? 'pins' : t;
    $$('button[data-tool]').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === t); });
    var inks = /^(pen|hl|text)$/.test(t), chips = t === 'mark', objs = t === 'object';
    $('#svPalette').hidden = !(inks || chips || objs); $('#svCtxInks').hidden = !inks; $('#svMarks').hidden = !chips; $('#svObjects').hidden = !objs;
    var name = /^pin:/.test(t) ? ((pinDef(t.slice(4)) || {}).label + ' pin — tap the page') : (TOOL_NAMES[t] || t); $('#svToolNow').textContent = name;
    $('#svMoreBtn').classList.toggle('active', /^(hl|eraser|text|pan)$/.test(t) || /^pin:/.test(t));
    refreshMarkUi();
  }
  function curTool() { var b = $('button[data-tool].active'); return b ? b.dataset.tool : ink.getTool(); }
  function setTool(t) {
    closeTextEditor();
    if (t === 'text') { ink.setTool('text'); setToolBtn('text'); return; }
    if (/^pin:/.test(t)) { var pk = t.slice(4), pdf = pinDef(pk); if (!pdf) return; if (!S.pinFloor) loadPinFloor(); ink.setMarkDef({ code: 'pin-' + pk, kind: 'pin', pin: pk, label: pdf.label, glyph: pdf.glyph, c: pdf.c, nn: null }); ink.setTool('mark'); $$('.sv-mark-chip').forEach(function (x) { x.classList.remove('active'); }); setToolBtn('pin:' + pk); S.pinKind = pk; $('#svMoreMenu').hidden = true; return; }
    if (t === 'photopin') { ink.setMarkDef(Object.assign({}, CFG.photoMark, { c: '#1C1C1E' })); ink.setTool('mark'); $$('.sv-mark-chip').forEach(function (x) { x.classList.remove('active'); }); setToolBtn('photopin'); $('#svPalette').hidden = true; return; }
    if (t === 'object') { var oact = $('.sv-obj-chip.active'); if (!oact) { var ofirst = $('.sv-obj-chip'); if (ofirst) ofirst.click(); return; } var od = (CFG.objects || []).find(function (m) { return m.code === oact.dataset.code; }); if (od) ink.setMarkDef({ code: od.code, kind: 'object', label: od.label, glyph: od.glyph, c: CFG.objectColour || '#6E6E73', nn: null, block_code: null }); ink.setTool('mark'); setToolBtn('object'); return; }
    if (t === 'mark') { var act = $('.sv-mark-chip:not(.sv-obj-chip).active'); if (!act) { var first = $('.sv-mark-chip'); if (first) first.click(); return; } var d = CFG.marks.find(function (m) { return m.code === act.dataset.code; }); if (d) ink.setMarkDef(Object.assign({}, d, { c: d.nn ? svcColour(d.nn) : '#1C1C1E' })); }
    ink.setTool(t); setToolBtn(t);
  }
  function updateUndo() { $('#svUndo').disabled = !ink.canUndo(); $('#svRedo').disabled = !ink.canRedo(); }
  function openAddMenu(anchor) {
    var m = $('#svAddMenu'); m.hidden = !m.hidden; if (m.hidden) return;
    var r = anchor.getBoundingClientRect(); m.style.left = Math.min(r.left, window.innerWidth - 240) + 'px'; m.style.top = (r.bottom + 6) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', function h(e) { if (!m.contains(e.target)) { m.hidden = true; document.removeEventListener('pointerdown', h); } }); }, 0);
  }
  function wireDrop() {
    var zone = $('.sv-stage');
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; zone.classList.add('sv-drop'); } }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function () { zone.classList.remove('sv-drop'); }); });
    zone.addEventListener('drop', async function (e) {
      var files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(function (f) { return /^image\//.test(f.type); }); if (!files.length) return; e.preventDefault();
      var host = $('#svCanvas'), r = host.getBoundingClientRect(), inside = !host.hidden && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      for (var i = 0; i < files.length; i++) { var at = null; if (inside && i === 0) { var pg = ink.getPage(); if (pg) { at = null; } } await insertImage(files[i], at); }
    });
    document.addEventListener('paste', async function (e) {
      if (e.target && /input|textarea/i.test(e.target.tagName) || (e.target && e.target.isContentEditable)) return;
      var items = Array.from((e.clipboardData && e.clipboardData.items) || []).filter(function (it) { return /^image\//.test(it.type); }); if (!items.length) return; e.preventDefault();
      for (var i = 0; i < items.length; i++) { var f = items[i].getAsFile(); if (f) await insertImage(f); }
    });
  }
  function wireUi() {
    $$('button[data-tool]').forEach(function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });   // v0.6.0: BUTTONS only — the canvas host also carries data-tool (cursor CSS), and wiring it re-armed the first device on every canvas click
    $('#svUndo').onclick = function () { ink.undo(); }; $('#svRedo').onclick = function () { ink.redo(); };
    $('#svFit').onclick = function () { ink.fit(); };
    $('#svDelObj').onclick = function () { ink.removeSelected(); refreshMarkUi(); };
    $('#svFinger').onclick = function () { var on = !$('#svFinger').classList.contains('active'); $('#svFinger').classList.toggle('active', on); ink.fingerDraws(on); $('#svFinger').setAttribute('aria-pressed', on); };
    $('#svNew').onclick = newSession; $('#svClose').onclick = toggleClose; $('#svReport').onclick = exportReport;
    $('#svSession').onchange = function () { if (this.value) openSession(this.value); };
    $('#svKind').onchange = function () { if (S.session) { S.session.kind = this.value; window.SurveyStore.updateSession(S.pid, S.session.id, { kind: this.value }); } };
    $('#svAdd').onclick = function (e) { openAddMenu(e.currentTarget); };
    $('#svPortrait').onclick = function (e) { e.stopPropagation(); S.portrait = !S.portrait; try { localStorage.setItem('sonor_survey_portrait', S.portrait ? '1' : '0'); } catch (x) { } $('#svPortrait').classList.toggle('active', S.portrait); $('#svPortrait').textContent = S.portrait ? '▯ Portrait pages' : '▭ Landscape pages'; };
    $('#svPortrait').textContent = S.portrait ? '▯ Portrait pages' : '▭ Landscape pages';
    $$('#svAddMenu [data-add]').forEach(function (b) {
      b.onclick = function () { $('#svAddMenu').hidden = true; var k = b.dataset.add; if (k === 'plan') addPlanPage(); else if (k === 'checklist') addChecklistPage(); else if (k === 'photo') $('#svPhotoIn').click(); else if (k === 'photo-lib') { S.pendingReceived = null; $('#svPhotoLib').click(); } else if (k === 'received') openReceivedSheet(); else if (k === 'image') $('#svImageIn').click(); else addPage(k); };
    });
    function photoPicked(f) { var rid = S.pendingReplace; S.pendingReplace = null; var mid = S.pendingPhotoMark; S.pendingPhotoMark = null; if (rid) { if (f) replacePhoto(rid, f); } else if (mid) { if (f) photoAtMark(f, mid); else { var mk0 = (ink.getPage().marks || []).find(function (m) { return m.id === mid; }); if (mk0 && mk0.kind === 'photo' && !mk0.photo_page_id) ink.removeMark(mid); } } else addPhotoPage(f); }
    $('#svPhotoIn').onchange = function () { var f = this.files[0]; this.value = ''; photoPicked(f); };
    $('#svPhotoPick').onchange = function () { var f = this.files[0]; this.value = ''; photoPicked(f); };
    $('#svMarkPhoto').onclick = function () { var mk = ink.selectedMark(); if (!mk) return; var has = mk.photo_page_id && S.pages.some(function (x) { return x.id === mk.photo_page_id; }); if (has) S.pendingReplace = mk.photo_page_id; else S.pendingPhotoMark = mk.id; $('#svPhotoIn').click(); };
    $('#svPhotoRetake').onclick = function () { if (!S.page || S.page.kind !== 'photo') return; S.pendingReplace = S.page.id; $('#svPhotoIn').click(); };
    $('#svPhotoChange').onclick = function () { if (!S.page || S.page.kind !== 'photo') return; S.pendingReplace = S.page.id; $('#svPhotoPick').click(); };
    $('#svMarkOpen').onclick = function () { var mk = ink.selectedMark(); if (mk && mk.photo_page_id) openPage(mk.photo_page_id); };
    $('#svPhotoLib').onchange = function () { var fs = Array.from(this.files); this.value = ''; var rc = S.pendingReceived; S.pendingReceived = null; (async function () { if (!S.session) await newSession(); if (rc && rc.notes) await addReceivedNotes(rc); for (var i = 0; i < fs.length; i++) await addPhotoPage(fs[i], null, rc ? { category: rc.category, credit: { from: rc.from || null, via: rc.via || null } } : null); if (rc) toast(fs.length + ' ' + rc.category + ' photo' + (fs.length === 1 ? '' : 's') + (rc.from ? ' from ' + rc.from : '')); })(); };
    $('#svImageIn').onchange = function () { var fs = Array.from(this.files); this.value = ''; (async function () { for (var i = 0; i < fs.length; i++) await insertImage(fs[i]); })(); };
    ['svTitle', 'svRoom', 'svPhotoCat', 'svPhotoFrom'].forEach(function (id) { $('#' + id).onchange = savePageMeta; $('#' + id).onblur = savePageMeta; });
    $('#svFloor').onchange = savePageMeta;
    $('#svHistory').onclick = showHistory;
    $('#svRemove').onclick = function () {   // v0.10.3 confirm sheet — the old two-tap "sure?" arm was hidden by the menu closing itself, so Remove "did nothing" (Bryn)
      if (!S.page) return; var p = S.page, body = document.createElement('div'); body.className = 'sv-recv';
      body.innerHTML = '<p>Remove <b>' + esc(p.title || (p.kind === 'photo' ? 'this photo' : 'this page')) + '</b> from the survey?</p><p class="muted">It is hidden, not deleted — Page history keeps it and any photo pins pointing at it are released.</p><div class="sv-pin-actions"><button type="button" class="btn" id="rmCancel">Keep it</button><button type="button" class="btn btn-primary" id="rmGo">Remove page</button></div>';
      $('#rmCancel', body).onclick = closeModal; $('#rmGo', body).onclick = function () { closeModal(); hidePage(); };
      openModal('Remove page', body);
    };
    $('#svEngineer').onclick = function () { var cur = ''; try { cur = localStorage.getItem('sonor_survey_engineer') || ''; } catch (e) { } var v = prompt('Your name (stamped on new surveys + the report)', cur); if (v != null) { try { localStorage.setItem('sonor_survey_engineer', v.trim()); } catch (e) { } if (S.session) { S.session.engineer = v.trim(); window.SurveyStore.updateSession(S.pid, S.session.id, { engineer: v.trim() }); renderSessions(); } } };
    $('#svPublish').onclick = publish;
    document.addEventListener('keydown', function (e) {
      if (S.textEd || (e.target && e.target.closest && e.target.closest('textarea, input'))) return;
      if (e.target && (/input|select|textarea/i.test(e.target.tagName) || e.target.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? ink.redo() : ink.undo(); }
      else if (e.key === 'p') setTool('pen'); else if (e.key === 'h') setTool('hl'); else if (e.key === 'e') setTool('eraser'); else if (e.key === 'v') setTool('select'); else if (e.key === ' ') { setTool('pan'); }
      else if (e.key === 'f') ink.fit();
      else if (e.key === 'Escape') { if (S.textEd) return; $$('.sv-menu').forEach(function (m) { m.hidden = true; }); ink.clearSelection && ink.clearSelection(); refreshMarkUi(); }
      else if (e.key === 't') setTool('text');
      else if (e.key === 'm') setTool('mark'); else if (e.key === 'o') setTool('object'); else if (e.key === 'c') setTool('photopin');
      else if ((e.key === 'Backspace' || e.key === 'Delete') && /select|mark/.test(ink.getTool()) && (ink.selected() || ink.selectedMark())) { e.preventDefault(); ink.removeSelected(); refreshMarkUi(); }
    });
    document.addEventListener('keyup', function (e) { if (e.key === ' ' && ink.getTool() === 'pan') setTool('pen'); });
    $('#svCanvas').addEventListener('pointerup', function () { setTimeout(refreshMarkUi, 0); });
    $('#svModalClose').onclick = closeModal;
  }
  async function publish() { if (!S.pid) return; flushSave(); await window.SurveyStore.flush(); await window.SurveyStore.publishSummary(S.pid); toast('Published to the project — Brief page, Takeoffs Plan Notes, Tasks'); }
  function renderSync(st) {
    var el = $('#svSync'); if (!el) return;
    // v0.7.0 — one unmistakable saving state (Bryn's field review): device-first, then what still has to upload, then the backed-up time
    var n = st.pending, t = st.last ? new Date(st.last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
    if (!st.online) { el.dataset.tone = 'warn'; el.textContent = n ? 'Saved to device · ' + n + ' waiting for signal' : 'Saved to device · offline'; }
    else if (st.flushing) { el.dataset.tone = 'busy'; el.textContent = 'Uploading ' + n + ' change' + (n === 1 ? '' : 's') + '…'; }
    else if (n) { el.dataset.tone = 'info'; el.textContent = n + ' change' + (n === 1 ? '' : 's') + ' waiting to upload'; }
    else { el.dataset.tone = 'ok'; el.textContent = 'All changes backed up' + (t ? ' · ' + t : ''); }
    el.title = n ? 'Tap to see what is waiting and retry' : 'Everything is in Supabase';
  }

  // ---------- small ui ----------
  function openModal(title, body) { $('#svModalTitle').textContent = title; var b = $('#svModalBody'); b.innerHTML = ''; b.appendChild(body); $('#svModal').hidden = false; }
  function closeModal() { $('#svModal').hidden = true; }
  function toast(msg) { if (window.SonorShell && window.SonorShell.toast) return window.SonorShell.toast(msg); var t = $('#svToast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(function () { t.hidden = true; }, 2600); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtDate(iso) { try { var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) { return ''; } }

  window.SurveyApp = { state: S, boot: boot, setTool: setTool, newSession: newSession, openSession: openSession, toggleClose: toggleClose, publish: publish, projectRow: projectRow, renderPageMeta: renderPageMeta, toast: toast, openModal: openModal, closeModal: closeModal, esc: esc, fmtDate: fmtDate, openPinSheet: openPinSheet, openTextEditor: openTextEditor, closeTextEditor: closeTextEditor, addPage: addPage, flushSave: flushSave, insertImage: insertImage, exportReport: exportReport, pageModel: pageModel, replacePhoto: replacePhoto, tags: tags, openPage: openPage, ink: function () { return ink; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
