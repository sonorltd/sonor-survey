/* Sonor Survey — CHECKLIST PAGES (app-local, v0.2.0)
 * A checklist page is a `survey_pages` row (kind 'checklist') whose items live in metadata.checklist:
 *   { template_key, name, service_nn, items:[{id, kind:'check'|'text'|'number'|'yesno', text, done, value, hint}] }
 * Templates are the SSOT rows of `survey_templates` (per service + client questions); a page is a COPY so the
 * template can change later without rewriting history, and the engineer can add items on the spot.
 * Rendered as a paper-styled DOM form (ticks + fields; Scribble works in the fields on the iPad). No canvas.
 * API: SurveyChecklist.mount(host, page, { onChange(checklist) })  ·  SurveyChecklist.fromTemplate(tpl)  ·  SurveyChecklist.progress(cl)
 */
window.SurveyChecklist = (function () {
  'use strict';
  function uid() { return 'ci_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fromTemplate(tpl) {
    return { template_key: tpl.key, name: tpl.name, service_nn: tpl.service_nn || null, kind: tpl.kind,
      items: (tpl.items || []).map(function (it) { return { id: it.id || uid(), kind: it.kind || 'check', text: it.text, hint: it.hint || null, done: false, value: '' }; }) };
  }
  function progress(cl) {
    var items = (cl && cl.items) || [], done = items.filter(function (it) { return it.kind === 'check' ? !!it.done : (it.value != null && String(it.value).trim() !== ''); }).length;
    return { done: done, total: items.length };
  }
  function mount(host, page, opts) {
    var cl = page.metadata && page.metadata.checklist; if (!cl) { host.innerHTML = '<p class="muted">No checklist on this page.</p>'; return; }
    var onChange = (opts && opts.onChange) || function () {};
    var t = null; function changed() { clearTimeout(t); t = setTimeout(function () { onChange(cl); head(); }, 500); }
    host.innerHTML = '';
    var sheet = document.createElement('div'); sheet.className = 'sv-sheet s-paper';
    var h = document.createElement('div'); h.className = 'sv-sheet-h'; sheet.appendChild(h);
    function head() { var p = progress(cl); h.innerHTML = '<div class="sv-sheet-title">' + esc(cl.name) + '</div><div class="sv-sheet-prog">' + p.done + ' / ' + p.total + '</div>'; }
    head();
    var list = document.createElement('div'); list.className = 'sv-sheet-list'; sheet.appendChild(list);
    function row(it) {
      var r = document.createElement('div'); r.className = 'sv-ci' + (it.done ? ' done' : ''); r.dataset.id = it.id;
      var tick = document.createElement('button'); tick.type = 'button'; tick.className = 'sv-ci-tick'; tick.setAttribute('aria-pressed', !!it.done); tick.textContent = it.done ? '✓' : '';
      tick.onclick = function () { it.done = !it.done; tick.textContent = it.done ? '✓' : ''; tick.setAttribute('aria-pressed', it.done); r.classList.toggle('done', it.done); changed(); };
      var body = document.createElement('div'); body.className = 'sv-ci-body';
      var txt = document.createElement('div'); txt.className = 'sv-ci-text'; txt.contentEditable = 'true'; txt.spellcheck = false; txt.textContent = it.text || '';
      txt.onblur = function () { var v = txt.textContent.trim(); if (v !== it.text) { it.text = v; changed(); } };
      body.appendChild(txt);
      if (it.kind !== 'check') {
        var inp;
        if (it.kind === 'yesno') { inp = document.createElement('div'); inp.className = 'sv-ci-yn'; ['Yes', 'No', 'TBC'].forEach(function (v) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm' + (it.value === v ? ' active' : ''); b.textContent = v; b.onclick = function () { it.value = v; Array.from(inp.children).forEach(function (x) { x.classList.toggle('active', x === b); }); changed(); }; inp.appendChild(b); }); }
        else { inp = document.createElement(it.kind === 'number' ? 'input' : 'textarea'); inp.className = 'sv-ci-val'; if (it.kind === 'number') { inp.type = 'number'; inp.step = 'any'; inp.inputMode = 'decimal'; } else inp.rows = 1; inp.placeholder = it.hint || (it.kind === 'number' ? '0' : 'Answer / notes'); inp.value = it.value || ''; inp.oninput = function () { it.value = inp.value; if (inp.tagName === 'TEXTAREA') { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; } changed(); }; setTimeout(function () { if (inp.tagName === 'TEXTAREA') { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; } }, 0); }
        body.appendChild(inp);
      } else if (true) {
        var note = document.createElement('input'); note.className = 'sv-ci-note'; note.placeholder = 'note'; note.value = it.value || ''; note.oninput = function () { it.value = note.value; changed(); }; body.appendChild(note);
      }
      var del = document.createElement('button'); del.type = 'button'; del.className = 'sv-ci-del'; del.title = 'Remove item'; del.textContent = '✕';
      del.onclick = function () { var i = cl.items.indexOf(it); if (i >= 0) cl.items.splice(i, 1); r.remove(); changed(); };
      r.appendChild(tick); r.appendChild(body); r.appendChild(del); return r;
    }
    cl.items.forEach(function (it) { list.appendChild(row(it)); });
    var addBar = document.createElement('div'); addBar.className = 'sv-sheet-add';
    [['check', '＋ Tick item'], ['text', '＋ Question'], ['number', '＋ Measurement']].forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = k[1];
      b.onclick = function () { var it = { id: uid(), kind: k[0], text: '', done: false, value: '' }; cl.items.push(it); var r = row(it); list.appendChild(r); r.querySelector('.sv-ci-text').focus(); changed(); };
      addBar.appendChild(b);
    });
    sheet.appendChild(addBar); host.appendChild(sheet);
  }
  return { mount: mount, fromTemplate: fromTemplate, progress: progress, VERSION: '0.2.0' };
})();
