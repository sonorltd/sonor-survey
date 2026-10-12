/* Sonor Survey — SURVEY / MEETING REPORT PDF (app-local, v0.5.0)
 * The luxury proposal chrome (root master data/sonor-pdf-luxury.js — cover · pageHead brand:'large' · pageFoot ·
 * sectionHead · specRows) on pdf-lib. Page images come from SurveyInk.renderPage (paper + photos + ink + marks) so the
 * PDF is exactly what was on the iPad. One A4 portrait per survey page; checklists as tick tables (paginated).
 * v0.5.0 — the SUMMARY aspect (Bryn: "the pdf should thumbnail photos that are pinned on that page and also show text / id,
 *   any symbol counts should also show the icon in a legend"):
 *   · every photo gets a report-wide tag P1…Pn; the tag is painted beside its pin on the plan image, heads the photo page,
 *     and labels its thumbnail — so plan ↔ thumbnail ↔ photo page cross-reference by eye;
 *   · plan pages carry a DEVICES legend drawn with the real icons (service colour + glyph) and counts, then a PINNED PHOTOS
 *     thumbnail grid (rendered photo page incl. its ink, tag + title / room), spilling onto continuation pages when needed;
 *   · the summary page gains a DEVICE SCHEDULE by floor (icons + counts, photos pinned / total) ahead of the contents;
 *   · two-pass layout (dry → draw) so "n / T" page numbers and "see page n" references are exact.
 * API: await SurveyPdf.report({ project, session, pages:[{row, model|null}], engineer, coverBlob? }) → Uint8Array · SurveyPdf.download(bytes, filename)
 */
