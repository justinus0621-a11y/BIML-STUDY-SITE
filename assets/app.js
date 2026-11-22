/* ============ 설정: 여기만 바꾸면 됩니다 ============ */
const CONFIG = {
  apiUrl: '/api/notion',
  labHomepage: 'https://www.smu.ac.kr',            // 연구실 홈페이지 주소로 바꿔 주세요
  notionUrl: 'https://app.notion.com/p/420a77c9b52881008fd7f7f59ade1be0', // 노션 홈 주소
  cacheMinutes: 0.5,                                  // 페이지 이동 시 다시 불러오지 않는 시간
};
/* ================================================ */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const okUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');
const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const tagCls = (c) => 'c-' + (COLORS.includes(c) ? c : 'default');
const tagHtml = (t) => `<span class="tag ${tagCls(t.color)}">${esc(t.name)}</span>`;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = ymd(new Date());
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
const fmtDate = (s) => { if (!s) return '날짜 미정'; const d = parseDay(s); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
const timeOf = (s) => (s && s.length > 10 ? s.slice(11, 16) : '');
const PAGE = document.body.dataset.page;
let DATA = null;

/* ---------- 공통 머리글/바닥글 ---------- */
function renderChrome() {
  const links = [['about', '소개'], ['schedule', '일정'], ['library', 'PR 도서관'], ['members', '참여자']];
  $('header').innerHTML = `<div class="wrap">
    <a class="logo" href="index.html">🔬 BIML <span>STUDY</span></a>
    <nav class="links">${links.map(([p, n]) => `<a href="${p}.html" class="${PAGE === p ? 'active' : ''}">${n}</a>`).join('')}</nav>
    <a class="btn" id="labLink" href="${esc(CONFIG.labHomepage)}" target="_blank" rel="noopener">연구실 홈페이지</a>
    <a class="btn primary" href="${esc(CONFIG.notionUrl)}" target="_blank" rel="noopener">노션에서 등록 ↗</a>
  </div>`;
  $('footer').innerHTML = `<div class="wrap">
    <span>© BIML STUDY · 상명대학교 윤희남 교수님 연구실</span><span id="updated"></span></div>`;
}

/* ---------- 미리보기용 예시 데이터 (API 연결 전/로컬에서 열었을 때만 사용) ---------- */
function demoData() {
  const t = new Date();
  const off = (n) => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
  const members = [
    { id: 'm1', name: '아무개1', course: { name: '학석연계', color: 'red' }, interests: [{ name: 'HRV', color: 'orange' }], intro: '', prCount: 1 },
    { id: 'm2', name: '아무개2', course: { name: '석사과정', color: 'blue' }, interests: [{ name: 'BCG', color: 'yellow' }], intro: '', prCount: 0 },
  ];
  const prs = [
    { id: 'p1', title: '예시 논문: 노션에 등록하면 여기에 표시됩니다', date: off(-4), presenters: ['아무개1'], year: '2021', tags: [{ name: 'HRV', color: 'orange' }], topic: '예시 데이터입니다.', link: '', slides: [], qa: [] },
  ];
  const events = [
    { id: 'e1', title: 'PR 발표 (예시)', start: off(10), type: { name: 'PR 발표', color: 'blue' }, place: '연구실', owners: ['아무개2'] },
  ];
  return { prs, events, members, showFiles: false, updatedAt: new Date().toISOString(), demo: true };
}

/* ---------- 데이터 불러오기 ---------- */
async function loadData() {
  const KEY = 'biml-study-data';
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (c && Date.now() - c.t < CONFIG.cacheMinutes * 60000) return c.d;
  } catch (e) { /* 저장소 사용 불가 → 무시 */ }
  try {
    if (location.protocol === 'file:') throw new Error('local file');
    const res = await fetch(CONFIG.apiUrl, { headers: { Accept: 'application/json' } });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || json.error || res.statusText);
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: json })); } catch (e) { /* ignore */ }
    return json;
  } catch (e) {
    const n = $('notice');
    if (n) {
      n.hidden = false;
      n.textContent = location.protocol === 'file:'
        ? '미리보기 모드: 예시 데이터를 보여주고 있어요. 배포 후에는 노션 데이터가 자동으로 표시됩니다.'
        : `노션 데이터를 불러오지 못해 예시 데이터를 보여주고 있어요. (${e.message})`;
    }
    return demoData();
  }
}

