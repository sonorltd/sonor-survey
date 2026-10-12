/* Sonor Survey — INK ENGINE (app-local, v0.4.0 — survey marks: tool 'mark' places a palette item; Select moves / deletes marks too)
 * Pointer-events pencil layer on Canvas 2D. Direct-object model (ADAPTER_INVARIANTS): every stroke point and every
 * object rect is stored in PAGE units (note 1414×1000 landscape / 1000×1414 portrait, plan = Takeoffs 1400×900 world
 * frame, photo = image px); the view transform (scale + pan) is applied only at render time. Nothing here touches Supabase.
 *
 * Stroke: { id, tool:'pen'|'hl', c:'#hex', w:<base width in page units>, t:<epoch ms>, pts:[[x,y,p],…] }
 * Object: { id, kind:'image', src:<image key — app resolves to a bitmap via page.images[src]>, x, y, w, h, t }
 * v0.2.0: objects layer (drop / paste photos, move + resize with the Select tool), pan clamp, static renderPage()
 *         (shared by thumbnails + the PDF report), bg clip save/restore (v0.1.0 bug: the clip accumulated across
 *         renders so panning shrank the paper to a strip and stale shadows were never cleared).
 * API:
 *   const ink = SurveyInk.create({ host, onChange(op) })   // op = {type:'add',stroke} | {type:'erase',ids} | {type:'object', action:'add'|'update'|'remove', object}
 *   ink.setPage({ space:{w,h}, strokes:[], objects:[], images:{key:bitmap}, paper:'blank'|'lined'|'grid'|'image', image?, imageFit? })
 *   ink.setTool('pen'|'hl'|'eraser'|'pan'|'select'); setColour; setWidth; undo; redo; fit; fingerDraws; render; thumbnail(w,h)
 *   ink.addObject(obj) / ink.removeSelected() / ink.selected() / ink.viewCentrePage()
 *   SurveyInk.renderPage(page, canvas, pxWidth)  — static: paper + image + objects + strokes into any canvas
 */
