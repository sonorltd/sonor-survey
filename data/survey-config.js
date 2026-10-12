/* Sonor Survey — app config (static refs only; project data lives in Supabase) */
window.__SURVEY_CONFIG__ = (function () {
  'use strict';
  return {
    version: '0.4.0',
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
    // v0.4.0 SURVEY MARKS palette — quick, coarse survey-stage intent. Each entry names the DEFAULT Library block
    // (sonor_blocks.block_code) so Takeoffs swaps the mark for the real block at takeoff stage (B-529). Service colours.
    marks: [
      { code: 'photo', kind: 'photo', label: 'Photo here', glyph: '📷', nn: null },
      { code: 'tv',    label: 'TV',             glyph: 'TV',  nn: '03', block_code: 'CL-SON-03-1-TVPOINT' },
      { code: 'cspk',  label: 'Ceiling speaker', glyph: 'CS', nn: '02', block_code: 'CL-SON-02-3-SPKR-CEIL' },
      { code: 'iwspk', label: 'In-wall speaker', glyph: 'IW', nn: '02', block_code: 'CL-SON-02-SPKR-INWALL' },
      { code: 'sub',   label: 'Subwoofer',      glyph: 'SUB', nn: '02', block_code: 'CL-SON-02-3-SUB' },
      { code: 'kp',    label: 'Keypad',         glyph: 'KP',  nn: '07', block_code: 'CL-SON-07-KP' },
      { code: 'ts',    label: 'Touchscreen',    glyph: 'TS',  nn: '07', block_code: 'CL-SON-07-1-TOUCH' },
      { code: 'lkp',   label: 'Lighting keypad', glyph: 'LK', nn: '04', block_code: 'CL-SON-04-3-KP-4' },
      { code: 'led',   label: 'LED strip',      glyph: 'LED', nn: '04', block_code: 'CL-SON-04-LEDSTRIP' },
      { code: 'dl',    label: 'Downlight',      glyph: 'DL',  nn: '04', block_code: 'CL-SON-04-20-DL-FIXED' },
      { code: 'blind', label: 'Blind / shade',  glyph: 'BL',  nn: '05', block_code: 'CL-SON-05-BLIND-1800' },
      { code: 'pir',   label: 'PIR',            glyph: 'PIR', nn: '05', block_code: 'CL-SON-05-3-PIR' },
      { code: 'stat',  label: 'Thermostat',     glyph: 'TH',  nn: '06', block_code: 'CL-SON-06-TSTAT' },
      { code: 'cam',   label: 'Camera',         glyph: 'CAM', nn: '08', block_code: 'CL-SON-08-1-CAM-BULLET' },
      { code: 'dbell', label: 'Doorbell',       glyph: 'DB',  nn: '08', block_code: 'CL-SON-08-DBELL' },
      { code: 'ap',    label: 'WiFi AP',        glyph: 'AP',  nn: '09', block_code: 'CL-SON-09-WAP-CEIL' },
      { code: 'data',  label: 'Data point',     glyph: 'D',   nn: '09', block_code: 'CL-SON-09-3-DATA-TWIN' },
      { code: 'pj',    label: 'Projector',      glyph: 'PJ',  nn: '01', block_code: 'CL-SON-01-PROJ-4K' },
      { code: 'scr',   label: 'Screen',         glyph: 'SCR', nn: '01', block_code: 'CL-SON-01-SCRN-FIXED' },
      { code: 'rack',  label: 'Rack / Node 0',  glyph: 'N0',  nn: '10', block_code: 'CL-SON-10-NODE-0' }
    ],
    paper: { line: 36, grid: 25 },
    autosaveMs: 1200,
    photoJpegQuality: 0.86
  };
})();
