/* Sonor Survey — APP (app-local, v0.1.0)
 * Shell + UI: project bar → sessions → pages (strip) → one ink canvas. Takeoffs in principle, more basic.
 * State lives in Supabase through SurveyStore (local-first outbox); ink in SurveyInk; plans via SurveyPlan.
 */
(function () {
  'use strict';
  var CFG = window.__SURVEY_CONFIG__, $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  var ICON = function (n, o) { return (window.SonorIcons && window.SonorIcons.has(n)) ? window.SonorIcons.svg(n, o) : ''; };
  var supa, ink, S = { pid: null, project: null, sessions: [], session: null, pages: [], page: null, floors: null, erased: [], saveT: null, images: {} };

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
    buildToolbar(); wireUi();
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
    $('#svEmpty').hidden = false; $('#svCanvas').hidden = true; $('#svPages').innerHTML = '';
    S.sessions = await window.SurveyStore.listSessions(pid);
    renderSessions();
    var open = S.sessions.find(function (s) { return s.status === 'open'; }) || S.sessions[0];
    if (open) openSession(open.id);
  }
  function renderSessions() {
    var sel = $('#svSession'); sel.innerHTML = '';
    if (!S.sessions.length) { sel.innerHTML = '<option value="">No surveys yet — + New</option>'; return; }
    S.sessions.forEach(function (s) {
      var o = document.createElement('option'); o.value = s.id;
      o.textContent = (s.status === 'closed' ? '✓ ' : '') + s.title + ' · ' + fmtDate(s.started_at) + (s.engineer ? ' · ' + s.engineer : '');
      sel.appendChild(o);
    });
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
    if (S.pages.length) openPage(S.pages[0].id); else { $('#svEmpty').hidden = false; $('#svCanvas').hidden = true; }
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
  function nextSeq() { return S.pages.length ? Math.max.apply(null, S.pages.map(function (p) { return p.seq || 0; })) + 10 : 10; }
  async function addPage(kind, extra) {
    if (!S.session) { await newSession(); if (!S.session) return; if (kind === 'blank') return; }
    var fields = Object.assign({ kind: kind, seq: nextSeq(), ink: { v: 1, space: kind === 'plan' ? CFG.spaces.plan : CFG.spaces.note, strokes: [] } }, extra || {});
    var row = await window.SurveyStore.createPage(S.pid, S.session.id, fields);
    S.pages.push(row); renderStrip(); await openPage(row.id);
    return row;
  }
  async function addPlanPage() {
    if (!S.pid) return toast('Pick a project first');
    if (!S.floors) S.floors = await window.SurveyPlan.listFloors(supa, S.pid);
    var items = [];
    for (var i = 0; i < S.floors.length; i++) {
      var f = S.floors[i], pl = await window.SurveyPlan.activePlan(supa, S.pid, f.floor_id);
      items.push({ floor: f, plan: pl });
    }
    var body = document.createElement('div'); body.className = 'sv-floorlist';
    if (!items.length) body.innerHTML = '<p class="muted">No Takeoffs floors on this project yet. Add floors + plans in Takeoffs, or use a photo of the drawing.</p>';
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-floor-btn'; b.disabled = !it.plan;
      b.innerHTML = '<b>' + esc(it.floor.code) + '</b> ' + esc(it.floor.name || '') + (it.plan ? ' <span class="muted">· ' + esc(it.plan.revision_label || '') + ' ' + esc(it.plan.filename || '') + '</span>' : ' <span class="muted">· no plan uploaded</span>');
      b.onclick = async function () { closeModal(); await addPage('plan', { floor_id: it.floor.floor_id, floor_code: it.floor.code, title: it.floor.name || it.floor.code, plan_ref: { plan_id: it.plan.id, storage_path: it.plan.storage_path, mime: it.plan.mime_type, page_index: it.plan.page_index || 1, revision_label: it.plan.revision_label, bucket: CFG.buckets.plans } }); };
      body.appendChild(b);
    });
    openModal('Plan page — which floor?', body);
  }
  async function addPhotoPage(file) {
    if (!file) return;
    var ph = await window.SurveyPlan.preparePhoto(file, CFG.spaces.photoMax, CFG.photoJpegQuality);
    var id = window.SurveyStore.uuid();
    if (!S.session) await newSession();
    var path = window.SurveyStore.photoPath(S.pid, S.session.id, id);
    await window.SurveyStore.blobSet('photo:' + id, ph.blob);
    var row = await addPage('photo', { id: id, photo_path: path, title: 'Photo ' + (S.pages.filter(function (p) { return p.kind === 'photo'; }).length + 1), ink: { v: 1, space: { w: ph.w, h: ph.h }, strokes: [] }, metadata: { w: ph.w, h: ph.h, bytes: ph.blob.size } });
    await window.SurveyStore.stashPhoto(S.pid, S.session.id, id, ph.blob);
    return row;
  }
  async function openPage(id) {
    flushSave();
    var p = S.pages.find(function (x) { return x.id === id; }); if (!p) return;
    S.page = p; S.erased = [];
    $('#svEmpty').hidden = true; $('#svCanvas').hidden = false;
    $$('#svPages .sv-thumb').forEach(function (el) { el.classList.toggle('active', el.dataset.id === id); });
    renderPageMeta();
    var img = null, fit = null;
    try {
      if (p.kind === 'plan' && p.plan_ref) {
        var key = 'plan:' + p.plan_ref.plan_id;
        if (!S.images[key]) S.images[key] = await window.SurveyPlan.loadImage(supa, { id: p.plan_ref.plan_id, storage_path: p.plan_ref.storage_path, mime_type: p.plan_ref.mime, filename: '', page_index: p.plan_ref.page_index });
        img = S.images[key].image; fit = S.images[key].fit;
      } else if (p.kind === 'photo') {
        var blob = await window.SurveyStore.photoBlob(p.id);
        if (!blob && p.photo_path) { var r = await fetch(window.SurveyStore.photoUrl(p.photo_path)); if (r.ok) { blob = await r.blob(); try { await window.SurveyStore.blobSet('photo:' + p.id, blob); } catch (e) { } } }
        if (blob) { img = await window.SurveyPlan.loadBitmap(blob); fit = { x: 0, y: 0, w: p.ink.space.w, h: p.ink.space.h }; }
      }
    } catch (e) { console.warn('[Survey] page image', e.message); toast('Could not load the ' + p.kind + ' image' + (navigator.onLine ? '' : ' (offline)')); }
    if (S.page !== p) return;
    ink.setPage({ space: p.ink.space, strokes: p.ink.strokes || [], paper: img ? 'image' : p.kind, image: img, imageFit: fit });
    updateUndo();
  }
  function renderStrip() {
    var host = $('#svPages'); host.innerHTML = '';
    S.pages.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); }).forEach(function (p) {
      var el = document.createElement('div'); el.className = 'sv-thumb' + (S.page && S.page.id === p.id ? ' active' : ''); el.dataset.id = p.id;
      el.innerHTML = '<div class="sv-thumb-img"><img alt=""></div><div class="sv-thumb-lbl"><span class="sv-thumb-kind">' + esc(p.kind) + '</span> ' + esc(p.title || (p.floor_code ? p.floor_code : '')) + '</div>';
      el.onclick = function () { openPage(p.id); };
      host.appendChild(el); thumbFor(p, el);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'btn sv-thumb-add'; add.innerHTML = ICON('plus') + ' Page'; add.onclick = function (e) { openAddMenu(e.currentTarget); };
    host.appendChild(add);
  }
  function thumbFor(p, el) {
    var img = $('img', el); if (!img) return;
    var c = document.createElement('canvas'); c.width = 120; c.height = Math.round(120 * (p.ink.space.h / p.ink.space.w)); var x = c.getContext('2d');
    var s = c.width / p.ink.space.w; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.setTransform(s, 0, 0, s, 0, 0);
    var done = function () { (p.ink.strokes || []).forEach(function (st) { ink.drawStrokeTo(x, Object.assign({}, st, { w: Math.max(st.w, 2.5 / s) })); }); img.src = c.toDataURL('image/png'); };
    if (p.kind === 'plan' && p.plan_ref && S.images['plan:' + p.plan_ref.plan_id]) { var im = S.images['plan:' + p.plan_ref.plan_id]; x.drawImage(im.image, im.fit.x, im.fit.y, im.fit.w, im.fit.h); done(); }
    else if (p.kind === 'photo') { window.SurveyStore.photoBlob(p.id).then(function (b) { if (!b) { done(); return; } return window.SurveyPlan.loadBitmap(b).then(function (bm) { x.drawImage(bm, 0, 0, p.ink.space.w, p.ink.space.h); done(); }); }).catch(done); }
    else {
      if (p.kind === 'lined') { x.strokeStyle = '#c9d3e6'; x.lineWidth = 1 / s; for (var y = CFG.paper.line * 2; y < p.ink.space.h; y += CFG.paper.line) { x.beginPath(); x.moveTo(40, y); x.lineTo(p.ink.space.w - 40, y); x.stroke(); } }
      if (p.kind === 'grid') { x.strokeStyle = '#dde3ee'; x.lineWidth = 1 / s; x.beginPath(); for (var gx = 0; gx <= p.ink.space.w; gx += CFG.paper.grid * 2) { x.moveTo(gx, 0); x.lineTo(gx, p.ink.space.h); } for (var gy = 0; gy <= p.ink.space.h; gy += CFG.paper.grid * 2) { x.moveTo(0, gy); x.lineTo(p.ink.space.w, gy); } x.stroke(); }
      done();
    }
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
    if (S.pages.length) openPage(S.pages[0].id); else { $('#svEmpty').hidden = false; $('#svCanvas').hidden = true; }
    toast('Page removed');
  }

  // ---------- ink → autosave ----------
  function onInk(op) {
    if (!S.page) return;
    if (op.type === 'erase') op.ids.forEach(function (id) { S.erased.push(id); });
    if (op.type === 'add') { var i = S.erased.indexOf(op.stroke.id); if (i >= 0) S.erased.splice(i, 1); }
    updateUndo();
    clearTimeout(S.saveT); S.saveT = setTimeout(flushSave, CFG.autosaveMs);
  }
  function flushSave() {
    clearTimeout(S.saveT); if (!S.page || !S.session) return;
    var pg = ink.getPage(); if (!pg) return;
    S.page.ink = { v: 1, space: pg.space, strokes: pg.strokes };
    var er = S.erased; S.erased = [];
    window.SurveyStore.saveInk(S.pid, S.session.id, S.page, er);
    var el = $$('#svPages .sv-thumb').find(function (e) { return e.dataset.id === S.page.id; }); if (el) thumbFor(S.page, el);
  }
  window.addEventListener('pagehide', flushSave); document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });

  // ---------- toolbar ----------
  function buildToolbar() {
    var sw = $('#svColours'); CFG.inks.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sv-swatch' + (i === 0 ? ' active' : ''); b.style.setProperty('--c', c.c); b.title = c.n; b.dataset.c = c.c;
      b.onclick = function () { ink.setColour(c.c); $$('.sv-swatch').forEach(function (x) { x.classList.toggle('active', x === b); }); if (ink.getTool() === 'eraser' || ink.getTool() === 'pan') setTool('pen'); };
      sw.appendChild(b);
    });
    var ws = $('#svWidths'); CFG.widths.forEach(function (w, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-w' + (i === 1 ? ' active' : ''); b.textContent = w.k; b.title = 'Width ' + w.w;
      b.onclick = function () { ink.setWidth(w.w); $$('.sv-w').forEach(function (x) { x.classList.toggle('active', x === b); }); };
      ws.appendChild(b);
    });
    var ks = $('#svKind'); CFG.sessionKinds.forEach(function (k) { var o = document.createElement('option'); o.value = k[0]; o.textContent = k[1]; ks.appendChild(o); });
  }
  function setTool(t) { ink.setTool(t); $$('[data-tool]').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === t); }); }
  function updateUndo() { $('#svUndo').disabled = !ink.canUndo(); $('#svRedo').disabled = !ink.canRedo(); }
  function openAddMenu(anchor) {
    var m = $('#svAddMenu'); m.hidden = !m.hidden; if (m.hidden) return;
    var r = anchor.getBoundingClientRect(); m.style.left = Math.min(r.left, window.innerWidth - 220) + 'px'; m.style.top = (r.bottom + 6) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', function h(e) { if (!m.contains(e.target)) { m.hidden = true; document.removeEventListener('pointerdown', h); } }); }, 0);
  }
  function wireUi() {
    $$('[data-tool]').forEach(function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });
    $('#svUndo').onclick = function () { ink.undo(); }; $('#svRedo').onclick = function () { ink.redo(); };
    $('#svFit').onclick = function () { ink.fit(); };
    $('#svFinger').onclick = function () { var on = !$('#svFinger').classList.contains('active'); $('#svFinger').classList.toggle('active', on); ink.fingerDraws(on); $('#svFinger').setAttribute('aria-pressed', on); };
    $('#svNew').onclick = newSession; $('#svClose').onclick = toggleClose;
    $('#svSession').onchange = function () { if (this.value) openSession(this.value); };
    $('#svKind').onchange = function () { if (S.session) { S.session.kind = this.value; window.SurveyStore.updateSession(S.pid, S.session.id, { kind: this.value }); } };
    $('#svAdd').onclick = function (e) { openAddMenu(e.currentTarget); };
    $$('#svAddMenu [data-add]').forEach(function (b) {
      b.onclick = function () { $('#svAddMenu').hidden = true; var k = b.dataset.add; if (k === 'plan') addPlanPage(); else if (k === 'photo') $('#svPhotoIn').click(); else if (k === 'photo-lib') $('#svPhotoLib').click(); else addPage(k); };
    });
    $('#svPhotoIn').onchange = function () { var f = this.files[0]; this.value = ''; addPhotoPage(f); };
    $('#svPhotoLib').onchange = function () { var fs = Array.from(this.files); this.value = ''; (async function () { for (var i = 0; i < fs.length; i++) await addPhotoPage(fs[i]); })(); };
    ['svTitle', 'svRoom'].forEach(function (id) { $('#' + id).onchange = savePageMeta; $('#' + id).onblur = savePageMeta; });
    $('#svFloor').onchange = savePageMeta;
    $('#svRemove').onclick = function () { if (!S.page) return; if ($('#svRemove').dataset.armed) { delete $('#svRemove').dataset.armed; $('#svRemove').textContent = 'Remove page'; hidePage(); } else { $('#svRemove').dataset.armed = '1'; $('#svRemove').textContent = 'Remove — sure?'; setTimeout(function () { delete $('#svRemove').dataset.armed; $('#svRemove').textContent = 'Remove page'; }, 6000); } };
    $('#svEngineer').onclick = function () { var cur = ''; try { cur = localStorage.getItem('sonor_survey_engineer') || ''; } catch (e) { } var v = prompt('Your name (stamped on new surveys)', cur); if (v != null) { try { localStorage.setItem('sonor_survey_engineer', v.trim()); } catch (e) { } if (S.session) { S.session.engineer = v.trim(); window.SurveyStore.updateSession(S.pid, S.session.id, { engineer: v.trim() }); renderSessions(); } } };
    $('#svPublish').onclick = async function () { if (!S.pid) return; flushSave(); await window.SurveyStore.flush(); await window.SurveyStore.publishSummary(S.pid); toast('Survey summary published to the project'); };
    document.addEventListener('keydown', function (e) {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? ink.redo() : ink.undo(); }
      else if (e.key === 'p') setTool('pen'); else if (e.key === 'h') setTool('hl'); else if (e.key === 'e') setTool('eraser'); else if (e.key === ' ') { setTool('pan'); }
      else if (e.key === 'f') ink.fit();
    });
    document.addEventListener('keyup', function (e) { if (e.key === ' ' && ink.getTool() === 'pan') setTool('pen'); });
    $('#svModalClose').onclick = closeModal;
  }
  function renderSync(st) {
    var el = $('#svSync'); if (!el) return;
    var tone = !st.online ? 'warn' : (st.pending ? 'info' : 'ok');
    el.dataset.tone = tone; el.textContent = !st.online ? 'Offline · ' + st.pending + ' queued' : (st.pending ? (st.flushing ? 'Syncing ' + st.pending + '…' : st.pending + ' to sync') : 'Synced');
  }

  // ---------- small ui ----------
  function openModal(title, body) { $('#svModalTitle').textContent = title; var b = $('#svModalBody'); b.innerHTML = ''; b.appendChild(body); $('#svModal').hidden = false; }
  function closeModal() { $('#svModal').hidden = true; }
  function toast(msg) { if (window.SonorShell && window.SonorShell.toast) return window.SonorShell.toast(msg); var t = $('#svToast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(function () { t.hidden = true; }, 2600); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtDate(iso) { try { var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) { return ''; } }

  window.SurveyApp = { state: S, boot: boot, addPage: addPage, flushSave: flushSave };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
