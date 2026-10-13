import json, time, uuid, random, string, urllib.request
URL='https://ysmvklstkzodlocttspy.supabase.co'; KEY=open('.key').read().strip()   # anon key in a local .key file - never commit it
PID='b7c40775-31ee-47e9-9720-be880f7d4d88'; SID='6bc3b29f-b118-4a08-b2e4-759c50d2d054'; GF_OLD='fmv6soviygikj'; OLD_PLAN='8fe8a86c-25e8-4df7-abf4-02c3070296f0'
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
def fid(): time.sleep(0.002); return 'f'+b36(int(time.time()*1000))+''.join(random.choice(string.ascii_lowercase+string.digits) for _ in range(4))
EMPTY={"tvs":[],"leds":[],"areas":[],"shades":[],"leaders":[],"lengths":[],"symbols":[],"pinSnags":[],"pjScreens":[],"textBoxes":[],"dimensions":[],"annotations":[],"containment":[],"revisionClouds":[],"buildingOutline":[],"exportFrame":None,"backgroundImage":None,"roomCounter":0,"scalePxPerM":None,"activeCableId":"cat6d","activeLedId":"strip-w"}
floors=[('B','Basement',0,None),('GF','Ground Floor',1,GF_OLD),('1F','First Floor',2,None),('2F','Second Floor',3,None),('EXT','External',4,None)]
rows=[]; ids={}
for code,name,seq,existing in floors:
    ids[code]=existing or fid()
    if existing: st,out=req('PATCH','/rest/v1/takeoffs_floors?project_id=eq.'+PID+'&floor_id=eq.'+existing,{"seq":seq,"updated_at":NOW}); assert st in(200,204),(st,out)
    else: rows.append({"project_id":PID,"floor_id":ids[code],"code":code,"name":name,"seq":seq,"content":EMPTY,"metadata":{"app_version":"claude/cowork","source":"agent floorplan 2026 (J&H / Giraffe360)" if code!='EXT' else "council site plan 17/4459M"},"version":1})
st,out=req('POST','/rest/v1/takeoffs_floors',rows); assert st in(200,201),(st,out)
# demote the footprint
st,out=req('PATCH','/rest/v1/takeoffs_floor_plans?id=eq.'+OLD_PLAN,{"is_active":False}); assert st in(200,204),(st,out)
files={'B':('1-Woodbrook-Road_B_agent-floorplan-2026.pdf','Agent floorplan 2026','Basement - Jordan & Halstead / Giraffe360 letting floorplan, cropped + scaled ~1:100 from stated room sizes'),
 'GF':('1-Woodbrook-Road_GF_agent-floorplan-2026.pdf','Agent floorplan 2026','Ground Floor incl. garage - agent floorplan, ~1:100 (hallway 52ft9 = 16.08 m basis)'),
 '1F':('1-Woodbrook-Road_1F_agent-floorplan-2026.pdf','Agent floorplan 2026','First Floor - agent floorplan, ~1:100'),
 '2F':('1-Woodbrook-Road_2F_agent-floorplan-2026.pdf','Agent floorplan 2026','Second Floor - agent floorplan, ~1:100'),
 'EXT':('council-266db995.pdf','Site plan 17/4459M (2017)','Design Consultants site/location plan 1:500 from the 2017 garage application - gates, drive, trees, boundary')}
plans=[]; pages=[]; seq=30
titles={'B':'Basement','GF':'Ground Floor','1F':'First Floor','2F':'Second Floor','EXT':'External - site plan'}
for code in ['B','GF','1F','2F','EXT']:
    fn,label,notes=files[code]; data=open(fn,'rb').read(); pid_=str(uuid.uuid4())
    outname=fn if code!='EXT' else '1-Woodbrook-Road_site-plan_17-4459M.pdf'
    path=PID+'/'+ids[code]+'/'+str(uuid.uuid4())+'__'+outname
    st,out=req('POST','/storage/v1/object/takeoffs-plans/'+path,data,ctype='application/pdf',extra={'x-upsert':'true'}); assert st in(200,201),(st,out)
    plans.append({"id":pid_,"project_id":PID,"floor_id":ids[code],"revision_label":label,"filename":outname,"mime_type":"application/pdf","page_count":1,"page_index":1,"storage_path":path,"byte_size":len(data),"notes":notes,"is_active":True,"uploaded_by":"claude/cowork"})
    pages.append({"id":str(uuid.uuid4()),"session_id":SID,"project_id":PID,"seq":seq,"kind":"plan","title":titles[code],"floor_id":ids[code],"floor_code":code,"room":None,"photo_path":None,"version":1,"created_at":NOW,"updated_at":NOW,"metadata":{"category":"received","credit":{"from":"Jordan & Halstead listing" if code!='EXT' else "Cheshire East planning 17/4459M","via":"Rightmove" if code!='EXT' else "council portal"}},
      "plan_ref":{"plan_id":pid_,"storage_path":path,"mime":"application/pdf","page_index":1,"revision_label":label,"bucket":"takeoffs-plans"},"ink":{"v":1,"space":{"w":1400,"h":900},"strokes":[],"objects":[],"marks":[]}}); seq+=10
st,out=req('POST','/rest/v1/takeoffs_floor_plans',plans); assert st in(200,201),(st,out)
# hide the footprint survey page, add the new ones
st,out=req('PATCH','/rest/v1/survey_pages?session_id=eq.'+SID+'&kind=eq.plan&seq=eq.30',{"metadata":{"hidden":True,"hidden_at":NOW,"reason":"superseded by agent floorplan"},"updated_at":NOW}); assert st in(200,204),(st,out)
for p in pages: p['seq']+=10
st,out=req('POST','/rest/v1/survey_pages',pages); assert st in(200,201),(st,out)
req('PATCH','/rest/v1/projects?id=eq.'+PID,{"updated_at":NOW})
print(json.dumps(ids))
