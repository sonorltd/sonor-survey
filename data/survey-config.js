/* Sonor Survey — app config (static refs only; project data lives in Supabase) */
window.__SURVEY_CONFIG__ = (function () {
  'use strict';
  return {
    version: '0.2.1',
    appKey: 'survey',
    buckets: { photos: 'site-photos', plans: 'takeoffs-plans' },
    // Page spaces (page-unit frames). PLAN = the Takeoffs world frame (1400×900 fit, anchored top-left) so a
    // markup drawn here lands on the same plan coordinates Takeoffs uses — never change these two numbers.
    spaces: { note: { w: 1414, h: 1000 }, notePortrait: { w: 1000, h: 1414 }, plan: { w: 1400, h: 900 }, photoMax: 1600, objectMax: 1400 },   // v0.2.0: landscape notes by default (Bryn 2026-10-12)
    pageKinds: [
      { kind: 'blank', label: 'Blank', icon: 'file-text' },
      { kind: 'lined', label: 'Lined', icon: 'file-text' },
      { kind: 'grid',  label: 'Grid',  icon: 'layers' },
      { kind: 'plan',  label: 'Plan',  icon: 'map' },
      { kind: 'photo', label: 'Photo', icon: 'camera' },
      { kind: 'checklist', label: 'Checklist', icon: 'clipboard-list' }
    ],
    sessionKinds: [['survey', 'Site survey'], ['meeting', 'Client meeting'], ['snag-walk', 'Snag walk'], ['handover', 'Handover'], ['other', 'Other']],
    // Pen palette: ink + the 10 service colours (brand-core — never reassigned)
    inks: [
      { c: '#141414', n: 'Ink' }, { c: '#8058a1', n: '01 Cinema' }, { c: '#4bb9d3', n: '02 Audio' }, { c: '#78ba57', n: '03 Video' },
      { c: '#f5d05c', n: '04 Lighting' }, { c: '#e37c59', n: '05 Automation' }, { c: '#ec6061', n: '06 Climate' }, { c: '#e67eb1', n: '07 Control' },
      { c: '#ad9978', n: '08 Security' }, { c: '#b7b1a7', n: '09 WiFi' }, { c: '#302f2e', n: '10 Infrastructure' }
    ],
    widths: [{ k: 'S', w: 2 }, { k: 'M', w: 3.5 }, { k: 'L', w: 6 }],
    paper: { line: 36, grid: 25 },
    autosaveMs: 1200,
    photoJpegQuality: 0.86
  };
})();
