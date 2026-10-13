/* Sonor Survey — app config (static refs only; project data lives in Supabase) */
window.__SURVEY_CONFIG__ = (function () {
  'use strict';
  var CFG = {
    version: '0.11.0',
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
      { code: 'tv',    label: 'TV',             glyph: 'TV',  nn: '03', block_code: 'CL-SON-03-1-TVPOINT' },
      { code: 'cspk',  label: 'Ceiling spk',    glyph: 'CS',  nn: '02', block_code: 'CL-SON-02-3-SPKR-CEIL' },
      { code: 'iwspk', label: 'In-wall spk',    glyph: 'IW',  nn: '02', block_code: 'CL-SON-02-SPKR-INWALL' },
      { code: 'sub',   label: 'Sub',            glyph: 'SUB', nn: '02', block_code: 'CL-SON-02-3-SUB' },
      { code: 'lkp',   label: 'Keypad',         glyph: 'KP',  nn: '04', block_code: 'CL-SON-04-3-KP-4' },
      { code: 'ts',    label: 'Touchscreen',    glyph: 'TS',  nn: '07', block_code: 'CL-SON-07-1-TOUCH' },
      { code: 'dl',    label: 'Downlight',      glyph: 'DL',  nn: '04', block_code: 'CL-SON-04-20-DL-FIXED' },
      { code: 'pend',  label: 'Pendant',        glyph: 'PEN', nn: '04', block_code: 'CL-SON-04-24-PEND' },
      { code: 'wall',  label: 'Wall light',     glyph: 'WL',  nn: '04', block_code: 'CL-SON-04-6-WALL' },
      { code: 'lamp',  label: '5A lamp',        glyph: '5A',  nn: '04', block_code: 'CL-SON-04-6-LAMP5A' },
      { code: 'led',   label: 'LED strip',      glyph: 'LED', nn: '04', block_code: 'CL-SON-04-LEDSTRIP' },
      { code: 'blind', label: 'Blind',          glyph: 'BL',  nn: '05', block_code: 'CL-SON-05-BLIND-1800' },
      { code: 'pir',   label: 'PIR',            glyph: 'PIR', nn: '05', block_code: 'CL-SON-05-3-PIR' },
      { code: 'dwc',   label: 'Door contact',   glyph: 'DC',  nn: '05', block_code: 'CL-SON-05-3-DOOR' },
      { code: 'gate',  label: 'Gate / garage',  glyph: 'GT',  nn: '05', block_code: 'CL-SON-05-6-GARAGE' },
      { code: 'stat',  label: 'Thermostat',     glyph: 'TH',  nn: '06', block_code: 'CL-SON-06-TSTAT' },
      { code: 'trv',   label: 'Radiator TRV',   glyph: 'TRV', nn: '06', block_code: 'CL-SON-06-RADIATOR-TRV' },
      { code: 'ufh',   label: 'UFH manifold',   glyph: 'UFH', nn: '06', block_code: 'SON-TO-06-UFH' },
      { code: 'cam',   label: 'Camera',         glyph: 'CAM', nn: '08', block_code: 'CL-SON-08-1-CAM-BULLET' },
      { code: 'dbell', label: 'Doorbell',       glyph: 'DB',  nn: '08', block_code: 'CL-SON-08-DBELL' },
      { code: 'siren', label: 'Siren',          glyph: 'SRN', nn: '08', block_code: 'SON-TO-08-SIREN' },
      { code: 'ap',    label: 'WiFi AP',        glyph: 'AP',  nn: '09', block_code: 'CL-SON-09-WAP-CEIL' },
      { code: 'data',  label: 'Data point',     glyph: 'D',   nn: '09', block_code: 'CL-SON-09-3-DATA-TWIN' },
      { code: 'pj',    label: 'Projector',      glyph: 'PJ',  nn: '01', block_code: 'CL-SON-01-PROJ-4K' },
      { code: 'scr',   label: 'Screen',         glyph: 'SCR', nn: '01', block_code: 'CL-SON-01-SCRN-FIXED' },
      { code: 'rack',  label: 'Rack / Node 0',  glyph: 'N0',  nn: '10', block_code: 'CL-SON-10-NODE-0' },
      { code: 'aerial', label: 'Aerial / dish', glyph: 'AER', nn: '10', block_code: 'CL-SON-10-7-IRS-COMBO' },
      { code: 'sock',  label: 'Double socket',  glyph: 'SKT', nn: '11', block_code: 'CL-SON-11-1-SOC-DBL' },
      { code: 'floor', label: 'Floor box',      glyph: 'FB',  nn: '11', block_code: 'CL-SON-11-SOCK-FLOOR' },
      { code: 'smoke', label: 'Smoke alarm',    glyph: 'SM',  nn: '11', block_code: 'CL-SON-11-SMOKE-M' }
    ],
    photoMark: { code: 'photo', kind: 'photo', label: 'Photo here', glyph: '📷', nn: null },   // its own tool, never in the devices palette
    extraColours: { '11': '#c0392b' },
    // v0.11.0 SITE OBJECTS — the 🧱 Objects palette (Bryn: "non sonor items like radiators and anything else we possibly need to be
    // aware of for future ref"). Things that are THERE, not things we supply: they constrain cable routes, speaker / keypad
    // positions, rack and plant locations. Drawn as a graphite rounded square (never a service colour), listed as
    // SITE OBJECTS in the report, never counted as devices, never mirrored to Takeoffs as blocks. Groups keep the strip scannable.
    objectColour: '#6E6E73',
    objects: [
      // building fabric
      { code: 'steel',   group: 'Fabric',   label: 'Steel beam',      glyph: 'STL',  hint: 'RSJ / steel — no coring, route around' },
      { code: 'joist',   group: 'Fabric',   label: 'Joist direction', glyph: 'JST',  hint: 'Tap, then draw an arrow with the pen for the run' },
      { code: 'solid',   group: 'Fabric',   label: 'Solid wall',      glyph: 'SOL',  hint: 'Brick / block — chasing, no in-wall boxes without cutting' },
      { code: 'stud',    group: 'Fabric',   label: 'Stud wall',       glyph: 'STD',  hint: 'Plasterboard — easy fishing' },
      { code: 'void',    group: 'Fabric',   label: 'Ceiling void',    glyph: 'VD',   hint: 'Accessible void — note depth with a measurement pin' },
      { code: 'hatch',   group: 'Fabric',   label: 'Loft hatch',      glyph: 'LFT',  hint: 'Loft / roof access' },
      { code: 'riser',   group: 'Fabric',   label: 'Riser / duct',    glyph: 'RSR',  hint: 'Vertical route between floors' },
      { code: 'fire',    group: 'Fabric',   label: 'Fireplace',       glyph: 'FP',   hint: 'Fireplace / stove / chimney breast' },
      { code: 'stairs',  group: 'Fabric',   label: 'Stairs',          glyph: 'STR',  hint: 'Stair / landing — keypad and lighting positions' },
      { code: 'rlight',  group: 'Fabric',   label: 'Roof light',      glyph: 'RL',   hint: 'Roof light / lantern — blinds, no ceiling kit here' },
      { code: 'conc',    group: 'Fabric',   label: 'Concrete floor',  glyph: 'CNC',  hint: 'Solid / screeded floor — no under-floor route' },
      // existing M&E (other trades)
      { code: 'rad',     group: 'M&E',      label: 'Radiator',        glyph: 'RAD',  hint: 'Radiator — TRV candidate, speaker / keypad clash' },
      { code: 'boiler',  group: 'M&E',      label: 'Boiler',          glyph: 'BLR',  hint: 'Boiler / heat pump unit' },
      { code: 'cyl',     group: 'M&E',      label: 'Cylinder / tank', glyph: 'CYL',  hint: 'Hot water cylinder / tank' },
      { code: 'cu',      group: 'M&E',      label: 'Consumer unit',   glyph: 'CU',   hint: 'Fuse board — spare ways?' },
      { code: 'meter',   group: 'M&E',      label: 'Meter',           glyph: 'MTR',  hint: 'Electric / gas / water meter position' },
      { code: 'stop',    group: 'M&E',      label: 'Stopcock',        glyph: 'STP',  hint: 'Mains water stop tap — leak shut-off valve goes here' },
      { code: 'fan',     group: 'M&E',      label: 'Extract fan',     glyph: 'FAN',  hint: 'Extract / MVHR terminal' },
      { code: 'acunit',  group: 'M&E',      label: 'AC unit',         glyph: 'AC',   hint: 'Existing air-con indoor / outdoor unit' },
      { code: 'ont',     group: 'M&E',      label: 'Incoming / ONT',  glyph: 'ONT',  hint: 'Broadband entry — fibre ONT, master socket, cable TV' },
      // existing kit (takeover / upgrade jobs)
      { code: 'xtv',     group: 'Existing', label: 'Existing TV',     glyph: 'xTV',  hint: 'TV already there — size / bracket / sources' },
      { code: 'xspk',    group: 'Existing', label: 'Existing spk',    glyph: 'xSP',  hint: 'Existing ceiling / in-wall / box speaker' },
      { code: 'xkp',     group: 'Existing', label: 'Existing keypad', glyph: 'xKP',  hint: 'Existing keypad / dimmer / switch to reuse or replace' },
      { code: 'xcam',    group: 'Existing', label: 'Existing camera', glyph: 'xCM',  hint: 'Existing CCTV camera' },
      { code: 'xap',     group: 'Existing', label: 'Existing AP',     glyph: 'xAP',  hint: 'Existing Wi-Fi AP / router' },
      { code: 'xrack',   group: 'Existing', label: 'Existing rack',   glyph: 'xRK',  hint: 'Existing rack / head end / cupboard of kit' },
      { code: 'alarm',   group: 'Existing', label: 'Alarm panel',     glyph: 'ALM',  hint: 'Intruder alarm panel / keypad' },
      { code: 'icom',    group: 'Existing', label: 'Intercom',        glyph: 'ICM',  hint: 'Existing door entry / intercom' },
      { code: 'xstat',   group: 'Existing', label: 'Existing stat',   glyph: 'xTH',  hint: 'Existing thermostat / heating control' },
      // furniture that fixes a position
      { code: 'bed',     group: 'Furniture', label: 'Bed',            glyph: 'BED',  hint: 'Bed position — bedside keypads, TV sightline' },
      { code: 'sofa',    group: 'Furniture', label: 'Sofa',           glyph: 'SOF',  hint: 'Seating — listening position, sub placement' },
      { code: 'desk',    group: 'Furniture', label: 'Desk',           glyph: 'DSK',  hint: 'Desk — data, power, monitor' },
      { code: 'island',  group: 'Furniture', label: 'Island',         glyph: 'ISL',  hint: 'Kitchen island — pendants, sockets, pop-ups' },
      { code: 'ward',    group: 'Furniture', label: 'Wardrobe',       glyph: 'WRD',  hint: 'Fitted wardrobe — hides a wall, LED inside?' },
      { code: 'bath',    group: 'Furniture', label: 'Bath / shower',  glyph: 'BTH',  hint: 'Bath / shower — IP zones for speakers and lights' },
      // external
      { code: 'tree',    group: 'External', label: 'Tree',            glyph: 'TRE',  hint: 'Tree — uplight, Wi-Fi shadow, duct route' },
      { code: 'mh',      group: 'External', label: 'Manhole / duct',  glyph: 'MH',   hint: 'Manhole, drain run or existing duct' },
      { code: 'tap',     group: 'External', label: 'External tap',    glyph: 'TAP',  hint: 'Outside tap — irrigation valve' },
      { code: 'post',    group: 'External', label: 'Gate post',       glyph: 'GP',   hint: 'Gate post / pier — intercom, camera, keypad' },
      { code: 'pond',    group: 'External', label: 'Pond / pool',     glyph: 'PND',  hint: 'Water — IP rating, pump power' },
      { code: 'drive',   group: 'External', label: 'Drive / path',    glyph: 'DRV',  hint: 'Hard standing — ducts go in BEFORE this' },
      // hazards + access
      { code: 'asb',     group: 'Hazard',   label: 'Asbestos ?',      glyph: 'ASB',  hint: 'Suspected asbestos — do not disturb, flag it' },
      { code: 'damp',    group: 'Hazard',   label: 'Damp',            glyph: 'DMP',  hint: 'Damp / water ingress near kit' },
      { code: 'noacc',   group: 'Hazard',   label: 'No access',       glyph: 'NOA',  hint: 'Could not get in — survey later' },
      { code: 'obs',     group: 'Hazard',   label: 'Obstruction',     glyph: 'OBS',  hint: 'Something in the way of a route or position' }
    ],
   // 11 Electrical is a Takeoffs block family, not a Sonor service colour
    // v0.6.0 PINS — the 📌 menu. Each pin is a numbered flag with text; RFI / client / note pins pull through to Takeoffs
    // Plan Notes (projects.metadata.plan_notes: section + is_rfi) at the same x/y; snags publish for Tasks (B-530); all in the report.
    pins: [
      { pin: 'rfi',    label: 'RFI / query',     glyph: '?',  c: '#d08a1a', notes_section: 'general', is_rfi: true,  hint: 'A question for the architect / client / contractor' },
      { pin: 'client', label: 'Client comment',  glyph: 'C',  c: '#3A8AA8', notes_section: 'client',  is_rfi: false, hint: 'Something the client / contractor said on site' },
      { pin: 'note',   label: 'Site note',       glyph: 'N',  c: '#4a4a4f', notes_section: 'general', is_rfi: false, hint: 'A drawing note for the takeoff' },
      { pin: 'snag',   label: 'Snag',            glyph: '!',  c: '#c0392b', notes_section: null,      is_rfi: false, hint: 'Defect / outstanding item (snag walk)' },
      { pin: 'dim',    label: 'Measurement',     glyph: 'm',  c: '#2f7d4f', notes_section: 'general', is_rfi: false, hint: 'A dimension taken on site, e.g. "ceiling 2.6 m"' }
    ],
    // v0.10.0 PHOTO CATEGORIES — where a photo came from (Bryn: Paul Murphy sent pre-visit photos on WhatsApp). 'survey' = taken on site by us.
    photoCategories: [
      { key: 'survey',    label: 'Survey',    short: '',    hint: 'Taken on site during this survey' },
      { key: 'pre-visit', label: 'Pre-visit', short: 'PRE', hint: 'Sent before the visit — client, contractor, architect' },
      { key: 'received',  label: 'Received',  short: 'RCV', hint: 'Sent to us after / outside the visit' },
      { key: 'existing',  label: 'Existing',  short: 'EXG', hint: 'Existing kit / as-found condition' }
    ],
    // v0.6.0 TEXT tool — typed text objects (page units); S / M / L follow the pen width buttons
    textSizes: { S: 22, M: 32, L: 46 },

    paper: { line: 36, grid: 25 },
    autosaveMs: 1200,
    photoJpegQuality: 0.86
  };
  // v0.6.0 — SERVICE ORDER everywhere: the devices palette, legends and schedules all read this list in nn order
  CFG.marks.sort(function (a, b) { return (a.nn || '99').localeCompare(b.nn || '99'); });
  return CFG;
})();
