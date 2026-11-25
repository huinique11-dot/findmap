import json, re, sys, time, urllib.request, urllib.parse
src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(src))
try: cache = json.load(open(dst+'.cache'))
except Exception: cache = {}
def q(s):
    if s in cache: return cache[s]
    url='https://nominatim.openstreetmap.org/search?'+urllib.parse.urlencode(dict(q=s,format='json',countrycodes='kr',limit=1))
    req=urllib.request.Request(url,headers={'User-Agent':'edu-map-setup/1.0'})
    for i in range(3):
        try:
            r=json.load(urllib.request.urlopen(req,timeout=20)); break
        except Exception as e:
            time.sleep(3); r=None
    time.sleep(1.1)
    res=None
    if r:
        la,lo=float(r[0]['lat']),float(r[0]['lon'])
        if 37.25<la<37.65 and 126.45<lo<126.85: res=[la,lo]
    cache[s]=res; json.dump(cache,open(dst+'.cache','w'),ensure_ascii=False)
    return res
def clean(a):
    a=re.sub(r'\(.*?\)?$','',a); a=re.sub(r'\(.*?\)','',a)
    a=a.split(',')[0]
    a=re.sub(r'^(인천광역시|인천시|인천)\s*','',a).strip()
    a=re.sub(r'(\S+[로길])\s+(\d+번길)',r'\1\2',a)
    a=re.sub(r'\s+(지하|\d+층|\d+~\d+층|[A-Z]동|T)\b.*$','',a)
    a=re.sub(r'\s+[^\s\d]*(아파트|상가|빌딩|복지관|센터|평생학습관|공원|커뮤니티).*$','',a)
    if not a.startswith(('남동구','연수구')):
        a=('연수구 ' if '센트럴로' in a else '')+a
    return '인천광역시 '+re.sub(r'\s+',' ',a).strip()
for i,d in enumerate(data):
    ca=clean(d['addr']); d['q']=ca
    gu='남동구' if '남동구' in d['addr'] else '연수구' if '연수구' in d['addr'] else ''
    pos=q(ca); prec='addr'
    if not pos:
        pos=q(f"인천광역시 {gu} {d['name'].strip()}"); prec='name'
    if not pos:
        m=re.match(r'(인천광역시 \S+구 \S+[로길])',ca)
        if m: pos=q(m.group(1)); prec='road'
    d['lat'],d['lng']=(pos or [None,None]); d['prec']=prec if pos else 'none'
    print(i,d['name'],ca,d['prec'],pos,flush=True)
json.dump(data,open(dst,'w'),ensure_ascii=False,indent=1)
