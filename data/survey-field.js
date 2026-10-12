/* Sonor Survey — FIELD CHROME (app-local, v0.7.0)
 * Bryn's field-use review (2026-10-12): "Simplify the toolbar… Improve project selection… Make saving unmistakable…
 * Clarify finishing a survey… Design for field use." This module owns the chrome AROUND the page:
 *   · menus (Survey ▾ · More ▾ · page ⋯) — fixed-position so the scrolling tool bars never clip them
 *   · 🔎 project FINDER — search by number / name / address, recent projects first, completed + test records hidden by default
 *     (sits on the shared project bar: picking a project calls SonorProjectBar.setActive, so every other app agrees)
 *   · SAVING sheet — what is waiting to upload, retry, drop
 *   · FINISH flow — Review → Complete → Publish, with what will be included and where it goes, before anything happens
 *   · WHERE strip — project › survey › floor › room, always visible (and in Focus mode as a floating chip)
 *   · FOCUS mode — nothing but the page + the tool bar
 * Talks to SurveyApp (state + actions) and SurveyStore (status + outbox). No Supabase writes of its own.
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  var A = function () { return window.SurveyApp; }, ST = function () { return window.SurveyStore; };
  var RECENT_KEY = 'sonor_survey_recent', FOCUS_KEY = 'sonor_survey_focus';
  var DONE = /^(complete|completed|closed|done|archived|lost|cancelled|declined|handover)/i;

  // ---------- menus ----------
  function placeMenu(menu, btn) { var r = btn.getBoundingClientRect(); menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px'; menu.style.top = (r.bottom + 6) + 'px'; }
  function toggleMenu(id, btnId) { var m = $('#' + id), b = $('#' + btnId); var open = m.hidden; $$('.sv-menu').forEach(function (x) { x.hidden = true; }); if (open) { m.hidden = false; placeMenu(m, b); } }
  function wireMenus() {
    [['svSurveyMenu', 'svSurveyBtn'], ['svMoreMenu', 'svMoreBtn'], ['svPageMenu', 'svPageBtn']].forEach(function (p) { var b = $('#' + p[1]); if (b) b.onclick = function (e) { e.stopPropagation(); toggleMenu(p[0], p[1]); }; });
    document.addEventListener('pointerdown', function (e) { if (!e.target.closest || !e.target.closest('.sv-menu, .sv-menu-wrap > .btn')) $$('.sv-menu').forEach(function (m) { m.hidden = true; }); }, true);
    // a menu item closes its menu after acting (tools, actions); selects stay open
    $$('.sv-menu .btn').forEach(function (b) { b.addEventListener('click', function () { setTimeout(function () { $$('.sv-menu').forEach(function (m) { m.hidden = true; }); }, 0); }); });
    window.addEventListener('resize', function () { $$('.sv-menu').forEach(function (m) { m.hidden = true; }); });
  }

  // ---------- project finder ----------
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } }
  function remember(id) { try { var r = recent().filter(function (x) { return x !== id; }); r.unshift(id); localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 8))); } catch (e) { } }
  function isTest(p) { return !!(p.metadata && p.metadata.is_test); }
  function isDone(p) { return DONE.test(String(p.status || '')); }
  function projLabel(p) { return [p.ref, p.name].filter(Boolean).join(' · ') || p.id; }
  async function openFinder() {
    var PB = window.SonorProjectBar; if (!PB) return;
    var all = PB.getProjects ? PB.getProjects() : []; if (!all || !all.length) { try { all = await PB.loadProjects(); } catch (e) { all = []; } }
    var body = document.createElement('div'); body.className = 'sv-finder';
    body.innerHTML = '<input id="svFindQ" type="search" placeholder="Project number, name, client or address…" autocomplete="off" inputmode="search">' +
      '<div class="sv-finder-opts"><label><input type="checkbox" id="svFindDone"> show completed</label><label><input type="checkbox" id="svFindTest"> show test records</label><span class="sv-grow"></span><span id="svFindCount"></span></div>' +
      '<div class="sv-finder-list" id="svFindList"></div>';
    var q = $('#svFindQ', body), list = $('#svFindList', body), cur = PB.getActiveId ? PB.getActiveId() : null;
    function norm(s) { return String(s || '').toLowerCase(); }
    function render() {
      var term = norm(q.value).trim(), showDone = $('#svFindDone', body).checked, showTest = $('#svFindTest', body).checked, rec = recent();
      var rows = all.filter(function (p) { if (!showTest && isTest(p)) return false; if (!showDone && isDone(p)) return false; if (!term) return true; var hay = norm([p.ref, p.name, p.client_name, p.address, p.postcode].join(' ')); return term.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; }); });
      var recRows = term ? [] : rec.map(function (id) { return rows.find(function (p) { return p.id === id; }); }).filter(Boolean);
      var rest = rows.filter(function (p) { return recRows.indexOf(p) < 0; }).slice(0, term ? 60 : 40);
      list.innerHTML = ''; $('#svFindCount', body).textContent = rows.length + ' project' + (rows.length === 1 ? '' : 's');
      function add(p) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sv-finder-row' + (p.id === cur ? ' cur' : ''); b.innerHTML = '<span class="ref">' + esc(p.ref || '—') + (p.status ? ' · ' + esc(p.status) : '') + (isTest(p) ? ' · TEST' : '') + '</span><span class="nm">' + esc(p.name || '(no name)') + (p.client_name ? ' <span class="ad">· ' + esc(p.client_name) + '</span>' : '') + '</span>' + (p.address || p.postcode ? '<span class="ad">' + esc([p.address, p.postcode].filter(Boolean).join(', ')) + '</span>' : ''); b.onclick = function () { pick(p); }; list.appendChild(b); }
      if (recRows.length) { var h = document.createElement('div'); h.className = 'sv-finder-h'; h.textContent = 'Recent'; list.appendChild(h); recRows.forEach(add); var h2 = document.createElement('div'); h2.className = 'sv-finder-h'; h2.textContent = 'All projects'; list.appendChild(h2); }
      rest.forEach(add);
      if (!rows.length) { var e = document.createElement('p'); e.className = 'muted'; e.textContent = 'Nothing matches' + (showDone && showTest ? '.' : ' — try "show completed" or "show test records".'); list.appendChild(e); }
    }
    function pick(p) { remember(p.id); A().closeModal(); try { PB.setActive(p.id); } catch (e) { } }
    q.oninput = render; $('#svFindDone', body).onchange = render; $('#svFindTest', body).onchange = render;
    q.onkeydown = function (e) { if (e.key === 'Enter') { var first = $('.sv-finder-row', list); if (first) first.click(); } e.stopPropagation(); };
    A().openModal('Find a project', body); render(); setTimeout(function () { q.focus(); }, 40);
  }
  function refreshFindLabel() { var PB = window.SonorProjectBar, p = PB && PB.getProject ? PB.getProject() : null; $('#svFindLbl').textContent = p ? (p.ref || p.name || 'Project') : 'Project'; if (p) remember(p.id); }

  // ---------- where am I ----------
  function renderWhere() {
    var S = A().state, p = (window.SonorProjectBar && window.SonorProjectBar.getProject && window.SonorProjectBar.getProject()) || S.project || null;
    var parts = [];
    if (p) parts.push('<b>' + esc(p.ref || p.name || '') + '</b>');
    if (S.session) parts.push(esc(S.session.title || 'Survey'));
    if (S.page) { if (S.page.floor_code) parts.push(esc(S.page.floor_code)); if (S.page.room) parts.push(esc(S.page.room)); else if (S.page.title) parts.push(esc(S.page.title)); }
    var html = parts.join('<span class="sep">›</span>') || '<span class="muted">No project</span>';
    $('#svWhere').innerHTML = html; $('#svFocusWhere').innerHTML = html;
  }

  // ---------- saving sheet ----------
  var OPN = { 'session.insert': 'New survey', 'session.update': 'Survey details', 'page.insert': 'New page', 'page.update': 'Page details', 'page.ink': 'Page markup', 'photo.upload': 'Photo' };
  async function openSaving() {
    var st = ST().status(), ops = await ST().outboxAll();
    var body = document.createElement('div'); body.className = 'sv-q';
    var head = document.createElement('p'); head.innerHTML = !st.online ? 'You are <b>offline</b>. Everything is saved on this device and uploads itself when signal returns.' : (ops.length ? '<b>' + ops.length + '</b> change' + (ops.length === 1 ? '' : 's') + ' waiting to upload to Supabase.' : 'All changes are backed up' + (st.last ? ' · ' + new Date(st.last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '') + '.');
    body.appendChild(head);
    ops.forEach(function (o) {
      var r = document.createElement('div'); r.className = 'sv-q-row';
      r.innerHTML = '<span class="op">' + esc(OPN[o.op] || o.op) + '</span><span>' + esc(o.op === 'photo.upload' ? (o.path || '').split('/').pop() : (o.id || (o.row && o.row.id) || '')).slice(0, 36) + '</span><span class="when">' + (o.ts ? new Date(o.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '') + '</span>';
      var d = document.createElement('button'); d.type = 'button'; d.className = 'btn btn-sm'; d.textContent = 'Drop'; d.title = 'Discard this change (it stays on the device only)'; d.onclick = async function () { if (!confirm('Drop this change? It will not reach the project.')) return; await ST().outboxDel(o.k); openSaving(); };
      r.appendChild(d); body.appendChild(r);
    });
    var act = document.createElement('div'); act.className = 'sv-pin-actions';
    act.innerHTML = '<span class="muted">' + (st.online ? 'Online' : 'Offline') + '</span>';
    var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn btn-primary'; retry.textContent = ops.length ? 'Upload now' : 'Check again'; retry.onclick = async function () { retry.disabled = true; retry.textContent = 'Uploading…'; try { A().flushSave(); await ST().flushNow(); } catch (e) { } openSaving(); };
    act.appendChild(retry); body.appendChild(act);
    A().openModal('Saving', body);
  }

  // ---------- finish flow ----------
  function review() {
    var S = A().state, pages = S.pages || [], tags = window.SurveyInk.photoTags(pages), pinned = Object.keys(tags.pinnedBy).length;
    var devices = 0, pins = { rfi: 0, client: 0, note: 0, snag: 0, dim: 0 }, emptyPins = 0, untitledPhotos = 0, check = { done: 0, total: 0 }, planPins = 0;
    pages.forEach(function (p) {
      ((p.ink && p.ink.marks) || []).forEach(function (m) { if (m.kind === 'block') devices++; else if (m.kind === 'pin') { pins[m.pin] = (pins[m.pin] || 0) + 1; if (!(m.text || '').trim()) emptyPins++; if (p.kind === 'plan' && m.pin !== 'snag') planPins++; } });
      if (p.kind === 'photo' && !p.title && !p.room) untitledPhotos++;
      if (p.kind === 'checklist' && window.SurveyChecklist) { var pr = window.SurveyChecklist.progress((p.metadata || {}).checklist); check.done += pr.done; check.total += pr.total; }
    });
    return { pages: pages.length, photos: tags.count, pinned: pinned, devices: devices, pins: pins, emptyPins: emptyPins, untitledPhotos: untitledPhotos, check: check, planPins: planPins, plans: pages.filter(function (p) { return p.kind === 'plan'; }).length, notes: pages.filter(function (p) { return /blank|lined|grid/.test(p.kind); }).length };
  }
  function openFinish() {
    var S = A().state; if (!S.session) return A().toast('Open a survey first');
    var r = review(), closed = S.session.status === 'closed', st = ST().status();
    var body = document.createElement('div'); body.className = 'sv-steps';
    var warn = [];
    if (r.emptyPins) warn.push(r.emptyPins + ' pin' + (r.emptyPins === 1 ? '' : 's') + ' with no text');
    if (r.untitledPhotos) warn.push(r.untitledPhotos + ' photo' + (r.untitledPhotos === 1 ? '' : 's') + ' without a title or room');
    if (r.check.total && r.check.done < r.check.total) warn.push('checklists ' + r.check.done + ' / ' + r.check.total + ' answered');
    if (st.pending) warn.push(st.pending + ' change' + (st.pending === 1 ? '' : 's') + ' not yet uploaded');
    var s1 = document.createElement('div'); s1.className = 'sv-step done';
    s1.innerHTML = '<h4><span class="n">1</span>Review</h4><ul><li>' + r.pages + ' pages — ' + r.notes + ' notes · ' + r.plans + ' plan · ' + r.photos + ' photos (' + r.pinned + ' pinned)' + (r.check.total ? ' · checklists ' + r.check.done + '/' + r.check.total : '') + '</li><li>' + r.devices + ' devices marked · ' + (r.pins.rfi || 0) + ' RFIs · ' + (r.pins.client || 0) + ' client comments · ' + (r.pins.note || 0) + ' notes · ' + (r.pins.snag || 0) + ' snags · ' + (r.pins.dim || 0) + ' measurements</li>' + warn.map(function (w) { return '<li class="warn">⚠ ' + esc(w) + '</li>'; }).join('') + '</ul>';
    var s2 = document.createElement('div'); s2.className = 'sv-step' + (closed ? ' done' : '');
    s2.innerHTML = '<h4><span class="n">2</span>Complete</h4><p class="muted" style="margin:0">Marks this survey finished (' + esc(S.session.title || '') + '). It stays readable; reopen it from Survey ▾ if you need to add more.</p><div class="row"></div>';
    var bC = document.createElement('button'); bC.type = 'button'; bC.className = 'btn' + (closed ? '' : ' btn-primary'); bC.textContent = closed ? '↩ Reopen survey' : '✓ Complete survey'; bC.onclick = async function () { await A().toggleClose(); openFinish(); }; $('.row', s2).appendChild(bC);
    var s3 = document.createElement('div'); s3.className = 'sv-step';
    s3.innerHTML = '<h4><span class="n">3</span>Publish</h4><p class="muted" style="margin:0">What goes where:</p><ul>' +
      '<li><b>Project Master › Brief</b> — Site surveys card: ' + r.pages + ' pages, ' + r.photos + ' photos' + (r.check.total ? ', checklist progress' : '') + '</li>' +
      '<li><b>Takeoffs › Plan Notes</b> — ' + r.planPins + ' RFI / client / note / measurement pin' + (r.planPins === 1 ? '' : 's') + ' from plan pages (RFIs flagged with "To")</li>' +
      '<li><b>Takeoffs › Survey ink layer</b> — every plan page\'s markup, devices and pins (live)</li>' +
      '<li><b>Tasks / Portal</b> — ' + (r.pins.snag || 0) + ' snag' + ((r.pins.snag || 0) === 1 ? '' : 's') + ' and all pins via survey_summary</li></ul><div class="row"></div>';
    var bP = document.createElement('button'); bP.type = 'button'; bP.className = 'btn btn-primary'; bP.textContent = st.pending ? '⬆ Upload ' + st.pending + ' + publish' : '⬆ Publish to project'; bP.onclick = async function () { bP.disabled = true; bP.textContent = 'Publishing…'; await A().publish(); openFinish(); };
    var bR = document.createElement('button'); bR.type = 'button'; bR.className = 'btn'; bR.textContent = '📄 Report PDF'; bR.onclick = function () { A().closeModal(); $('#svReport').click(); };
    $('.row', s3).appendChild(bP); $('.row', s3).appendChild(bR);
    body.appendChild(s1); body.appendChild(s2); body.appendChild(s3);
    A().openModal('Finish — Review → Complete → Publish', body);
  }

  // ---------- focus mode ----------
  function setFocus(on) { document.body.classList.toggle('sv-focus', !!on); $('#svFocus').classList.toggle('active', !!on); try { localStorage.setItem(FOCUS_KEY, on ? '1' : '0'); } catch (e) { } window.dispatchEvent(new Event('resize')); }

  // ---------- boot ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function boot() {
    if (!A()) return setTimeout(boot, 50);
    wireMenus();
    $('#svFind').onclick = openFinder;
    $('#svSync').onclick = openSaving;
    $('#svFinish').onclick = openFinish;
    $('#svFocus').onclick = function () { setFocus(!document.body.classList.contains('sv-focus')); };
    $('#svFocusExit').onclick = function () { setFocus(false); };
    document.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openFinder(); } else if (e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocus(!document.body.classList.contains('sv-focus')); } });
    document.addEventListener('sonor:project-changed', function () { setTimeout(function () { refreshFindLabel(); renderWhere(); }, 50); });
    // where-strip follows page / session changes — poll the cheap way (state is plain) rather than threading hooks through the editor
    var last = ''; setInterval(function () { var S = A().state, k = [S.pid, S.session && S.session.id, S.page && S.page.id, S.page && S.page.floor_code, S.page && S.page.room, S.page && S.page.title].join('|'); if (k !== last) { last = k; renderWhere(); refreshFindLabel(); } }, 600);
    refreshFindLabel(); renderWhere();
    // v0.8.0 cross-app links — the same project, one tap away (sonor-brand appUrls; local when we are running from the Drive)
    function openLinks() { var S = A().state, B = window.SonorBrand, local = /^(file:|http:\/\/(127|localhost))/.test(location.href), urls = (B && B.appUrls && B.appUrls[local ? 'local' : 'hosted']) || {};
      $$('[data-open]').forEach(function (a) { var base = urls[a.dataset.open]; if (!base || !S.pid) { a.classList.add('disabled'); a.removeAttribute('href'); return; } a.classList.remove('disabled'); var path = a.dataset.openPath ? base.replace(/\/[^\/]*$/, '/') + a.dataset.openPath : base; a.href = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'pid=' + encodeURIComponent(S.pid) + '&project=' + encodeURIComponent(S.pid); }); }
    document.addEventListener('sonor:project-changed', function () { setTimeout(openLinks, 80); }); openLinks(); setInterval(openLinks, 2000);
    try { if (localStorage.getItem(FOCUS_KEY) === '1') setFocus(true); } catch (e) { }
    // photo actions live in the page ⋯ menu: keep them in step with the page kind
    var mo = new MutationObserver(function () { var p = A().state.page; var isPhoto = !!(p && p.kind === 'photo'); $('#svPhotoRetake').hidden = !isPhoto; $('#svPhotoChange').hidden = !isPhoto; });
    mo.observe($('#svPages'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.SurveyField = { openFinder: openFinder, openSaving: openSaving, openFinish: openFinish, review: review, setFocus: setFocus, VERSION: '0.7.0' };
})();
