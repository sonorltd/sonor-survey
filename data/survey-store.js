/* Sonor Survey — STORE (app-local, v0.4.0 — ink.objects + ink.marks merged by id like strokes; survey_templates read; summary carries marks_by_floor + photo plan_pins)
 * Supabase (SSOT) behind an IndexedDB OUTBOX so a survey never depends on signal. Every write goes to the local
 * cache + outbox first, then flushes in order when online. Ink writes are compare-and-swap on survey_pages.version
 * (takeoffs_floors law) with a stroke-level MERGE on conflict (strokes are append-only records keyed by id, erases
 * are an id list) — so two devices, or offline + online edits, never clobber each other.
 * Tables: survey_sessions · survey_pages. Storage: site-photos/{project}/survey/{session}/{page}.jpg (public bucket).
 */
window.SurveyStore = (function () {
  'use strict';
  var CFG = window.__SURVEY_CONFIG__ || {};
  var supa = null, db = null, status = { online: navigator.onLine, pending: 0, flushing: false, last: null };
  var listeners = [];
  function emit() { listeners.forEach(function (f) { try { f(status); } catch (e) { } }); }

  // ---------- IndexedDB ----------
  function openDb() {
    if (db) return Promise.resolve(db);
    return new Promise(function (res, rej) {
      var r = indexedDB.open('sonor-survey', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        d.createObjectStore('outbox', { keyPath: 'k', autoIncrement: true });
        d.createObjectStore('cache');
        d.createObjectStore('blobs');
      };
      r.onsuccess = function () { db = r.result; res(db); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(store, mode, fn) {
    return openDb().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { res((out && typeof out === 'object' && 'result' in out) ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function cacheGet(key) { return tx('cache', 'readonly', function (s) { return s.get(key); }); }
  function cacheSet(key, val) { return tx('cache', 'readwrite', function (s) { s.put(val, key); }); }
  function blobGet(key) { return tx('blobs', 'readonly', function (s) { return s.get(key); }); }
  function blobSet(key, val) { return tx('blobs', 'readwrite', function (s) { s.put(val, key); }); }
  function blobDel(key) { return tx('blobs', 'readwrite', function (s) { s.delete(key); }); }
  function outboxAll() { return tx('outbox', 'readonly', function (s) { return s.getAll(); }); }
  function outboxAdd(op) { op.ts = Date.now(); return tx('outbox', 'readwrite', function (s) { s.add(op); }).then(countPending); }
  function outboxDel(k) { return tx('outbox', 'readwrite', function (s) { s.delete(k); }); }
  function countPending() { return outboxAll().then(function (a) { status.pending = a.length; emit(); return a.length; }); }

  // ---------- helpers ----------
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); }
  function nowIso() { return new Date().toISOString(); }
  function photoPath(pid, sid, pageId) { return pid + '/survey/' + sid + '/' + pageId + '.jpg'; }
  function hasPendingFor(pid) { return outboxAll().then(function (a) { return a.some(function (o) { return o.pid === pid; }); }); }

  // ---------- reads (cloud → cache; cache when offline or when local edits are still queued) ----------
  async function listSessions(pid) {
    var key = 'sessions:' + pid, pend = await hasPendingFor(pid);
    if (status.online && !pend) {
      try {
        var r = await supa.from('survey_sessions').select('*').eq('project_id', pid).order('started_at', { ascending: false });
        if (!r.error) { await cacheSet(key, r.data); return r.data; }
        console.warn('[Survey] sessions', r.error.message);
      } catch (e) { console.warn('[Survey] sessions offline', e.message); }
    }
    return (await cacheGet(key)) || [];
  }
  async function listPages(pid, sid) {
    var key = 'pages:' + sid, pend = await hasPendingFor(pid);
    if (status.online && !pend) {
      try {
        var r = await supa.from('survey_pages').select('*').eq('session_id', sid).order('seq');
        if (!r.error) { await cacheSet(key, r.data); return r.data; }
        console.warn('[Survey] pages', r.error.message);
      } catch (e) { }
    }
    return (await cacheGet(key)) || [];
  }
  async function listHistory(pageId) {
    var r = await supa.from('survey_page_history').select('id,version,ink,checklist,saved_at,superseded_at,title').eq('page_id', pageId).order('version', { ascending: false }).limit(60);
    return r.error ? [] : r.data;
  }
  async function listTemplates() {
    if (status.online) {
      try { var r = await supa.from('survey_templates').select('*').eq('active', true).order('sort'); if (!r.error) { await cacheSet('templates', r.data); return r.data; } } catch (e) { }
    }
    return (await cacheGet('templates')) || [];
  }
  async function listProjectPhotos(pid) {
    var r = await supa.from('survey_pages').select('id,session_id,title,floor_code,room,photo_path,created_at').eq('project_id', pid).eq('kind', 'photo').order('created_at');
    return r.error ? [] : r.data;
  }

  // ---------- local-first writes ----------
  async function upsertCache(key, row) {
    var list = (await cacheGet(key)) || [], i = list.findIndex(function (x) { return x.id === row.id; });
    if (i >= 0) list[i] = Object.assign({}, list[i], row); else list.push(row);
    await cacheSet(key, list); return list;
  }
  async function createSession(pid, fields) {
    var row = Object.assign({ id: uuid(), project_id: pid, title: 'Site survey', kind: 'survey', status: 'open', started_at: nowIso(), metadata: {}, created_at: nowIso(), updated_at: nowIso() }, fields || {});
    await upsertCache('sessions:' + pid, row);
    await outboxAdd({ op: 'session.insert', pid: pid, row: row });
    flush(); return row;
  }
  async function updateSession(pid, sid, patch) {
    patch = Object.assign({}, patch, { updated_at: nowIso() });
    await upsertCache('sessions:' + pid, Object.assign({ id: sid }, patch));
    await outboxAdd({ op: 'session.update', pid: pid, id: sid, patch: patch });
    flush();
  }
  async function createPage(pid, sid, fields) {
    var row = Object.assign({ id: uuid(), session_id: sid, project_id: pid, seq: 10, kind: 'blank', ink: { v: 1, space: CFG.spaces.note, strokes: [] }, version: 1, metadata: {}, created_at: nowIso(), updated_at: nowIso() }, fields || {});
    await upsertCache('pages:' + sid, row);
    await outboxAdd({ op: 'page.insert', pid: pid, row: row });
    flush(); return row;
  }
  async function updatePage(pid, sid, id, patch) {
    patch = Object.assign({}, patch, { updated_at: nowIso() });
    await upsertCache('pages:' + sid, Object.assign({ id: id }, patch));
    await outboxAdd({ op: 'page.update', pid: pid, id: id, patch: patch });
    flush();
  }
  // ink: full local strokes + ids erased since the last synced base (merge-safe)
  async function saveInk(pid, sid, page, erasedIds) {
    await upsertCache('pages:' + sid, { id: page.id, ink: page.ink, updated_at: nowIso() });
    var all = await outboxAll(), prev = all.filter(function (o) { return o.op === 'page.ink' && o.id === page.id; });
    var erased = (prev.length ? prev[prev.length - 1].erased : []).concat(erasedIds || []);
    for (var i = 0; i < prev.length; i++) await outboxDel(prev[i].k);   // coalesce: one pending ink op per page
    await outboxAdd({ op: 'page.ink', pid: pid, sid: sid, id: page.id, ink: page.ink, base: page.version || 1, erased: erased });
    flush();
  }
  async function stashPhoto(pid, sid, pageId, blob) {
    var path = photoPath(pid, sid, pageId);
    await blobSet('photo:' + pageId, blob);
    await outboxAdd({ op: 'photo.upload', pid: pid, id: pageId, path: path });
    flush(); return path;
  }
  function photoUrl(path) { try { return supa.storage.from(CFG.buckets.photos).getPublicUrl(path).data.publicUrl; } catch (e) { return null; } }
  async function photoBlob(pageId) { return blobGet('photo:' + pageId); }

  // ---------- flush ----------
  var flushTimer = null;
  function flush() { clearTimeout(flushTimer); flushTimer = setTimeout(_flush, 300); }
  async function _flush() {
    if (status.flushing || !navigator.onLine || !supa) { countPending(); return; }
    status.flushing = true; emit();
    try {
      var ops = await outboxAll();
      for (var i = 0; i < ops.length; i++) {
        var o = ops[i], ok = await apply(o);
        if (ok === 'retry') break;           // network — stop, keep order
        await outboxDel(o.k);
      }
      status.last = Date.now();
    } catch (e) { console.warn('[Survey] flush', e.message); }
    status.flushing = false; await countPending();
  }
  async function apply(o) {
    try {
      var r;
      if (o.op === 'session.insert') { r = await supa.from('survey_sessions').upsert(o.row, { onConflict: 'id' }); }
      else if (o.op === 'session.update') { r = await supa.from('survey_sessions').update(o.patch).eq('id', o.id); }
      else if (o.op === 'page.insert') { r = await supa.from('survey_pages').upsert(o.row, { onConflict: 'id' }); }
      else if (o.op === 'page.update') { r = await supa.from('survey_pages').update(o.patch).eq('id', o.id); }
      else if (o.op === 'page.ink') { return await applyInk(o); }
      else if (o.op === 'photo.upload') {
        var blob = await blobGet('photo:' + o.id); if (!blob) return true;
        r = await supa.storage.from(CFG.buckets.photos).upload(o.path, blob, { contentType: 'image/jpeg', upsert: true });
        // blob is KEPT after upload so the page still opens offline (storage is small; cleared with the browser)
      }
      if (r && r.error) { if (isNet(r.error)) return 'retry'; console.warn('[Survey] op failed (dropped)', o.op, r.error.message); return true; }
      return true;
    } catch (e) { return isNet(e) ? 'retry' : true; }
  }
  async function applyInk(o) {
    for (var attempt = 0; attempt < 3; attempt++) {
      var g = await supa.from('survey_pages').select('id,ink,version').eq('id', o.id).maybeSingle();
      if (g.error) return isNet(g.error) ? 'retry' : true;
      if (!g.data) { // row not yet inserted (insert op may have been dropped) — insert minimal
        var ins = await supa.from('survey_pages').upsert({ id: o.id, session_id: o.sid, project_id: o.pid, ink: o.ink }, { onConflict: 'id' });
        return ins.error && isNet(ins.error) ? 'retry' : true;
      }
      var ink = o.ink, base = g.data.version;
      if (g.data.version !== o.base) ink = mergeInk(g.data.ink, o.ink, o.erased);
      var u = await supa.from('survey_pages').update({ ink: ink, version: base + 1 }).eq('id', o.id).eq('version', base).select('id,version');
      if (u.error) return isNet(u.error) ? 'retry' : true;
      if (u.data && u.data.length) { await upsertCache('pages:' + o.sid, { id: o.id, ink: ink, version: base + 1 }); return true; }
    }
    return true;
  }
  function mergeInk(cloud, local, erased) {
    var er = {}; (erased || []).forEach(function (id) { er[id] = 1; });
    var map = {};
    ((cloud && cloud.strokes) || []).forEach(function (s) { if (!er[s.id]) map[s.id] = s; });
    ((local && local.strokes) || []).forEach(function (s) { map[s.id] = s; });
    var strokes = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    var om = {};
    ((cloud && cloud.objects) || []).forEach(function (o) { if (!er[o.id]) om[o.id] = o; });
    ((local && local.objects) || []).forEach(function (o) { om[o.id] = o; });
    var objects = Object.keys(om).map(function (k) { return om[k]; }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    var mm = {};
    ((cloud && cloud.marks) || []).forEach(function (m) { if (!er[m.id]) mm[m.id] = m; });
    ((local && local.marks) || []).forEach(function (m) { mm[m.id] = m; });
    var marks = Object.keys(mm).map(function (k) { return mm[k]; }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    return Object.assign({}, local, { strokes: strokes, objects: objects, marks: marks });
  }
  function isNet(e) { var m = String((e && e.message) || e || ''); return /fetch|network|Failed|load failed|timeout|abort/i.test(m) || !navigator.onLine; }

  // ---------- publish (projects.metadata.survey_summary via the merge RPC — never a raw metadata write) ----------
  async function publishSummary(pid) {
    if (!status.online) return;
    var s = await supa.from('survey_sessions').select('id,title,kind,status,started_at,ended_at').eq('project_id', pid).order('started_at', { ascending: false });
    var p = await supa.from('survey_pages').select('id,kind,title,floor_code,room,photo_path,session_id,ink,metadata').eq('project_id', pid);
    if (s.error || p.error) return;
    var pages = p.data.filter(function (x) { return !(x.metadata && x.metadata.hidden); }), photos = pages.filter(function (x) { return x.kind === 'photo' && x.photo_path; });
    var marksByFloor = {};   // v0.4.0 — survey-stage block intents per floor + block_code (Takeoffs B-529 swap source)
    pages.forEach(function (x) { if (x.kind !== 'plan') return; ((x.ink && x.ink.marks) || []).forEach(function (m) { if (m.kind === 'photo') return; var f = x.floor_code || '?'; marksByFloor[f] = marksByFloor[f] || {}; var k = m.block_code || m.code; marksByFloor[f][k] = (marksByFloor[f][k] || 0) + 1; }); });
    var checklists = pages.filter(function (x) { return x.kind === 'checklist'; }).length;
    var patch = { survey_summary: {
      app: 'survey', version: CFG.version, updated_at: nowIso(),
      sessions: s.data.length, last_session: s.data[0] ? { id: s.data[0].id, title: s.data[0].title, kind: s.data[0].kind, status: s.data[0].status, started_at: s.data[0].started_at } : null,
      pages: { notes: pages.filter(function (x) { return /blank|lined|grid/.test(x.kind); }).length, plans: pages.filter(function (x) { return x.kind === 'plan'; }).length, photos: photos.length, checklists: checklists },
      photos: photos.slice(0, 60).map(function (x) { return { id: x.id, path: x.photo_path, url: photoUrl(x.photo_path), title: x.title || null, floor: x.floor_code || null, room: x.room || null, plan_pin: (x.metadata && x.metadata.plan_pin) || null }; }),
      marks_by_floor: marksByFloor,
      url: 'https://sonorltd.github.io/sonor-survey/?pid=' + pid
    } };
    var r = await supa.rpc('sonor_merge_project_metadata', { p_project_id: pid, p_patch: patch });
    if (r.error) console.warn('[Survey] publish', r.error.message);
  }

  window.addEventListener('online', function () { status.online = true; emit(); flush(); });
  window.addEventListener('offline', function () { status.online = false; emit(); });
  setInterval(function () { if (status.pending) flush(); }, 30000);

  return {
    init: function (client) { supa = client; countPending(); flush(); },
    onStatus: function (f) { listeners.push(f); f(status); },
    status: function () { return status; },
    uuid: uuid, photoPath: photoPath,
    listSessions: listSessions, listPages: listPages, listProjectPhotos: listProjectPhotos, listTemplates: listTemplates, listHistory: listHistory,
    createSession: createSession, updateSession: updateSession, createPage: createPage, updatePage: updatePage,
    saveInk: saveInk, stashPhoto: stashPhoto, photoUrl: photoUrl, photoBlob: photoBlob,
    blobGet: blobGet, blobSet: blobSet, flush: flush, publishSummary: publishSummary,
    client: function () { return supa; }
  };
})();
