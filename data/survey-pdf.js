/* Sonor Survey — SURVEY / MEETING REPORT PDF (app-local, v0.11.0 — site objects; was v0.10.2 neutral theme + gold cover mark; hi-res page images, service-ordered legends, pins lists + summary)
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
    if (m.kind === 'pin') {   // diamond flag
      var pc = hex(m.c || '#4a4a4f'), lxx = L();
      P.page.drawSvgPath('M 0 -' + (r * 1.15).toFixed(2) + ' L ' + (r * 1.15).toFixed(2) + ' 0 L 0 ' + (r * 1.15).toFixed(2) + ' L -' + (r * 1.15).toFixed(2) + ' 0 Z', { x: cx, y: lxx.A4.h - cy, color: lxx.col(pc), borderColor: lxx.col(WHITE), borderWidth: 0.7 });
      var pg = pd(String(m.glyph || '?').slice(0, 2)), psz = r * 0.95, pw = F.b.widthOfTextAtSize(pg, psz); P.text(pg, cx - pw / 2, cy - psz * 0.56, psz, F.b, lum(pc) > 150 ? [11, 26, 34] : WHITE);
      return;
    }
    if (m.kind === 'object') {   // v0.11.0 site object — graphite rounded square (SonorInk 1.3.0)
      var oc = hex(m.c || '#6E6E73'); P.rect(cx - r, cy - r, r * 2, r * 2, oc); P.rectB(cx - r, cy - r, r * 2, r * 2, WHITE, 0.7);
      var og = pd(String(m.glyph || '?').slice(0, 4)), osz = r * 0.7, ow = F.b.widthOfTextAtSize(og, osz); P.text(og, cx - ow / 2, cy - osz * 0.56, osz, F.b, WHITE); return;
    }
    var c = hex(m.c || '#98989D'); P.dot(cx, cy, r, c, WHITE);
    var g = pd(String(m.glyph || '?').slice(0, 4)), sz = r * 0.82, w = F.b.widthOfTextAtSize(g, sz);
    P.text(g, cx - w / 2, cy - sz * 0.56, sz, F.b, lum(c) > 150 ? [11, 26, 34] : WHITE);
  }
  var CATS = { 'pre-visit': 'Pre-visit', received: 'Received', existing: 'Existing' };
  function catOf(r) { return (r.metadata || {}).category || 'survey'; }
  function creditOf(r) { var c = (r.metadata || {}).credit || {}; return [c.from, c.via].filter(Boolean).join(' · '); }
  function tagPill(P, F, tag, x, top) { var sz = 7, w = F.b.widthOfTextAtSize(tag, sz) + 8; P.rect(x, top, w, 11, DARK); P.text(tag, x + 4, top + 1.6, sz, F.b, WHITE); return w; }

  // ── analysis: tags, counts, cross-links ──
  function analyse(pages) {   // v0.5.1 — the ONE numbering (SurveyInk.photoTags): any page's pins count, not only plan pages
    var byId = {}; pages.forEach(function (p) { byId[p.row.id] = p; });
    var t = window.SurveyInk.photoTags(pages.map(function (p) { return p.row; })), pinnedBy = {};
    Object.keys(t.pinnedBy).forEach(function (pid) { var pb = t.pinnedBy[pid], host = byId[pb.pageId]; if (!host) return; pinnedBy[pid] = { plan: host, mark: (host.model && (host.model.marks || []).find(function (m) { return m.id === pb.markId; })) || null }; });
    var thumbsFor = {}; Object.keys(pinnedBy).forEach(function (pid) { var pl = pinnedBy[pid].plan.row.id; (thumbsFor[pl] = thumbsFor[pl] || []).push(pid); });
    return { byId: byId, tag: t.tag, pinnedBy: pinnedBy, thumbsFor: thumbsFor, photoCount: t.count };
  }
  function legendItems(marks) {   // [{m, n}] in SERVICE order (nn, then label); pins are listed separately; photo pins last
    var out = [], idx = {}, photos = 0, ph = null;
    (marks || []).forEach(function (m) { if (m.kind === 'pin' || m.kind === 'object') return; if (m.kind === 'photo') { photos++; ph = ph || m; return; } var k = m.code || m.label || '?'; if (idx[k] == null) { idx[k] = out.length; out.push({ m: m, n: 0, label: m.label || m.code }); } out[idx[k]].n++; });
    out.sort(function (a, b) { return String(a.m.nn || '99').localeCompare(String(b.m.nn || '99')) || String(a.label).localeCompare(String(b.label)); });
    if (photos) out.push({ m: ph, n: photos, label: photos === 1 ? 'Photo' : 'Photos' });
    return out;
  }
  var OBJ_GROUPS = ['Fabric', 'M&E', 'Existing', 'Furniture', 'External', 'Hazard'];
  function objectItems(marks) {   // v0.11.0 — SITE OBJECTS (kind 'object'): counted by code, config group order then label; never devices
    var defs = (window.__SURVEY_CONFIG__ || {}).objects || [], out = [], idx = {};
    (marks || []).forEach(function (m) { if (m.kind !== 'object') return; var k = m.code || m.label || '?'; if (idx[k] == null) { var d = defs.find(function (x) { return x.code === m.code; }); idx[k] = out.length; out.push({ m: m, n: 0, label: m.label || m.code, group: (d && d.group) || 'Other' }); } out[idx[k]].n++; });
    out.sort(function (a, b) { return (OBJ_GROUPS.indexOf(a.group) + 1 || 99) - (OBJ_GROUPS.indexOf(b.group) + 1 || 99) || String(a.label).localeCompare(String(b.label)); });
    return out;
  }
  function pinItems(marks) { var PL = (window.SonorInk && window.SonorInk.PIN_LABEL) || {}; var order = ['rfi', 'client', 'note', 'snag', 'dim']; return (marks || []).filter(function (m) { return m.kind === 'pin'; }).sort(function (a, b) { return order.indexOf(a.pin) - order.indexOf(b.pin) || (a.n || 0) - (b.n || 0); }).map(function (m) { return { m: m, label: (PL[m.pin] || 'PIN') + (m.n ? ' ' + m.n : ''), text: m.text || '', to: m.to || '' }; }); }
  function sortItems(items) { return items.sort(function (a, b) { var pa = a.m.kind === 'photo' ? 1 : 0, pb = b.m.kind === 'photo' ? 1 : 0; return pa - pb || String(a.m.nn || '99').localeCompare(String(b.m.nn || '99')) || String(a.label).localeCompare(String(b.label)); }); }
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
  function drawLegend(P, F, items, x0, top, W, title) {
    var C = L().COL, rows = legendRows(F, items, W), y = top;
    P.tracked(title || 'DEVICES ON THIS PAGE', x0, y, 7, F.r, C.GOLD, 2.2); y += 14;
    rows.forEach(function (row) { row.forEach(function (c) { icon(P, F, c.it.m, x0 + c.x + 7, y + 5, 6); P.text(c.it._txt, x0 + c.x + 18, y, 8.5, F.r, C.INK2); }); y += 17; });
    return y + 2;
  }
  function legendHeight(F, items, W) { return 16 + legendRows(F, items, W).length * 17; }

  // ── report ──
  async function report(m) {
    var lx = L(), PL = window.PDFLib, A4 = lx.A4, M = lx.M, C = lx.COL, W = A4.w - M * 2;
    if (lx.theme) lx.theme('neutral');   // v0.8.0 — working document: white paper, neutral greys, gold accents (Bryn: cream is for the luxury proposals only)
    var doc = await PL.PDFDocument.create();
    doc.setTitle((m.session.title || 'Survey') + ' — ' + (m.project.name || '')); doc.setAuthor('Sonor Smart Homes');
    var F = await lx.makeFonts(doc, BASE);
    var cedia = null; try { cedia = await lx.loadImage(doc, BASE + 'cedia-member-stacked.png'); } catch (e) { }
    var fade = null; try { var fp = lx.fadePngDataUrl(); if (fp) fade = await doc.embedPng(fp); } catch (e) { }
    var pages = m.pages.filter(function (p) { return p.row && !(p.row.metadata && p.row.metadata.hidden); });
    var A = analyse(pages), imgCache = {};
    async function pageImg(p, px, opts) {   // rendered once per (page, size); plan pages get the photo tags painted beside their pins
      var key = p.row.id + ':' + px; if (imgCache[key]) return imgCache[key];
      var cv = window.SurveyInk.renderPage(p.model, null, px, Object.assign({ labels: A.tag }, opts || {}));
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
        // v0.5.1 — PERMANENT cover (Bryn: "use a permanent image for the front cover, something that shows survey plans"): data/survey-cover.jpg; the first site photo is only the offline fallback
        var hero = null, heroArt = false; try { hero = await lx.loadCoverArt(doc, BASE + 'survey-cover.jpg'); heroArt = true; } catch (e) { try { if (m.coverBlob) hero = await blobJpg(doc, m.coverBlob); } catch (e2) { } }   // cover art set (2026-11-01): the house art → art layout; a site photo keeps the photo layout
        var cp = doc.addPage([A4.w, A4.h]), CP = lx.mk(cp, doc);
        lx.cover(CP, F, { hero: hero, fadeImg: fade, eyebrow: kindLabel(m.session.kind), title: pd(m.session.title || kindLabel(m.session.kind)), subtitle: pd([m.project.name, m.project.address].filter(Boolean).join(' · ')),
          info: [['CLIENT', pd(m.project.client_name || '—')], ['DATE', fmtDate(m.session.started_at)], ['ENGINEER', pd(m.engineer || m.session.engineer || 'Sonor')]], cediaImg: cedia, brandLarge: true, brandColour: heroArt ? lx.COL.CREAM : lx.COL.GOLD, topShade: 0.6, airy: true, layout: heroArt ? 'art' : undefined });   // gold mark on a bright site photo, cream on the black art
      }
      // ── summary ──
      var P = newPage('SUMMARY');
      var y = state.dry ? 156 : lx.sectionHead(P, F, kindLabel(m.session.kind), pd(m.project.name || 'Project'), m.session.summary ? pd(m.session.summary) : null);
      if (state.dry && m.session.summary) y = 142 + Math.min(4, lx.wrap(pd(m.session.summary), F.r, 10.5, W).length) * 14 + 6;
      var counts = { notes: 0, plans: 0, photos: 0, checklists: 0 }, pinned = Object.keys(A.pinnedBy).length;
      pages.forEach(function (p) { var k = p.row.kind; counts[k === 'plan' ? 'plans' : k === 'photo' ? 'photos' : k === 'checklist' ? 'checklists' : 'notes']++; });
      var rowsL = [['Project', pd(m.project.name)], ['Reference', pd(m.project.ref)], ['Address', pd([m.project.address, m.project.postcode].filter(Boolean).join(', '))], ['Client', pd(m.project.client_name)]];
      var catCounts = {}; pages.forEach(function (p) { if (p.row.kind === 'photo' && catOf(p.row) !== 'survey') catCounts[catOf(p.row)] = (catCounts[catOf(p.row)] || 0) + 1; }); var catTxt = Object.keys(catCounts).map(function (k) { return catCounts[k] + ' ' + (CATS[k] || k).toLowerCase(); }).join(', ');
      var rowsR = [['Session', pd(m.session.title)], ['Started', fmtDate(m.session.started_at)], ['Engineer', pd(m.engineer || m.session.engineer)], ['Pages', counts.notes + ' notes · ' + counts.plans + ' plan · ' + counts.photos + ' photo (' + pinned + ' pinned' + (catTxt ? ', ' + catTxt : '') + ') · ' + counts.checklists + ' checklist']];
      var y1 = lx.specRows(P, F, rowsL, M, y + 6, W / 2 - 12), y2 = lx.specRows(P, F, rowsR, M + W / 2 + 12, y + 6, W / 2 - 12);
      y = Math.max(y1, y2) + 14;
      // device schedule by floor
      var floors = [], byFloor = {}, all = {};
      pages.forEach(function (p) { if (!p.model || !(p.model.marks || []).length) return; var fc = p.row.floor_code || p.row.title || (p.row.kind === 'plan' ? 'Plan' : 'Notes'); if (!byFloor[fc]) { byFloor[fc] = {}; floors.push(fc); } var items = legendItems(p.model.marks); mergeLegend(items, byFloor[fc]); mergeLegend(items, all); });
      if (floors.length) {
        P.tracked('DEVICE SCHEDULE', M, y, 8.5, F.r, C.GOLD, 2.6); y += 18;
        floors.forEach(function (fc) {
          var items = sortItems(Object.keys(byFloor[fc]).map(function (k) { return byFloor[fc][k]; })), rows = legendRows(F, items, W - 60);
          if (y + rows.length * 17 + 8 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
          P.text(fit(F.b, fc, 9.5, 52), M, y, 9.5, F.b, C.INK);
          rows.forEach(function (row) { row.forEach(function (c) { icon(P, F, c.it.m, M + 60 + c.x + 7, y + 5, 6); P.text(c.it._txt, M + 60 + c.x + 18, y, 8.5, F.r, C.INK2); }); y += 17; });
          P.hline(M, A4.w - M, y - 2, C.LINE, 0.4, 0.7); y += 6;
        });
        if (floors.length > 1) {
          var tItems = sortItems(Object.keys(all).map(function (k) { return all[k]; })), tRows = legendRows(F, tItems, W - 60);
          if (y + tRows.length * 17 + 8 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
          P.text('Total', M, y, 9.5, F.b, C.GOLD);
          tRows.forEach(function (row) { row.forEach(function (c) { icon(P, F, c.it.m, M + 60 + c.x + 7, y + 5, 6); P.text(c.it._txt, M + 60 + c.x + 18, y, 8.5, F.b, C.INK); }); y += 17; });
          y += 6;
        }
        y += 8;
      }
      // v0.11.0 — SITE OBJECTS by floor (radiators, steels, existing kit…): what is THERE, kept apart from what we supply
      var ofloors = [], oByFloor = {};
      pages.forEach(function (p) { if (!p.model) return; var items = objectItems(p.model.marks); if (!items.length) return; var fc = p.row.floor_code || p.row.title || (p.row.kind === 'plan' ? 'Plan' : 'Notes'); if (!oByFloor[fc]) { oByFloor[fc] = {}; ofloors.push(fc); } mergeLegend(items, oByFloor[fc]); });
      if (ofloors.length) {
        if (y + 40 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
        P.tracked('SITE OBJECTS', M, y, 8.5, F.r, C.GOLD, 2.6); y += 18;
        ofloors.forEach(function (fc) {
          var items = Object.keys(oByFloor[fc]).map(function (k) { return oByFloor[fc][k]; }), rows = legendRows(F, items, W - 60);
          if (y + rows.length * 17 + 8 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
          P.text(fit(F.b, fc, 9.5, 52), M, y, 9.5, F.b, C.INK);
          rows.forEach(function (row) { row.forEach(function (c) { icon(P, F, c.it.m, M + 60 + c.x + 7, y + 5, 6); P.text(c.it._txt, M + 60 + c.x + 18, y, 8.5, F.r, C.INK2); }); y += 17; });
          P.hline(M, A4.w - M, y - 2, C.LINE, 0.4, 0.7); y += 6;
        });
        y += 8;
      }
      // v0.6.0 — PINS & RFIs across the survey (page refs are exact after the dry pass)
      var allPins = []; pages.forEach(function (p) { if (p.model) pinItems(p.model.marks).forEach(function (it) { it.page = p; allPins.push(it); }); });
      if (allPins.length) {
        if (y + 40 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
        P.tracked('PINS & RFIs', M, y, 8.5, F.r, C.GOLD, 2.6); y += 18;
        allPins.forEach(function (it) {
          var lines = lx.wrap(pd((it.text || '—') + (it.to ? '  – to ' + it.to : '')), F.r, 9, W - 150).slice(0, 2), h = Math.max(14, lines.length * 11.5 + 4);
          if (y + h + 4 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
          icon(P, F, it.m, M + 7, y + 5, 5.5); P.text(it.label, M + 18, y, 9, F.b, C.INK);
          lines.forEach(function (ln, li) { P.text(ln, M + 80, y + li * 11.5, 9, F.r, C.INK2); });
          var where = (it.page.row.floor_code || it.page.row.title || '') + (state.pageNo[it.page.row.id] ? ' · p.' + state.pageNo[it.page.row.id] : ''); P.right(fit(F.r, where, 8, 110), A4.w - M, y + 1, 8, F.r, C.MUT);
          P.hline(M, A4.w - M, y + h - 2, C.LINE, 0.4, 0.7); y += h + 2;
        });
        y += 8;
      }
      // contents (flows onto continuation summary pages)
      if (y + 40 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
      P.tracked('CONTENTS', M, y, 8.5, F.r, C.GOLD, 2.6); y += 18;
      // v0.10.3 photo pages list as GROUPS (consecutive photos sharing category + credit) — "P3–P8 · Pre-visit photos (6) · pp 9–14"
      // rather than one row each (Bryn: "contents should prob not list every photo, do it by groups or types p3 to px etc").
      var rows = [], i0 = 0;
      while (i0 < pages.length) {
        var p0 = pages[i0], r0 = p0.row;
        if (r0.kind !== 'photo') { rows.push({ p: p0 }); i0++; continue; }
        var key = catOf(r0) + '|' + creditOf(r0), j0 = i0; while (j0 < pages.length && pages[j0].row.kind === 'photo' && catOf(pages[j0].row) + '|' + creditOf(pages[j0].row) === key) j0++;
        rows.push(j0 - i0 === 1 ? { p: p0 } : { group: pages.slice(i0, j0) }); i0 = j0;
      }
      rows.forEach(function (row) {
        if (y + 20 > FOOT) { foot(P); P = newPage('SUMMARY'); y = 96; }
        var lab, meta, pno;
        if (row.group) {
          var g = row.group, f0 = g[0].row, fl = g[g.length - 1].row, t0 = A.tag[f0.id], t1 = A.tag[fl.id];
          lab = (t0 && t1 ? t0 + '–' + t1 + ' · ' : '') + (catOf(f0) !== 'survey' ? (CATS[catOf(f0)] || catOf(f0)) + ' photos' : 'Site photos') + ' (' + g.length + ')';
          var places = []; g.forEach(function (x) { var pl = [x.row.floor_code, x.row.room].filter(Boolean).join(' · '); if (pl && places.indexOf(pl) < 0) places.push(pl); });
          meta = [places.length > 2 ? places.slice(0, 2).join(', ') + ' +' + (places.length - 2) : places.join(', '), creditOf(f0) ? 'from ' + creditOf(f0) : ''].filter(Boolean).join(' · ');
          var a = state.pageNo[f0.id] || '', b = state.pageNo[fl.id] || ''; pno = a && b && a !== b ? a + '–' + b : String(a);
        } else {
          var r = row.p.row, p = row.p;
          lab = (r.title || (r.kind === 'plan' ? 'Plan — ' + (r.floor_code || '') : r.kind === 'checklist' ? ((r.metadata.checklist || {}).name || 'Checklist') : r.kind.charAt(0).toUpperCase() + r.kind.slice(1) + ' page'));
          if (r.kind === 'photo' && A.tag[r.id]) lab = A.tag[r.id] + ' · ' + lab;
          meta = [r.floor_code, r.room].filter(Boolean).join(' · ');
          if (catOf(r) !== 'survey') meta = [CATS[catOf(r)] || catOf(r), creditOf(r) ? 'from ' + creditOf(r) : '', meta].filter(Boolean).join(' · ');
          if (r.kind === 'checklist') { var pr = window.SurveyChecklist.progress(r.metadata.checklist); meta = (meta ? meta + ' · ' : '') + pr.done + '/' + pr.total + ' complete'; }
          if (p.model && (p.model.marks || []).length) { var li = legendItems(p.model.marks), nd = li.reduce(function (s, it) { return s + (it.m.kind === 'photo' ? 0 : it.n); }, 0), np = (A.thumbsFor[r.id] || []).length; meta = [meta, nd ? nd + ' devices' : '', np ? np + ' photos' : ''].filter(Boolean).join(' · '); }
          pno = String(state.pageNo[r.id] || '');
        }
        var pw = F.b.widthOfTextAtSize(pd(pno), 9.5) + 10;
        P.text(pno, M, y, 9.5, F.b, C.INK); P.text(fit(F.r, lab, 9.5, W - 190 - Math.max(0, pw - 28)), M + Math.max(28, pw), y, 9.5, F.r, C.INK); if (meta) P.right(fit(F.r, meta, 8.5, 170), A4.w - M, y + 1, 8.5, F.r, C.MUT);
        P.hline(M, A4.w - M, y + 15, C.LINE, 0.4, 0.7); y += 20;
      });
      foot(P);

      // ── pages ──
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i], r = p.row;
        if (r.kind === 'checklist') { state.pageNo[r.id] = state.n + 1; await checklistPages(r); continue; }
        var label = (r.kind === 'plan' ? 'PLAN' : r.kind === 'photo' ? ((catOf(r) !== 'survey' ? (CATS[catOf(r)] || catOf(r)).toUpperCase() + ' ' : '') + 'PHOTO') : (catOf(r) !== 'survey' ? (CATS[catOf(r)] || catOf(r)).toUpperCase() + ' NOTES' : 'NOTES'));
        var PP = newPage(label); state.pageNo[r.id] = state.n;
        var title = r.title || (r.kind === 'plan' ? 'Plan — ' + (r.floor_code || '') : r.kind === 'photo' ? 'Site photo' : 'Notes'), sub = [r.floor_code, r.room].filter(Boolean).join(' · ');
        var tx = M; if (catOf(r) !== 'survey' && creditOf(r)) sub = [sub, 'from ' + creditOf(r)].filter(Boolean).join(' · ');
        if (r.kind === 'photo' && A.tag[r.id]) { tx += tagPill(PP, F, A.tag[r.id], M, 90) + 8; var pb = A.pinnedBy[r.id]; if (pb) { var pl = pb.plan.row; sub = [sub, 'pinned on ' + (pl.title || (pl.kind === 'plan' ? 'Plan — ' + (pl.floor_code || '') : 'Notes')) + (state.pageNo[pl.id] ? ' (p.' + state.pageNo[pl.id] + ')' : '') + (pb.mark && pb.mark.kind !== 'photo' ? ' at ' + (pb.mark.label || pb.mark.code) : '')].filter(Boolean).join(' · '); } }
        var subTxt = sub ? fit(F.r, sub, 9, 300) : '', subW = subTxt ? F.r.widthOfTextAtSize(pd(subTxt), 9) + 16 : 0;   // v0.10.2 title never runs under the credit/pinned-on meta
        PP.text(fit(F.b, title, 18, W - subW - (tx - M)), tx, 88, 18, F.b, C.INK); if (subTxt) PP.right(subTxt, A4.w - M, 94, 9, F.r, C.MUT);
        var top = 122, maxH = FOOT - top, maxW = W;
        if (!p.model) { PP.text('Page could not be rendered (image missing offline).', M, top, 9.5, F.r, C.MUT); foot(PP); continue; }
        var sp = p.model.space, px = sp.w >= sp.h ? 2600 : 1900, legend = legendItems(p.model.marks), objs = objectItems(p.model.marks), pins = pinItems(p.model.marks), thumbs = (A.thumbsFor[r.id] || []).map(function (pid) { return A.byId[pid]; }).filter(function (t) { return t && t.model; });
        var reserve = (legend.length ? legendHeight(F, legend, W) + 10 : 0) + (objs.length ? legendHeight(F, objs, W) + 10 : 0) + (pins.length ? 14 + Math.min(pins.length, 4) * 13 : 0);
        var sc = Math.min(maxW / sp.w, (maxH - reserve) / sp.h), dw = sp.w * sc, dh = sp.h * sc, dx = M + (maxW - dw) / 2;
        if (!state.dry) { var img = await pageImg(p, px, { minMark: 24 }); PP.rectB(dx - 1, top - 1, dw + 2, dh + 2, C.LINE, 0.6); PP.image(img, dx, top, dw, dh, 1); }
        var y3 = top + dh + 12;
        if (legend.length) y3 = state.dry ? y3 + legendHeight(F, legend, W) : drawLegend(PP, F, legend, M, y3, W);
        if (objs.length) y3 = state.dry ? y3 + legendHeight(F, objs, W) : drawLegend(PP, F, objs, M, y3, W, 'SITE OBJECTS ON THIS PAGE');   // v0.11.0
        if (pins.length) {   // v0.6.0 — "PINS ON THIS PAGE": RFI 1 — text → to
          if (y3 + 14 + 13 > FOOT) { foot(PP); PP = newPage(label); PP.text(fit(F.b, title + ' — pins', 14, W), M, 88, 14, F.b, C.INK); y3 = 112; }
          PP.tracked('PINS ON THIS PAGE', M, y3, 7, F.r, C.GOLD, 2.2); y3 += 14;
          for (var pi = 0; pi < pins.length; pi++) {
            var pn = pins[pi], plines = lx.wrap(pd((pn.text || '—') + (pn.to ? '  – to ' + pn.to : '')), F.r, 8.5, W - 80).slice(0, 3), ph = Math.max(13, plines.length * 11 + 3);
            if (y3 + ph > FOOT) { foot(PP); PP = newPage(label); PP.text(fit(F.b, title + ' — pins (cont.)', 14, W), M, 88, 14, F.b, C.INK); y3 = 112; }
            icon(PP, F, pn.m, M + 7, y3 + 5, 5.5); PP.text(pn.label, M + 18, y3, 8.5, F.b, C.INK);
            plines.forEach(function (ln, li) { PP.text(ln, M + 76, y3 + li * 11, 8.5, F.r, C.INK2); });
            y3 += ph;
          }
          y3 += 4;
        }
        // pinned photo thumbnails — 4 per row, continuation pages as needed
        if (thumbs.length) {
          var gap = 10, tw = (W - gap * 3) / 4, th = 96, cellH = th + 18, col = 0;
          function head(PX, yy) { PX.tracked('PINNED PHOTOS', M, yy, 7, F.r, C.GOLD, 2.2); return yy + 14; }
          y3 += 6; if (y3 + 14 + cellH > FOOT) { foot(PP); PP = newPage(label); PP.text(fit(F.b, title + ' — photos', 14, W), M, 88, 14, F.b, C.INK); y3 = 112; }
          y3 = head(PP, y3);
          for (var t = 0; t < thumbs.length; t++) {
            if (col === 4) { col = 0; y3 += cellH; if (y3 + cellH > FOOT) { foot(PP); PP = newPage(label); PP.text(fit(F.b, title + ' — photos (cont.)', 14, W), M, 88, 14, F.b, C.INK); y3 = head(PP, 112); } }
            var tp = thumbs[t], ts = tp.model.space, k = Math.min(tw / ts.w, th / ts.h), iw = ts.w * k, ih = ts.h * k, ix = M + col * (tw + gap) + (tw - iw) / 2, iy = y3 + (th - ih) / 2;
            if (!state.dry) { var tim = await pageImg(tp, 480); PP.rect(M + col * (tw + gap), y3, tw, th, [242, 242, 242]); PP.image(tim, ix, iy, iw, ih, 1); PP.rectB(M + col * (tw + gap), y3, tw, th, C.LINE, 0.5); }
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
  return { report: report, download: download, VERSION: '0.10.0' };
})();
