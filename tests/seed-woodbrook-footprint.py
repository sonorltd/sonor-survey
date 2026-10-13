import json, time, uuid, random, string, urllib.request
URL='https://ysmvklstkzodlocttspy.supabase.co'; KEY=open('.key').read().strip()   # anon key in a local .key file - never commit it
PID='b7c40775-31ee-47e9-9720-be880f7d4d88'; SID='6bc3b29f-b118-4a08-b2e4-759c50d2d054'
NOW=time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
def req(m,p,b=None,ctype='application/json',extra=None):
    h={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':ctype,'Prefer':'return=minimal'}; h.update(extra or {})
    d=b if isinstance(b,(bytes,bytearray)) else (json.dumps(b).encode() if b is not None else None)
    r=urllib.request.Request(URL+p,data=d,method=m,headers=h)
    try:
        with urllib.request.urlopen(r) as x: return x.status, x.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
def b36(n):
    s=''
    while n: n,r=divmod(n,36); s='0123456789abcdefghijklmnopqrstuvwxyz'[r]+s
    return s
GF='f'+b36(int(time.time()*1000))+''.join(random.choice(string.ascii_lowercase+string.digits) for _ in range(4))
EMPTY={"tvs":[],"leds":[],"areas":[],"shades":[],"leaders":[],"lengths":[],"symbols":[],"pinSnags":[],"pjScreens":[],"textBoxes":[],"dimensions":[],"annotations":[],"containment":[],"revisionClouds":[],"buildingOutline":[],"exportFrame":None,"backgroundImage":None,"roomCounter":0,"scalePxPerM":None,"activeCableId":"cat6d","activeLedId":"strip-w"}
st,out=req('POST','/rest/v1/takeoffs_floors',[{"project_id":PID,"floor_id":GF,"code":"GF","name":"Ground Floor","seq":0,"content":EMPTY,"metadata":{"app_version":"claude/cowork","source":"OSM footprint (indicative) for site assessment"},"version":1}]); assert st in(200,201),(st,out)
fn='1-Woodbrook-Road_GF-footprint_OSM-indicative.pdf'; data=open(fn,'rb').read(); plan_id=str(uuid.uuid4()); path=PID+'/'+GF+'/'+str(uuid.uuid4())+'__'+fn
st,out=req('POST','/storage/v1/object/takeoffs-plans/'+path,data,ctype='application/pdf',extra={'x-upsert':'true'}); assert st in(200,201),(st,out)
st,out=req('POST','/rest/v1/takeoffs_floor_plans',[{"id":plan_id,"project_id":PID,"floor_id":GF,"revision_label":"OSM footprint (indicative)","filename":fn,"mime_type":"application/pdf","page_count":1,"page_index":1,"storage_path":path,"byte_size":len(data),"notes":"Building outline from OpenStreetMap (way 827142526) at 1:100 A3 — no internal layout; walls to be sketched on site 14 Oct. Replace with a measured / LiDAR plan when there is one.","is_active":True,"uploaded_by":"claude/cowork"}]); assert st in(200,201),(st,out)
page={"id":str(uuid.uuid4()),"session_id":SID,"project_id":PID,"seq":30,"kind":"plan","title":"Ground Floor - footprint (sketch rooms here)","floor_id":GF,"floor_code":"GF","room":None,"photo_path":None,"version":1,"created_at":NOW,"updated_at":NOW,"metadata":{},
 "plan_ref":{"plan_id":plan_id,"storage_path":path,"mime":"application/pdf","page_index":1,"revision_label":"OSM footprint (indicative)","bucket":"takeoffs-plans"},
 "ink":{"v":1,"space":{"w":1400,"h":900},"strokes":[],"objects":[],"marks":[]}}
st,out=req('POST','/rest/v1/survey_pages',[page]); assert st in(200,201),(st,out)
req('PATCH','/rest/v1/projects?id=eq.'+PID,{"updated_at":NOW})
print('GF',GF,'plan',plan_id)