window.SurveyPdf = (function () {
  'use strict';
  function selfDir() { try { var s = document.currentScript; if (s && s.src) return s.src.replace(/[^/]*$/, ''); } catch (e) { } return '../data/'; }
  var BASE = selfDir(), DOC_LABEL = 'SURVEY REPORT';
  function L() { var lx = window.SonorPdfLuxury; if (!lx || !window.PDFLib) throw new Error('pdf-lib / SonorPdfLuxury not loaded'); return lx; }
  // WinAnsi-safe text: user-typed items can hold any glyph; Gilroy / Helvetica subset cannot (pdf-lib throws).
  var GLYPH = { '↔': '<->', '→': '->', '←': '<-', '✓': 'yes', '✔': 'yes', '✕': 'no', '✗': 'no', '☐': '[ ]', '☑': '[x]', '²': '2', '³': '3' };
  function pd(str) { return String(str == null ? '' : str).replace(/[↔→←✓✔✕✗☐☑]/g, function (c) { return GLYPH[c] || '?'; }).replace(/[^\x00-\xFF€‘’“”–—…•™]/g, '?'); }
  function fit(font, str, size, w) { str = pd(str); if (font.widthOfTextAtSize(str, size) <= w) return str; while (str.length > 1 && font.widthOfTextAtSize(str + '…', size) > w) str = str.slice(0, -1); return str + '…'; }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  function kindLabel(k) { return { survey: 'Site survey', meeting: 'Client meeting', 'snag-walk': 'Snag walk', handover: 'Handover', other: 'Site notes' }[k] || 'Site survey'; }
  function hex(h) { var lx = L(); try { var a = lx.hexRgb ? lx.hexRgb(h) : null; if (a && a.length === 3) return a; } catch (e) { } var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h || ''); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [152, 152, 157]; }
  function lum(a) { return 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]; }
  async function blobJpg(doc, blob) { return doc.embedJpg(new Uint8Array(await blob.arrayBuffer())); }
  async function canvasJpg(doc, canvas, q) { var b = await new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', q || 0.88); }); return blobJpg(doc, b); }
  var DARK = [28, 28, 30], WHITE = [255, 255, 255];

  // ── a no-op painter for the dry (measuring) pass — same surface as lx.mk(page) ──
  var NOOP = {}; ['text', 'tracked', 'right', 'rect', 'rectB', 'hline', 'vline', 'logo', 'image', 'dot', 'path'].forEach(function (k) { NOOP[k] = function () { }; });
  NOOP.page = { drawSvgPath: function () { }, drawRectangle: function () { }, drawCircle: function () { } };

  // ── icons (the same shapes SonorInk paints on the page) ──
  function icon(P, F, m, cx, cy, r) {
    if (m.kind === 'photo') {
      P.rect(cx - r, cy - r * 1.1, r * 2, r * 1.5, DARK); P.rectB(cx - r, cy - r * 1.1, r * 2, r * 1.5, WHITE, 0.6);
      P.page.drawSvgPath('M 0 0 L -' + (r * 0.55).toFixed(2) + ' -' + (r * 1.1).toFixed(2) + ' L ' + (r * 0.55).toFixed(2) + ' -' + (r * 1.1).toFixed(2) + ' Z', { x: cx, y: L().A4.h - (cy + r * 1.3), color: L().col(DARK) });
      P.dot(cx, cy - r * 0.35, r * 0.4, WHITE); P.dot(cx, cy - r * 0.35, r * 0.2, DARK);
      return;
    }
    var c = hex(m.c || '#98989D'); P.dot(cx, cy, r, c, WHITE);
    var g = pd(String(m.glyph || '?').slice(0, 4)), sz = r * 0.82, w = F.b.widthOfTextAtSize(g, sz);
    P.text(g, cx - w / 2, cy - sz * 0.56, sz, F.b, lum(c) > 150 ? [11, 26, 34] : WHITE);
  }
  function tagPill(P, F, tag, x, top) { var sz = 7, w = F.b.widthOfTextAtSize(tag, sz) + 8; P.rect(x, top, w, 11, DARK); P.text(tag, x + 4, top + 1.6, sz, F.b, WHITE); return w; }

  // ── analysis: tags, counts, cross-links ──
  function analyse(pages) {
    var byId = {}; pages.forEach(function (p) { byId[p.row.id] = p; });
    var tag = {}, seq = 0, pinnedBy = {};   // tag[photoPageId] = 'P3' · pinnedBy[photoPageId] = { plan page, mark }
    pages.forEach(function (p) {
      if (p.row.kind !== 'plan' || !p.model) return;
      (p.model.marks || []).forEach(function (m) {
        var pid = m.photo_page_id; if (!pid || !byId[pid] || tag[pid]) return;
        tag[pid] = 'P' + (++seq); pinnedBy[pid] = { plan: p, mark: m };
      });
    });
    pages.forEach(function (p) {   // photos whose pin record points at a plan but the mark lost its link, then unpinned photos
      if (p.row.kind !== 'photo' || tag[p.row.id]) return;
      tag[p.row.id] = 'P' + (++seq);
      var pin = p.row.metadata && p.row.metadata.plan_pin; if (pin && pin.page_id && byId[pin.page_id]) pinnedBy[p.row.id] = { plan: byId[pin.page_id], mark: (byId[pin.page_id].model && (byId[pin.page_id].model.marks || []).find(function (m) { return m.id === pin.mark_id; })) || null };
    });
    var thumbsFor = {}; Object.keys(pinnedBy).forEach(function (pid) { var pl = pinnedBy[pid].plan.row.id; (thumbsFor[pl] = thumbsFor[pl] || []).push(pid); });
    return { byId: byId, tag: tag, pinnedBy: pinnedBy, thumbsFor: thumbsFor, photoCount: seq };
  }
  function legendItems(marks) {   // [{m, n}] in first-seen order, photo pins last
    var out = [], idx = {}, photos = 0, ph = null;
    (marks || []).forEach(function (m) { if (m.kind === 'photo') { photos++; ph = ph || m; return; } var k = m.code || m.label || '?'; if (idx[k] == null) { idx[k] = out.length; out.push({ m: m, n: 0, label: m.label || m.code }); } out[idx[k]].n++; });
    if (photos) out.push({ m: ph, n: photos, label: photos === 1 ? 'Photo' : 'Photos' });
    return out;
  }
  function mergeLegend(items, into) { items.forEach(function (it) { var k = it.m.kind === 'photo' ? '__photo' : (it.m.code || it.label); if (!into[k]) into[k] = { m: it.m, n: 0, label: it.label }; into[k].n += it.n; }); }

  // ── layout helpers ──
  function legendRows(F, items, W) {   // chips wrapped into rows of {x, it}
    var rows = [], row = [], x = 0, sz = 8.5;
    items.forEach(function (it) {
      var txt = pd(it.label) + '  ×' + it.n, w = 18 + F.r.widthOfTextAtSize(txt, sz) + 16; it._txt = txt;
      if (x + w > W && row.length) { rows.push(row); row = []; x = 0; }
      row.push({ x: x, it: it }); x += w;
    });
    if (row.length) rows.push(row); return rows;
  }
  function drawLegend(P, F, items, x0, top, W) {
    var C = L().COL, rows = legendRows(F, items, W), y = top;
    P.tracked('DEVICES ON THIS PAGE', x0, y, 7, F.r, C.GOLD, 2.2); y += 14;
    rows.forEach(function (row) { row.forEach(function (c) { icon(P, F, c.it.m, x0 + c.x + 7, y + 5, 6); P.text(c.it._txt, x0 + c.x + 18, y, 8.5, F.r, C.INK2); }); y += 17; });
    return y + 2;
  }
  function legendHeight(F, items, W) { return 16 + legendRows(F, items, W).length * 17; }

  // ── report ──
  async function report(m) {
    var lx = L(), PL = window.PDFLib, A4 = lx.A4, M = lx.M, C = lx.COL, W = A4.w - M * 2;
    var doc = await PL.PDFDocument.create();
    doc.setTitle((m.session.title || 'Survey') + ' — ' + (m.project.name || '')); doc.setAuthor('Sonor Smart Homes');
    var F = await lx.makeFonts(doc, BASE);
    var cedia = null; try { cedia = await lx.loadImage(doc, BASE + 'cedia-member-stacked.png'); } catch (e) { }
    var fade = null; try { var fp = lx.fadePngDataUrl(); if (fp) fade = await doc.embedPng(fp); } catch (e) { }
    var pages = m.pages.filter(function (p) { return p.row && !(p.row.metadata && p.row.metadata.hidden); });
    var A = analyse(pages), imgCache = {};
    async function pageImg(p, px, opts) {   // rendered once per (page, size); plan pages get the photo tags painted beside their pins
      var key = p.row.id + ':' + px; if (imgCache[key]) return imgCache[key];
      var cv = window.SurveyInk.renderPage(p.model, null, px, opts || {});
      if (p.row.kind === 'plan') {
        var s = px / p.model.space.w, x = cv.getContext('2d'), r = Math.max((window.SonorInk && window.SonorInk.MARK_R) || 13, 24 / s) * s;
        (p.model.marks || []).forEach(function (mk) { var t = mk.photo_page_id && A.tag[mk.photo_page_id]; if (!t) return;
          x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.font ='bold ' + Math.round(r * 0.9) + 'px "DM Sans", system-ui, sans-serif'; x.textBaseline = 'middle'; var tw = x.measureText(t).width + r * 0.8;
          var px0 = mk.x * s + r * 1.15, py0 = (mk.kind === 'photo' ? mk.y * s - r * 1.65 : mk.y * s) - r * 0.6;
          x.fillStyle = '#1C1C1E'; x.beginPath(); x.roundRect ? x.roundRect(px0, py0, tw, r * 1.2, 3) : x.rect(px0, py0, tw, r * 1.2); x.fill();
          x.fillStyle = '#fff'; x.fillText(t, px0 + r * 0.4, py0 + r * 0.62); x.restore(); });
      }
      var im = await canvasJpg(doc, cv, px > 600 ? 0.88 : 0.8); imgCache[key] = im; return im;
    }
    var state = { dry: true, n: 0, total: 0, pageNo: {} };
    function newPage(label) {
      state.n++;
      if (state.dry) return NOOP;
      var pg = doc.addPage([A4.w, A4.h]), P = lx.mk(pg, doc); P.rect(0, 0, A4.w, A4.h, C.CREAM); lx.pageHead(P, F, label, state.n, state.total, DOC_LABEL, { brand: 'large' }); return P;
    }
    function foot(P) { if (!state.dry) lx.pageFoot(P, F, { email: 'projects@sonor.co.uk' }); }
    var FOOT = A4.h - 70;

    async function build() {
      state.n = 0;
      // ── cover ──
      state.n++;
      if (!state.dry) {
        var hero = null; try { if (m.coverBlob) hero = await blobJpg(doc, m.coverBlob); } catch (e) { }
        var cp = doc.addPage([A4.w, A4.h]), CP = lx.mk(cp, doc);
        lx.cover(CP, F, { hero: hero, fadeImg: fade, eyebrow: kindLabel(m.session.kind), title: pd(m.session.title || kindLabel(m.session.kind)), subtitle: pd([m.project.name, m.project.address].filter(Boolean).join(' · ')),
          info: [['CLIENT', pd(m.project.client_name || '—')], ['DATE', fmtDate(m.session.started_at)], ['ENGINEER', pd(m.engineer || m.session.engineer || 'Sonor')]], cediaImg: cedia, brandLarge: true, airy: true });
      }
      // ── summary ──
      var P = newPage('SUMMARY');
      var y = state.dry ? 156 : lx.sectionHead(P, F, kindLabel(m.session.kind), pd(m.project.name || 'Project'), m.session.summary ? pd(m.session.summary) : null);
      if (state.dry && m.session.summary) y = 142 + Math.min(4, lx.wrap(pd(m.session.summary), F.r, 10.5, W).length) * 14 + 6;
      var counts = { notes: 0, plans: 0, photos: 0, checklists: 0 }, pinned = Object.keys(A.pinnedBy).length;
      pages.forEach(function (p) { var k = p.row.kind; counts[k === 'plan' ? 'plans' : k === 'photo' ? 'photos' : k === 'checklist' ? 'checklists' : 'notes']++; });
      var rowsL = [['Project', pd(m.project.name)], ['Reference', pd(m.project.ref)], ['Address', pd([m.project.address, m.project.postcode].filter(Boolean).join(', '))], ['Client', pd(m.project.client_name)]];
      var rowsR = [['Session', pd(m.session.title)], ['Started', fmtDate(m.session.started_at)], ['Engineer', pd(m.engineer || m.session.engineer)], ['Pages', counts.notes + ' notes · ' + counts.plans + ' plan · ' + counts.photos + ' photo (' + pinned + ' pinned) · ' + counts.checklists + ' checklist']];
      var y1 = lx.specRows(P, F, rowsL, M, y + 6, W / 2 - 12), y2 = lx.specRows(P, F, rowsR, M + W / 2 + 12, y + 6, W / 2 - 12);
      y = Math.max(y1, y2) + 14;
      // device schedule by floor
      var floors = [], byFloor = {}, all = {};
      pages.forEach(function (p) { if (p.row.kind !== 'plan' || !p.model) return; var fc = p.row.floor_code || 'Plan'; if (!byFloor[fc]) { byFloor[fc] = {}; floors.push(fc); } var items = legendItems(p.model.marks); mergeLegend(items, byFloor[fc]); mergeLegend(items, all); });
      if (floors.length) {
        P.tracked('DEVICE SCHEDULE', M, y, 8.5, F.r, C.GOLD, 2.6); y += 18;
        floors.forEach(function (fc) {
          var items = Object.keys(byFloor[fc]).map(function (k) { return byFloor[fc][k]; }), rows = legendRows(F, items, W - 60);
          if (y + rows.length * 17 + 8 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
          P.text(fit(F.b, fc, 9.5, 52), M, y, 9.5, F.b, C.INK);
          rows.forEach(function (row) { row.forEach(function (c) { icon(P, F, c.it.m, M + 60 + c.x + 7, y + 5, 6); P.text(c.it._txt, M + 60 + c.x + 18, y, 8.5, F.r, C.INK2); }); y += 17; });
          P.hline(M, A4.w - M, y - 2, C.LINE, 0.4, 0.7); y += 6;
        });
        if (floors.length > 1) {
          var tItems = Object.keys(all).map(function (k) { return all[k]; }), tRows = legendRows(F, tItems, W - 60);
          if (y + tRows.length * 17 + 8 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
          P.text('Total', M, y, 9.5, F.b, C.GOLD);
          tRows.forEach(function (row) { row.forEach(function (c) { icon(P, F, c.it.m, M + 60 + c.x + 7, y + 5, 6); P.text(c.it._txt, M + 60 + c.x + 18, y, 8.5, F.b, C.INK); }); y += 17; });
          y += 6;
        }
        y += 8;
      }
      // contents (flows onto continuation summary pages)
      if (y + 40 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
      P.tracked('CONTENTS', M, y, 8.5, F.r, C.GOLD, 2.6); y += 18;
      pages.forEach(function (p) {
        if (y + 20 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
        var r = p.row, lab = (r.title || (r.kind === 'plan' ? 'Plan — ' + (r.floor_code || '') : r.kind === 'checklist' ? ((r.metadata.checklist || {}).name || 'Checklist') : r.kind.charAt(0).toUpperCase() + r.kind.slice(1) + ' page'));
        if (r.kind === 'photo' && A.tag[r.id]) lab = A.tag[r.id] + ' · ' + lab;
        var meta = [r.floor_code, r.room].filter(Boolean).join(' · ');
        if (r.kind === 'checklist') { var pr = window.SurveyChecklist.progress(r.metadata.checklist); meta = (meta ? meta + ' · ' : '') + pr.done + '/' + pr.total + ' complete'; }
        if (r.kind === 'plan' && p.model) { var li = legendItems(p.model.marks), nd = li.reduce(function (s, it) { return s + (it.m.kind === 'photo' ? 0 : it.n); }, 0), np = (A.thumbsFor[r.id] || []).length; meta = [meta, nd ? nd + ' devices' : '', np ? np + ' photos' : ''].filter(Boolean).join(' · '); }
        var pno = state.pageNo[r.id] || '';
        P.text(String(pno), M, y, 9.5, F.b, C.INK); P.text(fit(F.r, lab, 9.5, W - 190), M + 28, y, 9.5, F.r, C.INK); if (meta) P.right(fit(F.r, meta, 8.5, 170), A4.w - M, y + 1, 8.5, F.r, C.MUT);
        P.hline(M, A4.w - M, y + 15, C.LINE, 0.4, 0.7); y += 20;
      });
      foot(P);

      // ── pages ──
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i], r = p.row;
        if (r.kind === 'checklist') { state.pageNo[r.id] = state.n + 1; await checklistPages(r); continue; }
        var label = (r.kind === 'plan' ? 'PLAN' : r.kind === 'photo' ? 'PHOTO' : 'NOTES');
        var PP = newPage(label); state.pageNo[r.id] = state.n;
        var title = r.title || (r.kind === 'plan' ? 'Plan — ' + (r.floor_code || '') : r.kind === 'photo' ? 'Site photo' : 'Notes'), sub = [r.floor_code, r.room].filter(Boolean).join(' · ');
        var tx = M;
        if (r.kind === 'photo' && A.tag[r.id]) { tx += tagPill(PP, F, A.tag[r.id], M, 90) + 8; var pb = A.pinnedBy[r.id]; if (pb) { var pl = pb.plan.row; sub = [sub, 'pinned on ' + (pl.title || 'Plan — ' + (pl.floor_code || '')) + (state.pageNo[pl.id] ? ' (p.' + state.pageNo[pl.id] + ')' : '') + (pb.mark && pb.mark.kind !== 'photo' ? ' at ' + (pb.mark.label || pb.mark.code) : '')].filter(Boolean).join(' · '); } }
        PP.text(fit(F.b, title, 18, W - 120 - (tx - M)), tx, 88, 18, F.b, C.INK); if (sub) PP.right(fit(F.r, sub, 9, 300), A4.w - M, 94, 9, F.r, C.MUT);
        var top = 122, maxH = FOOT - top, maxW = W;
        if (!p.model) { PP.text('Page could not be rendered (image missing offline).', M, top, 9.5, F.r, C.MUT); foot(PP); continue; }
        var sp = p.model.space, px = sp.w >= sp.h ? 1800 : 1400, legend = r.kind === 'plan' ? legendItems(p.model.marks) : [], thumbs = (A.thumbsFor[r.id] || []).map(function (pid) { return A.byId[pid]; }).filter(function (t) { return t && t.model; });
        var reserve = (legend.length ? legendHeight(F, legend, W) + 10 : 0);
        var sc = Math.min(maxW / sp.w, (maxH - reserve) / sp.h), dw = sp.w * sc, dh = sp.h * sc, dx = M + (maxW - dw) / 2;
        if (!state.dry) { var img = await pageImg(p, px, { minMark: 24 }); PP.rectB(dx - 1, top - 1, dw + 2, dh + 2, C.LINE, 0.6); PP.image(img, dx, top, dw, dh, 1); }
        var y3 = top + dh + 12;
        if (legend.length) y3 = state.dry ? y3 + legendHeight(F, legend, W) : drawLegend(PP, F, legend, M, y3, W);
        // pinned photo thumbnails — 4 per row, continuation pages as needed
        if (thumbs.length) {
          var gap = 10, tw = (W - gap * 3) / 4, th = 96, cellH = th + 18, col = 0;
          function head(PX, yy) { PX.tracked('PINNED PHOTOS', M, yy, 7, F.r, C.GOLD, 2.2); return yy + 14; }
          y3 += 6; if (y3 + 14 + cellH > FOOT) { foot(PP); PP = newPage('PLAN'); PP.text(fit(F.b, title + ' — photos', 14, W), M, 88, 14, F.b, C.INK); y3 = 112; }
          y3 = head(PP, y3);
          for (var t = 0; t < thumbs.length; t++) {
            if (col === 4) { col = 0; y3 += cellH; if (y3 + cellH > FOOT) { foot(PP); PP = newPage('PLAN'); PP.text(fit(F.b, title + ' — photos (cont.)', 14, W), M, 88, 14, F.b, C.INK); y3 = head(PP, 112); } }
            var tp = thumbs[t], ts = tp.model.space, k = Math.min(tw / ts.w, th / ts.h), iw = ts.w * k, ih = ts.h * k, ix = M + col * (tw + gap) + (tw - iw) / 2, iy = y3 + (th - ih) / 2;
            if (!state.dry) { var tim = await pageImg(tp, 480); PP.rect(M + col * (tw + gap), y3, tw, th, [238, 234, 226]); PP.image(tim, ix, iy, iw, ih, 1); PP.rectB(M + col * (tw + gap), y3, tw, th, C.LINE, 0.5); }
            var lab = (tp.row.title || tp.row.room || 'Site photo'), tg = A.tag[tp.row.id] || '', pmk = A.pinnedBy[tp.row.id] && A.pinnedBy[tp.row.id].mark;
            var lx0 = M + col * (tw + gap), lw = tagPill(PP, F, tg, lx0, y3 + th + 4);
            PP.text(fit(F.r, lab + (pmk && pmk.kind !== 'photo' ? ' · ' + (pmk.label || pmk.code) : ''), 7.5, tw - lw - 6), lx0 + lw + 4, y3 + th + 5, 7.5, F.r, C.INK2);
            if (state.pageNo[tp.row.id] && !state.dry) PP.right('p.' + state.pageNo[tp.row.id], lx0 + tw, y3 + th + 5, 7, F.r, C.MUT);
            col++;
          }
        }
        foot(PP);
      }
    }
    async function checklistPages(r) {
      var cl = (r.metadata || {}).checklist || { items: [] }, items = cl.items || [];
      var per = 22, chunks = Math.max(1, Math.ceil(items.length / per));
      for (var c = 0; c < chunks; c++) {
        var P = newPage('CHECKLIST'), y;
        if (state.dry) { y = 156; } else if (c === 0) { var pr = window.SurveyChecklist.progress(cl); y = lx.sectionHead(P, F, (cl.kind === 'questions' ? 'Client questions' : 'Checklist') + (r.floor_code ? ' · ' + r.floor_code : ''), pd(cl.name || r.title || 'Checklist'), pr.done + ' of ' + pr.total + ' answered.'); }
        else { P.text(fit(F.b, (cl.name || 'Checklist') + ' (cont.)', 16, W), M, 88, 16, F.b, C.INK); y = 118; }
        if (!state.dry) items.slice(c * per, (c + 1) * per).forEach(function (it) {
          var done = it.kind === 'check' ? !!it.done : (it.value != null && String(it.value).trim() !== '');
          P.dot(M + 6, y + 5, 5, done ? C.GOLD : C.CREAM, done ? C.GOLD : C.LABEL);
          if (done) P.page.drawSvgPath('M 0 3 L 2.4 5.4 L 7 0.5', { x: M + 2.5, y: A4.h - (y + 2.5), borderColor: lx.col(C.CREAM), borderWidth: 1.4 });   // tick as a path — Gilroy/Helvetica have no ✓ glyph
          var lines = lx.wrap(pd(it.text || ''), F.r, 9.8, W - 20 - 170).slice(0, 2);
          lines.forEach(function (ln, li) { P.text(ln, M + 20, y + li * 12, 9.8, F.r, C.INK); });
          var val = it.kind === 'check' ? (it.value || '') : (it.value || '—');
          var vl = lx.wrap(pd(val), F.b, 9, 160).slice(0, 2); vl.forEach(function (ln, li) { P.right(ln, A4.w - M, y + li * 11, 9, F.b, done ? C.INK : C.MUT); });
          var h = Math.max(lines.length * 12, vl.length * 11, 12) + 9; P.hline(M, A4.w - M, y + h - 4, C.LINE, 0.4, 0.7); y += h + 2;
        });
        foot(P);
      }
    }

    await build();                       // dry: counts pages, fixes page numbers
    state.total = state.n; state.dry = false;
    await build();                       // draw
    return doc.save();
  }
  function download(bytes, name) { var b = new Blob([bytes], { type: 'application/pdf' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 4000); }
  return { report: report, download: download, VERSION: '0.5.0' };
})();
