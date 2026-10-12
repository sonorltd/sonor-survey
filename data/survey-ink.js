/* Sonor Survey — INK ENGINE (app-local, v0.1.0)
 * Pointer-events pencil layer on Canvas 2D. Direct-object model (ADAPTER_INVARIANTS): every stroke point is stored
 * in PAGE units (the page's own frame — note 1000×1414, plan = Takeoffs 1400×900 world frame, photo = image px);
 * the view transform (scale + pan) is applied only at render time. Nothing here touches Supabase.
 *
 * Stroke record: { id, tool:'pen'|'hl', c:'#hex', w:<base width in page units>, t:<epoch ms>, pts:[[x,y,p],…] }
 * API:
 *   const ink = SurveyInk.create({ host, onChange(op) })      // op = {type:'add',stroke} | {type:'erase',ids}
 *   ink.setPage({ space:{w,h}, strokes:[], paper:'blank'|'lined'|'grid'|'image', image?:ImageBitmap|HTMLImageElement, imageFit?:{x,y,w,h} })
 *   ink.setTool('pen'|'hl'|'eraser'|'pan'); ink.setColour(hex); ink.setWidth(n); ink.undo(); ink.redo(); ink.fit();
 *   ink.fingerDraws(bool); ink.render(); ink.thumbnail(w,h) → dataURL; ink.destroy()
 */