/* ---------- 홈 ---------- */
function nextPr() { return DATA.events.find((e) => e.type?.name === 'PR 발표' && e.start.slice(0, 10) >= todayStr); }
function renderStats() {
  $('stPr').textContent = DATA.prs.length;
  $('stMem').textContent = DATA.members.length;
  const next = nextPr();
  if (next) {
    const dd = daysBetween(todayStr, next.start);
    $('stNext').textContent = dd === 0 ? 'D-Day' : `D-${dd}`;
    $('stNextSub').textContent = `${fmtDate(next.start)} · ${next.owners?.length ? next.owners.join(', ') : next.title}`;
  } else {
    $('stNext').textContent = '–';
    $('stNextSub').textContent = '예정된 발표 없음';
  }
}
function renderHomeRecent() {
  const list = DATA.prs.slice(0, 4);
  $('homePr').innerHTML = list.length ? list.map((p) => `<div class="mini-pr">
      <div class="t">${esc(p.title)}</div>
      <div class="m">${esc([fmtDate(p.date), p.presenters.join(', ')].filter(Boolean).join(' · '))}</div>
      <div>${p.tags.map(tagHtml).join('')}</div></div>`).join('')
    : '<div class="empty">아직 등록된 PR이 없어요.</div>';
}

/* ---------- 일정 ---------- */
let calCursor = new Date(); calCursor.setDate(1);
function eventsOn(dayStr) {
  return DATA.events.filter((e) => {
    const s = e.start.slice(0, 10), en = (e.end || e.start).slice(0, 10);
    return dayStr >= s && dayStr <= en;
  });
}
function renderCalendar() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  $('calTitle').textContent = `${y}년 ${m + 1}월`;
  const first = new Date(y, m, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  let html = ['일', '월', '화', '수', '목', '금', '토'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m) break;
    const ds = ymd(d);
    const evs = eventsOn(ds);
    const cls = ['day', d.getMonth() !== m && 'out', ds === todayStr && 'today', d.getDay() === 0 && 'sun'].filter(Boolean).join(' ');
    html += `<div class="${cls}"><span class="n">${d.getDate()}</span>` +
      evs.slice(0, 2).map((e) => `<span class="ev ${tagCls(e.type?.color)}" title="${esc(e.title)}">${esc(e.title)}</span>`).join('') +
      (evs.length > 2 ? `<span class="more">+${evs.length - 2}</span>` : '') + `</div>`;
  }
  $('calGrid').innerHTML = html;
}
function bindCalendar() {
  $('calPrev').onclick = () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); };
  $('calNext').onclick = () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); };
  $('calToday').onclick = () => { calCursor = new Date(); calCursor.setDate(1); renderCalendar(); };
}
function renderUpcoming(targetId, max) {
  const list = DATA.events.filter((e) => (e.end || e.start).slice(0, 10) >= todayStr).slice(0, max);
  if (!list.length) { $(targetId).innerHTML = '<div class="empty">예정된 일정이 없어요.</div>'; return; }
  $(targetId).innerHTML = list.map((e) => {
    const d = parseDay(e.start); const dd = daysBetween(todayStr, e.start);
    const meta = [timeOf(e.start), e.end && `~ ${fmtDate(e.end)}`, e.place, e.owners?.join(', ')].filter(Boolean).join(' · ');
    return `<div class="up-item">
      <div class="dbox"><div class="m">${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '.' : ''}${d.getMonth() + 1}월</div><div class="d">${d.getDate()}</div></div>
      <div class="up-body">
        <div>${e.type ? tagHtml(e.type) : ''}</div>
        <div class="up-title">${esc(e.title)}</div>
        ${meta ? `<div class="up-meta">${esc(meta)}</div>` : ''}
      </div>
      <div class="dday">${dd <= 0 ? '진행 중' : 'D-' + dd}</div>
    </div>`;
  }).join('');
}

