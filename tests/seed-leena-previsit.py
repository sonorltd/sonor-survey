#!/usr/bin/env python3
"""Leena (31 Prestbury Road) — insert pre-visit material into Survey + Takeoffs.
Run from the leena scratch dir. Mirrors exactly what the Survey app writes (survey-app.js addPhotoPage /
addReceivedNotes / addPlanPage) so the app, the PDF and Takeoffs treat it as native."""
import json, io, os, sys, time, uuid, random, string, urllib.request
from PIL import Image

URL = 'https://ysmvklstkzodlocttspy.supabase.co'
KEY = open('.key').read().strip()   # anon key (SUPABASE_ANON from sonor-db.js) in a local .key file - never commit it
PID = 'dbe32b1a-e799-43be-815b-8b4fdf53487a'
SID = '8a5ad576-7f45-4b85-8874-5a1160a61eaa'
NOW = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
DRY = '--dry' in sys.argv

def req(method, path, body=None, ctype='application/json', extra=None):
    h = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': ctype}
    if extra: h.update(extra)
    data = body if isinstance(body, (bytes, bytearray)) else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(URL + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r) as resp: return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()

def insert(table, rows):
    keys = sorted(set(k for r in rows for k in r)); rows = [{k: r.get(k) for k in keys} for r in rows]   # PostgREST: all object keys must match
    if DRY: print('DRY insert', table, json.dumps(rows)[:300]); return
    st, out = req('POST', '/rest/v1/' + table, rows, extra={'Prefer': 'return=minimal'})
    assert st in (200, 201), (table, st, out)
    print('inserted', table, len(rows))

def upload(bucket, path, data, mime):
    if DRY: print('DRY upload', bucket, path, len(data)); return
    st, out = req('POST', '/storage/v1/object/' + bucket + '/' + path, data, ctype=mime, extra={'x-upsert': 'true'})
    assert st in (200, 201), (path, st, out)
    print('uploaded', path, len(data))

def fid(): return 'f' + base36(int(time.time() * 1000)) + ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(4))
def base36(n):
    s = ''
    while n: n, r = divmod(n, 36); s = '0123456789abcdefghijklmnopqrstuvwxyz'[r] + s
    return s
def uid(p): return p + base36(int(time.time() * 1000)) + ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(5))
def r2(v): return round(v, 2)

# ---------- 1. Takeoffs floors (none existed) ----------
EMPTY = {"tvs": [], "leds": [], "areas": [], "shades": [], "leaders": [], "lengths": [], "symbols": [], "pinSnags": [], "pjScreens": [], "textBoxes": [], "dimensions": [], "annotations": [], "containment": [], "revisionClouds": [], "buildingOutline": [], "exportFrame": None, "backgroundImage": None, "roomCounter": 0, "scalePxPerM": None, "activeCableId": "cat6d", "activeLedId": "strip-w"}
RESUME = '--resume' in sys.argv
GF, FF = fid(), fid()
time.sleep(0.01)
floors = [
    {"project_id": PID, "floor_id": GF, "code": "GF", "name": "Ground Floor", "seq": 0, "content": EMPTY, "metadata": {"app_version": "claude/cowork", "source": "survey pre-visit (client KRA plans)"}, "version": 1},
    {"project_id": PID, "floor_id": FF, "code": "1F", "name": "First Floor", "seq": 1, "content": EMPTY, "metadata": {"app_version": "claude/cowork", "source": "survey pre-visit (client KRA plans)"}, "version": 1},
]
if RESUME:
    st, out = req('GET', '/rest/v1/takeoffs_floors?project_id=eq.' + PID + '&select=floor_id,code'); fl = {r['code']: r['floor_id'] for r in json.loads(out)}; GF, FF = fl['GF'], fl['1F']
else: insert('takeoffs_floors', floors)

# ---------- 2. Plans → takeoffs-plans bucket + takeoffs_floor_plans ----------
plans = []
for floor_id, code, fn, pdf, notes in [
    (GF, 'GF', '31-Prestbury-Road_KRA-A23-GF-M-E-Layout-revD_client-markup.pdf', 'plan-1.pdf', "KRA A/23 GF M&E Layout rev D — client's hand markup (WhatsApp, pre-visit): Sitting Room in-wall 1-5, Atmos ceiling pair, sub TBC"),
    (FF, '1F', '31-Prestbury-Road_KRA-A24-FF-M-E-Layout-revF_client-markup.pdf', 'plan-2.pdf', "KRA A/24 FF M&E Layout rev F — client's hand markup (WhatsApp, pre-visit): suggested ceiling speaker placements per bedroom"),
]:
    if RESUME:
        st, out = req('GET', '/rest/v1/takeoffs_floor_plans?project_id=eq.' + PID + '&floor_id=eq.' + floor_id + '&select=*'); plans.append(json.loads(out)[0]); continue
    data = open(pdf, 'rb').read(); plan_id = str(uuid.uuid4())
    path = PID + '/' + floor_id + '/' + str(uuid.uuid4()) + '__' + fn
    upload('takeoffs-plans', path, data, 'application/pdf')
    plans.append({"id": plan_id, "project_id": PID, "floor_id": floor_id, "revision_label": "Client markup", "filename": fn, "mime_type": "application/pdf", "page_count": 1, "page_index": 1, "storage_path": path, "byte_size": len(data), "notes": notes, "is_active": True, "uploaded_by": "claude/cowork"})