window.SurveyInk = (function () {
  'use strict';
  var CFG = window.__SURVEY_CONFIG__ || {};
  var PAPER = (CFG.paper) || { line: 36, grid: 25 };
  function uid(p) { return (p || 's_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function r2(v) { return Math.round(v * 100) / 100; }

  // ---------- static drawing (no view state) ----------
  // v0.3.0: the painters live in the ROOT master data/sonor-ink.js (SonorInk) so Takeoffs' survey-ink layer paints the
  // same pixels; the inline copies below are the offline / load-order fallback only (delegate-with-fallback, B-420).
  var SI = window.SonorInk || null;
  function widthAt(st, p) { if (SI) return SI.widthAt(st, p); if (st.tool === 'hl') return st.w * 4; var pr = (p == null || p === 0) ? 0.5 : p; return st.w * (0.45 + 1.1 * pr); }
  function drawStroke(ctx, st) {
    if (SI) return SI.drawStroke(ctx, st);
    var pts = st.pts; if (!pts || !pts.length) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.c;
    if (st.tool === 'hl') { ctx.globalAlpha = 0.32; ctx.globalCompositeOperation = 'multiply'; ctx.lineCap = 'butt'; }
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], widthAt(st, pts[0][2]) / 2, 0, Math.PI * 2); ctx.fillStyle = st.c; ctx.fill(); ctx.restore(); return; }
    var prev = pts[0];
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], w = (widthAt(st, prev[2]) + widthAt(st, p[2])) / 2;
      ctx.lineWidth = Math.max(0.4, w); ctx.beginPath();
      if (i > 1) { var pp = pts[i - 2]; ctx.moveTo((pp[0] + prev[0]) / 2, (pp[1] + prev[1]) / 2); ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2); }
      else { ctx.moveTo(prev[0], prev[1]); ctx.lineTo((prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2); }
      if (i === pts.length - 1) ctx.lineTo(p[0], p[1]);
      ctx.stroke(); prev = p;
    }
    ctx.restore();
  }
  function drawPaper(ctx, page, lw) {
    if (SI) return SI.drawPaper(ctx, page, lw);
    var sp = page.space;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, sp.w, sp.h);
    if (page.image) { var f = page.imageFit || { x: 0, y: 0, w: sp.w, h: sp.h }; try { ctx.drawImage(page.image, f.x, f.y, f.w, f.h); } catch (e) { } }
    else if (page.paper === 'lined') {
      ctx.strokeStyle = '#c9d3e6'; ctx.lineWidth = lw;
      for (var y = PAPER.line * 2; y < sp.h; y += PAPER.line) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(sp.w - 40, y); ctx.stroke(); }
      ctx.strokeStyle = '#f0b9b9'; ctx.beginPath(); ctx.moveTo(90, 0); ctx.lineTo(90, sp.h); ctx.stroke();
    } else if (page.paper === 'grid') {
      ctx.strokeStyle = '#dde3ee'; ctx.lineWidth = lw; ctx.beginPath();
      for (var gx = 0; gx <= sp.w; gx += PAPER.grid) { ctx.moveTo(gx, 0); ctx.lineTo(gx, sp.h); }
      for (var gy = 0; gy <= sp.h; gy += PAPER.grid) { ctx.moveTo(0, gy); ctx.lineTo(sp.w, gy); }
      ctx.stroke();
    }
  }
  function drawObjects(ctx, page) {
    if (SI) return SI.drawObjects(ctx, page.objects, page.images);
    (page.objects || []).forEach(function (o) {
      var im = page.images && page.images[o.src];
      if (im) { try { ctx.drawImage(im, o.x, o.y, o.w, o.h); } catch (e) { } }
      else { ctx.fillStyle = '#eef0f4'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = '#b8bec8'; ctx.lineWidth = 1; ctx.strokeRect(o.x, o.y, o.w, o.h); }
    });
  }
  // Static page → canvas. Returns the canvas. pxWidth = output width in px (height follows the page aspect).
  function renderPage(page, canvas, pxWidth, opts) {
    opts = opts || {};
    var sp = page.space, s = pxWidth / sp.w;
    canvas = canvas || document.createElement('canvas');
    canvas.width = Math.round(pxWidth); canvas.height = Math.round(sp.h * s);
    var x = canvas.getContext('2d');
    x.setTransform(s, 0, 0, s, 0, 0);
    drawPaper(x, page, 1 / s); drawObjects(x, page);
    // v0.4.2 — device/photo marks render in exports and thumbnails exactly as on the live bg layer (under the ink).
    if (SI && page.marks && page.marks.length) SI.drawMarks(x, page.marks, { r: Math.max(SI.MARK_R, (opts.minMark || 0) / s) });
    (page.strokes || []).forEach(function (st) { drawStroke(x, opts.minStroke ? Object.assign({}, st, { w: Math.max(st.w, opts.minStroke / s) }) : st); });
    return canvas;
  }

  function create(opts) {
    var host = opts.host, onChange = opts.onChange || function () {};
    var bg = mk('bg'), inkC = mk('ink'), live = mk('live');
    function mk(n) { var c = document.createElement('canvas'); c.className = 'sv-layer sv-layer-' + n; host.appendChild(c); return c; }
    var bgx = bg.getContext('2d'), inx = inkC.getContext('2d'), lvx = live.getContext('2d');
    var page = null, dpr = Math.max(1, window.devicePixelRatio || 1);
    var view = { s: 1, tx: 0, ty: 0 };
    var tool = 'pen', colour = '#141414', width = 3.5, fingerDraw = false;
    var undo = [], redo = [];
    var cur = null, pointers = new Map(), penActiveUntil = 0, pinch = null, panStart = null;
    var sel = null, drag = null;      // selected object id; drag = {mode:'move'|'resize', handle, start, orig}
    var selMark = null, markDef = null, mdrag = null;   // v0.4.0 marks: selected mark id · active palette def · {id,start,orig}
    var W = 0, H = 0;

    function resize() {
      var r = host.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0);
      dpr = Math.max(1, window.devicePixelRatio || 1);
      [bg, inkC, live].forEach(function (c) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; });
      render();
    }
    var ro = new ResizeObserver(function () { resize(); }); ro.observe(host);

    // ---------- view ----------
    function fit() { if (!page) return; var s = Math.min(W / page.space.w, H / page.space.h) * 0.97; view.s = s; view.tx = (W - page.space.w * s) / 2; view.ty = (H - page.space.h * s) / 2; render(); }
    function clampView() {   // keep at least a quarter of the page on screen — a scroll can never lose the page
      if (!page) return; var pw = page.space.w * view.s, ph = page.space.h * view.s;
      view.tx = Math.min(Math.max(view.tx, -pw * 0.75), W - pw * 0.25); view.ty = Math.min(Math.max(view.ty, -ph * 0.75), H - ph * 0.25);
    }
    function toPage(cx, cy) { var r = host.getBoundingClientRect(); return [(cx - r.left - view.tx) / view.s, (cy - r.top - view.ty) / view.s]; }
    function applyView(ctx) { ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty); }
    function zoomAt(cx, cy, f) {
      var r = host.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
      var ns = Math.max(0.1, Math.min(12, view.s * f)); f = ns / view.s;
      view.tx = px - (px - view.tx) * f; view.ty = py - (py - view.ty) * f; view.s = ns; clampView(); render();
    }
    function viewCentrePage() { return toPage(host.getBoundingClientRect().left + W / 2, host.getBoundingClientRect().top + H / 2); }

    // ---------- render ----------
    function clear(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W * dpr, H * dpr); }
    function renderBg() {
      clear(bgx); if (!page) return;
      applyView(bgx); var sp = page.space;
      bgx.save(); bgx.shadowColor = 'rgba(0,0,0,.45)'; bgx.shadowBlur = 18 / view.s; bgx.shadowOffsetY = 4 / view.s; bgx.fillStyle = '#ffffff'; bgx.fillRect(0, 0, sp.w, sp.h); bgx.restore();
      bgx.save(); bgx.beginPath(); bgx.rect(0, 0, sp.w, sp.h); bgx.clip();
      drawPaper(bgx, page, 1 / view.s); drawObjects(bgx, page);
      if (SI) SI.drawMarks(bgx, page.marks);
      bgx.restore();
    }
    function renderInk() { clear(inx); if (!page) return; applyView(inx); page.strokes.forEach(function (st) { drawStroke(inx, st); }); }
    function renderLive() {
      clear(lvx); if (!page) return; applyView(lvx);
      if (cur && !cur.eraser) drawStroke(lvx, cur);
      var mk = selMarkObj(); if (mk && SI) { lvx.save(); lvx.strokeStyle = '#3A8AA8'; lvx.lineWidth = 2 / view.s; lvx.setLineDash([5 / view.s, 3 / view.s]); lvx.beginPath(); lvx.arc(mk.x, mk.kind === 'photo' ? mk.y - SI.MARK_R * 1.4 : mk.y, SI.MARK_R * 1.6, 0, Math.PI * 2); lvx.stroke(); lvx.restore(); }
      var o = selObj(); if (o && tool === 'select') {
        lvx.save(); lvx.strokeStyle = '#3A8AA8'; lvx.lineWidth = 1.5 / view.s; lvx.setLineDash([6 / view.s, 4 / view.s]); lvx.strokeRect(o.x, o.y, o.w, o.h); lvx.setLineDash([]);
        handles(o).forEach(function (h) { lvx.fillStyle = '#fff'; lvx.beginPath(); lvx.arc(h.x, h.y, 7 / view.s, 0, Math.PI * 2); lvx.fill(); lvx.stroke(); });
        lvx.restore();
      }
    }
    function render() { renderBg(); renderInk(); renderLive(); }

    // ---------- objects ----------
    function selObj() { return sel && page ? (page.objects || []).find(function (o) { return o.id === sel; }) : null; }
    function handles(o) { return [{ k: 'nw', x: o.x, y: o.y }, { k: 'ne', x: o.x + o.w, y: o.y }, { k: 'sw', x: o.x, y: o.y + o.h }, { k: 'se', x: o.x + o.w, y: o.y + o.h }]; }
    function objectAt(pt) { var os = page.objects || []; for (var i = os.length - 1; i >= 0; i--) { var o = os[i]; if (pt[0] >= o.x && pt[0] <= o.x + o.w && pt[1] >= o.y && pt[1] <= o.y + o.h) return o; } return null; }
    function handleAt(pt) { var o = selObj(); if (!o) return null; var r = 14 / view.s; return handles(o).find(function (h) { return Math.hypot(h.x - pt[0], h.y - pt[1]) <= r; }) || null; }
    function selMarkObj() { return selMark && page ? (page.marks || []).find(function (m) { return m.id === selMark; }) : null; }
    function addMark(def, pt) {
      page.marks = page.marks || [];
      var m = { id: uid('m_'), code: def.code, kind: def.kind || 'block', label: def.label, glyph: def.glyph, c: def.c || null, nn: def.nn || null, block_code: def.block_code || null, x: r2(pt[0]), y: r2(pt[1]), t: Date.now() };
      page.marks.push(m); selMark = m.id; sel = null;
      undo.push({ type: 'mark-add', mark: m }); redo.length = 0; onChange({ type: 'mark', action: 'add', mark: m }); render(); return m;
    }
    function removeMark(id) {
      var i = (page.marks || []).findIndex(function (m) { return m.id === id; }); if (i < 0) return;
      var m = page.marks.splice(i, 1)[0]; if (selMark === id) selMark = null;
      undo.push({ type: 'mark-remove', mark: m, index: i }); redo.length = 0; onChange({ type: 'mark', action: 'remove', mark: m }); render();
    }
    function addObject(o) {
      page.objects = page.objects || []; o.id = o.id || uid('o_'); o.t = o.t || Date.now();
      page.objects.push(o); sel = o.id; undo.push({ type: 'obj-add', object: o }); redo.length = 0; onChange({ type: 'object', action: 'add', object: o }); render(); return o;
    }
    function removeSelected() {
      if (selMark) { removeMark(selMark); return; }
      var o = selObj(); if (!o) return; var i = page.objects.indexOf(o); page.objects.splice(i, 1); sel = null;
      undo.push({ type: 'obj-remove', object: o, index: i }); redo.length = 0; onChange({ type: 'object', action: 'remove', object: o }); render();
    }

    // ---------- input ----------
    host.style.touchAction = 'none';
    function isDrawPointer(e) {
      if (tool === 'pan' || tool === 'select' || tool === 'mark') return false;
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') return true;
      if (e.pointerType === 'touch') return fingerDraw && Date.now() > penActiveUntil && pointers.size <= 1;
      return false;
    }
    function begin(e) {
      var pt = toPage(e.clientX, e.clientY);
      if (tool === 'eraser') { cur = { eraser: true, r: 14 / view.s }; eraseAt(pt); return; }
      cur = { id: uid(), tool: tool === 'hl' ? 'hl' : 'pen', c: colour, w: width, t: Date.now(), pts: [[r2(pt[0]), r2(pt[1]), r2(e.pressure || 0.5)]] };
      renderLive();
    }
    function move(e) {
      if (!cur) return;
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      for (var i = 0; i < evs.length; i++) {
        var pt = toPage(evs[i].clientX, evs[i].clientY);
        if (cur.eraser) { eraseAt(pt); continue; }
        var last = cur.pts[cur.pts.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) * view.s < 0.9) continue;
        cur.pts.push([r2(pt[0]), r2(pt[1]), r2(evs[i].pressure || 0.5)]);
      }
      if (!cur.eraser) renderLive();
    }
    function end() {
      if (!cur) return;
      if (cur.eraser) { if (cur.hit && cur.hit.length) { undo.push({ type: 'erase', strokes: cur.removed }); redo.length = 0; onChange({ type: 'erase', ids: cur.hit.slice() }); } cur = null; return; }
      var st = cur; cur = null; clear(lvx);
      page.strokes.push(st); applyView(inx); drawStroke(inx, st);
      undo.push({ type: 'add', stroke: st }); redo.length = 0; onChange({ type: 'add', stroke: st });
    }
    function eraseAt(pt) {
      var r = cur.r, hit = [];
      for (var i = page.strokes.length - 1; i >= 0; i--) {
        var st = page.strokes[i], pts = st.pts, near = false;
        for (var j = 0; j < pts.length && !near; j++) {
          if (Math.abs(pts[j][0] - pt[0]) > r + 20 || Math.abs(pts[j][1] - pt[1]) > r + 20) continue;
          if (segDist(pt, pts[Math.max(0, j - 1)], pts[j]) <= r + widthAt(st, pts[j][2]) / 2) near = true;
        }
        if (near) hit.push(i);
      }
      if (!hit.length) return;
      cur.hit = cur.hit || []; cur.removed = cur.removed || [];
      hit.forEach(function (idx) { var st = page.strokes.splice(idx, 1)[0]; cur.hit.push(st.id); cur.removed.push(st); });
      renderInk();
    }
    function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; var t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); }

    function onDown(e) {
      if (!page) return;
      try { host.setPointerCapture && host.setPointerCapture(e.pointerId); } catch (err) { }
      if (e.pointerType === 'pen') penActiveUntil = Date.now() + 1500;
      if (e.pointerType === 'touch') {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          if (cur && cur.byTouch) { cur = null; clear(lvx); } drag = null; mdrag = null;
          var a = Array.from(pointers.values()); pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, s: view.s, tx: view.tx, ty: view.ty };
          panStart = null; return;
        }
      }
      if (tool === 'mark') {   // v0.4.1: a tap ALWAYS places (grabbing a nearby mark made it "stuck" on the iPad); Select moves marks
        var mp = toPage(e.clientX, e.clientY);
        if (!markDef) { panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return; }
        if (mp[0] < 0 || mp[1] < 0 || mp[0] > page.space.w || mp[1] > page.space.h) return;
        addMark(markDef, mp); e.preventDefault(); return;
      }
      if (tool === 'select') {
        var pt = toPage(e.clientX, e.clientY), hitMk = SI ? SI.markAt(page.marks, pt) : null;
        if (hitMk) { selMark = hitMk.id; sel = null; mdrag = { id: e.pointerId, start: pt, orig: { x: hitMk.x, y: hitMk.y } }; renderLive(); e.preventDefault(); return; }
        selMark = null;
        var h = handleAt(pt), o = h ? selObj() : objectAt(pt);
        if (o) { sel = o.id; drag = { id: e.pointerId, mode: h ? 'resize' : 'move', handle: h && h.k, start: pt, orig: { x: o.x, y: o.y, w: o.w, h: o.h } }; renderLive(); e.preventDefault(); return; }
        sel = null; renderLive(); panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return;
      }
      if (!isDrawPointer(e)) { panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return; }
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) { panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return; }
      if (cur) end();
      begin(e); if (cur) { cur.byTouch = e.pointerType === 'touch'; cur.penId = e.pointerId; }
      e.preventDefault();
    }
    function onMove(e) {
      if (e.pointerType === 'touch' && pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        var a = Array.from(pointers.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
        var f = Math.max(0.1, Math.min(12, pinch.s * (d / pinch.d))) / pinch.s;
        var r = host.getBoundingClientRect(), px = pinch.cx - r.left, py = pinch.cy - r.top;
        view.s = pinch.s * f; view.tx = px - (px - pinch.tx) * f + (cx - pinch.cx); view.ty = py - (py - pinch.ty) * f + (cy - pinch.cy); clampView(); render(); return;
      }
      if (mdrag && mdrag.id === e.pointerId) { var mm = selMarkObj(); if (mm) { var mpt = toPage(e.clientX, e.clientY); mm.x = r2(mdrag.orig.x + mpt[0] - mdrag.start[0]); mm.y = r2(mdrag.orig.y + mpt[1] - mdrag.start[1]); renderBg(); renderLive(); } return; }
      if (drag && drag.id === e.pointerId) {
        var o = selObj(); if (!o) return; var pt = toPage(e.clientX, e.clientY), dx = pt[0] - drag.start[0], dy = pt[1] - drag.start[1], g = drag.orig;
        if (drag.mode === 'move') { o.x = r2(g.x + dx); o.y = r2(g.y + dy); }
        else { var ar = g.w / g.h, nw, nh;
          if (drag.handle === 'se') { nw = Math.max(40, g.w + dx); nh = nw / ar; o.w = r2(nw); o.h = r2(nh); }
          else if (drag.handle === 'sw') { nw = Math.max(40, g.w - dx); nh = nw / ar; o.x = r2(g.x + g.w - nw); o.w = r2(nw); o.h = r2(nh); }
          else if (drag.handle === 'ne') { nw = Math.max(40, g.w + dx); nh = nw / ar; o.y = r2(g.y + g.h - nh); o.w = r2(nw); o.h = r2(nh); }
          else { nw = Math.max(40, g.w - dx); nh = nw / ar; o.x = r2(g.x + g.w - nw); o.y = r2(g.y + g.h - nh); o.w = r2(nw); o.h = r2(nh); } }
        renderBg(); renderLive(); return;
      }
      if (panStart) { view.tx = panStart.tx + (e.clientX - panStart.x); view.ty = panStart.ty + (e.clientY - panStart.y); clampView(); render(); return; }
      if (cur && cur.penId === e.pointerId) { move(e); e.preventDefault(); return; }
      if (tool === 'select' && e.pointerType === 'mouse' && !e.buttons) hoverCursor(toPage(e.clientX, e.clientY));
    }
    function hoverCursor(pt) {   // Mac: the cursor says what a click will do (resize corner · move · grab-to-pan)
      var h = handleAt(pt), c = 'default';
      if (h) c = (h.k === 'nw' || h.k === 'se') ? 'nwse-resize' : 'nesw-resize';
      else if ((SI && SI.markAt(page.marks, pt)) || objectAt(pt)) c = 'move';
      else c = 'grab';
      if (host.style.cursor !== c) host.style.cursor = c;
    }
    function resetGestures() { cur = null; drag = null; mdrag = null; panStart = null; pinch = null; pointers.clear(); clear(lvx); renderLive(); }
    function onUp(e) {
      if (e.pointerType === 'touch') { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; }
      if (mdrag && mdrag.id === e.pointerId) {   // v0.4.3: one block — the old early `return` never cleared mdrag, so the first mark grabbed stayed glued to the pointer and nothing else could be selected
        var mk2 = selMarkObj(), mg = mdrag.orig, ms = mdrag.start; mdrag = null;
        if (mk2) { var mpt = toPage(e.clientX, e.clientY); mk2.x = r2(Math.max(0, Math.min(page.space.w, mg.x + mpt[0] - ms[0]))); mk2.y = r2(Math.max(0, Math.min(page.space.h, mg.y + mpt[1] - ms[1]))); }
        if (mk2 && (mk2.x !== mg.x || mk2.y !== mg.y)) { undo.push({ type: 'mark-update', id: mk2.id, before: mg, after: { x: mk2.x, y: mk2.y } }); redo.length = 0; onChange({ type: 'mark', action: 'update', mark: mk2 }); }
        renderBg(); renderLive(); return;
      }
      if (drag && drag.id === e.pointerId) { var o = selObj(), g = drag.orig; drag = null; if (o && (o.x !== g.x || o.y !== g.y || o.w !== g.w || o.h !== g.h)) { undo.push({ type: 'obj-update', id: o.id, before: g, after: { x: o.x, y: o.y, w: o.w, h: o.h } }); redo.length = 0; onChange({ type: 'object', action: 'update', object: o }); } }
      if (panStart) panStart = null;
      if (cur && cur.penId === e.pointerId) end();
      if (cur && cur.eraser) end();
    }
    host.addEventListener('pointerdown', onDown); host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', function (e) { onUp(e); if (cur) end(); resetGestures(); });   // a cancelled gesture (palm, OS swipe, tab switch) never leaves a half-drag armed
    window.addEventListener('blur', function () { if (cur) end(); resetGestures(); });
    host.addEventListener('pointerleave', function () { if (tool === 'select') host.style.cursor = ''; });
    host.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else { view.tx -= e.deltaX; view.ty -= e.deltaY; clampView(); render(); }
    }, { passive: false });

    // ---------- undo / redo ----------
    function applyObj(o, r) { o.x = r.x; o.y = r.y; o.w = r.w; o.h = r.h; }
    function doUndo() {
      var op = undo.pop(); if (!op) return;
      if (op.type === 'add') { var i = page.strokes.indexOf(op.stroke); if (i >= 0) page.strokes.splice(i, 1); onChange({ type: 'erase', ids: [op.stroke.id], undo: true }); }
      else if (op.type === 'erase') { op.strokes.forEach(function (s) { page.strokes.push(s); onChange({ type: 'add', stroke: s, undo: true }); }); }
      else if (op.type === 'obj-add') { var j = page.objects.indexOf(op.object); if (j >= 0) page.objects.splice(j, 1); if (sel === op.object.id) sel = null; onChange({ type: 'object', action: 'remove', object: op.object }); }
      else if (op.type === 'obj-remove') { page.objects.splice(Math.min(op.index, page.objects.length), 0, op.object); onChange({ type: 'object', action: 'add', object: op.object }); }
      else if (op.type === 'obj-update') { var o = page.objects.find(function (x) { return x.id === op.id; }); if (o) { applyObj(o, op.before); onChange({ type: 'object', action: 'update', object: o }); } }
      else if (op.type === 'mark-add') { var mi = page.marks.indexOf(op.mark); if (mi >= 0) page.marks.splice(mi, 1); if (selMark === op.mark.id) selMark = null; onChange({ type: 'mark', action: 'remove', mark: op.mark }); }
      else if (op.type === 'mark-remove') { page.marks.splice(Math.min(op.index, page.marks.length), 0, op.mark); onChange({ type: 'mark', action: 'add', mark: op.mark }); }
      else if (op.type === 'mark-update') { var mu = page.marks.find(function (x) { return x.id === op.id; }); if (mu) { mu.x = op.before.x; mu.y = op.before.y; onChange({ type: 'mark', action: 'update', mark: mu }); } }
      redo.push(op); render();
    }
    function doRedo() {
      var op = redo.pop(); if (!op) return;
      if (op.type === 'add') { page.strokes.push(op.stroke); onChange({ type: 'add', stroke: op.stroke }); }
      else if (op.type === 'erase') { op.strokes.forEach(function (s) { var i = page.strokes.indexOf(s); if (i >= 0) page.strokes.splice(i, 1); }); onChange({ type: 'erase', ids: op.strokes.map(function (s) { return s.id; }) }); }
      else if (op.type === 'obj-add') { page.objects.push(op.object); onChange({ type: 'object', action: 'add', object: op.object }); }
      else if (op.type === 'obj-remove') { var j = page.objects.indexOf(op.object); if (j >= 0) page.objects.splice(j, 1); onChange({ type: 'object', action: 'remove', object: op.object }); }
      else if (op.type === 'obj-update') { var o = page.objects.find(function (x) { return x.id === op.id; }); if (o) { applyObj(o, op.after); onChange({ type: 'object', action: 'update', object: o }); } }
      else if (op.type === 'mark-add') { page.marks.push(op.mark); onChange({ type: 'mark', action: 'add', mark: op.mark }); }
      else if (op.type === 'mark-remove') { var mj = page.marks.indexOf(op.mark); if (mj >= 0) page.marks.splice(mj, 1); onChange({ type: 'mark', action: 'remove', mark: op.mark }); }
      else if (op.type === 'mark-update') { var mu2 = page.marks.find(function (x) { return x.id === op.id; }); if (mu2) { mu2.x = op.after.x; mu2.y = op.after.y; onChange({ type: 'mark', action: 'update', mark: mu2 }); } }
      undo.push(op); render();
    }

    return {
      setPage: function (p) { page = p; page.strokes = page.strokes || []; page.objects = page.objects || []; page.marks = page.marks || []; page.images = page.images || {}; undo.length = 0; selMark = null; mdrag = null; redo.length = 0; cur = null; sel = null; drag = null; resize(); fit(); },
      getPage: function () { return page; },
      setTool: function (t) { tool = t; host.dataset.tool = t; drag = null; mdrag = null; panStart = null; host.style.cursor = ''; if (t !== 'select') sel = null; if (t !== 'select' && t !== 'mark') selMark = null; renderLive(); }, getTool: function () { return tool; },
      clearSelection: function () { sel = null; selMark = null; drag = null; mdrag = null; renderLive(); },
      setMarkDef: function (d) { markDef = d; selMark = null; renderLive(); }, selectedMark: selMarkObj, selectMark: function (id) { selMark = id; renderLive(); }, addMarkAt: addMark, updateMark: function (id, patch) { var m = (page.marks || []).find(function (x) { return x.id === id; }); if (!m) return; Object.assign(m, patch); onChange({ type: 'mark', action: 'update', mark: m }); render(); },
      setColour: function (c) { colour = c; }, setWidth: function (w) { width = w; },
      fingerDraws: function (b) { fingerDraw = !!b; },
      undo: doUndo, redo: doRedo, canUndo: function () { return undo.length > 0; }, canRedo: function () { return redo.length > 0; },
      fit: fit, render: render, zoomAt: zoomAt, viewCentrePage: viewCentrePage,
      addObject: addObject, removeSelected: removeSelected, selected: selObj, removeMark: removeMark, select: function (id) { sel = id; renderLive(); },
      thumbnail: function (tw) { return page ? renderPage(page, null, tw, { minStroke: 2.5, minMark: 9 }).toDataURL('image/png') : null; },
      drawStrokeTo: drawStroke,
      destroy: function () { ro.disconnect(); host.innerHTML = ''; }
    };
  }
  return { create: create, renderPage: renderPage, drawStroke: drawStroke, VERSION: '0.4.3' };
})();
