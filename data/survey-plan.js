/* Sonor Survey — PLAN LOADER (app-local, v0.1.0)
 * Floors + the ACTIVE plan per floor come from Takeoffs (takeoffs_floors / takeoffs_floor_plans / bucket takeoffs-plans)
 * — the Survey app never keeps its own copy of a plan. The image is fitted exactly as Takeoffs' loadBackgroundImage does
 * (k = min(1400/W, 900/H), anchored top-left) so ink drawn here is in the Takeoffs world frame.
 * Rendered plans are cached as PNG blobs in IndexedDB (SurveyStore.blobSet 'plan:<planRowId>') for offline.
 */
window.SurveyPlan = (function () {
  'use strict';
  var CFG = window.__SURVEY_CONFIG__ || {};
  var SP = CFG.spaces.plan;

  async function listFloors(supa, pid) {
    var r = await supa.from('takeoffs_floors').select('floor_id,code,name,seq').eq('project_id', pid).order('seq');
    if (r.error) { console.warn('[Survey] floors', r.error.message); return []; }
    return (window.sonorSortFloors ? window.sonorSortFloors(r.data) : r.data);
  }
  async function activePlan(supa, pid, floorId) {
    var r = await supa.from('takeoffs_floor_plans').select('id,revision_label,filename,mime_type,page_index,storage_path,is_active,created_at')
      .eq('project_id', pid).eq('floor_id', floorId).order('created_at', { ascending: false });
    if (r.error || !r.data.length) return null;
    return r.data.find(function (x) { return x.is_active; }) || r.data[0];
  }
  async function signedUrl(supa, path) {
    var r = await supa.storage.from(CFG.buckets.plans).createSignedUrl(path, 3600);
    if (r.error) throw new Error(r.error.message);
    return r.data.signedUrl;
  }
  // Returns { image, fit:{x,y,w,h}, basis:{w,h,k} }
  async function loadImage(supa, planRow) {
    var key = 'plan:' + planRow.id, blob = null;
    try { blob = await window.SurveyStore.blobGet(key); } catch (e) { }
    if (!blob) {
      var url = await signedUrl(supa, planRow.storage_path);
      var resp = await fetch(url); var raw = await resp.blob();
      if (/pdf/i.test(planRow.mime_type || '') || /\.pdf$/i.test(planRow.filename || '')) {
        blob = await renderPdf(await raw.arrayBuffer(), planRow.page_index || 1);
      } else blob = raw;
      try { await window.SurveyStore.blobSet(key, blob); } catch (e) { }
    }
    var img = await loadBitmap(blob);
    var k = Math.min(SP.w / img.width, SP.h / img.height, 1 * 1e9);   // same rule as Takeoffs (never upscale past fit)
    return { image: img, fit: { x: 0, y: 0, w: img.width * k, h: img.height * k }, basis: { w: img.width, h: img.height, k: k } };
  }
  async function renderPdf(buf, pageIndex) {
    if (!window.pdfjsLib) throw new Error('pdf.js not loaded');
    var doc = await pdfjsLib.getDocument({ data: buf }).promise;
    var page = await doc.getPage(Math.min(Math.max(1, pageIndex | 0), doc.numPages));
    var vp1 = page.getViewport({ scale: 1 }), scale = Math.min(4, 3200 / Math.max(vp1.width, vp1.height));
    var vp = page.getViewport({ scale: scale });
    var c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    return await new Promise(function (res) { c.toBlob(res, 'image/png'); });
  }
  function loadBitmap(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(blob); });
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = URL.createObjectURL(blob); });
  }
  // Photo → downscaled JPEG blob + dims (EXIF orientation honoured)
  async function preparePhoto(file, maxSide, q) {
    var bmp = await loadBitmap(file);
    var s = Math.min(1, (maxSide || 1600) / Math.max(bmp.width, bmp.height));
    var c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', q || 0.86); });
    return { blob: blob, w: c.width, h: c.height };
  }
  return { listFloors: listFloors, activePlan: activePlan, loadImage: loadImage, loadBitmap: loadBitmap, preparePhoto: preparePhoto };
})();
