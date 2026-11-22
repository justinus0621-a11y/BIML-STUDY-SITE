// Vercel 서버리스 함수: 노션 데이터베이스 3개(PR, 일정, 참여자)를 읽어서
// BIML STUDY 홈페이지가 쓰기 좋은 JSON 하나로 묶어 돌려줍니다.
// 노션 연동 토큰은 이 서버 함수 안에서만 쓰이고 방문자 브라우저에는 노출되지 않습니다.

const NOTION_VERSION = '2025-09-03';

const DS = {
  pr: process.env.NOTION_PR_DS_ID || '420a77c9-b528-817e-9c78-000b67914d13',
  events: process.env.NOTION_EVENTS_DS_ID || '420a77c9-b528-8189-bcdf-000bb05a3ffa',
  members: process.env.NOTION_MEMBERS_DS_ID || '420a77c9-b528-8148-89fc-000b12d6a182',
};

// 노션 속성 이름 (노션에서 이름을 바꾸면 여기도 같이 바꿔 주세요)
export const P = {
  pr: {
    title: '논문 제목', date: '발표일', presenters: '발표자', year: '연도',
    tags: '대분류', topic: '주제', link: '논문 링크', slides: '발표자료', qa: '질의응답',
  },
  events: {
    title: '일정명', date: '날짜', type: '종류', place: '장소', owners: '담당', memo: '메모',
  },
  members: {
    name: '이름', course: '과정', interests: '연구 관심사', intro: '한 줄 소개',
  },
};

async function queryAll(dataSourceId, body, token) {
  const results = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Notion API ${res.status} (${dataSourceId}): ${detail.slice(0, 300)}`);
    }
    const json = await res.json();
    results.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return results;
}

// ---------- 속성 값 꺼내기 ----------
const plain = (arr) => (arr || []).map((t) => t.plain_text).join('').trim();

export function text(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return plain(prop.title);
  if (prop.type === 'rich_text') return plain(prop.rich_text);
  if (prop.type === 'number') return prop.number == null ? '' : String(prop.number);
  if (prop.type === 'url') return prop.url || '';
  if (prop.type === 'select') return prop.select?.name || '';
  return '';
}
const select = (prop) => (prop?.select ? { name: prop.select.name, color: prop.select.color } : null);
const multi = (prop) => (prop?.multi_select || []).map((o) => ({ name: o.name, color: o.color }));
const relIds = (prop) => (prop?.relation || []).map((r) => r.id);
const date = (prop) => (prop?.date ? { start: prop.date.start, end: prop.date.end } : null);
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');

function files(prop, showFiles) {
  const list = prop?.files || [];
  return list.map((f) => ({
    name: f.name,
    url: showFiles ? safeUrl(f.type === 'external' ? f.external?.url : f.file?.url) : '',
  }));
}

// ---------- 변환 ----------
export function transform({ prRows, eventRows, memberRows }, { showFiles = false } = {}) {
  const members = memberRows.map((p) => ({
    id: p.id,
    name: text(p.properties[P.members.name]) || '이름 없음',
    course: select(p.properties[P.members.course]),
    interests: multi(p.properties[P.members.interests]),
    intro: text(p.properties[P.members.intro]),
    prCount: 0,
  }));
  const byId = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id) => byId.get(id)?.name;

  // 제목이 비어 있는 행(노션에서 실수로 만든 빈 행)은 건너뜁니다.
  const hasTitle = (p, key) => text(p.properties[key]) !== '';
  const prs = prRows
    .filter((p) => hasTitle(p, P.pr.title))
    .map((p) => {
      const pp = p.properties;
      const presenterIds = relIds(pp[P.pr.presenters]);
      presenterIds.forEach((id) => { if (byId.has(id)) byId.get(id).prCount += 1; });
      return {
        id: p.id,
        title: text(pp[P.pr.title]),
        date: date(pp[P.pr.date])?.start || null,
        presenters: presenterIds.map(nameOf).filter(Boolean),
        year: text(pp[P.pr.year]),
        tags: multi(pp[P.pr.tags]),
        topic: text(pp[P.pr.topic]),
        link: safeUrl(text(pp[P.pr.link])),
        slides: files(pp[P.pr.slides], showFiles),
        qa: files(pp[P.pr.qa], showFiles),
        notionUrl: safeUrl(p.url),
      };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const events = eventRows
    .filter((p) => hasTitle(p, P.events.title))
    .map((p) => {
      const pp = p.properties;
      const d = date(pp[P.events.date]);
      return {
        id: p.id,
        title: text(pp[P.events.title]),
        start: d?.start || null,
        end: d?.end || null,
        type: select(pp[P.events.type]),
        place: text(pp[P.events.place]),
        memo: text(pp[P.events.memo]),
        owners: relIds(pp[P.events.owners]).map(nameOf).filter(Boolean),
      };
    })
    .filter((e) => e.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  return { prs, events, members, showFiles, updatedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'NOTION_TOKEN 환경 변수가 설정되지 않았습니다.' });
    return;
  }
  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString().slice(0, 10);
    const [prRows, eventRows, memberRows] = await Promise.all([
      queryAll(DS.pr, {}, token),
      queryAll(DS.events, { filter: { property: P.events.date, date: { on_or_after: since } } }, token),
      queryAll(DS.members, {}, token),
    ]);
    const data = transform(
      { prRows, eventRows, memberRows },
      { showFiles: process.env.PUBLIC_FILES === 'true' },
    );
    // 5분 동안 캐시 → 노션에 올린 내용은 최대 5분 안에 홈페이지에 반영됩니다.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: '노션에서 데이터를 불러오지 못했습니다.', detail: String(err.message || err) });
  }
}
