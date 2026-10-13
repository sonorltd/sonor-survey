#!/usr/bin/env python3
"""Woodbrook (ENQ - 1 Woodbrook Road) — pre-visit session for Wed 14 Oct 12:00 (takeover assessment, no plans, no photos yet)."""
import json, time, uuid, random, string, urllib.request, sys
URL='https://ysmvklstkzodlocttspy.supabase.co'; KEY=open('.key').read().strip()   # anon key in a local .key file - never commit it
PID='b7c40775-31ee-47e9-9720-be880f7d4d88'
NOW=time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
def req(m,p,b=None,extra=None):
    h={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=representation'}; h.update(extra or {})
    r=urllib.request.Request(URL+p,data=json.dumps(b).encode() if b is not None else None,method=m,headers=h)
    try:
        with urllib.request.urlopen(r) as x: return x.status, x.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
def b36(n):
    s=''
    while n: n,r=divmod(n,36); s='0123456789abcdefghijklmnopqrstuvwxyz'[r]+s
    return s
def uid(p): return p+b36(int(time.time()*1000))+''.join(random.choice(string.ascii_lowercase+string.digits) for _ in range(5))
SID=str(uuid.uuid4())
st,out=req('POST','/rest/v1/survey_sessions',{'id':SID,'project_id':PID,'kind':'survey','title':'Site assessment 14 Oct 26','status':'open','engineer':'Bryn','started_at':NOW,'created_at':NOW,'updated_at':NOW,'metadata':{'seeded_by':'claude/cowork','purpose':'takeover assessment — pre-visit context'}})
assert st in(200,201),(st,out); print('session',SID)
SP={'w':1414,'h':1000}; CREDIT={'from':'Deborah Donda (OnTheGo Group)','via':'WhatsApp'}
def text(t,size,x,y,w): return {'id':'t_'+uuid.uuid4().hex[:12],'kind':'text','text':t,'size':size,'c':'#141414','x':x,'y':y,'w':w,'h':round((t.count('\n')+1)*size*1.25),'t':int(time.time()*1000)}
def pin(kind,n,txt,x,y,glyph,c,label,to=None):
    m={'id':uid('m_'),'code':'pin-'+kind,'kind':'pin','label':label,'glyph':glyph,'c':c,'nn':None,'block_code':None,'x':x,'y':y,'t':int(time.time()*1000),'pin':kind,'n':n,'text':txt}
    if to: m['to']=to
    return m
MSG=("Pre-visit notes - Deborah Donda, OnTheGo Group (WhatsApp, 12 Oct 26)\n"
"\n"
"Private luxury concierge managing a private residence, 1 Woodbrook Road, Alderley Edge SK9 7DB.\n"
"Owner not named. Deborah is main contact; Sebastian on site to let us in. Wed 14 Oct, 12:00.\n"
"\n"
"What they asked for\n"
"  Stage 1 - full assessment of the existing home automation: lighting, TVs, Sky, Wi-Fi, heating,\n"
"  CCTV, security, access control + any other smart features. What is installed, does it work,\n"
"  what needs repair / reconfiguring / upgrading.\n"
"  Stage 2 - integrate into a centralised system (separate quotation + engineer booking - they\n"
"  already expect this).\n"
"  'Discreet, high-quality service with ongoing technical support' - said twice (service contract).\n"
"\n"
"No floorplans - walk-round only, they will show where the kit is.\n"
"Conservation Area. Only planning record: 17/4459M (2017 garage conversion).\n"
"NB Woodbrook Place (our job 1257, Will Peirce) is a DIFFERENT house on this road.")
CHK=("Assessment - walk every system, photo + 'existing' pin each\n"
"\n"
"  Head end / rack - where, what processor (Control4? Lutron? other), UPS, labels, spares\n"
"  Network - router/ISP, switches, APs per floor, Wi-Fi coverage (speed test each room), VLANs\n"
"  Lighting - keypads per room, dimmer type, scenes working, failed loads, external\n"
"  TVs / Sky - count, sources, matrix or local boxes, remotes, 4K path, audio\n"
"  Audio - zones, amps, speakers, streaming source\n"
"  Heating - stats / zones, UFH, boiler controls, app control\n"
"  CCTV - cameras (count, state, night), NVR, recording days, remote view\n"
"  Security - alarm panel, monitoring, sensors, keypads, who holds codes\n"
"  Access - gates, garage, doorbell / intercom, door locks\n"
"  Blinds / other - motorised, pool / garden / AV extras\n"
"\n"
"Ask for: existing installer + docs, logins (processor, router, NVR, Sky), service history.\n"
"Leave with: list of faults by system, quick wins vs upgrade candidates, support appetite.")
pages=[
 {'id':str(uuid.uuid4()),'session_id':SID,'project_id':PID,'seq':10,'kind':'blank','title':'Pre-visit notes - Deborah Donda (OnTheGo Group)','floor_code':None,'room':None,'photo_path':None,'plan_ref':None,'floor_id':None,'version':1,'created_at':NOW,'updated_at':NOW,
  'metadata':{'category':'pre-visit','credit':CREDIT,'received_notes':True},'ink':{'v':1,'space':SP,'strokes':[],'marks':[],'objects':[text(MSG,30,60,60,SP['w']-120)]}},
 {'id':str(uuid.uuid4()),'session_id':SID,'project_id':PID,'seq':20,'kind':'blank','title':'Assessment checklist + RFIs','floor_code':None,'room':None,'photo_path':None,'plan_ref':None,'floor_id':None,'version':1,'created_at':NOW,'updated_at':NOW,
  'metadata':{},'ink':{'v':1,'space':SP,'strokes':[],'objects':[text(CHK,28,60,60,SP['w']-120)],'marks':[
   pin('rfi',1,'Who is the homeowner / decision-maker, and does OnTheGo Group instruct and pay on their behalf?',1240,120,'?','#d08a1a','RFI / query','Client'),
   pin('rfi',2,'Existing installer? Any system documentation / logins (Control4, Lutron, Sky, router, CCTV NVR)?',1240,200,'?','#d08a1a','RFI / query','Client'),
   pin('rfi',3,'Appetite for an ongoing support / maintenance contract after the assessment - tier and response expectations',1240,280,'?','#d08a1a','RFI / query','Client')]}},
]
st,out=req('POST','/rest/v1/survey_pages',pages,extra={'Prefer':'return=minimal'}); assert st in(200,201),(st,out)
req('PATCH','/rest/v1/projects?id=eq.'+PID,{'updated_at':NOW},extra={'Prefer':'return=minimal'})
print('pages',len(pages))
