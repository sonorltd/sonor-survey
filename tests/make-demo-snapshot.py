#!/usr/bin/env python3
"""Refresh demo/ from the live Leena project (or any pid): scrubs names/contacts, downloads photos + plans, rasterises plans.
Usage: python3 tests/make-demo-snapshot.py [project_id] — needs a local .key (SUPABASE_ANON from sonor-db.js) and poppler (pdftoppm) + Pillow.
Writes demo/demo-data/demo-snapshot.json and demo/assets/*. The app files stay shared (demo/index.html loads ../data/)."""
import json, re, sys, os, io, urllib.request, subprocess
from PIL import Image
URL = 'https://ysmvklstkzodlocttspy.supabase.co'; KEY = open('.key').read().strip()
PID = sys.argv[1] if len(sys.argv) > 1 else 'dbe32b1a-e799-43be-815b-8b4fdf53487a'
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
def get(path, raw=False):
    r = urllib.request.Request(URL + path, headers=H)
    with urllib.request.urlopen(r) as x: return x.read() if raw else json.loads(x.read().decode())
root = os.path.join(os.path.dirname(__file__), '..', 'demo'); os.makedirs(os.path.join(root, 'assets'), exist_ok=True); os.makedirs(os.path.join(root, 'demo-data'), exist_ok=True)
proj = get('/rest/v1/projects?id=eq.' + PID + '&select=id,ref,name,status,address,postcode,created_at,updated_at,client_name')[0]
proj.update({'client_name': 'Private client', 'metadata': {'is_test': False, 'demo': True}, 'client_email': None, 'client_phone': None, 'services': None, 'value_agreed': None, 'value_quoted': None})
first = (proj.get('client_name') or '').split(' ')[0]
sessions = get('/rest/v1/survey_sessions?project_id=eq.' + PID + '&select=*')
pages = get('/rest/v1/survey_pages?project_id=eq.' + PID + '&metadata->>hidden=is.null&select=*&order=seq')
floors = get('/rest/v1/takeoffs_floors?project_id=eq.' + PID + '&deleted_at=is.null&select=floor_id,code,name,seq')
plans = get('/rest/v1/takeoffs_floor_plans?project_id=eq.' + PID + '&is_active=eq.true&select=*')
templates = get('/rest/v1/survey_templates?active=eq.true&select=*')
NAMES = sys.argv[2:]   # extra names to scrub, e.g. "Leena" "Bhavsar"
def scrub(s):
    if not isinstance(s, str): return s
    for n in NAMES: s = re.sub(re.escape(n), 'the client', s)
    return s
for s in sessions: s['title'] = scrub(s.get('title')); s['metadata'] = {}
for pg in pages:
    pg['title'] = scrub(pg.get('title') or ''); m = pg.get('metadata') or {}
    if m.get('credit'): m['credit'] = {'from': 'Client', 'via': m['credit'].get('via')}
    pg['metadata'] = m
    for o in pg['ink'].get('objects', []):
        if o.get('kind') == 'text': o['text'] = scrub(o['text'])
    for mk in pg['ink'].get('marks', []):
        if mk.get('text'): mk['text'] = scrub(mk['text'])
    if pg.get('plan_ref'): pg['plan_ref']['mime'] = 'image/jpeg'
    if pg.get('photo_path'):
        open(os.path.join(root, 'assets', pg['id'] + '.jpg'), 'wb').write(get('/storage/v1/object/site-photos/' + pg['photo_path'], raw=True))
for f in plans:
    pdf = get('/storage/v1/object/takeoffs-plans/' + f['storage_path'], raw=True); tmp = os.path.join(root, 'assets', 'plan-' + f['floor_id'])
    open(tmp + '.pdf', 'wb').write(pdf); subprocess.run(['pdftoppm', '-r', '150', '-png', '-singlefile', tmp + '.pdf', tmp], check=True)
    Image.open(tmp + '.png').convert('RGB').save(tmp + '.jpg', quality=82); os.remove(tmp + '.pdf'); os.remove(tmp + '.png')
    f['mime_type'] = 'image/jpeg'; f['filename'] = f['filename'].replace('.pdf', '.jpg'); f['uploaded_by'] = 'demo'
json.dump({'project': proj, 'sessions': sessions, 'pages': pages, 'floors': floors, 'plans': plans, 'templates': templates}, open(os.path.join(root, 'demo-data', 'demo-snapshot.json'), 'w'))
print('demo snapshot:', len(pages), 'pages,', len(plans), 'plans')
