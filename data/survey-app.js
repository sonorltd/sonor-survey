/* Sonor Survey — APP (app-local, v0.3.0)
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
    S.pid = pid; S.project = project; S.session = null; S.page = null; S.floors = null; S.images = {};
    showEmpty();
    $('#svPages').innerHTML = '';
    S.sessions = await window.SurveyStore.listSessions(pid);
    renderSessions();
    var open = S.sessions.find(function (s) { return s.status === 'open'; }) || S.sessions[0];
    if (open) openSession(open.id);
  }
  async function projectRow() {
    if (S.project && S.project.id === S.pid) return S.project;
    try { var r = await supa.from('projects').select('id,ref,name,client_name,address,postcode').eq('id', S.pid).maybeSingle(); if (r.data) S.project = r.data; } catch (e) { }
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
    $('#svSession').value = sid; $('#svKind').value = S.session.kind || 'survey';
    $('#svClose').textContent = S.session.status === 'closed' ? 'Reopen' : 'Close survey';
    S.pages = (await window.SurveyStore.listPages(S.pid, sid)).filter(function (p) { return !(p.metadata && p.metadata.hidden); });
    renderStrip();
    if (S.pages.length) openPage(S.pages[0].id); else showEmpty();
  }
  async function toggleClose() {
    if (!S.session) return;
    var closed = S.session.status !== 'closed';
    var patch = closed ? { status: 'closed', ended_at: new Date().toISOString() } : { status: 'open', ended_at: null };
    Object.assign(S.session, patch); await window.SurveyStore.updateSession(S.pid, S.session.id, patch);
    renderSessions(); $('#svClose').textContent = closed ? 'Reopen' : 'Close survey';
    toast(closed ? 'Survey closed — summary published to the project' : 'Survey reopened');
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
  async function addPhotoPage(file) {
    if (!file) return;
    var ph = await window.SurveyPlan.preparePhoto(file, CFG.spaces.photoMax, CFG.photoJpegQuality);
    var id = window.SurveyStore.uuid();
    if (!S.session) await newSession();
    var path = window.SurveyStore.photoPath(S.pid, S.session.id, id);
    await window.SurveyStore.blobSet('photo:' + id, ph.blob);
    var row = await addPage('photo', { id: id, photo_path: path, title: 'Photo ' + (S.pages.filter(function (p) { return p.kind === 'photo'; }).length + 1), ink: { v: 1, space: { w: ph.w, h: ph.h }, strokes: [], objects: [] }, metadata: { w: ph.w, h: ph.h, bytes: ph.blob.size } });
    await window.SurveyStore.stashPhoto(S.pid, S.session.id, id, ph.blob);
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
  async function imageFor(key, path) {
    if (S.bitmaps[key]) return S.bitmaps[key];
    var blob = await window.SurveyStore.photoBlob(key);
    if (!blob && path) { try { var r = await fetch(window.SurveyStore.photoUrl(path)); if (r.ok) { blob = await r.blob(); try { await window.SurveyStore.blobSet('photo:' + key, blob); } catch (e) { } } } catch (e) { } }
    if (!blob) return null;
    var bm = await window.SurveyPlan.loadBitmap(blob); S.bitmaps[key] = bm; return bm;
  }
  // Everything the renderer needs for a page row: background image (plan / photo) + object bitmaps
  async function pageModel(p) {
    var m = { space: p.ink.space, strokes: p.ink.strokes || [], objects: p.ink.objects || [], images: {}, paper: p.kind, image: null, imageFit: null };
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
    ink.setPage(m); updateUndo();
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
    if (!S.floors && S.pid) window.SurveyPlan.listFloors(supa, S.pid).then(function (f) { S.floors = f; if (S.page === p) renderPageMeta(); });
  }
  function savePageMeta() {
    if (!S.page) return;
    var patch = { title: $('#svTitle').value.trim() || null, room: $('#svRoom').value.trim() || null };
    if (S.page.kind !== 'plan') patch.floor_code = $('#svFloor').value || null;
    var changed = Object.keys(patch).some(function (k) { return (S.page[k] || null) !== patch[k]; }); if (!changed) return;
    Object.assign(S.page, patch); window.SurveyStore.updatePage(S.pid, S.session.id, S.page.id, patch); renderStrip();
  }
  async function hidePage() {
    if (!S.page) return;
    var p = S.page, meta = Object.assign({}, p.metadata || {}, { hidden: true, hidden_at: new Date().toISOString() });
    await window.SurveyStore.updatePage(S.pid, S.session.id, p.id, { metadata: meta });
    S.pages = S.pages.filter(function (x) { return x.id !== p.id; }); S.page = null; renderStrip();
    if (S.pages.length) openPage(S.pages[0].id); else showEmpty();
    toast('Page removed');
  }

  // ---------- ink → autosave ----------
  function onInk(op) {
    if (!S.page) return;
    if (op.type === 'erase') op.ids.forEach(function (id) { S.erased.push(id); });
    if (op.type === 'add') { var i = S.erased.indexOf(op.stroke.id); if (i >= 0) S.erased.splice(i, 1); }
    if (op.type === 'object') { if (op.action === 'remove') S.erased.push(op.object.id); else { var j = S.erased.indexOf(op.object.id); if (j >= 0) S.erased.splice(j, 1); } }
    updateUndo(); $('#svDelObj').hidden = !(ink.getTool() === 'select' && ink.selected());
    clearTimeout(S.saveT); S.saveT = setTimeout(flushSave, CFG.autosaveMs);
  }
  function flushSave() {
    clearTimeout(S.saveT); if (S.noFlushOnce) { S.noFlushOnce = false; return; }
    if (!S.page || !S.session || S.page.kind === 'checklist') return;
    var pg = ink.getPage(); if (!pg) return;
    S.page.ink = { v: 1, space: pg.space, strokes: pg.strokes, objects: (pg.objects || []).map(function (o) { return { id: o.id, kind: o.kind, src: o.src, path: o.path, x: o.x, y: o.y, w: o.w, h: o.h, t: o.t }; }) };
    var er = S.erased; S.erased = [];
    window.SurveyStore.saveInk(S.pid, S.session.id, S.page, er);
    var el = thumbEl(S.page.id); if (el) thumbFor(S.page, el);
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
  function svcColour(nn) { var c = CFG.inks.find(function (i) { return i.n.indexOf(nn) === 0; }); return c ? c.c : '#98989D'; }
  function buildToolbar() {
    var sw = $('#svColours'); CFG.inks.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sv-swatch' + (i === 0 ? ' active' : ''); b.style.setProperty('--c', c.c); b.title = c.n; b.dataset.c = c.c;
      b.onclick = function () { ink.setColour(c.c); $$('.sv-swatch').forEach(function (x) { x.classList.toggle('active', x === b); }); if (/eraser|pan|select/.test(ink.getTool())) setTool('pen'); };
      sw.appendChild(b);
    });
    var ws = $('#svWidths'); CFG.widths.forEach(function (w, i) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-w' + (i === 1 ? ' active' : ''); b.textContent = w.k; b.title = 'Width ' + w.w; b.onclick = function () { ink.setWidth(w.w); $$('.sv-w').forEach(function (x) { x.classList.toggle('active', x === b); }); }; ws.appendChild(b); });
    var ks = $('#svKind'); CFG.sessionKinds.forEach(function (k) { var o = document.createElement('option'); o.value = k[0]; o.textContent = k[1]; ks.appendChild(o); });
    $('#svPortrait').classList.toggle('active', S.portrait);
  }
  function setToolBtn(t) { $$('[data-tool]').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === t); }); $('#svDelObj').hidden = !(t === 'select' && ink.selected()); }
  function setTool(t) { ink.setTool(t); setToolBtn(t); }
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
    $$('[data-tool]').forEach(function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });
    $('#svUndo').onclick = function () { ink.undo(); }; $('#svRedo').onclick = function () { ink.redo(); };
    $('#svFit').onclick = function () { ink.fit(); };
    $('#svDelObj').onclick = function () { ink.removeSelected(); $('#svDelObj').hidden = true; };
    $('#svFinger').onclick = function () { var on = !$('#svFinger').classList.contains('active'); $('#svFinger').classList.toggle('active', on); ink.fingerDraws(on); $('#svFinger').setAttribute('aria-pressed', on); };
    $('#svNew').onclick = newSession; $('#svClose').onclick = toggleClose; $('#svReport').onclick = exportReport;
    $('#svSession').onchange = function () { if (this.value) openSession(this.value); };
    $('#svKind').onchange = function () { if (S.session) { S.session.kind = this.value; window.SurveyStore.updateSession(S.pid, S.session.id, { kind: this.value }); } };
    $('#svAdd').onclick = function (e) { openAddMenu(e.currentTarget); };
    $('#svPortrait').onclick = function (e) { e.stopPropagation(); S.portrait = !S.portrait; try { localStorage.setItem('sonor_survey_portrait', S.portrait ? '1' : '0'); } catch (x) { } $('#svPortrait').classList.toggle('active', S.portrait); $('#svPortrait').textContent = S.portrait ? '▯ Portrait pages' : '▭ Landscape pages'; };
    $('#svPortrait').textContent = S.portrait ? '▯ Portrait pages' : '▭ Landscape pages';
    $$('#svAddMenu [data-add]').forEach(function (b) {
      b.onclick = function () { $('#svAddMenu').hidden = true; var k = b.dataset.add; if (k === 'plan') addPlanPage(); else if (k === 'checklist') addChecklistPage(); else if (k === 'photo') $('#svPhotoIn').click(); else if (k === 'photo-lib') $('#svPhotoLib').click(); else if (k === 'image') $('#svImageIn').click(); else addPage(k); };
    });
    $('#svPhotoIn').onchange = function () { var f = this.files[0]; this.value = ''; addPhotoPage(f); };
    $('#svPhotoLib').onchange = function () { var fs = Array.from(this.files); this.value = ''; (async function () { for (var i = 0; i < fs.length; i++) await addPhotoPage(fs[i]); })(); };
    $('#svImageIn').onchange = function () { var fs = Array.from(this.files); this.value = ''; (async function () { for (var i = 0; i < fs.length; i++) await insertImage(fs[i]); })(); };
    ['svTitle', 'svRoom'].forEach(function (id) { $('#' + id).onchange = savePageMeta; $('#' + id).onblur = savePageMeta; });
    $('#svFloor').onchange = savePageMeta;
    $('#svHistory').onclick = showHistory;
    $('#svRemove').onclick = function () { if (!S.page) return; if ($('#svRemove').dataset.armed) { delete $('#svRemove').dataset.armed; $('#svRemove').textContent = 'Remove page'; hidePage(); } else { $('#svRemove').dataset.armed = '1'; $('#svRemove').textContent = 'Remove — sure?'; setTimeout(function () { delete $('#svRemove').dataset.armed; $('#svRemove').textContent = 'Remove page'; }, 6000); } };
    $('#svEngineer').onclick = function () { var cur = ''; try { cur = localStorage.getItem('sonor_survey_engineer') || ''; } catch (e) { } var v = prompt('Your name (stamped on new surveys + the report)', cur); if (v != null) { try { localStorage.setItem('sonor_survey_engineer', v.trim()); } catch (e) { } if (S.session) { S.session.engineer = v.trim(); window.SurveyStore.updateSession(S.pid, S.session.id, { engineer: v.trim() }); renderSessions(); } } };
    $('#svPublish').onclick = async function () { if (!S.pid) return; flushSave(); await window.SurveyStore.flush(); await window.SurveyStore.publishSummary(S.pid); toast('Survey summary published to the project'); };
    document.addEventListener('keydown', function (e) {
      if (e.target && (/input|select|textarea/i.test(e.target.tagName) || e.target.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? ink.redo() : ink.undo(); }
      else if (e.key === 'p') setTool('pen'); else if (e.key === 'h') setTool('hl'); else if (e.key === 'e') setTool('eraser'); else if (e.key === 'v') setTool('select'); else if (e.key === ' ') { setTool('pan'); }
      else if (e.key === 'f') ink.fit();
      else if ((e.key === 'Backspace' || e.key === 'Delete') && ink.getTool() === 'select' && ink.selected()) { e.preventDefault(); ink.removeSelected(); $('#svDelObj').hidden = true; }
    });
    document.addEventListener('keyup', function (e) { if (e.key === ' ' && ink.getTool() === 'pan') setTool('pen'); });
    $('#svCanvas').addEventListener('pointerup', function () { setTimeout(function () { $('#svDelObj').hidden = !(ink.getTool() === 'select' && ink.selected()); }, 0); });
    $('#svModalClose').onclick = closeModal;
  }
  function renderSync(st) {
    var el = $('#svSync'); if (!el) return;
    el.dataset.tone = !st.online ? 'warn' : (st.pending ? 'info' : 'ok');
    el.textContent = !st.online ? 'Offline · ' + st.pending + ' queued' : (st.pending ? (st.flushing ? 'Syncing ' + st.pending + '…' : st.pending + ' to sync') : 'Synced');
  }

  // ---------- small ui ----------
  function openModal(title, body) { $('#svModalTitle').textContent = title; var b = $('#svModalBody'); b.innerHTML = ''; b.appendChild(body); $('#svModal').hidden = false; }
  function closeModal() { $('#svModal').hidden = true; }
  function toast(msg) { if (window.SonorShell && window.SonorShell.toast) return window.SonorShell.toast(msg); var t = $('#svToast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(function () { t.hidden = true; }, 2600); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtDate(iso) { try { var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) { return ''; } }

  window.SurveyApp = { state: S, boot: boot, addPage: addPage, flushSave: flushSave, insertImage: insertImage, exportReport: exportReport, pageModel: pageModel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
