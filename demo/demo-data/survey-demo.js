/* Sonor Survey — DEMO SANDBOX (v1.0.1, 2026-10-15)
 * Bryn: "a demo sandboxed version of this hosted on web that shows 31 Prestbury as example that I can send a link to
 * someone, without them accidentally being able to get into other apps and links".
 * This file replaces the whole back end. The real app code is untouched: it talks to `window.SonorDB().client`, which here
 * is a tiny in-memory stand-in for the Supabase client (query builder + storage + no-op realtime) seeded from
 * data/demo-snapshot.json. Nothing leaves the viewer's browser: edits live in memory (and this app's own IndexedDB outbox,
 * which "flushes" into the same memory). No anon key, no project list, no cross-app links, no realtime, no history.
 */
(function (global) {
  'use strict';
  var SNAP = null, T = {}, uploads = {};   // T: table name → rows; uploads: storage path → object URL

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function assetFor(bucket, path) {
    if (uploads[path]) return uploads[path];
    var parts = String(path).split('/'), last = parts[parts.length - 1];
    if (bucket === 'site-photos') return 'assets/' + last;                       // {pid}/survey/{sid}/{pageId}.jpg → assets/{pageId}.jpg
    if (bucket === 'takeoffs-plans') return 'assets/plan-' + parts[1] + '.jpg';  // {pid}/{floor_id}/{uuid}__file.pdf → assets/plan-{floor_id}.jpg (pre-rasterised)
    return 'assets/' + last;
  }

  // ---- query builder (the subset the Survey app + shared bar use) ----
  function Q(table) { this.t = table; this.f = []; this.ord = []; this.lim = null; this.mode = 'select'; this.payload = null; this.single = 0; this.cols = null; }
  Q.prototype.select = function (cols) { if (this.mode === 'select') this.cols = cols; this.wantRows = true; return this; };
  Q.prototype.eq = function (k, v) { this.f.push(function (r) { return String(r[k]) === String(v); }); return this; };
  Q.prototype.neq = function (k, v) { this.f.push(function (r) { return String(r[k]) !== String(v); }); return this; };
  Q.prototype.is = function (k, v) { this.f.push(function (r) { return v === null ? (r[k] == null) : r[k] === v; }); return this; };
  Q.prototype.in = function (k, vs) { this.f.push(function (r) { return vs.map(String).indexOf(String(r[k])) >= 0; }); return this; };
  Q.prototype.or = function () { return this; };   // the bar's lean filters — a one-project demo matches anyway
  Q.prototype.order = function (k, o) { this.ord.push([k, !(o && o.ascending === false)]); return this; };
  Q.prototype.limit = function (n) { this.lim = n; return this; };
  Q.prototype.maybeSingle = function () { this.single = 1; return this; };
  Q.prototype.single = function () { this.single = 2; return this; };
  Q.prototype.update = function (p) { this.mode = 'update'; this.payload = p; return this; };
  Q.prototype.insert = function (p) { this.mode = 'insert'; this.payload = p; return this; };
  Q.prototype.upsert = function (p) { this.mode = 'upsert'; this.payload = p; return this; };
  Q.prototype.delete = function () { this.mode = 'delete'; return this; };
  Q.prototype.run = function () {
    var rows = T[this.t] || (T[this.t] = []), self = this, out;
    var hit = rows.filter(function (r) { return self.f.every(function (fn) { return fn(r); }); });
    if (this.mode === 'update') { hit.forEach(function (r) { Object.assign(r, clone(self.payload), { updated_at: new Date().toISOString() }); }); out = hit; }
    else if (this.mode === 'insert' || this.mode === 'upsert') {
      var list = Array.isArray(this.payload) ? this.payload : [this.payload]; out = [];
      list.forEach(function (p) { var r = clone(p); var ex = r.id != null && rows.find(function (x) { return x.id === r.id; }); if (ex && self.mode === 'upsert') Object.assign(ex, r); else if (!ex) rows.push(r); out.push(ex || r); });
    }
    else if (this.mode === 'delete') { hit.forEach(function (r) { rows.splice(rows.indexOf(r), 1); }); out = hit; }
    else out = hit;
    this.ord.forEach(function (o) { out = out.slice().sort(function (a, b) { var x = a[o[0]], y = b[o[0]]; return (x > y ? 1 : x < y ? -1 : 0) * (o[1] ? 1 : -1); }); });
    if (this.lim != null) out = out.slice(0, this.lim);
    out = out.map(clone);
    if (this.single) return { data: out[0] || null, error: (this.single === 2 && !out.length) ? { message: 'no rows' } : null };
    return { data: out, error: null };
  };
  Q.prototype.then = function (res, rej) { try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return Promise.resolve({ data: null, error: { message: String(e) } }).then(res, rej); } };

  var client = {
    from: function (t) { return new Q(t); },
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var ch = { on: function () { return ch; }, subscribe: function () { return ch; }, unsubscribe: function () { } }; return ch; },
    removeChannel: function () { return Promise.resolve('ok'); },
    storage: { from: function (bucket) { return {
      upload: function (path, blob) { try { uploads[path] = URL.createObjectURL(blob); } catch (e) { } return Promise.resolve({ data: { path: path }, error: null }); },
      getPublicUrl: function (path) { return { data: { publicUrl: assetFor(bucket, path) } }; },
      createSignedUrl: function (path) { return Promise.resolve({ data: { signedUrl: assetFor(bucket, path) }, error: null }); },
      remove: function () { return Promise.resolve({ data: null, error: null }); }
    }; } },
    auth: { getSession: function () { return Promise.resolve({ data: { session: null } }); } }
  };

  function load() {
    var req = new XMLHttpRequest(); req.open('GET', 'data/demo-snapshot.json', false); req.send(null);   // sync on purpose: SonorDB() is constructed synchronously by the app
    SNAP = JSON.parse(req.responseText);
    T.projects = [SNAP.project]; T.survey_sessions = SNAP.sessions; T.survey_pages = SNAP.pages; T.takeoffs_floors = SNAP.floors; T.takeoffs_floor_plans = SNAP.plans; T.survey_templates = SNAP.templates || []; T.survey_page_history = []; T.app_versions = [];
  }
  function SonorDB() { if (!SNAP) load(); this.client = client; }
  // the demo always opens on its one project (the app otherwise waits for ?pid= or a remembered pick)
  try { load(); ['sonor_active_project_id', 'sonor_active_project_id::survey'].forEach(function (k) { localStorage.setItem(k, SNAP.project.id); }); } catch (e) { }
  // v1.0.1 — dark like every other back-end app: sonor-theme.js falls back to 'slate' (light) when the origin has no stored
  // choice and the host page didn't put data-theme on <html> (the artifact host doesn't). First visit → graphite; the
  // viewer's own toggle still sticks after that.
  try {
    var th = localStorage.getItem('sonor-theme');
    if (th !== 'graphite' && th !== 'slate') { th = 'graphite'; localStorage.setItem('sonor-theme', th); }
    document.documentElement.setAttribute('data-theme', th); document.documentElement.style.colorScheme = th === 'graphite' ? 'dark' : 'light';
    if (global.SonorTheme && global.SonorTheme.set) global.SonorTheme.set(th, { silent: true });
  } catch (e) { }
  SonorDB.prototype.ping = function () { return Promise.resolve(true); };
  global.SonorDB = SonorDB;
  global.SurveyDemo = { snapshot: function () { return SNAP; }, tables: T, VERSION: '1.0.1' };

  // ---- demo chrome: no way out, and say so ----
  document.addEventListener('DOMContentLoaded', function () {
    var css = document.createElement('style'); css.textContent =
      '#sonor-header .sh-links, #sonor-header .sh-apps, .sonor-header-nav, #sonor-header a[href*="github"], #sonor-header a[href*="supabase"], #projectBarHost .actions, #projectBarHost .links, #projectBarHost a, #projectBarHost .sonor-wq-bar, #wqBarHost, [data-open], #svHistory, .sv-menu [data-add="plan"] { display: none !important; }' +
      '#projectBarHost select { pointer-events: none; }' +
      '.sv-demo-tag { position: fixed; right: 12px; bottom: 12px; z-index: 999; font: 600 11px/1 "DM Sans", system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #fff; background: #c0392b; padding: 7px 10px; border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,.4); pointer-events: none; }';
    document.head.appendChild(css);
    // the header's connection pill says where the data lives: here, nowhere
    var relabel = function () { Array.from(document.querySelectorAll('#sonor-header *')).forEach(function (el) { if (el.children.length === 0 && /^Supabase$/.test((el.textContent || '').trim())) el.textContent = 'Sandbox'; }); };
    setTimeout(relabel, 500); setTimeout(relabel, 2500);
    var tag = document.createElement('div'); tag.className = 'sv-demo-tag'; tag.textContent = 'Demo · nothing saves'; document.body.appendChild(tag);
    // any link that still slips through stays on this page
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a && !/^#|^javascript:|^blob:|^data:/.test(a.getAttribute('href') || '') && !a.hasAttribute('download')) { e.preventDefault(); e.stopPropagation(); } }, true);
  });
})(window);
