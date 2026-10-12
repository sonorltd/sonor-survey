/* sonor-ink.js — SHARED INK RENDERER (canonical master at workspace root, synced to every app's data/)
 * v1.0.0 (2026-10-12, APP - Survey v0.3.0 / Takeoffs survey-ink layer) — HARMONY §3: the one place that knows how a
 * Survey stroke / image object is painted, so Takeoffs (overlay layer), Survey (editor, thumbnails, PDF report) and any
 * future consumer (Tasks snag pins, Portal) render byte-identical ink from the same `survey_pages.ink` record.
 * Pure Canvas 2D, no DOM, no Supabase, no view state: every point is in PAGE units (plan pages = the Takeoffs 1400×900
 * world frame). Callers set the context transform; this module only draws.
 *   stroke: { id, tool:'pen'|'hl', c:'#hex', w, t, pts:[[x,y,p],…] }
 *   object: { id, kind:'image', src, path, x, y, w, h }        images: { [src]: ImageBitmap|HTMLImageElement }
 * API: SonorInk.widthAt(stroke, p) · drawStroke(ctx, stroke, {alpha}) · drawObjects(ctx, objects, images, {alpha, skipMissing}) ·
 *      drawPaper(ctx, page, lineWidth) · renderPage(page, canvas, pxWidth, {minStroke}) · drawInk(ctx, ink, images, opts)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(); else root.SonorInk = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.0.0', PAPER = { line: 36, grid: 25 };
  function widthAt(st, p) { if (st.tool === 'hl') return st.w * 4; var pr = (p == null || p === 0) ? 0.5 : p; return st.w * (0.45 + 1.1 * pr); }
  function drawStroke(ctx, st, opts) {
    var pts = st.pts; if (!pts || !pts.length) return;
    var alpha = (opts && opts.alpha != null) ? opts.alpha : 1;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.c; ctx.globalAlpha = alpha;
    if (st.tool === 'hl') { ctx.globalAlpha = 0.32 * alpha; ctx.globalCompositeOperation = 'multiply'; ctx.lineCap = 'butt'; }
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
  function drawObjects(ctx, objects, images, opts) {
    var alpha = (opts && opts.alpha != null) ? opts.alpha : 1;
    (objects || []).forEach(function (o) {
      var im = images && images[o.src];
      ctx.save(); ctx.globalAlpha = alpha;
      if (im) { try { ctx.drawImage(im, o.x, o.y, o.w, o.h); } catch (e) { } }
      else if (!(opts && opts.skipMissing)) { ctx.fillStyle = '#eef0f4'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = '#b8bec8'; ctx.lineWidth = 1; ctx.strokeRect(o.x, o.y, o.w, o.h); }
      ctx.restore();
    });
  }
  function drawPaper(ctx, page, lw) {
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
  function drawInk(ctx, ink, images, opts) {
    drawObjects(ctx, (ink && ink.objects) || [], images, Object.assign({ skipMissing: true }, opts || {}));
    ((ink && ink.strokes) || []).forEach(function (st) { drawStroke(ctx, st, opts); });
  }
  function renderPage(page, canvas, pxWidth, opts) {
    opts = opts || {}; var sp = page.space, s = pxWidth / sp.w;
    canvas = canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    canvas.width = Math.round(pxWidth); canvas.height = Math.round(sp.h * s);
    var x = canvas.getContext('2d'); x.setTransform(s, 0, 0, s, 0, 0);
    drawPaper(x, page, 1 / s); drawObjects(x, page.objects, page.images);
    (page.strokes || []).forEach(function (st) { drawStroke(x, opts.minStroke ? Object.assign({}, st, { w: Math.max(st.w, opts.minStroke / s) }) : st); });
    return canvas;
  }
  return { VERSION: VERSION, PAPER: PAPER, widthAt: widthAt, drawStroke: drawStroke, drawObjects: drawObjects, drawPaper: drawPaper, drawInk: drawInk, renderPage: renderPage };
}));
