/* Sonor Survey — SURVEY / MEETING REPORT PDF (app-local, v0.4.2)
 * The luxury proposal chrome (root master data/sonor-pdf-luxury.js — cover · pageHead brand:'large' · pageFoot ·
 * sectionHead · specRows) on pdf-lib. Page images come from SurveyInk.renderPage (paper + photos + ink) so the PDF
 * is exactly what was on the iPad. One A4 portrait per survey page; checklists as tick tables (paginated).
 * API: await SurveyPdf.report({ project, session, pages:[{row, model|null}], engineer, coverBlob? }) → Uint8Array · SurveyPdf.download(bytes, filename)
 */
window.SurveyPdf = (function () {
  'use strict';
  function selfDir() { try { var s = document.currentScript; if (s && s.src) return s.src.replace(/[^/]*$/, ''); } catch (e) { } return '../data/'; }
  var BASE = selfDir(), DOC_LABEL = 'SURVEY REPORT';
  function L() { var lx = window.SonorPdfLuxury; if (!lx || !window.PDFLib) throw new Error('pdf-lib / SonorPdfLuxury not loaded'); return lx; }
  // WinAnsi-safe text: user-typed items can hold any glyph; Gilroy / Helvetica subset cannot (pdf-lib throws).
  var GLYPH = { '\u2194': '<->', '\u2192': '->', '\u2190': '<-', '\u2713': 'yes', '\u2714': 'yes', '\u2715': 'no', '\u2717': 'no', '\u2610': '[ ]', '\u2611': '[x]', '\u00b2': '2', '\u00b3': '3' };
  function pd(str) { return String(str == null ? '' : str).replace(/[\u2194\u2192\u2190\u2713\u2714\u2715\u2717\u2610\u2611]/g, function (c) { return GLYPH[c] || '?'; }).replace(/[^\x00-\xFF\u20AC\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2022\u2122]/g, '?'); }
  function fit(font, str, size, w) { str = pd(str); if (font.widthOfTextAtSize(str, size) <= w) return str; while (str.length > 1 && font.widthOfTextAtSize(str + '…', size) > w) str = str.slice(0, -1); return str + '…'; }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  function kindLabel(k) { return { survey: 'Site survey', meeting: 'Client meeting', 'snag-walk': 'Snag walk', handover: 'Handover', other: 'Site notes' }[k] || 'Site survey'; }
  async function blobJpg(doc, blob) { return doc.embedJpg(new Uint8Array(await blob.arrayBuffer())); }
  async function canvasJpg(doc, canvas, q) { var b = await new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', q || 0.88); }); return blobJpg(doc, b); }
  function newPage(doc, F, label, n, T) { var lx = L(), C = lx.COL; var pg = doc.addPage([lx.A4.w, lx.A4.h]); var P = lx.mk(pg, doc); P.rect(0, 0, lx.A4.w, lx.A4.h, C.CREAM); lx.pageHead(P, F, label, n, T, DOC_LABEL, { brand: 'large' }); return P; }

  async function report(m) {
    var lx = L(), PL = window.PDFLib, A4 = lx.A4, M = lx.M, C = lx.COL, W = A4.w - M * 2;
    var doc = await PL.PDFDocument.create();
    doc.setTitle((m.session.title || 'Survey') + ' — ' + (m.project.name || '')); doc.setAuthor('Sonor Smart Homes');
    var F = await lx.makeFonts(doc, BASE);
    var cedia = null; try { cedia = await lx.loadImage(doc, BASE + 'cedia-member-stacked.png'); } catch (e) { }
    var fade = null; try { var fp = lx.fadePngDataUrl(); if (fp) fade = await doc.embedPng(fp); } catch (e) { }
    var pages = m.pages.filter(function (p) { return p.row && !(p.row.metadata && p.row.metadata.hidden); });
    var total = 2 + pages.reduce(function (n, p) { return n + (p.row.kind === 'checklist' ? Math.max(1, Math.ceil((((p.row.metadata || {}).checklist || {}).items || []).length / 22)) : 1); }, 0);

    // ── cover ──
    var hero = null; try { if (m.coverBlob) hero = await blobJpg(doc, m.coverBlob); } catch (e) { }
    var cp = doc.addPage([A4.w, A4.h]), CP = lx.mk(cp, doc);
    lx.cover(CP, F, { hero: hero, fadeImg: fade, eyebrow: kindLabel(m.session.kind), title: pd(m.session.title || kindLabel(m.session.kind)), subtitle: pd([m.project.name, m.project.address].filter(Boolean).join(' · ')),
      info: [['CLIENT', pd(m.project.client_name || '—')], ['DATE', fmtDate(m.session.started_at)], ['ENGINEER', pd(m.engineer || m.session.engineer || 'Sonor')]], cediaImg: cedia, brandLarge: true, airy: true });

    // ── summary ──
    var P = newPage(doc, F, 'SUMMARY', 2, total);
    var y = lx.sectionHead(P, F, kindLabel(m.session.kind), pd(m.project.name || 'Project'), m.session.summary ? pd(m.session.summary) : null);
    var counts = { notes: 0, plans: 0, photos: 0, checklists: 0 };
    pages.forEach(function (p) { var k = p.row.kind; counts[k === 'plan' ? 'plans' : k === 'photo' ? 'photos' : k === 'checklist' ? 'checklists' : 'notes']++; });
    var y1 = lx.specRows(P, F, [['Project', pd(m.project.name)], ['Reference', pd(m.project.ref)], ['Address', pd([m.project.address, m.project.postcode].filter(Boolean).join(', '))], ['Client', pd(m.project.client_name)]], M, y + 6, W / 2 - 12);
    var y2 = lx.specRows(P, F, [['Session', pd(m.session.title)], ['Started', fmtDate(m.session.started_at)], ['Engineer', pd(m.engineer || m.session.engineer)], ['Pages', counts.notes + ' notes · ' + counts.plans + ' plan · ' + counts.photos + ' photo · ' + counts.checklists + ' checklist']], M + W / 2 + 12, y + 6, W / 2 - 12);
    y = Math.max(y1, y2) + 18;
    P.tracked('CONTENTS', M, y, 8.5, F.r, C.GOLD, 2.6); y += 18;
    var pn = 3;
    pages.forEach(function (p, i) {
      if (y > A4.h - 90) return;
      var r = p.row, lab = (r.title || (r.kind === 'plan' ? 'Plan — ' + (r.floor_code || '') : r.kind === 'checklist' ? ((r.metadata.checklist || {}).name || 'Checklist') : r.kind.charAt(0).toUpperCase() + r.kind.slice(1) + ' page'));
      var meta = [r.floor_code, r.room].filter(Boolean).join(' · ');
      if (r.kind === 'checklist') { var pr = window.SurveyChecklist.progress(r.metadata.checklist); meta = (meta ? meta + ' · ' : '') + pr.done + '/' + pr.total + ' complete'; }
      P.text(String(pn), M, y, 9.5, F.b, C.INK); P.text(fit(F.r, lab, 9.5, W - 160), M + 28, y, 9.5, F.r, C.INK); if (meta) P.right(fit(F.r, meta, 8.5, 150), A4.w - M, y + 1, 8.5, F.r, C.MUT);
      P.hline(M, A4.w - M, y + 15, C.LINE, 0.4, 0.7); y += 20;
      pn += r.kind === 'checklist' ? Math.max(1, Math.ceil(((r.metadata.checklist || {}).items || []).length / 22)) : 1;
    });
    lx.pageFoot(P, F, { email: 'projects@sonor.co.uk' });

    // ── pages ──
    var n = 3;
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i], r = p.row;
      if (r.kind === 'checklist') { n = await checklistPages(doc, F, r, n, total); continue; }
      var label = (r.kind === 'plan' ? 'PLAN' : r.kind === 'photo' ? 'PHOTO' : 'NOTES');
      var PP = newPage(doc, F, label, n, total);
      var title = r.title || (r.kind === 'plan' ? 'Plan — ' + (r.floor_code || '') : r.kind === 'photo' ? 'Site photo' : 'Notes'), sub = [r.floor_code, r.room].filter(Boolean).join(' · ');
      PP.text(fit(F.b, title, 18, W - 120), M, 88, 18, F.b, C.INK); if (sub) PP.right(sub, A4.w - M, 94, 9, F.r, C.MUT);
      var top = 122, maxH = A4.h - 70 - top, maxW = W;
      if (p.model) {
        var sp = p.model.space, px = sp.w >= sp.h ? 1800 : 1400;
        var cv = window.SurveyInk.renderPage(p.model, null, px, { minMark: 24 });   // marks hold a readable print size var img = await canvasJpg(doc, cv, 0.88);
        var sc = Math.min(maxW / sp.w, maxH / sp.h), dw = sp.w * sc, dh = sp.h * sc, dx = M + (maxW - dw) / 2;
        PP.rectB(dx - 1, top - 1, dw + 2, dh + 2, C.LINE, 0.6); PP.image(img, dx, top, dw, dh, 1);
        // v0.4.2 — device legend under the page: "6× Ceiling speaker · 2× TV point · 3 photos"
        var leg = markLegend(p.model.marks); if (leg) PP.text(fit(F.r, pd(leg), 8.5, W), M, top + dh + 14, 8.5, F.r, C.MUT);
      } else PP.text('Page could not be rendered (image missing offline).', M, top, 9.5, F.r, C.MUT);
      lx.pageFoot(PP, F, { email: 'projects@sonor.co.uk' }); n++;
    }
    return doc.save();
  }
  function markLegend(marks) {
    if (!marks || !marks.length) return '';
    var counts = {}, order = [], photos = 0;
    marks.forEach(function (m) { if (m.kind === 'photo') { photos++; return; } var k = m.label || m.code || '?'; if (!counts[k]) { counts[k] = 0; order.push(k); } counts[k]++; });
    var parts = order.map(function (k) { return counts[k] + '× ' + k; });
    if (photos) parts.push(photos + (photos === 1 ? ' photo' : ' photos'));
    return parts.join(' · ');
  }
  async function checklistPages(doc, F, r, n, total) {
    var lx = L(), A4 = lx.A4, M = lx.M, C = lx.COL, W = A4.w - M * 2, cl = (r.metadata || {}).checklist || { items: [] }, items = cl.items || [];
    var per = 22, chunks = Math.max(1, Math.ceil(items.length / per));
    for (var c = 0; c < chunks; c++) {
      var P = newPage(doc, F, 'CHECKLIST', n, total), y;
      if (c === 0) { var pr = window.SurveyChecklist.progress(cl); y = lx.sectionHead(P, F, (cl.kind === 'questions' ? 'Client questions' : 'Checklist') + (r.floor_code ? ' · ' + r.floor_code : ''), pd(cl.name || r.title || 'Checklist'), pr.done + ' of ' + pr.total + ' answered.'); }
      else { P.text(fit(F.b, (cl.name || 'Checklist') + ' (cont.)', 16, W), M, 88, 16, F.b, C.INK); y = 118; }
      items.slice(c * per, (c + 1) * per).forEach(function (it) {
        var done = it.kind === 'check' ? !!it.done : (it.value != null && String(it.value).trim() !== '');
        P.dot(M + 6, y + 5, 5, done ? C.GOLD : C.CREAM, done ? C.GOLD : C.LABEL);
        if (done) P.page.drawSvgPath('M 0 3 L 2.4 5.4 L 7 0.5', { x: M + 2.5, y: A4.h - (y + 2.5), borderColor: lx.col(C.CREAM), borderWidth: 1.4 });   // tick as a path — Gilroy/Helvetica have no ✓ glyph
        var lines = lx.wrap(pd(it.text || ''), F.r, 9.8, W - 20 - 170).slice(0, 2);
        lines.forEach(function (ln, li) { P.text(ln, M + 20, y + li * 12, 9.8, F.r, C.INK); });
        var val = it.kind === 'check' ? (it.value || '') : (it.value || '—');
        var vl = lx.wrap(pd(val), F.b, 9, 160).slice(0, 2); vl.forEach(function (ln, li) { P.right(ln, A4.w - M, y + li * 11, 9, F.b, done ? C.INK : C.MUT); });
        var h = Math.max(lines.length * 12, vl.length * 11, 12) + 9; P.hline(M, A4.w - M, y + h - 4, C.LINE, 0.4, 0.7); y += h + 2;
      });
      lx.pageFoot(P, F, { email: 'projects@sonor.co.uk' }); n++;
    }
    return n;
  }
  function download(bytes, name) { var b = new Blob([bytes], { type: 'application/pdf' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 4000); }
  return { report: report, download: download, VERSION: '0.2.0' };
})();