if not RESUME: insert('takeoffs_floor_plans', plans)
PLAN = {p['floor_id']: p for p in plans}

# ---------- 3. Survey pages ----------
pages = []
def page(seq, kind, **f):
    row = {"id": str(uuid.uuid4()), "session_id": SID, "project_id": PID, "seq": seq, "kind": kind, "version": 1, "metadata": {}, "created_at": NOW, "updated_at": NOW}
    row.update(f); pages.append(row); return row
CREDIT = {"from": "Leena", "via": "WhatsApp"}
AUDIO, VIDEO = '#4bb9d3', '#78ba57'

# 3a. pre-visit notes page (what addReceivedNotes writes)
NOTES = ("Pre-visit notes from Leena (WhatsApp) - KRA GF / FF M&E layouts marked up by hand\n"
         "\n"
         "Sitting Room\n"
         "  1-5 = in-wall speakers\n"
         "  1-3 = WS180 (1 R, 2 C below TV, 3 L)\n"
         "  4 + 5 = W165 (Rear R, Rear L)\n"
         "  * = C180 Atmos ceiling speakers (x2, in the slatted ceiling)\n"
         "  Subwoofer can go anywhere, dependent on furniture placement\n"
         "\n"
         "Other rooms\n"
         "  Circle-cross = suggested speaker placement (ceiling) - Gym, Lounge, Entrance Hall, Playroom,\n"
         "  Breakfast, Dining, Living; FF Master Bed, Master Dressing (2 choices of placement), Beds 2-5\n"
         "  Bed 3: 'just next to light'\n"
         "\n"
         "Existing on site\n"
         "  Monitor Audio W165 in-wall (boxed), in-ceiling LCR already in the slatted ceiling above the TV wall")
size = 32; sp = {"w": 1414, "h": 1000}; lines = NOTES.count('\n') + 1
page(30, 'blank', title='Pre-visit notes - Leena (WhatsApp)', metadata={"category": "pre-visit", "credit": CREDIT, "received_notes": True},
     ink={"v": 1, "space": sp, "strokes": [], "marks": [], "objects": [{"id": 't_' + uuid.uuid4().hex[:12], "kind": "text", "text": NOTES, "size": size, "c": "#141414", "x": 60, "y": 60, "w": sp['w'] - 120, "h": round(lines * size * 1.25), "t": int(time.time() * 1000)}]})

# 3b. plan pages with the client's marks. Plan is A3 landscape 1191x842 pt, fitted top-left into 1400x900 → 1273x900.
# coordinates below were read off a 100 dpi render (1655x1170 px).
def pu(x, y): return r2(x / 1655 * 1273.1), r2(y / 1170 * 900)
def mark(code, label, glyph, nn, block, c, x, y):
    X, Y = pu(x, y); return {"id": uid('m_'), "code": code, "kind": "block", "label": label, "glyph": glyph, "c": c, "nn": nn, "block_code": block, "x": X, "y": Y, "t": int(time.time() * 1000)}
def pin(kind, n, text, x, y, glyph, c, label):
    X, Y = pu(x, y); return {"id": uid('m_'), "code": 'pin-' + kind, "kind": "pin", "label": label, "glyph": glyph, "c": c, "nn": None, "block_code": None, "x": X, "y": Y, "t": int(time.time() * 1000), "pin": kind, "n": n, "text": text}
