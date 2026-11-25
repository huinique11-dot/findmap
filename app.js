/* 우리동네 배움지도 — 설치·로그인 없이 쓰는 지역연계 교육자원 지도 */
(function () {
  'use strict';

  // ---------- 저장소 (실패해도 앱은 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bm.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bm.' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  };

  // ---------- 분류 묶음 ----------
  const GROUPS = [
    { key: '초등학교', color: '#2f6fdf' },
    { key: '중학교', color: '#6a4fd6' },
    { key: '고등학교', color: '#9a3fc4' },
    { key: '관공서·문화예술', color: '#d1495b' },
    { key: '체험·생태', color: '#2a9d5c' },
    { key: '도서관', color: '#e07b00' },
    { key: '청소년·돌봄', color: '#0f8fa8' },
    { key: '마을교육', color: '#8a6d3b' },
    { key: '기타', color: '#6b7280' }
  ];
  const colorOf = g => (GROUPS.find(x => x.key === g) || GROUPS[GROUPS.length - 1]).color;

  function groupOf(p) {
    const c = p.cat || '', n = p.name || '';
    if (/초등학교/.test(c)) return '초등학교';
    if (/중학교/.test(c)) return '중학교';
    if (/고등학교/.test(c)) return '고등학교';
    if (/도서관|북센터/.test(n) || /도서관/.test(c)) return '도서관';
    if (/청소년|돌봄|아동/.test(c)) return '청소년·돌봄';
    if (/마을교육|마을공동체/.test(c)) return '마을교육';
    if (/관공서|문화|예술|역사|박물관/.test(c)) return '관공서·문화예술';
    if (/체험|생태|공원|과학/.test(c)) return '체험·생태';
    return '기타';
  }
  const isSchool = p => /(초등|중|고등)학교/.test(p.cat || '');
  const guOf = p => { const m = (p.addr || '').match(/([가-힣]+구)(?=\s|$)/); return m ? m[1] : (p.gu || ''); };

  // ---------- 데이터 ----------
  const builtin = (window.PLACES || []).map((p, i) => Object.assign({ id: 'b' + i }, p));
  let custom = store.get('custom', []);
  let places = [];
  function rebuild() {
    places = builtin.concat(custom).map(p => {
      p.group = groupOf(p); p.gu = guOf(p); p.school = isSchool(p); return p;
    });
  }
  rebuild();
  const byId = id => places.find(p => p.id === id);

  // ---------- 상태 ----------
  let school = null;
  let plan = store.get('plan', []);
  let hidden = new Set(store.get('hidden', ['초등학교', '중학교', '고등학교']));
  let selectedId = null;
  let pickTarget = null; // 'new' | place id

  // ---------- 모바일 하단 시트 ----------
  const isMobile = () => matchMedia('(max-width:760px)').matches;
  const sheetPct = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || 45;
  function setSheet(p) {
    p = Math.max(14, Math.min(88, p));
    document.documentElement.style.setProperty('--sheet-h', p + '%');
    setTimeout(() => map.invalidateSize(), 220);
  }
  // ---------- 지도 ----------
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([37.43, 126.69], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const markers = new Map();
  let schoolMarker = null, ring = null, meMarker = null;

  // ---------- 유틸 ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function km(a, b) {
    if (a.lat == null || b.lat == null) return null;
    const R = 6371, r = Math.PI / 180;
    const dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = d => d == null ? '' : d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km';
  const telHref = t => { const m = (t || '').match(/[\d-]{3,}/); return m ? 'tel:' + m[0].replace(/-/g, '') : ''; };
  const routeHref = p => p.lat != null
    ? `https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(p.addr || p.name)}`;
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }
  const inPlan = id => plan.some(x => x.id === id);

  function actsHtml(p) {
    const tel = telHref(p.tel);
    return `<div class="acts">
      <button class="star ${inPlan(p.id) ? 'on' : ''}" data-act="star" data-id="${p.id}">${inPlan(p.id) ? '★ 담김' : '☆ 담기'}</button>
      ${tel ? `<a href="${tel}">📞 전화</a>` : ''}
      <a href="${routeHref(p)}" target="_blank" rel="noopener">🧭 길찾기</a>
      ${p.lat == null ? `<button data-act="locate" data-id="${p.id}">📍 위치 지정</button>` : ''}
    </div>`;
  }
  function popupHtml(p) {
    const d = school && school.id !== p.id ? km(school, p) : null;
    return `<div class="pop"><h4>${esc(p.name)}</h4>
      <div class="meta">${esc(p.cat)}${d != null ? ' · 우리 학교에서 ' + fmtKm(d) : ''}</div>
      <div class="meta">${esc(p.addr)}</div>
      ${p.tel ? `<div class="meta">☎ ${esc(p.tel)}</div>` : ''}
      ${p.approx ? '<div class="approx">※ 위치가 대략적일 수 있어요</div>' : ''}
      ${actsHtml(p)}</div>`;
  }

  // ---------- 필터 & 목록 ----------
  function visible() {
    const q = $('#q').value.trim().toLowerCase();
    const gu = $('#gu').value;
    const rad = +$('#radius').value;
    return places.filter(p => {
      if (school && p.id === school.id) return false;
      if (hidden.has(p.group)) return false;
      if (gu && p.gu !== gu) return false;
      if (q && !(p.name + ' ' + p.cat + ' ' + p.addr).toLowerCase().includes(q)) return false;
      p._d = school ? km(school, p) : null;
      if (school && rad && p._d != null && p._d > rad) return false;
      return true;
    }).sort((a, b) => (a._d ?? 1e9) - (b._d ?? 1e9) || a.name.localeCompare(b.name, 'ko'));
  }

  function renderChips() {
    const counts = {};
    places.forEach(p => counts[p.group] = (counts[p.group] || 0) + 1);
    $('#chips').innerHTML = GROUPS.filter(g => counts[g.key]).map(g =>
      `<button class="chip ${hidden.has(g.key) ? 'off' : ''}" data-group="${g.key}" aria-pressed="${!hidden.has(g.key)}">
        <i style="background:${g.color}"></i>${g.key} <small>${counts[g.key]}</small></button>`).join('');
  }

  function render() {
    const vis = visible();
    layer.clearLayers(); markers.clear();
    vis.forEach(p => {
      if (p.lat == null) return;
      const m = L.circleMarker([p.lat, p.lng], {
        radius: p.school ? 6 : 8, color: '#fff', weight: 2, fillColor: colorOf(p.group), fillOpacity: .95
      }).bindPopup(() => popupHtml(p), { maxWidth: 280 });
      m.bindTooltip(p.name, { direction: 'top', offset: [0, -6] });
      m.on('click', () => select(p.id, false));
      m.addTo(layer); markers.set(p.id, m);
    });

    const rad = +$('#radius').value;
    $('#summary').textContent = school
      ? `${school.name} ${rad ? rad + 'km 이내' : '주변'} ${vis.length}곳`
      : `전체 ${vis.length}곳 · 위에서 우리 학교를 고르면 가까운 순으로 보여요`;

    $('#list').innerHTML = vis.map(p => `
      <li class="item ${p.id === selectedId ? 'sel' : ''}" data-id="${p.id}">
        <h4><i style="background:${colorOf(p.group)}"></i>${esc(p.name)}</h4>
        <span class="dist">${fmtKm(p._d)}</span>
        <div class="meta">${esc(p.cat)} · ${esc(p.addr)}${p.tel ? ' · ' + esc(p.tel) : ''}</div>
        ${actsHtml(p)}
      </li>`).join('') || '<li class="empty">조건에 맞는 장소가 없어요. 거리나 분류를 넓혀 보세요.</li>';
  }

  function select(id, fly) {
    selectedId = id;
    const p = byId(id); if (!p) return;
    document.querySelectorAll('.item.sel').forEach(e => e.classList.remove('sel'));
    const li = document.querySelector(`.item[data-id="${id}"]`);
    if (li) { li.classList.add('sel'); if (!fly) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (fly && p.lat != null) {
      if (isMobile()) setSheet(32);
      map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: .6 });
      const m = markers.get(id); if (m) setTimeout(() => m.openPopup(), 650);
    }
  }

  // ---------- 우리 학교 ----------
  function fillSchools() {
    $('#schoolList').innerHTML = places.filter(p => p.school)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map(p => `<option value="${esc(p.name)}">${esc(p.gu)} ${esc(p.cat)}</option>`).join('');
    const gus = [...new Set(places.map(p => p.gu).filter(Boolean))].sort();
    const cur = $('#gu').value;
    $('#gu').innerHTML = '<option value="">전체 지역</option>' + gus.map(g => `<option ${g === cur ? 'selected' : ''}>${g}</option>`).join('');
    $('#catList').innerHTML = [...new Set(places.map(p => p.cat))].map(c => `<option value="${esc(c)}">`).join('');
  }

  function setSchool(p, quiet) {
    school = p || null;
    if (schoolMarker) { map.removeLayer(schoolMarker); schoolMarker = null; }
    if (ring) { map.removeLayer(ring); ring = null; }
    if (school) {
      store.set('school', school.name);
      try { history.replaceState(null, '', '#school=' + encodeURIComponent(school.name)); } catch (e) { }
      $('#schoolInput').value = school.name;
      if (school.lat != null) {
        schoolMarker = L.marker([school.lat, school.lng], {
          icon: L.divIcon({ className: '', html: '<div class="school-icon">🏫</div>', iconSize: [28, 28], iconAnchor: [14, 24] }),
          zIndexOffset: 1000
        }).bindTooltip(school.name, { permanent: true, direction: 'top', offset: [0, -22] }).addTo(map);
        drawRing();
        const rad = +$('#radius').value || 3;
        const pad = isMobile() ? { paddingBottomRight: [0, innerHeight * sheetPct() / 100 - 40] } : {};
        map.fitBounds(L.latLng(school.lat, school.lng).toBounds(rad * 2000), Object.assign({ animate: !quiet }, pad));
      }
    }
    render();
  }
  function drawRing() {
    if (ring) { map.removeLayer(ring); ring = null; }
    const rad = +$('#radius').value;
    if (school && school.lat != null && rad) {
      ring = L.circle([school.lat, school.lng], { radius: rad * 1000, color: '#1f6f5c', weight: 1.5, fillOpacity: .05, dashArray: '6 6', interactive: false }).addTo(map);
    }
  }

  $('#schoolInput').addEventListener('change', e => {
    const v = e.target.value.trim();
    const p = places.find(x => x.school && x.name === v) || places.find(x => x.school && x.name.includes(v));
    if (p && v) { setSchool(p); e.target.blur(); toast(`${p.name} 주변을 보여 드려요`); }
    else if (v) toast('목록에 있는 학교 이름을 골라 주세요');
    else setSchool(null);
  });

  // ---------- 수업계획 ----------
  function savePlan() { store.set('plan', plan); $('#planCount').textContent = plan.length; }
  function toggleStar(id) {
    const p = byId(id); if (!p) return;
    if (inPlan(id)) { plan = plan.filter(x => x.id !== id); toast('수업계획에서 뺐어요'); }
    else { plan.push({ id, name: p.name, cat: p.cat, addr: p.addr, tel: p.tel, lat: p.lat, lng: p.lng, subject: '', date: '', activity: '' }); toast('수업계획에 담았어요 ★'); }
    savePlan(); render(); renderPlan();
    const m = markers.get(id); if (m && m.isPopupOpen()) m.setPopupContent(popupHtml(p));
  }
  function renderPlan() {
    $('#planTitle').value = store.get('planTitle', '');
    $('#planEmpty').style.display = plan.length ? 'none' : '';
    $('#plan').innerHTML = plan.map((x, i) => `
      <li data-i="${i}">
        <h4><span>${esc(x.name)}</span><span>
          <button class="x" data-move="-1" title="위로" aria-label="위로">▲</button>
          <button class="x" data-move="1" title="아래로" aria-label="아래로">▼</button>
          <button class="x" data-del title="빼기" aria-label="빼기">✕</button></span></h4>
        <div class="meta">${esc(x.cat)} · ${esc(x.addr)}${school ? ' · ' + fmtKm(km(school, x)) : ''}</div>
        <div class="row"><input data-f="subject" placeholder="교과·학년 (예: 4학년 사회)" value="${esc(x.subject)}">
        <input data-f="date" type="date" value="${esc(x.date)}"></div>
        <textarea data-f="activity" placeholder="활동 내용 (예: 공공기관 하는 일 조사, 인터뷰)">${esc(x.activity)}</textarea>
      </li>`).join('');
  }
  $('#plan').addEventListener('input', e => {
    const li = e.target.closest('li'); const f = e.target.dataset.f;
    if (li && f) { plan[+li.dataset.i][f] = e.target.value; store.set('plan', plan); }
  });
  $('#plan').addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    const i = +li.dataset.i;
    if (e.target.hasAttribute('data-del')) { plan.splice(i, 1); }
    else if (e.target.dataset.move) {
      const j = i + +e.target.dataset.move; if (j < 0 || j >= plan.length) return;
      [plan[i], plan[j]] = [plan[j], plan[i]];
    } else return;
    savePlan(); renderPlan(); render();
  });
  $('#planTitle').addEventListener('input', e => store.set('planTitle', e.target.value));
  $('#clearPlan').addEventListener('click', () => {
    if (plan.length && confirm('수업계획을 모두 비울까요?')) { plan = []; savePlan(); renderPlan(); render(); }
  });

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  $('#exportCsv').addEventListener('click', () => {
    if (!plan.length) return toast('먼저 장소를 담아 주세요');
    const head = ['순서', '장소', '분류', '주소', '전화번호', '우리학교에서 거리', '활동일', '교과·학년', '활동 내용'];
    const rows = plan.map((x, i) => [i + 1, x.name, x.cat, x.addr, x.tel, school ? fmtKm(km(school, x)) : '', x.date, x.subject, x.activity]);
    const title = store.get('planTitle', '') || '지역연계 수업계획';
    const text = '﻿' + [[title], school ? ['학교', school.name] : [], head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
    download(title.replace(/[\\/:*?"<>|]/g, '_') + '.csv', text, 'text/csv;charset=utf-8');
  });
  $('#printPlan').addEventListener('click', () => {
    if (!plan.length) return toast('먼저 장소를 담아 주세요');
    const title = store.get('planTitle', '') || '지역연계 수업계획';
    $('#printArea').innerHTML = `<h1>${esc(title)}</h1><p>${school ? esc(school.name) + ' · ' : ''}${new Date().toLocaleDateString('ko-KR')}</p>
      <table><thead><tr><th>#</th><th>장소</th><th>주소·연락처</th><th>거리</th><th>활동일</th><th>교과·학년</th><th>활동 내용</th></tr></thead><tbody>
      ${plan.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.name)}</b><br>${esc(x.cat)}</td><td>${esc(x.addr)}<br>${esc(x.tel)}</td>
      <td>${school ? fmtKm(km(school, x)) : ''}</td><td>${esc(x.date)}</td><td>${esc(x.subject)}</td><td>${esc(x.activity).replace(/\n/g, '<br>')}</td></tr>`).join('')}
      </tbody></table>`;
    window.print();
  });

  // ---------- 자료 추가 ----------
  function saveCustom() { store.set('custom', custom); rebuild(); fillSchools(); renderChips(); render(); renderCustom(); }
  function renderCustom() {
    $('#customCount').textContent = custom.length ? `(${custom.length})` : '';
    $('#customList').innerHTML = custom.map(p => `<li><span>${esc(p.name)} <small style="color:var(--muted)">${esc(p.cat)}${p.lat == null ? ' · 위치 없음' : ''}</small></span>
      <button data-rm="${p.id}" aria-label="삭제">삭제</button></li>`).join('') || '<li style="color:var(--muted)">아직 없어요</li>';
  }
  $('#customList').addEventListener('click', e => {
    const id = e.target.dataset.rm; if (!id) return;
    custom = custom.filter(p => p.id !== id); saveCustom();
  });
  $('#clearCustom').addEventListener('click', () => {
    if (custom.length && confirm('내가 추가한 장소를 모두 삭제할까요?')) { custom = []; saveCustom(); }
  });
  $('#tmplBtn').addEventListener('click', () => {
    download('배움지도_양식.csv', '﻿이름,내용,주소,전화번호,위도,경도\r\n예시 생태체험관,체험시설,인천광역시 남동구 소래로 633,032-000-0000,,\r\n', 'text/csv;charset=utf-8');
  });

  // 주소 정리 후 OpenStreetMap(Nominatim)으로 좌표 찾기
  function cleanAddr(a) {
    a = (a || '').replace(/\(.*?\)?$/, '').replace(/\(.*?\)/g, '').split(',')[0];
    a = a.replace(/^(인천광역시|인천시|인천)\s*/, '').trim();
    a = a.replace(/(\S+[로길])\s+(\d+번길)/, '$1$2');
    a = a.replace(/\s+(지하|\d+층|\d+~\d+층|[A-Z]동)(\s.*)?$/, '');
    return ('인천광역시 ' + a).replace(/\s+/g, ' ').trim();
  }
  async function geocode(q) {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&countrycodes=kr&limit=1&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'ko' } });
      const j = await r.json();
      return j[0] ? [+j[0].lat, +j[0].lon] : null;
    } catch (e) { return null; }
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let XLSXp = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return XLSXp || (XLSXp = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX); s.onerror = () => { XLSXp = null; rej(new Error('엑셀 읽기 도구를 불러오지 못했어요')); };
      document.head.appendChild(s);
    }));
  }
  $('#xlsx').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const prog = $('#progress');
    try {
      prog.textContent = '파일 읽는 중…';
      const X = await loadXLSX();
      const wb = X.read(await f.arrayBuffer(), { type: 'array' });
      const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      if (rows.length && /이름/.test(String(rows[0][0]))) rows.shift();
      const items = rows.filter(r => String(r[0]).trim()).map((r, i) => ({
        id: 'c' + Date.now().toString(36) + i,
        name: String(r[0]).trim(), cat: String(r[1] || '기타').trim(), addr: String(r[2] || '').trim(), tel: String(r[3] || '').trim(),
        lat: parseFloat(r[4]) || null, lng: parseFloat(r[5]) || null
      }));
      if (!items.length) { prog.textContent = '읽을 수 있는 줄이 없어요. 양식을 확인해 주세요.'; return; }
      const need = items.filter(p => p.lat == null && p.addr);
      for (let i = 0; i < need.length; i++) {
        prog.textContent = `주소로 위치 찾는 중… ${i + 1}/${need.length}`;
        const p = need[i];
        let pos = await geocode(cleanAddr(p.addr));
        if (!pos) { await sleep(1100); pos = await geocode(p.name); }
        if (pos) { p.lat = pos[0]; p.lng = pos[1]; }
        await sleep(1100);
      }
      custom = custom.concat(items); saveCustom();
      const miss = items.filter(p => p.lat == null).length;
      prog.textContent = `${items.length}곳 추가 완료` + (miss ? ` · ${miss}곳은 위치를 못 찾았어요 (찾기 탭 목록에서 📍 위치 지정)` : '');
      toast(`${items.length}곳을 추가했어요`);
    } catch (err) { prog.textContent = '읽기 실패: ' + err.message; }
  });

  function startPick(target) {
    pickTarget = target;
    document.body.classList.add('picking');
    if (isMobile()) setSheet(18);
    toast('지도에서 위치를 눌러 주세요');
  }
  $('#pickBtn').addEventListener('click', () => startPick('new'));
  map.on('click', e => {
    if (!pickTarget) return;
    const { lat, lng } = e.latlng;
    document.body.classList.remove('picking');
    if (pickTarget === 'new') {
      const dlg = $('#addDlg'); $('#addForm').reset();
      dlg.onclose = () => {
        if (dlg.returnValue !== 'ok') return;
        const fd = new FormData($('#addForm'));
        custom.push({ id: 'c' + Date.now().toString(36), name: fd.get('name').trim(), cat: fd.get('cat').trim(), addr: fd.get('addr').trim(), tel: fd.get('tel').trim(), lat, lng });
        saveCustom(); toast('장소를 추가했어요');
      };
      dlg.showModal();
    } else {
      const c = custom.find(p => p.id === pickTarget);
      if (c) { c.lat = lat; c.lng = lng; c.approx = false; saveCustom(); toast('위치를 지정했어요'); }
      else toast('기본 자료의 위치는 바꿀 수 없어요');
    }
    pickTarget = null;
  });

  // ---------- 공통 이벤트 ----------
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a) {
      e.stopPropagation();
      if (a.dataset.act === 'star') toggleStar(a.dataset.id);
      if (a.dataset.act === 'locate') startPick(a.dataset.id);
      return;
    }
    const chip = e.target.closest('.chip');
    if (chip) {
      const g = chip.dataset.group;
      hidden.has(g) ? hidden.delete(g) : hidden.add(g);
      store.set('hidden', [...hidden]); renderChips(); render(); return;
    }
    const item = e.target.closest('.item[data-id]');
    if (item && !e.target.closest('a')) select(item.dataset.id, true);
  });
  $('#q').addEventListener('input', render);
  $('#gu').addEventListener('change', render);
  $('#radius').addEventListener('change', () => { drawRing(); render(); });

  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'plan') renderPlan();
    if (isMobile() && sheetPct() < 45) setSheet(60);
  }));

  $('#locBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('이 기기에서는 위치를 쓸 수 없어요');
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (meMarker) map.removeLayer(meMarker);
      meMarker = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).bindTooltip('내 위치').addTo(map);
      map.flyTo(ll, 16);
    }, () => toast('위치 권한을 허용해 주세요'), { enableHighAccuracy: true, timeout: 10000 });
  });

  $('#helpBtn').addEventListener('click', () => $('#help').showModal());

  (function dragSheet() {
    const h = $('#handle'); let startY = 0, startP = 0, moved = false;
    h.addEventListener('pointerdown', e => { startY = e.clientY; startP = sheetPct(); moved = false; h.setPointerCapture(e.pointerId); $('#panel').style.transition = 'none'; });
    h.addEventListener('pointermove', e => {
      if (!h.hasPointerCapture(e.pointerId)) return;
      const dy = startY - e.clientY; if (Math.abs(dy) > 4) moved = true;
      setSheet(startP + dy / window.innerHeight * 100);
    });
    h.addEventListener('pointerup', () => {
      $('#panel').style.transition = '';
      if (!moved) setSheet(sheetPct() > 50 ? 22 : 70);
    });
  })();
  window.addEventListener('resize', () => map.invalidateSize());

  // ---------- 시작 ----------
  fillSchools(); renderChips(); savePlan(); renderCustom();
  const fromHash = decodeURIComponent((location.hash.match(/school=([^&]+)/) || [])[1] || '');
  const start = places.find(p => p.school && p.name === (fromHash || store.get('school', '')));
  if (start) setSchool(start, true); else render();
  if (!store.get('seenHelp', false)) { store.set('seenHelp', true); $('#help').showModal(); }
})();