window.SurveyInk = (function () {
  'use strict';
  var CFG = window.__SURVEY_CONFIG__ || {};
  var PAPER = (CFG.paper) || { line: 36, grid: 25 };

  function uid() { return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function create(opts) {
    var host = opts.host, onChange = opts.onChange || function () {};
    var bg = mk('bg'), inkC = mk('ink'), live = mk('live');
    function mk(n) { var c = document.createElement('canvas'); c.className = 'sv-layer sv-layer-' + n; host.appendChild(c); return c; }
    var bgx = bg.getContext('2d'), inx = inkC.getContext('2d'), lvx = live.getContext('2d');
    var page = null, dpr = Math.max(1, window.devicePixelRatio || 1);
    var view = { s: 1, tx: 0, ty: 0 };
    var tool = 'pen', colour = '#141414', width = 3.5, fingerDraw = false;
    var undo = [], redo = [];
    var cur = null;              // current stroke being drawn
    var pointers = new Map();    // active pointers (touch) for pan / pinch
    var penActiveUntil = 0;      // palm rejection window
    var pinch = null, panStart = null;
    var W = 0, H = 0;

    function resize() {
      var r = host.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0);
      dpr = Math.max(1, window.devicePixelRatio || 1);
      [bg, inkC, live].forEach(function (c) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; });
      render();
    }
    var ro = new ResizeObserver(function () { resize(); });
    ro.observe(host);

    // ---------- view ----------
    function fit() {
      if (!page) return;
      var s = Math.min(W / page.space.w, H / page.space.h) * 0.97;
      view.s = s; view.tx = (W - page.space.w * s) / 2; view.ty = (H - page.space.h * s) / 2;
      render();
    }
    function toPage(cx, cy) { var r = host.getBoundingClientRect(); return [(cx - r.left - view.tx) / view.s, (cy - r.top - view.ty) / view.s]; }
    function applyView(ctx) { ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty); }
    function zoomAt(cx, cy, f) {
      var r = host.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
      var ns = Math.max(0.1, Math.min(12, view.s * f)); f = ns / view.s;
      view.tx = px - (px - view.tx) * f; view.ty = py - (py - view.ty) * f; view.s = ns; render();
    }

    // ---------- render ----------
    function clear(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W * dpr, H * dpr); }
    function renderBg() {
      clear(bgx); if (!page) return;
      applyView(bgx);
      var sp = page.space;
      bgx.save();
      bgx.shadowColor = 'rgba(0,0,0,.45)'; bgx.shadowBlur = 18 / view.s; bgx.shadowOffsetY = 4 / view.s;
      bgx.fillStyle = '#ffffff'; bgx.fillRect(0, 0, sp.w, sp.h);
      bgx.restore();
      bgx.beginPath(); bgx.rect(0, 0, sp.w, sp.h); bgx.clip();
      if (page.image) {
        var f = page.imageFit || { x: 0, y: 0, w: sp.w, h: sp.h };
        try { bgx.drawImage(page.image, f.x, f.y, f.w, f.h); } catch (e) { }
      } else if (page.paper === 'lined') {
        bgx.strokeStyle = '#c9d3e6'; bgx.lineWidth = 1 / view.s;
        for (var y = PAPER.line * 2; y < sp.h; y += PAPER.line) { bgx.beginPath(); bgx.moveTo(40, y); bgx.lineTo(sp.w - 40, y); bgx.stroke(); }
        bgx.strokeStyle = '#f0b9b9'; bgx.beginPath(); bgx.moveTo(90, 0); bgx.lineTo(90, sp.h); bgx.stroke();
      } else if (page.paper === 'grid') {
        bgx.strokeStyle = '#dde3ee'; bgx.lineWidth = 1 / view.s; bgx.beginPath();
        for (var gx = 0; gx <= sp.w; gx += PAPER.grid) { bgx.moveTo(gx, 0); bgx.lineTo(gx, sp.h); }
        for (var gy = 0; gy <= sp.h; gy += PAPER.grid) { bgx.moveTo(0, gy); bgx.lineTo(sp.w, gy); }
        bgx.stroke();
      }
    }
    function drawStroke(ctx, st, s) {
      var pts = st.pts; if (!pts || !pts.length) return;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.c;
      if (st.tool === 'hl') { ctx.globalAlpha = 0.32; ctx.globalCompositeOperation = 'multiply'; ctx.lineCap = 'butt'; }
      if (pts.length === 1) {
        ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], widthAt(st, pts[0][2]) / 2, 0, Math.PI * 2); ctx.fillStyle = st.c; ctx.fill(); ctx.restore(); return;
      }
      // variable-width polyline: one sub-path per segment, mid-point smoothing
      var prev = pts[0];
      for (var i = 1; i < pts.length; i++) {
        var p = pts[i], w = (widthAt(st, prev[2]) + widthAt(st, p[2])) / 2;
        ctx.lineWidth = Math.max(0.4, w);
        ctx.beginPath();
        if (i > 1) { var pp = pts[i - 2]; ctx.moveTo((pp[0] + prev[0]) / 2, (pp[1] + prev[1]) / 2); ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2); }
        else { ctx.moveTo(prev[0], prev[1]); ctx.lineTo((prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2); }
        if (i === pts.length - 1) { ctx.lineTo(p[0], p[1]); }
        ctx.stroke();
        prev = p;
      }
      ctx.restore();
    }
    function widthAt(st, p) {
      if (st.tool === 'hl') return st.w * 4;
      var pr = (p == null || p === 0) ? 0.5 : p;
      return st.w * (0.45 + 1.1 * pr);
    }
    function renderInk() { clear(inx); if (!page) return; applyView(inx); page.strokes.forEach(function (st) { drawStroke(inx, st); }); }
    function renderLive() { clear(lvx); if (!cur) return; applyView(lvx); drawStroke(lvx, cur); }
    function render() { renderBg(); renderInk(); renderLive(); }

    // ---------- input ----------
    host.style.touchAction = 'none';
    function isDrawPointer(e) {
      if (tool === 'pan') return false;
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
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) * view.s < 0.9) continue;   // sub-pixel jitter
        cur.pts.push([r2(pt[0]), r2(pt[1]), r2(evs[i].pressure || 0.5)]);
      }
      if (!cur.eraser) renderLive();
    }
    function end() {
      if (!cur) return;
      if (cur.eraser) { if (cur.hit && cur.hit.length) { var ids = cur.hit.slice(); undo.push({ type: 'erase', strokes: cur.removed }); redo.length = 0; onChange({ type: 'erase', ids: ids }); } cur = null; return; }
      var st = cur; cur = null; clear(lvx);
      if (st.pts.length < 1) return;
      page.strokes.push(st); applyView(inx); drawStroke(inx, st);
      undo.push({ type: 'add', stroke: st }); redo.length = 0;
      onChange({ type: 'add', stroke: st });
    }
    function eraseAt(pt) {
      var r = cur.r, hit = [];
      for (var i = page.strokes.length - 1; i >= 0; i--) {
        var st = page.strokes[i], pts = st.pts, near = false;
        for (var j = 0; j < pts.length && !near; j++) {
          if (Math.abs(pts[j][0] - pt[0]) > r + 20 || Math.abs(pts[j][1] - pt[1]) > r + 20) continue;
          var q = pts[Math.max(0, j - 1)];
          if (segDist(pt, q, pts[j]) <= r + widthAt(st, pts[j][2]) / 2) near = true;
        }
        if (near) hit.push(i);
      }
      if (!hit.length) return;
      cur.hit = cur.hit || []; cur.removed = cur.removed || [];
      hit.forEach(function (idx) { var st = page.strokes.splice(idx, 1)[0]; cur.hit.push(st.id); cur.removed.push(st); });
      renderInk();
    }
    function segDist(p, a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
      return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }
    function r2(v) { return Math.round(v * 100) / 100; }

    function onDown(e) {
      if (!page) return;
      try { host.setPointerCapture && host.setPointerCapture(e.pointerId); } catch (err) { }
      if (e.pointerType === 'pen') penActiveUntil = Date.now() + 1500;   // a touch landing while the pen is near = palm
      if (e.pointerType === 'touch') {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) { // pinch → cancel any touch stroke
          if (cur && cur.byTouch) { cur = null; clear(lvx); }
          var a = Array.from(pointers.values()); pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, s: view.s, tx: view.tx, ty: view.ty };
          panStart = null; return;
        }
        if (!isDrawPointer(e)) { panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return; }
      }
      if (e.pointerType === 'mouse' && (tool === 'pan' || e.button === 1 || e.button === 2)) { panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return; }
      if (!isDrawPointer(e)) { if (e.pointerType !== 'touch') panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return; }
      if (cur) end();
      begin(e); cur && (cur.byTouch = e.pointerType === 'touch', cur.penId = e.pointerId);
      e.preventDefault();
    }
    function onMove(e) {
      if (e.pointerType === 'touch' && pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        var a = Array.from(pointers.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
        var f = Math.max(0.1, Math.min(12, pinch.s * (d / pinch.d))) / pinch.s;
        var r = host.getBoundingClientRect(), px = pinch.cx - r.left, py = pinch.cy - r.top;
        view.s = pinch.s * f; view.tx = px - (px - pinch.tx) * f + (cx - pinch.cx); view.ty = py - (py - pinch.ty) * f + (cy - pinch.cy);
        render(); return;
      }
      if (panStart) { view.tx = panStart.tx + (e.clientX - panStart.x); view.ty = panStart.ty + (e.clientY - panStart.y); render(); return; }
      if (cur && cur.penId === e.pointerId) { move(e); e.preventDefault(); }
    }
    function onUp(e) {
      if (e.pointerType === 'touch') { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; }
      if (panStart) { panStart = null; }
      if (cur && cur.penId === e.pointerId) end();
      if (cur && cur.eraser) end();
    }
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else { view.tx -= e.deltaX; view.ty -= e.deltaY; render(); }
    }, { passive: false });

    // ---------- undo / redo ----------
    function doUndo() {
      var op = undo.pop(); if (!op) return;
      if (op.type === 'add') { var i = page.strokes.indexOf(op.stroke); if (i >= 0) page.strokes.splice(i, 1); onChange({ type: 'erase', ids: [op.stroke.id], undo: true }); }
      else { op.strokes.forEach(function (s) { page.strokes.push(s); onChange({ type: 'add', stroke: s, undo: true }); }); }
      redo.push(op); renderInk();
    }
    function doRedo() {
      var op = redo.pop(); if (!op) return;
      if (op.type === 'add') { page.strokes.push(op.stroke); onChange({ type: 'add', stroke: op.stroke }); }
      else { op.strokes.forEach(function (s) { var i = page.strokes.indexOf(s); if (i >= 0) page.strokes.splice(i, 1); }); onChange({ type: 'erase', ids: op.strokes.map(function (s) { return s.id; }) }); }
      undo.push(op); renderInk();
    }

    function thumbnail(tw, th) {
      if (!page) return null;
      var c = document.createElement('canvas'); c.width = tw; c.height = th; var x = c.getContext('2d');
      var s = Math.min(tw / page.space.w, th / page.space.h);
      x.fillStyle = '#fff'; x.fillRect(0, 0, tw, th);
      x.setTransform(s, 0, 0, s, (tw - page.space.w * s) / 2, (th - page.space.h * s) / 2);
      if (page.image) { var f = page.imageFit || { x: 0, y: 0, w: page.space.w, h: page.space.h }; try { x.drawImage(page.image, f.x, f.y, f.w, f.h); } catch (e) { } }
      page.strokes.forEach(function (st) { var st2 = Object.assign({}, st, { w: Math.max(st.w, 2.5 / s) }); drawStroke(x, st2); });
      return c.toDataURL('image/png');
    }

    return {
      setPage: function (p) { page = p; undo.length = 0; redo.length = 0; cur = null; resize(); fit(); },
      getPage: function () { return page; },
      setTool: function (t) { tool = t; host.dataset.tool = t; }, getTool: function () { return tool; },
      setColour: function (c) { colour = c; }, setWidth: function (w) { width = w; },
      fingerDraws: function (b) { fingerDraw = !!b; },
      undo: doUndo, redo: doRedo, canUndo: function () { return undo.length > 0; }, canRedo: function () { return redo.length > 0; },
      fit: fit, render: render, zoomAt: zoomAt, thumbnail: thumbnail, drawStrokeTo: drawStroke,
      destroy: function () { ro.disconnect(); host.innerHTML = ''; }
    };
  }
  return { create: create, VERSION: '0.1.0' };
})();