/* ---------- PR 도서관 ---------- */
const state = { q: '', tag: '', presenter: '', sort: 'new' };
function renderFilters() {
  const tagMap = new Map();
  DATA.prs.forEach((p) => p.tags.forEach((t) => { if (!tagMap.has(t.name)) tagMap.set(t.name, { ...t, n: 0 }); tagMap.get(t.name).n++; }));
  const tags = [...tagMap.values()].sort((a, b) => b.n - a.n);
  $('chips').innerHTML = `<button class="chip ${state.tag ? '' : 'on'}" data-tag="">전체</button>` +
    tags.map((t) => `<button class="chip ${state.tag === t.name ? 'on' : ''}" data-tag="${esc(t.name)}">${esc(t.name)} <small>${t.n}</small></button>`).join('');
  $('chips').querySelectorAll('.chip').forEach((b) => { b.onclick = () => { state.tag = b.dataset.tag; renderFilters(); renderLibrary(); }; });
  const names = [...new Set(DATA.prs.flatMap((p) => p.presenters))].sort((a, b) => a.localeCompare(b, 'ko'));
  $('fPresenter').innerHTML = '<option value="">전체 발표자</option>' + names.map((n) => `<option ${n === state.presenter ? 'selected' : ''}>${esc(n)}</option>`).join('');
}
function bindLibrary() {
  const params = new URLSearchParams(location.search);
  if (params.get('presenter')) state.presenter = params.get('presenter');
  $('q').oninput = (e) => { state.q = e.target.value.trim().toLowerCase(); renderLibrary(); };
  $('fPresenter').onchange = (e) => { state.presenter = e.target.value; renderLibrary(); };
  $('fSort').onchange = (e) => { state.sort = e.target.value; renderLibrary(); };
}
function fileActs(files, label) {
  if (!files?.length) return '';
  return files.map((f) => okUrl(f.url)
    ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${label}</a>`
    : `<span class="lock" title="랩 내부 자료는 노션에서 확인해 주세요">🔒 ${label}</span>`).join('');
}
function renderLibrary() {
  let list = DATA.prs.filter((p) => {
    if (state.tag && !p.tags.some((t) => t.name === state.tag)) return false;
    if (state.presenter && !p.presenters.includes(state.presenter)) return false;
    if (state.q) {
      const hay = [p.title, p.topic, p.year, ...p.presenters, ...p.tags.map((t) => t.name)].join(' ').toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  });
  const by = { new: (a, b) => (b.date || '').localeCompare(a.date || ''), old: (a, b) => (a.date || '').localeCompare(b.date || ''), year: (a, b) => (b.year || '').localeCompare(a.year || '') };
  list = [...list].sort(by[state.sort]);
  $('count').textContent = `${list.length}편`;
  if (!list.length) { $('prList').innerHTML = '<div class="card empty">조건에 맞는 PR이 없어요.</div>'; return; }
  $('prList').innerHTML = list.map((p) => {
    const d = p.date ? parseDay(p.date) : null;
    const meta = [p.presenters.join(', '), p.year && `${p.year}년 논문`].filter(Boolean).join(' · ');
    const acts = [
      okUrl(p.link) ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">📄 논문</a>` : '',
      fileActs(p.slides, '발표자료'),
      fileActs(p.qa, '질의응답'),
    ].join('');
    return `<article class="card pr">
      <div class="when">${d ? `<b>${d.getMonth() + 1}월 ${d.getDate()}일</b>${d.getFullYear()}` : '<b>미정</b>'}</div>
      <div>
        <h3>${esc(p.title)}</h3>
        ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
        <div>${p.tags.map(tagHtml).join('')}</div>
        ${p.topic ? `<p class="topic">${esc(p.topic)}</p>` : ''}
      </div>
      <div class="acts">${acts}</div>
    </article>`;
  }).join('');
}

/* ---------- 참여자 ---------- */
const AV = ['#1f3a5f', '#2f6fb0', '#3d8b6e', '#8a5cc2', '#c2577a', '#c98a2b', '#5a6b7f'];
function renderMembers() {
  if (!DATA.members.length) { $('memList').innerHTML = '<div class="empty">아직 등록된 참여자가 없어요.</div>'; return; }
  $('memList').innerHTML = DATA.members.map((m, i) => `
    <div class="card member">
      <div class="avatar" style="background:${AV[i % AV.length]}">${esc(m.name[0] || '?')}</div>
      <div class="nm">${esc(m.name)} ${m.course ? tagHtml(m.course) : ''}</div>
      <div class="intro">${esc(m.intro || '')}</div>
      <div>${m.interests.map(tagHtml).join('')}</div>
      <div class="prc">발표한 PR <b>${m.prCount}</b>편${m.prCount ? ` · <a href="library.html?presenter=${encodeURIComponent(m.name)}">보기 →</a>` : ''}</div>
    </div>`).join('');
}

/* ---------- 시작 ---------- */
(async function init() {
  renderChrome();
  if (PAGE === 'about') return;               // 소개 페이지는 노션 데이터가 필요 없음
  if (PAGE === 'schedule') bindCalendar();
  if (PAGE === 'library') bindLibrary();
  DATA = await loadData();
  const u = new Date(DATA.updatedAt);
  $('updated').textContent = `데이터 출처: Notion · 마지막 갱신 ${u.getMonth() + 1}/${u.getDate()} ${pad(u.getHours())}:${pad(u.getMinutes())}`;
  if (PAGE === 'home') { renderStats(); renderUpcoming('homeUp', 4); renderHomeRecent(); }
  if (PAGE === 'schedule') { renderCalendar(); renderUpcoming('upList', 8); }
  if (PAGE === 'library') { renderFilters(); renderLibrary(); }
  if (PAGE === 'members') renderMembers();
})();
