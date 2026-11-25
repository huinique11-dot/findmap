"""geo.json(좌표가 채워진 목록) → data/places.js 생성.
같은 좌표에 여러 기관이 있으면 지도에서 겹치지 않게 조금씩 벌려 놓는다."""
import json, sys, math, collections
src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(src))
seen = collections.Counter()
out = []
for d in data:
    p = dict(name=d['name'], cat=d['cat'], addr=d['addr'], tel=d['tel'])
    if d.get('lat') is not None:
        key = (round(d['lat'], 5), round(d['lng'], 5))
        k = seen[key]; seen[key] += 1
        a = k * 2.4
        p['lat'] = round(d['lat'] + (0.00012 * math.cos(a) if k else 0), 6)
        p['lng'] = round(d['lng'] + (0.00015 * math.sin(a) if k else 0), 6)
        if d.get('prec') in ('road', 'name'): p['approx'] = d['prec'] == 'road'
    out.append(p)
# 주소에 '구'가 없으면 가장 가까운 장소의 구를 붙인다 (지역 필터용)
import re
gu = lambda a: (re.search(r'([가-힣]+구)(?=\s|$)', a) or [None, None])[1]
for p in out:
    if not gu(p['addr']) and 'lat' in p:
        near = min((q for q in out if q is not p and gu(q['addr']) and 'lat' in q),
                   key=lambda q: (q['lat'] - p['lat']) ** 2 + (q['lng'] - p['lng']) ** 2)
        p['gu'] = gu(near['addr'])
with open(dst, 'w') as f:
    f.write('/* 자동 생성: tools/build_data.py. 이름·내용·주소·전화번호·위도·경도 */\n')
    f.write('window.PLACES = ' + json.dumps(out, ensure_ascii=False, indent=0).replace('\n', '') .replace('},{', '},\n{') + ';\n')
print(len(out), 'written', sum(1 for p in out if 'lat' not in p), 'without coords')