IW = lambda x, y: mark('iwspk', 'In-wall spk', 'IW', '02', 'CL-SON-02-SPKR-INWALL', AUDIO, x, y)
CS = lambda x, y: mark('cspk', 'Ceiling spk', 'CS', '02', 'CL-SON-02-3-SPKR-CEIL', AUDIO, x, y)
gf_marks = [
    IW(639.5, 244.5), IW(643, 318), IW(638, 365), IW(813.8, 246), IW(811, 360),       # 1 R · 2 C (below TV) · 3 L · 4 Rear R · 5 Rear L
    mark('tv', 'TV', 'TV', '03', 'CL-SON-03-1-TVPOINT', VIDEO, 652, 292),              # TV on the wall above 2
    CS(741.8, 287.5), CS(740, 346),                                                    # * Atmos pair
    mark('sub', 'Sub', 'SUB', '02', 'CL-SON-02-3-SUB', AUDIO, 790, 300),               # "anywhere" — parked rear-right, client pin says TBC
    CS(255, 582), CS(255, 680),                      # Gym
    CS(197, 797), CS(373, 800), CS(192, 938), CS(375, 943),   # Lounge
    CS(492, 856), CS(614, 856),                      # Entrance Hall
    CS(754, 852), CS(750, 975),                      # Playroom
    CS(862, 553), CS(861, 624),                      # Breakfast
    CS(948, 572), CS(1028, 575),                     # Dining
    CS(1104, 591), CS(1198, 593),                    # Living
    pin('client', 1, "Sitting Room: 1-3 = WS180 (R / C below TV / L), 4+5 = W165 rears, * = C180 Atmos pair", 700, 232, 'C', '#3A8AA8', 'Client comment'),
    pin('client', 2, "Subwoofer can go anywhere, dependent on furniture placement - position TBC on site", 800, 395, 'C', '#3A8AA8', 'Client comment'),
    pin('rfi', 3, "Confirm which circle-cross positions outside the Sitting Room are wanted as ceiling speakers (all rooms marked, no model given)", 1140, 540, '?', '#d08a1a', 'RFI / query'),
]
ff_marks = [
    CS(684, 266), CS(770, 266),                      # Master Bed
    CS(726, 520), CS(772, 520),                      # Master Dressing — "2 choices of placement"
    CS(236, 832), CS(227, 948),                      # Bed 5
    CS(372, 838), CS(366, 927),                      # Bed 4
    CS(611, 855), CS(605, 940),                      # Bed 3
    CS(762, 855), CS(757, 945),                      # Bed 2
    pin('client', 4, "Master Dressing: 2 choices of placement - either position, not both", 640, 500, 'C', '#3A8AA8', 'Client comment'),
    pin('client', 5, "Bed 3: 'just next to light'", 560, 985, 'C', '#3A8AA8', 'Client comment'),
]
def plan_ref(fl): p = PLAN[fl]; return {"plan_id": p['id'], "storage_path": p['storage_path'], "mime": "application/pdf", "page_index": 1, "revision_label": "Client markup", "bucket": "takeoffs-plans"}
page(40, 'plan', title='Ground Floor', floor_id=GF, floor_code='GF', plan_ref=plan_ref(GF), metadata={"category": "pre-visit", "credit": CREDIT},
     ink={"v": 1, "space": {"w": 1400, "h": 900}, "strokes": [], "objects": [], "marks": gf_marks})
page(50, 'plan', title='First Floor', floor_id=FF, floor_code='1F', plan_ref=plan_ref(FF), metadata={"category": "pre-visit", "credit": CREDIT},
     ink={"v": 1, "space": {"w": 1400, "h": 900}, "strokes": [], "objects": [], "marks": ff_marks})

# 3c. photos (preparePhoto: long edge 1600, jpeg 0.86) → site-photos/{pid}/survey/{sid}/{pageId}.jpg
PHOTOS = [
    ('photo5.jpg', "Client's marked-up GF plan (WhatsApp screenshot)", 'GF', 'Sitting Room'),
    ('photo4.jpg', 'Sitting Room - TV wall, bracket and in-ceiling LCR in slatted ceiling', 'GF', 'Sitting Room'),
    ('photo6.jpg', 'Sitting Room - TV wall and garden window', 'GF', 'Sitting Room'),
    ('photo3.jpg', 'Sitting Room - window wall, in-wall speaker position', 'GF', 'Sitting Room'),
    ('photo1.jpg', 'Existing in-ceiling speaker in the slatted ceiling (close-up)', 'GF', 'Sitting Room'),
    ('photo2.jpg', 'Existing Monitor Audio W165 in-wall speaker (boxed)', 'GF', 'Sitting Room'),
]
seq = 60
REUSE = ['ebaa27da-fd09-4939-af73-9ac179ed61c2','ad776101-7108-4a56-b89f-83ae7779c449','82c1edd0-c1cf-4d72-88c1-5d3c7553f022','fc5778c1-229a-4770-b017-473dca6e2426','8f5348b1-14d9-41f1-b6c6-570ab00e2857','e9d41da6-8afc-4892-9390-04d30bbdef34'] if '--resume' in sys.argv else []
for fn, title, fc, room in PHOTOS:
    im = Image.open(fn).convert('RGB'); s = min(1, 1600 / max(im.size))
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=86, optimize=True); data = buf.getvalue()
    pid_ = str(uuid.uuid4()); path = PID + '/survey/' + SID + '/' + pid_ + '.jpg'
    if RESUME and REUSE: pid_ = REUSE.pop(0); path = PID + '/survey/' + SID + '/' + pid_ + '.jpg'
    else: upload('site-photos', path, data, 'image/jpeg')
    page(seq, 'photo', id=pid_, title=title, floor_code=fc, room=room, photo_path=path,
         ink={"v": 1, "space": {"w": im.width, "h": im.height}, "strokes": [], "objects": []},
         metadata={"w": im.width, "h": im.height, "bytes": len(data), "category": "pre-visit", "credit": CREDIT})
    seq += 10

insert('survey_pages', pages)
if not DRY:
    req('PATCH', '/rest/v1/survey_sessions?id=eq.' + SID, {"updated_at": NOW}, extra={'Prefer': 'return=minimal'})
    req('PATCH', '/rest/v1/projects?id=eq.' + PID, {"updated_at": NOW}, extra={'Prefer': 'return=minimal'})
json.dump({"GF": GF, "FF": FF, "plans": plans, "pages": [{k: v for k, v in p.items() if k != 'ink'} for p in pages]}, open('inserted.json', 'w'), indent=1)
print('done', GF, FF, len(pages), 'pages')
