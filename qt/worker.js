/**
 * 예수비전교회 QT 자동 수집 서버 (Cloudflare Workers)
 *
 *  - 매일 오전 6:30(한국시간)에 생명의 삶 QT 페이지를 읽어 본문·찬송 번호를 저장
 *  - 두란노에 아직 안 올라왔으면 QT 캘린더(본문 범위) + 개역개정 성경 파일로 본문을 미리 준비
 *    (전날 새벽에 다음 날 본문·AI 해설까지 미리 만들어 두고, 두란노에 올라오면 소제목·찬송·기도로 채움)
 *  - GET  /api/qt?date=YYYY-MM-DD   → 앱이 오늘 QT를 받아가는 주소
 *  - GET  /api/bible?p=역대상 20:1–8 → 성경 본문 (올린 성경 파일에서)
 *  - GET  /api/hymn?no=93           → 새찬송가 가사 (올린 찬송가 파일에서)
 *  - GET  /score/384                → 384장 악보 이미지
 *  - GET  /admin                    → 관리자 페이지 (악보 올리기, QT 직접 수정, 다시 수집, 성경·찬송가 올리기)
 *  - GET  /api/dir                  → 스마트요람 명단 (비밀번호 필요, 기본 0191)
 *  - GET  /api/gallery              → 주간사역 갤러리 (앱이 받아감) / POST·DELETE 는 관리자
 *
 * 필요한 설정(wrangler.toml / 대시보드):
 *  - KV 바인딩  QT_KV      : 날짜별 QT 저장
 *  - R2 바인딩  SCORES     : (선택) 찬송 악보 이미지 저장 — 없으면 QT_KV에 저장 (카드 등록 불필요)
 *  - 변수       SOURCE_URL : 생명의 삶 QT 페이지 주소 ({yyyymmdd} 또는 {yyyy-mm-dd} 자리에 날짜가 들어감)
 *  - 비밀값     ADMIN_TOKEN: 관리자 비밀번호
 *  - 비밀값     DURANNO_ID / DURANNO_PW : 두란노 로그인 아이디·비밀번호 (대시보드 Secret으로만 저장)
 *  - 변수       LOGIN_PAGE / LOGIN_URL / LOGIN_ID_FIELD / LOGIN_PW_FIELD : 두란노 로그인 양식 정보
 *  - (선택)     DIR_PASS   : 스마트요람 비밀번호 — 없으면 0191
 *  - (선택)     CELL_PASS  : 셀리더교제 비밀번호 — 없으면 0109
 *
 * 2026-10-06 관리자 페이지 칸 번호를 위에서부터 ①~⑦ 순서로 정리
 * 2026-10-06 변경: 원어 해설 강화 (⭐ 열쇠 단어 + 📖 직역 + [어원] + [시제](필요할 때만) + [핵심 절] 설명 + 요약 필수 (👉 적용 칸 없음), 성도용 쉬운 말)
 *   - 2026-10-06(오늘)부터의 날짜는 예전(짧은) 원어 해설이면 자동으로 새 형식으로 다시 씀 (지난 날짜는 그대로 둠)
 * 2026-10-07 관리자 ④ 스마트요람: 달별 생일자 명단 보기 + 전출하신 분 명단에서 삭제 (DELETE /api/dir/person?id=)
 * 2026-10-07 관리자 ⑧ 선교기도: 이미지만 매달 올리기 (사진·PDF, 지난 이미지 바꾸기) — 선교지 이름 필요 없음
 * 2026-10-07 스마트요람 교인 추가·수정 (POST /api/dir/person) — 앱 관리자 모드에서 새가족 등록, 셀 이동 등
 * 2026-10-10 관리자 ⑨ 주간사역 갤러리: 사진 묶음 올리기·수정·삭제 (GET /api/gallery, POST·DELETE /api/gallery, 사진 /gallery-img/<키>)
 *   - 새 묶음을 올리면 지난 묶음은 사진까지 자동 삭제 (GALLERY_MAX=1). 같은 묶음 수정은 그대로
 * 2026-10-10 주간사역 영상 (갤러리 아래 재생 칸): 관리자 페이지 ⑨에서 영상 파일을 고르면 브라우저가 720p로 압축해 올림 (KV, 25MB 이하)
 *   - PUT /api/gallery-video (영상 바이트) · PUT /api/gallery-poster (표지 JPEG) · DELETE /api/gallery-video · GET /api/gallery-video (정보)
 *   - 재생: GET /gallery-video (Range 지원 — 아이폰도 재생) · GET /gallery-poster. 새 영상을 올리면 지난 영상은 자동 삭제(덮어씀)
 *   - 앱 관리자 모드에서도 같은 주소(POST /api/gallery, 관리자 비밀번호)로 올리고 고칠 수 있음
 * 2026-10-10 선교기도·갤러리·주보: 파일 여러 개를 고르면 이름의 숫자 순(1, 2, 3 …)으로 올려 1번이 맨 위에 나옴
 * 2026-10-10 해설·원어 배경: 지명이 나오면 지금 지도의 이름을 괄호로 — 갈라디아(지금의 터키) (앱은 이미 쓴 해설에도 지명 사전으로 붙임)
 * 2026-10-10 원어 해설: 핵심 단어 5~7개(보통 6개)로 늘림 (WORDS_V=5, 2026-10-10부터 다시 씀)
 * 2026-10-10 셀리더교제 자료방 (비밀번호 0109): 관리자가 올린 파일(사진·PDF·문서)을 성도가 보고 내려받음
 *   - GET /api/cell (X-Cell-Pass) · POST/DELETE /api/cell (관리자) · PUT /api/cell-file?name=&type= (관리자, 파일 바이트 25MB 이하)
 *   - GET /cell-file/<키>?k=비밀번호(&dl=1 내려받기) — PDF는 올릴 때 쪽마다 그림으로 바꿔 함께 저장해 화면에 바로 펼쳐 보임
 *   - 새 자료를 올리면 지난 자료는 파일까지 자동 삭제 (CELL_MAX=1). 같은 글 수정은 그대로
 * 2026-10-10 함께 기도해요: 관리자가 기도제목 고치기 (POST /api/prayers/edit) — 앱 관리자 모드에서 이름·내용·비공개 수정
 */

const BOOKS = ['창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기','사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더','욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','에스겔','다니엘','호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기','마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서','갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서','베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록'];

// ---------- 날짜 (한국시간 기준) ----------
function kstDateKey(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

// ---------- 로그인 세션 (쿠키) ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
function readSetCookies(res) {
  const h = res.headers;
  let list = [];
  if (typeof h.getSetCookie === 'function') list = h.getSetCookie();
  else if (typeof h.getAll === 'function') { try { list = h.getAll('Set-Cookie'); } catch {} }
  if (!list.length && h.get('set-cookie')) list = h.get('set-cookie').split(/,(?=\s*[^;,=\s]+=)/);
  return list.map(c => c.split(';')[0].trim()).filter(c => c.includes('='));
}
function mergeCookies(oldStr, newList) {
  const map = new Map();
  (oldStr || '').split(';').map(c => c.trim()).filter(Boolean).forEach(c => map.set(c.split('=')[0], c));
  newList.forEach(c => map.set(c.split('=')[0], c));
  return [...map.values()].join('; ');
}
function hiddenInputs(html) {
  const out = {};
  for (const m of html.matchAll(/<input[^>]*type=["']?hidden["']?[^>]*>/gi)) {
    const name = (m[0].match(/name=["']?([^"'\s>]+)/i) || [])[1];
    const value = (m[0].match(/value=["']([^"']*)["']/i) || [])[1] || '';
    if (name) out[name] = value;
  }
  return out;
}

async function login(env) {
  if (!env.DURANNO_ID || !env.DURANNO_PW) throw new Error('두란노 아이디/비밀번호(DURANNO_ID, DURANNO_PW)가 설정되지 않았습니다');
  if (!env.LOGIN_URL || !env.LOGIN_ID_FIELD || !env.LOGIN_PW_FIELD) throw new Error('로그인 양식 정보(LOGIN_URL, LOGIN_ID_FIELD, LOGIN_PW_FIELD)가 설정되지 않았습니다');
  let cookie = '';
  let hidden = {};
  if (env.LOGIN_PAGE) {                                  // 로그인 화면을 먼저 열어 기본 쿠키·숨은 값 받기
    const r = await fetch(env.LOGIN_PAGE, { headers: { 'User-Agent': UA }, redirect: 'manual' });
    cookie = mergeCookies(cookie, readSetCookies(r));
    hidden = hiddenInputs(await r.text());
  }
  const form = new URLSearchParams({ ...hidden, [env.LOGIN_ID_FIELD]: env.DURANNO_ID, [env.LOGIN_PW_FIELD]: env.DURANNO_PW });
  let res = await fetch(env.LOGIN_URL, {
    method: 'POST', redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': env.LOGIN_PAGE || env.LOGIN_URL, 'Cookie': cookie },
    body: form.toString(),
  });
  cookie = mergeCookies(cookie, readSetCookies(res));
  // 로그인 후 이동(redirect)하면서 주는 쿠키도 받기 (최대 3번)
  for (let i = 0; i < 3 && res.status >= 300 && res.status < 400 && res.headers.get('location'); i++) {
    const next = new URL(res.headers.get('location'), env.LOGIN_URL).toString();
    res = await fetch(next, { headers: { 'User-Agent': UA, 'Cookie': cookie }, redirect: 'manual' });
    cookie = mergeCookies(cookie, readSetCookies(res));
  }
  if (!cookie) throw new Error('로그인 응답에서 쿠키를 받지 못했습니다 (아이디/비번 또는 로그인 양식 확인)');
  await env.QT_KV.put('session:cookie', cookie, { expirationTtl: 60 * 60 * 6 });
  return cookie;
}

function looksLoggedOut(html, res) {
  if (res.redirected && /login/i.test(res.url)) return true;
  return /(로그인\s*후\s*(이용|확인|보실)|로그인이\s*필요|회원\s*전용)/.test(html) && !/찬송/.test(html);
}

// ---------- 페이지 읽기 ----------
async function fetchHtml(url, cookie) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko', ...(cookie ? { Cookie: cookie } : {}) } });
  if (!res.ok) throw new Error(`원본 페이지 응답 오류 ${res.status}`);
  return { res, html: await decodeBody(res) };
}
async function fetchText(url, env) {
  let cookie = env ? await env.QT_KV.get('session:cookie') : null;
  let { res, html } = await fetchHtml(url, cookie);
  if (env && looksLoggedOut(html, res)) {               // 로그인이 풀려 있으면 다시 로그인 후 재시도
    cookie = await login(env);
    ({ res, html } = await fetchHtml(url, cookie));
    if (looksLoggedOut(html, res)) throw new Error('로그인 후에도 QT 페이지를 볼 수 없습니다 (아이디/비번·이용권 확인)');
  }
  return html;
}
async function decodeBody(res) {
  const buf = await res.arrayBuffer();
  const head = new TextDecoder('utf-8').decode(buf.slice(0, 3000));
  const charset = ((res.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  try { return new TextDecoder(charset.toLowerCase()).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h\d|\/dd|\/dt)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// ---------- 내용 뽑기 ----------
// ※ 원본 페이지 구조를 보고 맞춰야 하는 부분입니다. 실제 페이지를 확인한 뒤 조정하세요.
// 두란노 '오늘의 QT'(bible.asp) 페이지 구조에 맞춘 읽기 — 2026-10 확인
//  <h1><span>역대상 19 : 1~7</span><em>소제목</em></h1>
//  <div class="song box"> … <p>(새 424 아버지여 나의 맘을)<br> …
//  <th>1</th><td>절 본문</td>   /   <div class="helper box"><p class="title">오늘의 기도</p><p>기도문</p>
const clean = s => htmlToText(String(s || '')).replace(/\s+/g, ' ').trim();
export function parseDuranno(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, '');               // 주석 처리된 옛 내용 제거
  const out = {};
  const pageDate = (html.match(/<li>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<span>/) || []);
  if (pageDate[1]) out.pageDate = `${pageDate[1]}-${pageDate[2]}-${pageDate[3]}`;
  const h1 = html.match(/<h1>\s*<span>([\s\S]*?)<\/span>\s*<em>([\s\S]*?)<\/em>/i);
  if (h1) {
    const p = clean(h1[1]).match(/^(.+?)\s*(\d{1,3})\s*:\s*(\d{1,3})\s*[~∼\-–]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3})/);
    out.passage = p ? `${p[1]} ${p[2]}:${p[3]}–${p[4] ? p[4] + ':' : ''}${p[5]}` : clean(h1[1]);
    out.title = clean(h1[2]);
  }
  const song = html.match(/class="song box"[\s\S]*?<p>\s*\(?\s*새\s*(\d{1,3})\s*([^)<]*)\)?/i);
  if (song) { out.hymnNo = Number(song[1]); out.hymnTitle = clean(song[2]); }
  const songP = html.match(/class="song box"[\s\S]*?<p>([\s\S]*?)<\/p>/i);     // 찬송 가사 (첫 줄 번호·제목 다음부터)
  if (songP) { const parts = songP[1].split(/<br\s*\/?>/i); out.hymnLyrics = clean(parts.slice(1).join(' ')); }
  // 본문 단락 제목: <p class="title">호의를 거부한 하눈 19:1~5</p>
  const bibleDiv = html.slice(Math.max(0, html.indexOf('class="bible"')));
  out.sections = [...bibleDiv.matchAll(/<p class="title">([\s\S]*?)<\/p>/gi)].map(m => clean(m[1]))
    .map(t => { const r = t.match(/^(.*?)\s*(\d{1,3}:\d{1,3}\s*[~∼\-–]\s*(?:\d{1,3}:)?\d{1,3})\s*$/); return r ? { title: r[1], range: r[2].replace(/\s+/g, '').replace(/[~∼\-]/, '~') } : null; })
    .filter(Boolean).slice(0, 8);
  out.verses = [...html.matchAll(/<th>\s*(\d{1,3})\s*<\/th>\s*<td>([\s\S]*?)<\/td>/gi)].map(m => [m[1], clean(m[2])]).filter(v => v[1]);
  const pr = html.match(/<p class="title">\s*오늘의 기도\s*<\/p>\s*<p>([\s\S]*?)<\/p>/i);
  if (pr) out.prayer = clean(pr[1]);
  return out;
}

export function parseQT(html) {
  const text = htmlToText(html);
  const bookRe = BOOKS.slice().sort((a, b) => b.length - a.length).join('|');

  // 본문 범위: "역대상 18:9-17", "역대상 21:18~22:1" 등
  const pm = text.match(new RegExp(`(${bookRe})\\s*(\\d{1,3})\\s*[:장]\\s*(\\d{1,3})\\s*(?:절)?\\s*[-–~∼]\\s*(?:(\\d{1,3})\\s*[:장]\\s*)?(\\d{1,3})`));
  const passage = pm ? `${pm[1]} ${pm[2]}:${pm[3]}–${pm[4] ? pm[4] + ':' : ''}${pm[5]}` : '';

  // 찬송: "찬송 384장", "새찬송가 384장", "찬송가 384(통 434)장"
  const hm = text.match(/(?:새\s*)?찬송(?:가)?\s*[:：]?\s*(\d{1,3})\s*(?:\(\s*통\s*\d+\s*\)\s*)?장?/);
  const hymnNo = hm ? Number(hm[1]) : null;
  let hymnTitle = '';
  if (hm) {
    const after = text.slice(hm.index + hm[0].length, hm.index + hm[0].length + 40).split('\n')[0];
    hymnTitle = after.replace(/^[\s·:\-()통\d장]+/, '').replace(/[()]/g, '').trim().slice(0, 30);
  }

  // 오늘의 제목: 본문 범위 바로 앞이나 뒤의 짧은 줄
  let title = '';
  if (pm) {
    const lines = text.split('\n');
    const idx = lines.findIndex(l => l.includes(pm[0]));
    const near = [lines[idx - 1], lines[idx + 1]].filter(l => l && l.length >= 2 && l.length <= 30 && !/찬송|QT|큐티|생명의|^(본문|제목|말씀)$/.test(l));
    title = near[0] || '';
  }

  // 성경 본문: "9 하맛 왕 도우가 ..." 처럼 절 번호로 시작하는 줄을 범위 안에서 수집
  const verses = [];
  if (pm) {
    const start = Number(pm[3]);
    const lines = text.slice(text.indexOf(pm[0]) + pm[0].length).split('\n');
    let expect = start;
    for (const line of lines) {
      const m = line.match(/^(\d{1,3})\s*[.)]?\s+(.{4,})$/);
      if (m && (Number(m[1]) === expect || (verses.length && Number(m[1]) === 1))) {
        verses.push([m[1], m[2].trim()]);
        expect = Number(m[1]) + 1;
      }
      if (verses.length > 60) break;
    }
  }

  return { passage, title, hymnNo, hymnTitle, verses };
}

// ---------- QT 캘린더 (한 달치 본문 범위) ----------
// 캘린더 표에서 "4 / 역대상 / 18:9~17" 같은 날짜·책·범위 묶음을 뽑음
export function parseCalendar(html, ym) {
  // 표 구조가 "날짜 줄 → 본문 줄"이든 "칸마다 날짜+본문"이든 되도록,
  // 날짜 숫자와 본문 범위를 나오는 순서대로 모은 뒤 먼저 나온 날짜부터 짝지음
  const text = htmlToText(html).replace(/Today/g, '\n');
  const bookRe = BOOKS.slice().sort((a, b) => b.length - a.length).join('|');
  const tokenRe = new RegExp(`(?:^|\\n)\\s*(\\d{1,2})\\s*(?=\\n)|(${bookRe})\\s*\\n?\\s*(\\d{1,3}:\\d{1,3}\\s*[~∼\\-–]\\s*(?:\\d{1,3}:)?\\d{1,3})`, 'g');
  const out = {}, queue = [];
  let last = 0;
  for (const m of (text + '\n').matchAll(tokenRe)) {
    if (m[1]) {
      const day = Number(m[1]);
      if (day === last + 1 && day <= 31) { queue.push(day); last = day; }   // 1, 2, 3 … 순서대로만
    } else if (queue.length) {
      const day = queue.shift();
      out[`${ym}-${String(day).padStart(2, '0')}`] = `${m[2]} ${m[3].replace(/\s+/g, '').replace(/[~∼\-]/, '–')}`;
    }
  }
  return out;
}

async function collectMonth(env, ym) {
  // calendar.asp는 껍데기이고 실제 달력 내용은 calendar2.asp에서 불러옴
  const shell = env.CALENDAR_URL || 'https://www.duranno.com/qt/view/calendar.asp?clDate=';
  const bases = [shell.replace('calendar.asp', 'calendar2.asp'), shell];
  const errors = [];
  // 날짜 형식을 모르므로 몇 가지를 차례로 시도
  for (const base of [...new Set(bases)])
  for (const p of [`${ym}-01`, ym, ym.replace('-', '')]) {
    try {
      const html = await fetchText(base + encodeURIComponent(p), env);
      const days = parseCalendar(html, ym);
      if (Object.keys(days).length >= 20) {
        await env.QT_KV.put(`cal:${ym}`, JSON.stringify(days), { expirationTtl: 60 * 60 * 24 * 400 });
        return days;
      }
      errors.push(`${base.split('/').pop().split('?')[0]} ${p}: ${Object.keys(days).length}일만 찾음`);
    } catch (e) { errors.push(`${p}: ${e.message}`); }
  }
  throw new Error(`${ym} 캘린더에서 본문 범위를 찾지 못했습니다\n` + errors.join('\n'));
}
async function calendarPassage(env, date) {
  const m = JSON.parse((await env.QT_KV.get(`cal:${date.slice(0, 7)}`)) || 'null');
  return m ? m[date] || '' : '';
}

// =====================================================================
//  하루치 QT 미리 준비 (한 달치를 자동으로 준비)
//   - 본문 범위 : 두란노 QT 캘린더 (cal:YYYY-MM)
//   - 성경 본문 : 관리자 페이지 ①에서 올린 개역개정 성경 파일 (bible:<책이름>)
//   - 찬송      : 그날 아침 두란노 페이지에서 '번호'만 읽고, 제목·가사는 올린 새찬송가 파일 (hymns)
//   - 소제목·단락·해설·한절 묵상·기도 : AI (qt:<날짜>.commentary)
//   - 원어 해설 : AI (words:<날짜>)
// =====================================================================
const TTL = { expirationTtl: 60 * 60 * 24 * 400 };
const getJSON = async (env, key) => JSON.parse((await env.QT_KV.get(key)) || 'null');
const getQT = (env, date) => getJSON(env, `qt:${date}`);
const saveQT = (env, date, data) => env.QT_KV.put(`qt:${date}`, JSON.stringify(data), data.manual ? {} : TTL);

// ---------- 원어 해설 버전 ----------
//  WORDS_FROM(오늘) 이후 날짜는 새 형식(v2)이 아니면 다시 씀. 그 전 날짜는 예전 것 그대로.
const WORDS_V = 5;   // 5: 핵심 단어 5~7개(보통 6개) + 배경의 지명에 지금 이름 괄호  (4: 직역·어원·시제·핵심 절, 성도용 쉬운 말)
const WORDS_FROM = '2026-10-10';
const wordsFresh = (w, date) => !!w && (date < WORDS_FROM || (Number(w.v) || 1) >= WORDS_V);   // WORDS_FROM 전 날짜는 예전 것 그대로
const wordsReady = async (env, date) => wordsFresh(await getJSON(env, `words:${date}`), date);

// ---------- 성경(개역개정)·새찬송가 데이터 ----------
//  KV 'bible:<책이름>' = {"장": ["1절", "2절", …]}     KV 'hymns' = {"번호": {"t": 제목, "l": ["1절 가사", "2절 가사", …]}}
export function parsePassage(p) {
  const m = String(p || '').trim().match(/^(.+?)\s*(\d{1,3})\s*:\s*(\d{1,3})\s*[–~∼\-]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3})$/);
  if (!m) return null;
  return { book: m[1].trim(), c1: +m[2], v1: +m[3], c2: m[4] ? +m[4] : +m[2], v2: +m[5] };
}
async function bibleVerses(env, passage) {
  const p = parsePassage(passage);
  if (!p) return [];
  const book = await getJSON(env, `bible:${p.book}`);
  if (!book) return [];
  const out = [];
  for (let c = p.c1; c <= p.c2; c++) {
    const ch = book[c] || [];
    const from = c === p.c1 ? p.v1 : 1, to = c === p.c2 ? p.v2 : ch.length;
    for (let v = from; v <= to && v <= ch.length; v++) if (ch[v - 1]) out.push([String(v), ch[v - 1]]);
  }
  return out;
}
async function hymnInfo(env, no) {
  if (!no) return null;
  const all = await getJSON(env, 'hymns');
  const h = all && all[no];
  // 앱은 가사를 '/'로 나눠 절마다 번호를 붙여 그림으로 보여줌 → 절과 절 사이만 '/', 절 안의 줄은 줄바꿈(\n)
  return h ? { hymnNo: Number(no), hymnTitle: h.t, hymnLyrics: h.l.join(' / ') } : null;
}

// ---------- 본문 준비 (AI 없이 바로) ----------
async function prepareBase(env, date) {
  const old = await getQT(env, date);
  if (old && old.verses?.length) return old;
  let passage = await calendarPassage(env, date);
  if (!passage) { await collectMonth(env, date.slice(0, 7)).catch(() => {}); passage = await calendarPassage(env, date); }
  if (!passage) throw new Error(`${date} 본문 범위가 QT 캘린더에 없습니다`);
  const verses = await bibleVerses(env, passage);
  if (!verses.length) throw new Error(`${passage} 본문을 성경 파일에서 찾지 못했습니다 (관리자 페이지 ①에서 성경 파일을 올렸는지 확인)`);
  const data = { ...(old || {}), passage, title: old?.title || '', verses, source: '생명의 삶 (두란노) · 개역개정', preparedAt: new Date().toISOString() };
  await saveQT(env, date, data);
  return data;
}
const needsCommentary = d => !!(d && d.verses?.length && !(d.commentary && d.commentary.meditation));

// 하루치 전부 준비: 본문 → AI 해설 → AI 원어
async function prepareDay(env, date, force = false) {
  const base = await prepareBase(env, date);
  const done = [];
  if (force || needsCommentary(base)) { const c = await makeCommentary(env, date, force); done.push(`해설 ${c.sections.length}단락`); }
  if (force || !(await wordsReady(env, date))) { const w = await makeWords(env, date); done.push(`원어 ${w.words.length}단어`); }
  return { passage: base.passage, verses: base.verses.length, done };
}

// ---------- 찬송: 그날 두란노 페이지에서 번호만 → 찬송가 파일에서 제목·가사 ----------
const DURANNO_QT = 'https://www.duranno.com/qt/view/bible.asp?qtDate={yyyy-mm-dd}';
async function fetchHymn(env, date) {
  if (date !== kstDateKey()) throw new Error('찬송 번호는 그날 아침 두란노 페이지에서만 읽을 수 있습니다');
  const { html } = await fetchHtml(DURANNO_QT.replace('{yyyy-mm-dd}', date));
  const d = parseDuranno(html);
  if (d.pageDate && d.pageDate !== date) throw new Error(`두란노에 ${date} QT가 아직 올라오지 않았습니다`);
  if (!d.hymnNo) throw new Error('두란노 페이지에서 찬송 번호를 찾지 못했습니다');
  const h = (await hymnInfo(env, d.hymnNo)) || { hymnNo: d.hymnNo, hymnTitle: d.hymnTitle || '', hymnLyrics: d.hymnLyrics || '' };
  const hymn = { ...h, at: new Date().toISOString() };
  await env.QT_KV.put(`hymn:${date}`, JSON.stringify(hymn), TTL);
  return hymn;
}

// ---------- AI (Cloudflare Workers AI, 바인딩 이름 AI) ----------
const AI_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/google/gemma-3-12b-it', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
function aiText(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.response === 'string') return r.response;
  if (r.response && typeof r.response === 'object') return JSON.stringify(r.response);
  return r.choices?.[0]?.message?.content || '';
}
// 모델을 차례로 시도해서 check()를 통과한 JSON 결과를 돌려줌
async function aiJSON(env, messages, check, maxTokens = 3000) {
  if (!env.AI) throw new Error('Workers AI 바인딩(AI)이 없습니다 — 설정 > 바인딩에서 Workers AI를 이름 AI로 추가하세요');
  let lastErr = '';
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature: 0.4 });
      const j = JSON.parse((aiText(r).match(/\{[\s\S]*\}/) || [])[0] || 'null');
      if (!j) throw new Error('형식 오류');
      return { ...check(j), model: model.split('/').pop() };
    } catch (e) { lastErr = `${model.split('/').pop()}: ${e.message}`; }
  }
  throw new Error('AI 작성 실패 — ' + lastErr);
}
const SYS = '당신은 한국 개신교 교회의 성경 교사입니다. 성도들이 매일 QT(경건의 시간)를 할 때 읽을 내용을 씁니다. 반드시 자연스러운 한국어 존댓말(~합니다, ~입니다)로만 쓰고, 영어·한자를 섞지 마세요. 본문에 없는 사실을 지어내지 말고, 역사적 배경은 널리 알려진 내용만 짧게 쓰세요. 결과는 JSON만 출력합니다.';
const rangeRe = /^\d{1,3}:\d{1,3}~(?:\d{1,3}:)?\d{1,3}$/;
// 지명 규칙: 성경 지명이 나오면 처음 한 번은 지금 지도에서 부르는 이름을 괄호로 붙임
const PLACE_RULE = '성경의 나라·도시·지역 이름이 나오면 처음 나올 때 한 번은 지금 지도에서 부르는 이름을 바로 뒤 괄호에 붙이세요. 예: 갈라디아(지금의 터키), 바벨론(지금의 이라크), 애굽(지금의 이집트), 마게도냐(지금의 그리스 북부), 다메섹(지금의 시리아 다마스쿠스). 예루살렘·갈릴리처럼 지금도 같은 이름이면 붙이지 않습니다.';

// 본문 해설 (+ 두란노 단락이 없으면 AI가 단락·소제목·기도까지)
async function makeCommentary(env, date, force = false) {
  const qt = await getQT(env, date);
  if (!qt || !qt.verses?.length) throw new Error('먼저 그날 QT 본문이 있어야 합니다');
  if (qt.commentary && qt.commentary.meditation && !force) return qt.commentary;
  const book = (qt.passage || '').replace(/\s*\d.*$/, '');
  const chap = ((qt.passage || '').match(/(\d+):/) || [])[1] || '';
  const fixed = qt.sections && qt.sections.length ? qt.sections : null;    // 예전에 두란노에서 받은 날은 그 단락 그대로
  const bible = qt.verses.map(v => `${v[0]} ${v[1]}`).join('\n');
  const plan = fixed
    ? `[단락]\n${fixed.map((s, i) => `${i + 1}. "${s.title}" (${book} ${s.range})`).join('\n')}\n단락 수(${fixed.length}개)와 순서를 꼭 맞추세요.`
    : `본문을 내용의 흐름에 따라 2~4개 단락으로 나누고, 단락마다 짧은 제목(12자 안팎)과 범위(예: "${chap}:${qt.verses[0][0]}~5")를 붙여 주세요. 장이 바뀌면 "21:18~22:1"처럼 씁니다.`;
  const messages = [
    { role: 'system', content: SYS },
    { role: 'user', content: `오늘 QT 본문: ${qt.passage}\n\n[본문 말씀]\n${bible}\n\n${plan}\n\n다음을 써 주세요.\n- title: 오늘 본문 전체의 소제목 (15자 이내)\n- sections: 단락마다 title(단락 제목), range(범위), text(본문 해설 4~5문장. 먼저 본문 내용과 배경을 풀어 설명하고, 마지막 1~2문장은 오늘 성도의 삶에 주는 교훈), question(묵상 질문 2개를 한 문장씩 이어서 — 첫째는 본문 내용 질문, 둘째는 나의 삶 적용 질문)\n- meditation.verses: 마음에 새길 핵심 1~2절의 절 번호 (예: "2" 또는 "2~3")\n- meditation.text: 그 구절을 붙잡고 하는 묵상 3~4문장. 따뜻하고 깊이 있게, 오늘 하루의 삶으로 이어지게.\n- prayer: 오늘 말씀으로 드리는 기도 3~4문장 ("~하옵소서", 마지막은 "예수님의 이름으로 기도합니다. 아멘.")\n\n${PLACE_RULE}\n\n출력 형식(JSON만):\n{"title":"...","sections":[{"title":"...","range":"${chap}:1~5","text":"...","question":"..."}],"meditation":{"verses":"2","text":"..."},"prayer":"..."}` },
  ];
  const res = await aiJSON(env, messages, j => {
    const list = Array.isArray(j.sections) ? j.sections : [];
    const secs = (fixed ? list.slice(0, fixed.length) : list.slice(0, 5)).map((s, i) => ({
      title: fixed ? fixed[i].title : String(s.title || '').trim().slice(0, 30),
      range: fixed ? fixed[i].range : (rangeRe.test(String(s.range || '').replace(/\s+/g, '').replace(/[-–∼]/g, '~')) ? String(s.range).replace(/\s+/g, '').replace(/[-–∼]/g, '~') : ''),
      text: String(s.text || '').trim(), question: String(s.question || '').trim(),
    })).filter(s => s.text.length > 40 && /[가-힣]/.test(s.text));
    if (!secs.length) throw new Error('해설이 비어 있음');
    return { j, secs };
  });
  const { j, secs } = res;
  const md = j.meditation && String(j.meditation.text || '').trim().length > 40 ? j.meditation : null;
  const meditation = md ? { ref: `${book} ${chap}장 ${String(md.verses || '').replace(/[^\d~\-–,]/g, '').replace(/[-–]/, '~') || qt.verses[0][0]}절`, text: String(md.text).trim() } : null;
  const commentary = { sections: secs, meditation, model: res.model, at: new Date().toISOString() };
  const cur = (await getQT(env, date)) || qt;
  const upd = { ...cur, commentary };
  if (!cur.title && String(j.title || '').trim()) upd.title = String(j.title).trim().slice(0, 40);
  if (!fixed && secs.every(s => s.range)) upd.sections = secs.map(s => ({ title: s.title, range: s.range }));
  if ((!cur.prayer || cur.prayerAI) && String(j.prayer || '').trim().length > 20) { upd.prayer = String(j.prayer).trim(); upd.prayerAI = true; }
  await saveQT(env, date, upd);
  return commentary;
}

// 원어 해설 (앱의 '원어로 보는 본문의 흐름' 형식) — 공부용: 핵심 단어 + 직역 + 문법·문맥 해석 + 요약(필수)
async function makeWords(env, date) {
  const qt = await getQT(env, date);
  if (!qt || !qt.verses?.length) throw new Error('먼저 그날 QT 본문이 있어야 합니다');
  const p = parsePassage(qt.passage);
  const lang = p && BOOKS.indexOf(p.book) >= 39 ? 'gr' : 'he';
  const langName = lang === 'gr' ? '헬라어' : '히브리어';
  const bible = qt.verses.map(v => `${v[0]} ${v[1]}`).join('\n');
  const example = lang === 'gr'
    ? JSON.stringify({ verse: '8', ko: '바람', orig: 'πνεῦμα', read: '프뉴마', mean: '바람 · 숨 · 영', strong: 'G4151',
        desc: '⭐ 오늘 본문의 열쇠 단어입니다. 📖 직역: 바람, 숨결 [어원] \'불다, 숨을 내쉬다\'라는 동사 프네오에서 나온 말로, 보이지 않지만 살아 움직이는 숨결을 그린 단어입니다. [시제] 8절의 \'분다\'는 현재형으로 쓰여, 성령의 바람은 지난날의 이야기가 아니라 지금도 불고 있음을 보여 줍니다. [핵심 절] 바람은 보이지 않아도 소리로 알 수 있듯, 성령으로 새로 난 사람도 그 삶의 변화로 드러난다는 말씀입니다.',
        next: '그 바람이 하는 일은' })
    : JSON.stringify({ verse: '1', ko: '목자', orig: 'רֹעִי', read: '로이', mean: '나의 목자 · 먹이고 돌보는 이', strong: 'H7462',
        desc: '⭐ 오늘 본문의 열쇠 단어입니다. 📖 직역: 나를 먹이시는 분 [어원] \'양을 먹이다, 돌보다\'라는 동사 라아에서 나온 말로, 양 떼 곁을 떠나지 않고 꼴과 물을 찾아 주는 사람을 그린 단어입니다. [시제] 한 번 돌보고 끝나는 말이 아니라 \'지금도 계속 먹이고 계신 분\'이라는 뜻을 담고 있어, 주님의 돌보심은 오늘도 변함이 없습니다. [핵심 절] 다윗은 왕이 된 뒤에도 자신을 양으로, 하나님을 목자로 고백하며 그분 안에서 부족함이 없다고 노래합니다.',
        next: '그 목자가 이끄는 곳은' });
  const messages = [
    { role: 'system', content: SYS + ' 성경 원어(히브리어·헬라어)와 스트롱 번호를 정확히 아는 교사로서, 매일 QT를 하는 평범한 성도가 편하게 읽고 은혜받을 수 있게 원어를 풀어 줍니다. 신학교 강의처럼 쓰지 말고, 문법 용어(부정과거·분사·완료 등)는 쓰지 말고 "지금도 계속", "이미 이루어진"처럼 쉬운 말로 바꿔 쓰세요. 확실하지 않은 원어·어원은 쓰지 마세요.' },
    { role: 'user', content: `오늘 QT 본문: ${qt.passage} (개역개정)\n\n${bible}\n\n이 본문의 흐름을 이어 주는 핵심 단어 5~7개(보통 6개)를 본문 순서대로 골라 ${langName} 원어로 쉽게 풀어 주세요. 4개 이하로 줄이지 마세요.\n- verse: 그 단어가 나오는 절 번호\n- ko: 위 본문에 글자 그대로 들어 있는 한글 단어 (2~4글자, 조사 빼고)\n- orig: ${langName} 원어 (${lang === 'he' ? '모음 부호 포함' : '악센트 포함'})\n- read: 원어의 한글 발음\n- mean: 뜻 (짧게, 여러 뜻은 · 로 구분)\n- strong: 스트롱 번호 (${lang === 'he' ? 'H' : 'G'}로 시작)\n- desc: 3~4문장. 성도가 묵상하며 편하게 읽을 수 있게, 아래 표시를 지켜 주세요.\n   · 본문 전체의 열쇠가 되는 단어 딱 하나만 맨 앞에 "⭐ 오늘 본문의 열쇠 단어입니다."\n   · 📖 직역: 이 단어를 글자 그대로 옮긴 뜻 (짧게, 몇 단어로)\n   · [어원] 어떤 말에서 나왔는지, 원래 어떤 그림(모습)을 담은 말인지 1문장\n   · [시제] 동사의 시제나 형태가 말씀의 의미를 살려 줄 때만 1문장 (예: 현재형이라 주님의 말씀은 지금도 변함이 없습니다). 특별한 의미가 없으면 [시제]는 빼세요 — 억지로 넣지 말 것\n   · [핵심 절] 이 단어가 들어 있는 절이 무슨 말씀인지 쉽게 1~2문장\n- next: 다음 단어로 이어지는 흐름을 잇는 짧은 말 (마지막 단어는 빈 칸)\n그리고 (모두 필수)\n- background: 본문의 시대적 배경과 인물의 상황 3~4문장 (쉽게). ${PLACE_RULE}\n- summary: "핵심 단어: 단어1 → 단어2 → 단어3 …" 다음에 한 칸 띄우고 "흐름 정리:"로 시작해, 고른 단어들을 이어 본문 전체의 흐름을 2문장으로 요약\n\n단어 하나는 예를 들어 이렇게 씁니다 (형식과 분위기만 참고하고, 내용은 반드시 오늘 본문으로 쓰세요):\n${example}\n\n출력 형식(JSON만):\n{"background":"...","words":[{"verse":"","ko":"","orig":"","read":"","mean":"","strong":"","desc":"","next":""}],"summary":"핵심 단어: … 흐름 정리: …"}` },
  ];
  const all = qt.verses.map(v => v[1]).join(' ');
  const res = await aiJSON(env, messages, j => {
    const words = (Array.isArray(j.words) ? j.words : []).map(w => ({
      verse: String(w.verse || '').replace(/[^\d]/g, ''), ko: String(w.ko || '').trim(), orig: String(w.orig || '').trim(), read: String(w.read || '').trim(),
      mean: String(w.mean || '').trim(), strong: String(w.strong || '').trim().toUpperCase(), desc: String(w.desc || '').replace(/\s*👉[\s\S]*$/, '').trim(), next: String(w.next || '').trim(),
    })).filter(w => w.ko && all.includes(w.ko) && w.orig && w.desc.length >= 80 && /[֐-׿Ͱ-Ͽἀ-῿]/.test(w.orig)).slice(0, 7);
    if (words.length < 4) throw new Error('핵심 단어가 부족하거나 해석이 너무 짧음 (' + words.length + '개)');
    // 열쇠 단어(⭐)는 하나만 — 없으면 첫 단어에, 여러 개면 첫 번째만 남김
    let star = false;
    words.forEach(w => {
      if (w.desc.startsWith('⭐')) {
        if (star) w.desc = w.desc.replace(/^⭐\s*(오늘 본문의 열쇠 단어입니다\.?)?\s*/, '');
        star = true;
      }
    });
    if (!star) words[0].desc = '⭐ 오늘 본문의 열쇠 단어입니다. ' + words[0].desc;
    words[words.length - 1].next = '';
    // 요약 필수 — 없거나 짧으면 다른 모델로 다시
    let summary = String(j.summary || '').trim();
    if (summary.length < 40 || !/흐름 정리/.test(summary)) throw new Error('요약(흐름 정리)이 빠짐');
    if (!/^핵심 단어/.test(summary)) summary = '핵심 단어: ' + words.map(w => w.ko).join(' → ') + ' ' + summary;
    if (String(j.background || '').trim().length < 40) throw new Error('배경 설명이 빠짐');
    return { j, words, summary };
  }, 6500);
  const data = { v: WORDS_V, ref: qt.passage.replace('–', '-'), lang, background: String(res.j.background || '').trim(), words: res.words, summary: res.summary, ai: true, model: res.model, at: new Date().toISOString() };
  await env.QT_KV.put(`words:${date}`, JSON.stringify(data), TTL);
  return data;
}

// 앱이 열었을 때 빠진 것 채우기 (같은 날짜는 10분에 한 번만)
async function fillMissing(env, date, needHymn) {
  const key = `bg:${date}`;
  if (await env.QT_KV.get(key)) return;
  await env.QT_KV.put(key, '1', { expirationTtl: 10 * 60 });
  if (needsCommentary(await getQT(env, date))) await makeCommentary(env, date).catch(e => console.log('해설 실패:', e.message));
  if (!(await wordsReady(env, date))) await makeWords(env, date).catch(e => console.log('원어 실패:', e.message));
  if (needHymn) await fetchHymn(env, date).catch(e => console.log('찬송 실패:', e.message));
}
// 앱에 보낼 하루치 (본문 + 찬송 + 원어 + CCM)
async function fullQT(env, date) {
  const qt = await getQT(env, date);
  if (!qt) return null;
  const [hymn, words, song] = await Promise.all([getJSON(env, `hymn:${date}`), getJSON(env, `words:${date}`), getJSON(env, `song:${date}`)]);
  return { ...qt, ...(hymn ? { hymnNo: hymn.hymnNo, hymnTitle: hymn.hymnTitle, hymnLyrics: hymn.hymnLyrics } : {}), words: words || qt.words || null, song };
}

// 악보 사진에서 노래 제목 읽기
async function readTitle(env, image) {
  const prompt = '이 그림은 찬양(CCM) 악보입니다. 맨 위에 크게 쓰인 노래 제목만 정확히 읽어서 출력하세요. 설명, 따옴표, 작곡가 이름, 영어 번역은 빼고 제목 한 줄만 쓰세요.';
  const tidy = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean)[0]?.replace(/^(제목|title)\s*[:：]\s*/i, '').replace(/^["'「『]|["'」』]$/g, '').trim().slice(0, 60) || '';
  const errs = [];
  for (const model of ['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/llava-hf/llava-1.5-7b-hf']) {
    try {
      let r;
      try { r = await env.AI.run(model, { prompt, image, max_tokens: 60 }); }
      catch (e) {
        if (!/agree/i.test(e.message)) throw e;
        await env.AI.run(model, { prompt: 'agree' });          // Llama 3.2 Vision 첫 사용 시 이용약관 동의
        r = await env.AI.run(model, { prompt, image, max_tokens: 60 });
      }
      const title = tidy(r?.response ?? r?.description ?? aiText(r));
      if (title && /[가-힣A-Za-z]/.test(title)) return { ok: true, title, model: model.split('/').pop() };
      errs.push(model.split('/').pop() + ': 빈 결과');
    } catch (e) { errs.push(model.split('/').pop() + ': ' + e.message); }
  }
  return { ok: false, error: errs.join(' / ') };
}

// ---------- 유튜브 설교 (검암 예수비전교회 채널 @joypch7) ----------
const YT_HANDLE = 'joypch7';
async function channelId(env) {
  if (env.YT_CHANNEL_ID) return env.YT_CHANNEL_ID;                 // 대시보드 변수로 직접 지정 가능
  const saved = await env.QT_KV.get('yt:channel');
  if (saved) return saved;
  const html = await (await fetch(`https://www.youtube.com/@${YT_HANDLE}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko' } })).text();
  const id = (html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || html.match(/"channelId":"(UC[\w-]{22})"/) || [])[1];
  if (!id) throw new Error('유튜브 채널 ID를 찾지 못했습니다');
  await env.QT_KV.put('yt:channel', id);
  return id;
}
async function fetchSermons(env) {
  const id = await channelId(env);
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('유튜브 응답 오류 ' + res.status);
  const xml = await res.text();
  const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const list = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const e = m[1];
    const vid = (e.match(/<yt:videoId>([^<]+)/) || [])[1];
    return vid && { id: vid, title: dec((e.match(/<title>([^<]*)/) || [])[1] || ''), published: (e.match(/<published>([^<]+)/) || [])[1] || '', thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` };
  }).filter(Boolean);
  if (!list.length) throw new Error('설교 영상이 없습니다');
  return list.slice(0, 15);
}

// ---------- 응답 도우미 ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Dir-Pass,X-Cell-Pass' };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });
function isAdmin(req, env) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();   // 앞뒤 공백·줄바꿈은 무시
  const want = String(env.ADMIN_TOKEN || '').trim();
  return !!want && t === want;
}
// base64 그림(data:image/jpeg;base64,…) → 바이트
const dataUrlBytes = data => Uint8Array.from(atob(String(data).split(',')[1] || ''), c => c.charCodeAt(0));

// ---------- 스마트요람 (비밀번호로 보호) ----------
// 명단: KV 'dir:data' (가족 단위 JSON) / 사진: KV 'dir:img:<ID>'
const dirPass = env => String(env.DIR_PASS || '0191');
const cellPass = env => String(env.CELL_PASS || '0109');
// 비밀번호 확인 — 틀리면 IP별로 횟수를 세고, 10분에 10번 넘게 틀리면 잠시 막음
async function passCheck(req, env, given, want, prefix) {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const failKey = `${prefix}:fail:${ip}`;
  const fails = ip ? Number((await env.QT_KV.get(failKey)) || 0) : 0;
  if (fails >= 10) return { ok: false, status: 429, error: '비밀번호를 여러 번 틀렸습니다. 10분 뒤에 다시 해 주세요' };
  if (String(given || '') === want) return { ok: true };
  if (ip) await env.QT_KV.put(failKey, String(fails + 1), { expirationTtl: 600 });
  return { ok: false, status: 401, error: '비밀번호가 맞지 않습니다' };
}
const dirCheck = (req, env, given) => passCheck(req, env, given, dirPass(env), 'dir');
const cellCheck = (req, env, given) => passCheck(req, env, given, cellPass(env), 'cell');
// ---------- 셀리더교제 자료방 ----------
// 목록 KV 'cell:list' = [{ id, title, body, at, files: [{ key, name, type, size, pages: ['/cell-file/<키>', …] }] }]
// 파일 KV 'cell:file:<키>' (바이트) + 'cell:fmeta:<키>' ({name,type,size})
const CELL_MAX = 1;                                          // 자료 보관 개수 — 새 자료를 올리면 지난 자료는 파일까지 자동 삭제 (여러 개 남기려면 숫자를 키움)
const cellList = async env => JSON.parse((await env.QT_KV.get('cell:list')) || '[]');
async function cellDropFile(env, url) { const k = (String(url || '').match(/cell-file\/([\w-]+)/) || [])[1]; if (k) { await env.QT_KV.delete(`cell:file:${k}`); await env.QT_KV.delete(`cell:fmeta:${k}`); } }
async function cellDropPost(env, post) { for (const f of post?.files || []) { await cellDropFile(env, f.url || `/cell-file/${f.key}`); for (const u of f.pages || []) await cellDropFile(env, u); } }
async function dirData(env) { return JSON.parse((await env.QT_KV.get('dir:data')) || 'null'); }
async function dirSetPhoto(env, id, has) {
  const data = await dirData(env);
  if (!data) return null;
  let pv = null;
  for (const f of data.families || []) for (const m of f.m) if (m.id === id) { m.photo = has; m.pv = pv = Date.now().toString(36); }
  await env.QT_KV.put('dir:data', JSON.stringify(data));
  return pv;
}

// ---------- 주간사역 갤러리 ----------
// 목록: KV 'gallery:list' = [{ id, date, title, body, images: ['/gallery-img/<키>', …], at, updatedAt }] (최근 날짜가 앞)
// 사진: KV 'gallery:img:<키>' (JPEG)
const GALLERY_MAX = 1;                                       // 묶음 보관 개수 — 새 묶음을 올리면 지난 묶음은 사진까지 자동 삭제 (여러 묶음을 남기려면 숫자를 키움)
const galleryList = async env => JSON.parse((await env.QT_KV.get('gallery:list')) || '[]');
// 주간사역 영상 (1개) — KV 'gallery:video' (바이트, 25MB 이하) / 'gallery:video:poster' (JPEG) / 'gallery:video:meta' ({type,size,dur,title,at})
const VIDEO_MAX = 25 * 1024 * 1024;
const videoMeta = env => getJSON(env, 'gallery:video:meta');
// 영상 파일 응답 — Range(일부 구간) 요청을 처리해야 아이폰·사파리에서 재생됨
function rangeResponse(buf, type, req, extra = {}) {
  const total = buf.byteLength;
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', ...CORS, ...extra };
  const m = (req.headers.get('Range') || '').match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) return new Response(req.method === 'HEAD' ? null : buf, { headers: { ...base, 'Content-Length': String(total) } });
  let start = m[1] === '' ? Math.max(0, total - Number(m[2])) : Number(m[1]);
  let end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), total - 1) : total - 1;
  if (start >= total || start > end) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${total}` } });
  const part = buf.slice(start, end + 1);
  return new Response(req.method === 'HEAD' ? null : part, { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(part.byteLength) } });
}
async function galleryDropImages(env, urls) {
  for (const u of urls || []) { const k = (String(u).match(/gallery-img\/([\w-]+)/) || [])[1]; if (k) await env.QT_KV.delete(`gallery:img:${k}`); }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      // 관리자 비밀번호 확인 (관리자 페이지에서 맞는지 바로 보여줌)
      if (path === '/api/admin-check') {
        const set = !!String(env.ADMIN_TOKEN || '').trim();
        return json({ ok: true, set, match: isAdmin(req, env) }, 200, { 'Cache-Control': 'no-store' });
      }
      // ---------- 스마트요람 ----------
      // 명단 받기 (앱): 헤더 X-Dir-Pass 에 비밀번호
      if (path === '/api/dir' && req.method === 'GET') {
        const c = isAdmin(req, env) ? { ok: true } : await dirCheck(req, env, req.headers.get('X-Dir-Pass') || url.searchParams.get('k'));
        if (!c.ok) return json({ ok: false, error: c.error }, c.status);
        const data = await dirData(env);
        if (!data) return json({ ok: false, error: '스마트요람 명단이 아직 등록되지 않았습니다' }, 404);
        return json({ ok: true, data }, 200, { 'Cache-Control': 'no-store' });
      }
      // 관리자: 명단 전체 올리기 (사진은 따로 /dir-img/ID 로 올림)
      if (path === '/api/dir' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => null);
        if (!b || !Array.isArray(b.families)) return json({ ok: false, error: '명단 형식 오류' }, 400);
        b.updatedAt = new Date().toISOString();
        await env.QT_KV.put('dir:data', JSON.stringify(b));
        return json({ ok: true, families: b.families.length, people: b.families.reduce((n, f) => n + f.m.length, 0) });
      }
      // 생일 명단 (앱 '이번 달 생일' 칸) — 이름·직분·월일만 (사진·연도·연락처 없음)
      if (path === '/api/birthdays' && req.method === 'GET') {
        const data = await dirData(env);
        if (!data) return json({ ok: false, error: '스마트요람 명단이 아직 등록되지 않았습니다' }, 404);
        const list = [];
        for (const f of data.families || []) for (const m of f.m) if (/^\d{4}-\d{2}-\d{2}$/.test(m.birth || '')) list.push({ name: m.name, duty: m.duty || '', md: m.birth.slice(5), lunar: !!m.lunar });
        return json({ ok: true, list }, 200, { 'Cache-Control': 'public, max-age=600' });
      }
      // 관리자: 음력/양력 생일 바꾸기
      if (path === '/api/dir/lunar' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => ({}));
        const data = await dirData(env);
        if (!data) return json({ ok: false, error: '명단 없음' }, 404);
        let hit = null;
        for (const f of data.families || []) for (const m of f.m) if (m.id === String(b.id)) { m.lunar = !!b.lunar; hit = m; }
        if (!hit) return json({ ok: false, error: '없는 사람입니다' }, 404);
        await env.QT_KV.put('dir:data', JSON.stringify(data));
        return json({ ok: true, name: hit.name, lunar: hit.lunar });
      }
      // 관리자: 교인 추가·수정 (앱 관리자 모드의 ✏️ 정보 수정 / ➕ 가족 추가 / ➕ 새 교인 등록)
      //   body: { id?(수정할 분), famWith?(이 분의 가정에 추가), cellAll?(가족 모두 같은 셀로), fields: {name,duty,g,rel,birth,lunar,hp,tel,addr,cell,src} }
      if (path === '/api/dir/person' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => null);
        if (!b || typeof b.fields !== 'object') return json({ ok: false, error: '형식 오류' }, 400);
        const data = await dirData(env);
        if (!data) return json({ ok: false, error: '스마트요람 명단이 아직 등록되지 않았습니다' }, 404);
        data.families = data.families || [];
        const pick = {};
        for (const k of ['name', 'duty', 'g', 'rel', 'birth', 'lunar', 'hp', 'tel', 'addr', 'cell', 'src']) {
          if (!(k in b.fields)) continue;
          pick[k] = k === 'lunar' ? !!b.fields[k] : String(b.fields[k] ?? '').trim().slice(0, k === 'addr' ? 120 : 40);
        }
        if (pick.birth && !/^\d{4}-\d{2}-\d{2}$/.test(pick.birth)) return json({ ok: false, error: '생년월일 형식 오류 (예: 1975-03-21)' }, 400);
        if (pick.g && !['남', '여'].includes(pick.g)) pick.g = '';
        const find = id => { for (const f of data.families) { const m = f.m.find(x => x.id === String(id)); if (m) return { f, m }; } return null; };
        let m;
        if (b.id) {                                     // 수정
          const hit = find(b.id);
          if (!hit) return json({ ok: false, error: '없는 사람입니다' }, 404);
          if ('name' in pick && !pick.name) return json({ ok: false, error: '이름을 넣어 주세요' }, 400);
          m = Object.assign(hit.m, pick);
          if (b.cellAll && 'cell' in pick) hit.f.m.forEach(x => { x.cell = pick.cell; });
        } else {                                        // 새로 등록
          if (!pick.name) return json({ ok: false, error: '이름을 넣어 주세요' }, 400);
          m = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', duty: '', g: '', rel: '', birth: '', hp: '', tel: '', addr: '', cell: '', ...pick, photo: false };
          if (b.famWith) {
            const hit = find(b.famWith);
            if (!hit) return json({ ok: false, error: '가정을 찾지 못했습니다' }, 404);
            hit.f.m.push(m);
          } else {
            if (!m.rel) m.rel = '본인';
            data.families.push({ m: [m] });
          }
        }
        data.updatedAt = new Date().toISOString();
        await env.QT_KV.put('dir:data', JSON.stringify(data));
        return json({ ok: true, id: m.id, name: m.name, data });
      }
      // 관리자: 전출하신 분 명단에서 빼기 (사진도 함께 삭제, 가족이 모두 빠지면 가족 칸도 삭제)
      if (path === '/api/dir/person' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = String(url.searchParams.get('id') || '');
        const data = await dirData(env);
        if (!data) return json({ ok: false, error: '명단 없음' }, 404);
        let hit = null;
        for (const f of data.families || []) {
          const i = f.m.findIndex(m => m.id === id);
          if (i >= 0) hit = f.m.splice(i, 1)[0];
        }
        if (!hit) return json({ ok: false, error: '없는 사람입니다' }, 404);
        data.families = (data.families || []).filter(f => f.m.length);
        data.updatedAt = new Date().toISOString();
        await env.QT_KV.put('dir:data', JSON.stringify(data));
        await env.QT_KV.delete(`dir:img:${id}`);
        return json({ ok: true, name: hit.name, families: data.families.length, people: data.families.reduce((n, f) => n + f.m.length, 0) });
      }
      // ---------- 셀리더교제 자료방 ----------
      // 목록 (앱): 헤더 X-Cell-Pass 또는 ?k= 에 비밀번호 (관리자 토큰도 됨)
      if (path === '/api/cell' && req.method === 'GET') {
        const c = isAdmin(req, env) ? { ok: true } : await cellCheck(req, env, req.headers.get('X-Cell-Pass') || url.searchParams.get('k'));
        if (!c.ok) return json({ ok: false, error: c.error }, c.status);
        return json({ ok: true, list: await cellList(env) }, 200, { 'Cache-Control': 'no-store' });
      }
      // 관리자: 파일 한 개 올리기 (바이트 그대로) — ?name=파일이름&type=형식 → { key, url }
      if (path === '/api/cell-file' && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const buf = await req.arrayBuffer();
        if (!buf.byteLength) return json({ ok: false, error: '빈 파일입니다' }, 400);
        if (buf.byteLength > 25 * 1024 * 1024) return json({ ok: false, error: `파일이 너무 큽니다 (${(buf.byteLength / 1048576).toFixed(1)}MB — 25MB 이하만)` }, 400);
        const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const name = String(url.searchParams.get('name') || 'file').slice(0, 120);
        const type = String(url.searchParams.get('type') || req.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().slice(0, 80);
        await env.QT_KV.put(`cell:file:${key}`, buf);
        await env.QT_KV.put(`cell:fmeta:${key}`, JSON.stringify({ name, type, size: buf.byteLength }));
        return json({ ok: true, file: { key, name, type, size: buf.byteLength, url: `/cell-file/${key}` } });
      }
      // 관리자: 글 올리기·고치기 — body: { id?, title, body?, files: [{key,name,type,size,url,pages:[…]}] }  (고칠 때 빠진 파일은 지움)
      if (path === '/api/cell' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => ({}));
        const title = String(b.title || '').trim().slice(0, 80), body = String(b.body || '').trim().slice(0, 3000);
        if (!title) return json({ ok: false, error: '제목을 넣어주세요' }, 400);
        const list = await cellList(env);
        const id = b.id || Date.now().toString(36);
        const old = list.find(x => x.id === id);
        const files = (Array.isArray(b.files) ? b.files : (old?.files || [])).slice(0, 20).map(f => ({
          key: String(f.key || '').replace(/[^\w-]/g, ''), name: String(f.name || '').slice(0, 120), type: String(f.type || '').slice(0, 80), size: Number(f.size) || 0,
          url: `/cell-file/${String(f.key || '').replace(/[^\w-]/g, '')}`, pages: (Array.isArray(f.pages) ? f.pages : []).filter(u => /^\/cell-file\/[\w-]+$/.test(String(u))).slice(0, 30),
        })).filter(f => f.key);
        if (old) {                                                   // 빠진 파일 삭제
          const keep = new Set(files.map(f => f.key));
          for (const f of old.files || []) if (!keep.has(f.key)) { await cellDropFile(env, f.url); for (const u of f.pages || []) await cellDropFile(env, u); }
        }
        const item = { id, title, body, files, pin: !!b.pin, at: old?.at || new Date().toISOString(), updatedAt: new Date().toISOString() };
        // 새 자료면 지난 자료는 전부 파일까지 지움 (같은 글 수정은 그대로)
        if (!old && CELL_MAX <= 1) for (const g of list) await cellDropPost(env, g);
        const rest = (!old && CELL_MAX <= 1) ? [] : list.filter(x => x.id !== id); rest.unshift(item);
        rest.sort((a, z) => (z.pin - a.pin) || z.at.localeCompare(a.at));
        for (const g of rest.slice(CELL_MAX)) await cellDropPost(env, g);   // 보관 개수를 넘는 오래된 자료는 파일까지 정리
        await env.QT_KV.put('cell:list', JSON.stringify(rest.slice(0, CELL_MAX)));
        return json({ ok: true, item });
      }
      if (path === '/api/cell' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = url.searchParams.get('id');
        const list = await cellList(env);
        const gone = list.find(x => x.id === id);
        if (!gone) return json({ ok: false, error: '없는 글입니다' }, 404);
        await cellDropPost(env, gone);
        await env.QT_KV.put('cell:list', JSON.stringify(list.filter(x => x.id !== id)));
        return json({ ok: true });
      }
      // 파일 보기·내려받기 (앱): ?k=비밀번호, &dl=1 이면 내려받기
      const cf = path.match(/^\/cell-file\/([\w-]+)$/);
      if (cf && (req.method === 'GET' || req.method === 'HEAD')) {
        const k = url.searchParams.get('k') || '';
        const admK = !!String(env.ADMIN_TOKEN || '').trim() && k === String(env.ADMIN_TOKEN).trim();
        const c = (isAdmin(req, env) || admK) ? { ok: true } : await cellCheck(req, env, k);
        if (!c.ok) return new Response(c.error, { status: c.status, headers: CORS });
        const meta = (await getJSON(env, `cell:fmeta:${cf[1]}`)) || {};
        const buf = await env.QT_KV.get(`cell:file:${cf[1]}`, 'arrayBuffer');
        if (!buf) return new Response('파일 없음', { status: 404, headers: CORS });
        const fname = encodeURIComponent(meta.name || 'file');
        const disp = (url.searchParams.get('dl') === '1' ? 'attachment' : 'inline') + `; filename*=UTF-8''${fname}`;
        return rangeResponse(buf, meta.type || 'application/octet-stream', req, { 'Content-Disposition': disp, 'Cache-Control': 'private, max-age=86400' });
      }
      // 사진 보기 (앱): ?k=비밀번호
      const di = path.match(/^\/dir-img\/([\w가-힣%-]+)$/);
      if (di && req.method === 'GET') {
        const c = await dirCheck(req, env, url.searchParams.get('k'));
        if (!c.ok) return new Response(c.error, { status: c.status, headers: CORS });
        const body = await env.QT_KV.get(`dir:img:${decodeURIComponent(di[1])}`, 'arrayBuffer');
        if (!body) return new Response('사진 없음', { status: 404, headers: CORS });
        return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=2592000', ...CORS } });
      }
      // 관리자: 사진 올리기·바꾸기 / 지우기
      if (di && (req.method === 'PUT' || req.method === 'DELETE')) {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = decodeURIComponent(di[1]);
        if (req.method === 'DELETE') { await env.QT_KV.delete(`dir:img:${id}`); await dirSetPhoto(env, id, false); return json({ ok: true }); }
        const buf = await req.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > 2 * 1024 * 1024) return json({ ok: false, error: '사진 크기 오류 (2MB 이하)' }, 400);
        await env.QT_KV.put(`dir:img:${id}`, buf);
        const pv = url.searchParams.get('nodata') === '1' ? null : await dirSetPhoto(env, id, true);
        return json({ ok: true, id, pv });
      }

      // ---------- 성경·찬송가 데이터 ----------
      // 관리자: 성경 한 권 올리기 (관리자 페이지 ①이 txt 파일을 책별로 나눠서 보냄)
      const bb = path.match(/^\/api\/bible\/(.+)$/);
      if (bb && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const book = decodeURIComponent(bb[1]);
        if (!BOOKS.includes(book)) return json({ ok: false, error: '없는 성경 이름: ' + book }, 400);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== 'object' || !Object.keys(b).length) return json({ ok: false, error: '성경 형식 오류' }, 400);
        await env.QT_KV.put(`bible:${book}`, JSON.stringify(b));
        return json({ ok: true, book, chapters: Object.keys(b).length });
      }
      // 성경 본문 보기: /api/bible?p=역대상 20:1–8
      if (path === '/api/bible' && req.method === 'GET') {
        const p = url.searchParams.get('p') || '';
        const verses = await bibleVerses(env, p);
        return verses.length ? json({ ok: true, passage: p, verses }, 200, { 'Cache-Control': 'public, max-age=86400' }) : json({ ok: false, error: '본문을 찾지 못했습니다 (형식 예: 역대상 20:1-8)' }, 404);
      }
      // 관리자: 새찬송가 전체 올리기
      if (path === '/api/hymns' && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => null);
        if (!b || !Object.keys(b).length) return json({ ok: false, error: '찬송가 형식 오류' }, 400);
        await env.QT_KV.put('hymns', JSON.stringify(b));
        return json({ ok: true, count: Object.keys(b).length });
      }
      // 찬송 가사 보기: /api/hymn?no=93
      if (path === '/api/hymn' && req.method === 'GET') {
        const h = await hymnInfo(env, Number(url.searchParams.get('no')));
        return h ? json({ ok: true, ...h }, 200, { 'Cache-Control': 'public, max-age=86400' }) : json({ ok: false, error: '없는 찬송 번호이거나 찬송가 파일이 아직 없습니다' }, 404);
      }
      // 관리자: 하루치 미리 준비 (본문 + AI 해설 + 원어) — 관리자 페이지가 날짜마다 차례로 부름
      if (path === '/api/prepare' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const date = url.searchParams.get('date');
        if (!validDate(date)) return json({ ok: false, error: '날짜 형식 오류' }, 400);
        return json({ ok: true, date, ...(await prepareDay(env, date, url.searchParams.get('force') === '1')) });
      }
      // 한 달 준비 현황
      if (path === '/api/prepared' && req.method === 'GET') {
        const ym = /^\d{4}-\d{2}$/.test(url.searchParams.get('ym') || '') ? url.searchParams.get('ym') : kstDateKey().slice(0, 7);
        const cal = (await getJSON(env, `cal:${ym}`)) || {};
        const days = await Promise.all(Object.keys(cal).sort().map(async d => {
          const [q, w, h] = await Promise.all([getQT(env, d), getJSON(env, `words:${d}`), getJSON(env, `hymn:${d}`)]);
          return { date: d, passage: cal[d], verses: q?.verses?.length || 0, title: q?.title || '', commentary: !!(q?.commentary?.meditation), words: wordsFresh(w, d), hymn: h?.hymnNo || q?.hymnNo || null };
        }));
        return json({ ok: true, ym, days }, 200, { 'Cache-Control': 'no-cache' });
      }

      // 오늘 QT
      if (path === '/api/qt' && req.method === 'GET') {
        const date = validDate(url.searchParams.get('date')) ? url.searchParams.get('date') : kstDateKey();
        let err = '';
        let base = await getQT(env, date);
        if (!base || !base.verses?.length) { try { await prepareBase(env, date); } catch (e) { err = e.message; } }
        let data = await fullQT(env, date);
        if (!data || !data.verses?.length) {            // 본문을 못 만들었으면 캘린더의 본문 범위라도 보냄
          const passage = await calendarPassage(env, date);
          if (passage) data = { passage, title: '', hymnNo: null, hymnTitle: '', verses: [], source: '생명의 삶 (두란노)', fromCalendar: true, song: data?.song || null };
        }
        if (!data) return json({ ok: false, error: err || '해당 날짜 QT가 없습니다' }, 404);
        const needHymn = !data.hymnNo && date === kstDateKey();
        const complete = !data.fromCalendar && !needsCommentary(data) && wordsFresh(data.words, date) && !needHymn;
        if (!data.fromCalendar && data.verses?.length && !complete) ctx.waitUntil(fillMissing(env, date, needHymn));
        return json({ ok: true, date, ...data }, 200, { 'Cache-Control': complete ? 'public, max-age=600' : 'no-cache' });
      }

      // 관리자: QT 직접 저장 (자동 수집이 틀렸을 때)
      if (path === '/api/qt' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const body = await req.json();
        if (!validDate(body.date)) return json({ ok: false, error: '날짜 형식 오류' }, 400);
        const data = { passage: body.passage || '', title: body.title || '', hymnNo: body.hymnNo ? Number(body.hymnNo) : null, hymnTitle: body.hymnTitle || '', verses: Array.isArray(body.verses) ? body.verses : [], source: '생명의 삶 (두란노)', manual: true, savedAt: new Date().toISOString() };
        if (data.hymnNo) { const h = await hymnInfo(env, data.hymnNo); if (h) { data.hymnLyrics = h.hymnLyrics; if (!data.hymnTitle) data.hymnTitle = h.hymnTitle; } }
        await env.QT_KV.put(`qt:${body.date}`, JSON.stringify(data));
        await env.QT_KV.delete(`hymn:${body.date}`);
        return json({ ok: true, date: body.date, ...data });
      }

      // 관리자: 다시 준비 (본문·해설·원어를 새로 만들고, 오늘이면 두란노에서 찬송 번호 다시 읽기)
      if (path === '/api/collect' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const date = validDate(url.searchParams.get('date')) ? url.searchParams.get('date') : kstDateKey();
        const force = url.searchParams.get('force') === '1';
        if (force) { const old = await getQT(env, date); if (!old?.manual) await env.QT_KV.delete(`qt:${date}`); await env.QT_KV.delete(`words:${date}`); }
        const r = await prepareDay(env, date);
        let hymnErr = '';
        if (date === kstDateKey()) await fetchHymn(env, date).catch(e => { hymnErr = e.message; });
        const data = await fullQT(env, date);
        return json({ ok: true, date, ...data, done: r.done, hymnErr });
      }

      // 한 달 본문 범위 (앱·관리자 확인용)
      if (path === '/api/month' && req.method === 'GET') {
        const ym = /^\d{4}-\d{2}$/.test(url.searchParams.get('ym') || '') ? url.searchParams.get('ym') : kstDateKey().slice(0, 7);
        const m = JSON.parse((await env.QT_KV.get(`cal:${ym}`)) || 'null');
        return m ? json({ ok: true, ym, days: m }, 200, { 'Cache-Control': 'public, max-age=3600' }) : json({ ok: false, error: '캘린더 없음' }, 404);
      }
      // 관리자: 캘린더 다시 읽기
      if (path === '/api/collect-month' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const ym = /^\d{4}-\d{2}$/.test(url.searchParams.get('ym') || '') ? url.searchParams.get('ym') : kstDateKey().slice(0, 7);
        const days = await collectMonth(env, ym);
        return json({ ok: true, ym, count: Object.keys(days).length, days });
      }

      // 관리자: 원본 페이지 진단 (서버가 실제로 받은 내용 확인)
      if (path === '/api/debug' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const target = url.searchParams.get('url') || '';
        if (!/^https:\/\/(www\.)?duranno\.com\//.test(target)) return json({ ok: false, error: '두란노 주소만 확인할 수 있습니다' }, 400);
        const cookie = await env.QT_KV.get('session:cookie');
        const res = await fetch(target, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko', ...(cookie ? { Cookie: cookie } : {}) } });
        const html = await decodeBody(res);
        const text = htmlToText(html);
        return json({ ok: true, status: res.status, finalUrl: res.url, htmlLength: html.length,
          hasBook: /역대상|아가/.test(text), hasLogin: /로그인/.test(text),
          scripts: [...html.matchAll(/(?:url|ajax|load|get|post)\s*\(?\s*["']([^"']*\.asp[^"']*)["']/gi)].map(m => m[1]).slice(0, 15),
          text: text.slice(0, 2500) });
      }

      // ---------- 함께 기도해요 (중보기도) ----------
      if (path === '/api/prayers' && req.method === 'GET') {
        const list = JSON.parse((await env.QT_KV.get('prayers:list')) || '[]');
        const all = url.searchParams.get('all') === '1' && isAdmin(req, env);
        return json({ ok: true, list: all ? list : list.filter(p => !p.private) }, 200, { 'Cache-Control': 'no-cache' });
      }
      if (path === '/api/prayers' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const name = String(b.name || '').trim().slice(0, 20), prayer = String(b.prayer || '').trim().slice(0, 1000);
        if (!name || prayer.length < 2) return json({ ok: false, error: '이름과 기도제목을 입력해 주세요' }, 400);
        const ip = req.headers.get('CF-Connecting-IP') || '';
        if (ip && !b.batch && await env.QT_KV.get(`prayers:ip:${ip}`)) return json({ ok: false, error: '1분 뒤에 다시 올려주세요' }, 429);
        if (ip) await env.QT_KV.put(`prayers:ip:${ip}`, '1', { expirationTtl: 60 });
        const list = JSON.parse((await env.QT_KV.get('prayers:list')) || '[]');
        const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, prayer, private: !!b.private, prayed: 0, at: b.at && !isNaN(Date.parse(b.at)) ? b.at : new Date().toISOString() };
        list.unshift(item);
        list.sort((a, z) => z.at.localeCompare(a.at));
        await env.QT_KV.put('prayers:list', JSON.stringify(list.slice(0, 300)));
        return json({ ok: true, item });
      }
      // 관리자: 기도제목 고치기 (앱 관리자 모드) — body: { id, name?, prayer?, private? } 보낸 칸만 바뀜
      if (path === '/api/prayers/edit' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => ({}));
        const list = JSON.parse((await env.QT_KV.get('prayers:list')) || '[]');
        const p = list.find(x => x.id === String(b.id || ''));
        if (!p) return json({ ok: false, error: '없는 기도제목' }, 404);
        if ('name' in b) { const n = String(b.name || '').trim().slice(0, 20); if (!n) return json({ ok: false, error: '이름을 입력해 주세요' }, 400); p.name = n; }
        if ('prayer' in b) { const t = String(b.prayer || '').trim().slice(0, 1000); if (t.length < 2) return json({ ok: false, error: '기도제목을 입력해 주세요' }, 400); p.prayer = t; }
        if ('private' in b) p.private = !!b.private;
        p.updatedAt = new Date().toISOString();
        await env.QT_KV.put('prayers:list', JSON.stringify(list));
        return json({ ok: true, item: p });
      }
      // 함께 기도했어요 (+1)
      if (path === '/api/prayers/amen' && req.method === 'POST') {
        const id = url.searchParams.get('id');
        const list = JSON.parse((await env.QT_KV.get('prayers:list')) || '[]');
        const p = list.find(x => x.id === id);
        if (!p) return json({ ok: false, error: '없는 기도제목' }, 404);
        p.prayed = (p.prayed || 0) + 1;
        await env.QT_KV.put('prayers:list', JSON.stringify(list));
        return json({ ok: true, prayed: p.prayed });
      }
      if (path === '/api/prayers' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = url.searchParams.get('id');
        const list = JSON.parse((await env.QT_KV.get('prayers:list')) || '[]').filter(x => x.id !== id);
        await env.QT_KV.put('prayers:list', JSON.stringify(list));
        return json({ ok: true });
      }

      // ---------- 교회 소식 ----------
      if (path === '/api/news' && req.method === 'GET') {
        const list = JSON.parse((await env.QT_KV.get('news:list')) || '[]');
        return json({ ok: true, list }, 200, { 'Cache-Control': 'no-cache' });
      }
      if (path === '/api/news' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => ({}));
        const title = String(b.title || '').trim().slice(0, 80), body = String(b.body || '').trim().slice(0, 3000);
        if (!title) return json({ ok: false, error: '제목을 넣어주세요' }, 400);
        const list = JSON.parse((await env.QT_KV.get('news:list')) || '[]');
        const id = b.id || Date.now().toString(36);
        const old = list.find(n => n.id === id);
        // 사진 여러 장 (주보는 여러 페이지): keep = 남길 사진 주소, imagesData = 새 사진
        const before = old?.images || (old?.img ? [old.img] : []);
        let images = Array.isArray(b.keep) ? before.filter(u => b.keep.includes(u)) : before;
        for (const u of before.filter(u => !images.includes(u))) { const kk = (u.match(/news-img\/([\w-]+)/) || [])[1]; if (kk) await env.QT_KV.delete(`news:img:${kk}`); }
        for (const data of (b.imagesData || []).slice(0, 12)) {
          const key = `${id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
          await env.QT_KV.put(`news:img:${key}`, dataUrlBytes(data));
          images.push(`/news-img/${key}`);
        }
        const kind = ['bulletin', 'event'].includes(b.kind) ? b.kind : 'news';
        const eventDate = kind === 'event' && validDate(b.eventDate) ? b.eventDate : '';
        const item = { id, kind, eventDate, title, body, images, pin: !!b.pin, at: old?.at || new Date().toISOString(), updatedAt: new Date().toISOString() };
        const rest = list.filter(n => n.id !== id);
        rest.unshift(item);
        rest.sort((a, z) => (z.pin - a.pin) || z.at.localeCompare(a.at));
        await env.QT_KV.put('news:list', JSON.stringify(rest.slice(0, 50)));
        return json({ ok: true, item });
      }
      if (path === '/api/news' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = url.searchParams.get('id');
        const list = JSON.parse((await env.QT_KV.get('news:list')) || '[]');
        const gone = list.find(n => n.id === id);
        for (const u of (gone?.images || (gone?.img ? [gone.img] : []))) { const k2 = (u.match(/news-img\/([\w-]+)/) || [])[1]; if (k2) await env.QT_KV.delete(`news:img:${k2}`); }
        await env.QT_KV.put('news:list', JSON.stringify(list.filter(n => n.id !== id)));
        return json({ ok: true });
      }
      const ni = path.match(/^\/news-img\/([\w-]+)$/);
      if (ni && req.method === 'GET') {
        const body = await env.QT_KV.get(`news:img:${ni[1]}`, 'arrayBuffer');
        if (!body) return new Response('사진 없음', { status: 404, headers: CORS });
        return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000', ...CORS } });
      }

      // ---------- 주간사역 갤러리 (관리자 페이지 ⑨ · 앱 관리자 모드에서 올림, 앱은 GET /api/gallery 로 받아감) ----------
      // 목록 (누구나)
      if (path === '/api/gallery' && req.method === 'GET') {
        const [list, video] = await Promise.all([galleryList(env), videoMeta(env)]);
        return json({ ok: true, list, video: video || null }, 200, { 'Cache-Control': 'no-cache' });
      }
      // ---------- 주간사역 영상 (1개 — 새로 올리면 지난 영상 삭제) ----------
      if (path === '/api/gallery-video' && req.method === 'GET') {
        return json({ ok: true, video: (await videoMeta(env)) || null }, 200, { 'Cache-Control': 'no-cache' });
      }
      // 관리자: 압축된 영상 올리기 — body 는 영상 바이트, Content-Type 은 video/mp4 또는 video/webm, ?title=&dur=초
      if (path === '/api/gallery-video' && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
        if (!/^video\/(mp4|webm|quicktime)$/.test(type)) return json({ ok: false, error: '영상 형식 오류 (mp4 또는 webm)' }, 400);
        const buf = await req.arrayBuffer();
        if (buf.byteLength < 1000) return json({ ok: false, error: '영상 파일이 비어 있습니다' }, 400);
        if (buf.byteLength > VIDEO_MAX) return json({ ok: false, error: `영상이 너무 큽니다 (${(buf.byteLength / 1048576).toFixed(1)}MB — 25MB 이하로 압축해 주세요)` }, 400);
        const at = Date.now().toString(36);
        await env.QT_KV.put('gallery:video', buf);
        const meta = { type, size: buf.byteLength, dur: Number(url.searchParams.get('dur')) || 0, title: String(url.searchParams.get('title') || '').trim().slice(0, 80), at, src: `/gallery-video?v=${at}`, poster: '' };
        const oldMeta = await videoMeta(env);
        if (oldMeta?.poster) { await env.QT_KV.delete('gallery:video:poster'); }   // 지난 영상 표지는 지움 (새 표지는 따로 올림)
        await env.QT_KV.put('gallery:video:meta', JSON.stringify(meta));
        return json({ ok: true, video: meta });
      }
      // 관리자: 영상 표지(첫 장면) JPEG 올리기
      if (path === '/api/gallery-poster' && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const meta = await videoMeta(env);
        if (!meta) return json({ ok: false, error: '먼저 영상을 올려 주세요' }, 400);
        const buf = await req.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > 2 * 1024 * 1024) return json({ ok: false, error: '표지 크기 오류' }, 400);
        await env.QT_KV.put('gallery:video:poster', buf);
        meta.poster = `/gallery-poster?v=${meta.at}`;
        await env.QT_KV.put('gallery:video:meta', JSON.stringify(meta));
        return json({ ok: true, video: meta });
      }
      if (path === '/api/gallery-video' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        await env.QT_KV.delete('gallery:video'); await env.QT_KV.delete('gallery:video:poster'); await env.QT_KV.delete('gallery:video:meta');
        return json({ ok: true });
      }
      // 재생 (앱 <video> 태그) — Range 지원
      if (path === '/gallery-video' && (req.method === 'GET' || req.method === 'HEAD')) {
        const meta = await videoMeta(env);
        const buf = meta && await env.QT_KV.get('gallery:video', 'arrayBuffer');
        if (!buf) return new Response('영상 없음', { status: 404, headers: CORS });
        return rangeResponse(buf, meta.type || 'video/mp4', req, { 'Cache-Control': 'public, max-age=2592000' });
      }
      if (path === '/gallery-poster' && req.method === 'GET') {
        const body = await env.QT_KV.get('gallery:video:poster', 'arrayBuffer');
        if (!body) return new Response('표지 없음', { status: 404, headers: CORS });
        return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000', ...CORS } });
      }
      // 관리자: 사진 묶음 올리기·고치기 — body: { id?(고칠 묶음), date, title, body?, keep?(남길 사진 주소), imagesData?(새 사진 data:image/jpeg;base64,…) }
      if (path === '/api/gallery' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json().catch(() => ({}));
        const title = String(b.title || '').trim().slice(0, 80), body = String(b.body || '').trim().slice(0, 1000);
        if (!title) return json({ ok: false, error: '제목을 넣어주세요' }, 400);
        const list = await galleryList(env);
        const id = b.id || Date.now().toString(36);
        const old = list.find(g => g.id === id);
        const date = validDate(b.date) ? b.date : (old?.date || kstDateKey());
        // 새 묶음이면 지난 묶음은 전부 사진까지 지움 (같은 묶음을 고칠 때는 그대로)
        if (!old && GALLERY_MAX <= 1) for (const g of list) await galleryDropImages(env, g.images);
        const before = old?.images || [];
        const images = Array.isArray(b.keep) ? before.filter(u => b.keep.includes(u)) : before.slice();
        await galleryDropImages(env, before.filter(u => !images.includes(u)));        // 빼기로 한 사진 삭제
        for (const data of (b.imagesData || []).slice(0, 30)) {
          const key = `${id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
          await env.QT_KV.put(`gallery:img:${key}`, dataUrlBytes(data));
          images.push(`/gallery-img/${key}`);
        }
        if (!images.length) return json({ ok: false, error: '사진을 한 장 이상 넣어주세요' }, 400);
        const item = { id, date, title, body, images, at: old?.at || new Date().toISOString(), updatedAt: new Date().toISOString() };
        const rest = (!old && GALLERY_MAX <= 1) ? [] : list.filter(g => g.id !== id);
        rest.unshift(item);
        rest.sort((a, z) => String(z.date || '').localeCompare(String(a.date || '')) || String(z.at || '').localeCompare(String(a.at || '')));
        for (const g of rest.slice(GALLERY_MAX)) await galleryDropImages(env, g.images);   // 보관 개수를 넘는 오래된 묶음은 사진까지 정리
        await env.QT_KV.put('gallery:list', JSON.stringify(rest.slice(0, GALLERY_MAX)));
        return json({ ok: true, item });
      }
      // 관리자: 사진 묶음 지우기 (사진도 함께)
      if (path === '/api/gallery' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = url.searchParams.get('id');
        const list = await galleryList(env);
        const gone = list.find(g => g.id === id);
        if (!gone) return json({ ok: false, error: '없는 갤러리입니다' }, 404);
        await galleryDropImages(env, gone.images);
        await env.QT_KV.put('gallery:list', JSON.stringify(list.filter(g => g.id !== id)));
        return json({ ok: true, count: list.length - 1 });
      }
      const gi = path.match(/^\/gallery-img\/([\w-]+)$/);
      if (gi && req.method === 'GET') {
        const body = await env.QT_KV.get(`gallery:img:${gi[1]}`, 'arrayBuffer');
        if (!body) return new Response('사진 없음', { status: 404, headers: CORS });
        return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000', ...CORS } });
      }

      // ---------- 오늘의 찬양 CCM으로 바꾸기 ----------
      const si = path.match(/^\/song-img\/(\d{4}-\d{2}-\d{2})$/);
      if (si && req.method === 'GET') {
        const body = await env.QT_KV.get(`song:img:${si[1]}`, 'arrayBuffer');
        if (!body) return new Response('악보 없음', { status: 404, headers: CORS });
        return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000', ...CORS } });
      }
      if (si && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const buf = await req.arrayBuffer();
        if (buf.byteLength > 20 * 1024 * 1024) return json({ ok: false, error: '파일이 너무 큽니다' }, 400);
        await env.QT_KV.put(`song:img:${si[1]}`, buf, { expirationTtl: 60 * 60 * 24 * 400 });
        return json({ ok: true });
      }
      if (path === '/api/song' && (req.method === 'POST' || req.method === 'DELETE')) {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const date = url.searchParams.get('date');
        if (!validDate(date)) return json({ ok: false, error: '날짜 형식 오류' }, 400);
        if (req.method === 'DELETE') { await env.QT_KV.delete(`song:${date}`); await env.QT_KV.delete(`song:img:${date}`); return json({ ok: true }); }
        const b = await req.json().catch(() => ({}));
        const title = String(b.title || '').trim().slice(0, 60);
        if (!title) return json({ ok: false, error: '제목을 넣어주세요' }, 400);
        const old = JSON.parse((await env.QT_KV.get(`song:${date}`)) || 'null');
        const img = b.hasImg ? `/song-img/${date}?v=${Date.now().toString(36)}` : (old?.img || '');
        const song = { type: 'ccm', title, img, savedAt: new Date().toISOString() };
        await env.QT_KV.put(`song:${date}`, JSON.stringify(song), { expirationTtl: 60 * 60 * 24 * 400 });
        return json({ ok: true, song });
      }
      // 관리자: 악보 사진에서 제목 읽기 (Workers AI 그림 읽기 모델)
      if (path === '/api/read-title' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        if (!env.AI) return json({ ok: false, error: 'Workers AI 바인딩(AI)이 없습니다' }, 400);
        const bytes = [...new Uint8Array(await req.arrayBuffer())];
        return json(await readTitle(env, bytes));
      }

      // 관리자: AI 해설 다시 쓰기
      if (path === '/api/commentary' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const date = validDate(url.searchParams.get('date')) ? url.searchParams.get('date') : kstDateKey();
        return json({ ok: true, date, commentary: await makeCommentary(env, date, true) });
      }
      // 관리자: AI 원어 해설 다시 쓰기
      if (path === '/api/words' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const date = validDate(url.searchParams.get('date')) ? url.searchParams.get('date') : kstDateKey();
        return json({ ok: true, date, words: await makeWords(env, date) });
      }

      // 관리자: 두란노 로그인 테스트
      if (path === '/api/login-test' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const cookie = await login(env);
        return json({ ok: true, message: `로그인 쿠키 ${cookie.split(';').length}개를 받았습니다` });
      }

      // 악보 이미지
      const sm = path.match(/^\/score\/(\d{1,3})$/);
      if (sm) {
        const key = `scores/${Number(sm[1])}.jpg`;
        if (req.method === 'GET') {
          const body = env.SCORES ? (await env.SCORES.get(key))?.body : await env.QT_KV.get(key, 'arrayBuffer');
          if (!body) return new Response('악보 없음', { status: 404, headers: CORS });
          return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000', ...CORS } });
        }
        if (req.method === 'PUT') {
          if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
          if (env.SCORES) await env.SCORES.put(key, req.body, { httpMetadata: { contentType: 'image/jpeg' } });
          else {
            const buf = await req.arrayBuffer();
            if (buf.byteLength > 20 * 1024 * 1024) return json({ ok: false, error: '파일이 너무 큽니다' }, 400);
            await env.QT_KV.put(key, buf);
          }
          return json({ ok: true, hymnNo: Number(sm[1]) });
        }
      }

      // 올라가 있는 악보 번호 목록
      if (path === '/api/scores') {
        const nums = []; let cursor;
        if (env.SCORES) {
          do { const r = await env.SCORES.list({ prefix: 'scores/', cursor }); r.objects.forEach(o => nums.push(Number(o.key.match(/(\d+)\.jpg$/)?.[1]))); cursor = r.truncated ? r.cursor : null; } while (cursor);
        } else {
          do { const r = await env.QT_KV.list({ prefix: 'scores/', cursor }); r.keys.forEach(k => nums.push(Number(k.name.match(/(\d+)\.jpg$/)?.[1]))); cursor = r.list_complete ? null : r.cursor; } while (cursor);
        }
        return json({ ok: true, scores: nums.filter(Boolean).sort((a, b) => a - b) });
      }

      if (path === '/admin') return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      // 선교기도 목록 (앱이 받아감)
      if (path === '/api/mission' && req.method === 'GET') {
        const list = JSON.parse((await env.QT_KV.get('mission:list')) || '[]');
        return json({ ok: true, list }, 200, { 'Cache-Control': 'no-cache' });
      }
      // 관리자: 선교기도 추가·수정 (id가 있으면 수정)
      if (path === '/api/mission' && req.method === 'POST') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const b = await req.json();
        b.field = String(b.field || '');   // 선교지 이름 없이 이미지만 올려도 됨
        const list = JSON.parse((await env.QT_KV.get('mission:list')) || '[]');
        const id = b.id || Date.now().toString(36);
        const old = list.find(m => m.id === id);
        // 사진 여러 장: 남길 사진(keep) + 새로 올린 사진(imagesData)
        let images = Array.isArray(b.keep) ? b.keep : (old?.images || (old?.img ? [old.img] : []));
        const removed = (old?.images || []).filter(u => !images.includes(u));
        for (const u of removed) { const k = (u.match(/mission-img\/([\w-]+)/) || [])[1]; if (k) await env.QT_KV.delete(`mission:img:${k}`); }
        for (const data of (b.imagesData || []).slice(0, 20)) {   // data:image/jpeg;base64,...
          const key = `${id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          await env.QT_KV.put(`mission:img:${key}`, dataUrlBytes(data));
          images.push(`/mission-img/${key}`);
        }
        const month = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : (old?.month || '');
        const item = { id, field: b.field, missionary: b.missionary || '', month, items: (b.items || []).map(x => String(x).trim()).filter(Boolean), note: b.note || '', images, updatedAt: new Date().toISOString() };
        const idx = list.findIndex(m => m.id === id);
        idx >= 0 ? (list[idx] = item) : list.push(item);
        await env.QT_KV.put('mission:list', JSON.stringify(list));
        return json({ ok: true, item });
      }
      // 관리자: 선교기도 삭제
      if (path === '/api/mission' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = url.searchParams.get('id');
        const all = JSON.parse((await env.QT_KV.get('mission:list')) || '[]');
        const gone = all.find(m => m.id === id);
        for (const u of (gone?.images || (gone?.img ? [gone.img] : []))) { const k = (u.match(/mission-img\/([\w-]+)/) || [])[1]; if (k) await env.QT_KV.delete(`mission:img:${k}`); }
        await env.QT_KV.put('mission:list', JSON.stringify(all.filter(m => m.id !== id)));
        return json({ ok: true });
      }
      // 유튜브 설교 목록 (교회 채널 최신 영상, 1시간마다 새로 읽음)
      if (path === '/api/sermons' && req.method === 'GET') {
        const cached = JSON.parse((await env.QT_KV.get('sermons:list')) || 'null');
        if (cached && Date.now() - cached.at < 60 * 60 * 1000 && url.searchParams.get('fresh') !== '1')
          return json({ ok: true, list: cached.list }, 200, { 'Cache-Control': 'public, max-age=600' });
        try {
          const list = await fetchSermons(env);
          await env.QT_KV.put('sermons:list', JSON.stringify({ at: Date.now(), list }));
          return json({ ok: true, list }, 200, { 'Cache-Control': 'public, max-age=600' });
        } catch (e) {
          if (cached) return json({ ok: true, list: cached.list, stale: true });   // 유튜브가 안 되면 지난 목록이라도
          return json({ ok: false, error: e.message }, 502);
        }
      }

      // 오늘도 감사 — 목록
      if (path === '/api/thanks' && req.method === 'GET') {
        const list = JSON.parse((await env.QT_KV.get('thanks:list')) || '[]');
        return json({ ok: true, list }, 200, { 'Cache-Control': 'no-cache' });
      }
      // 오늘도 감사 — 글 올리기 (누구나)
      if (path === '/api/thanks' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const text = String(b.text || '').trim().slice(0, 500);
        const name = String(b.name || '').trim().slice(0, 20) || '익명';
        if (text.length < 2) return json({ ok: false, error: '감사 내용을 적어주세요' }, 400);
        const ip = req.headers.get('CF-Connecting-IP') || '';
        if (ip && await env.QT_KV.get(`thanks:ip:${ip}`)) return json({ ok: false, error: '1분 뒤에 다시 올려주세요' }, 429);
        if (ip) await env.QT_KV.put(`thanks:ip:${ip}`, '1', { expirationTtl: 60 });
        const list = JSON.parse((await env.QT_KV.get('thanks:list')) || '[]');
        list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, text, at: new Date().toISOString() });
        await env.QT_KV.put('thanks:list', JSON.stringify(list.slice(0, 200)));   // 최근 200개까지 보관
        return json({ ok: true });
      }
      // 관리자: 감사 글 지우기
      if (path === '/api/thanks' && req.method === 'DELETE') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const id = url.searchParams.get('id');
        const list = JSON.parse((await env.QT_KV.get('thanks:list')) || '[]').filter(t => t.id !== id);
        await env.QT_KV.put('thanks:list', JSON.stringify(list));
        return json({ ok: true, count: list.length });
      }

      // 선교 사진
      const mi =path.match(/^\/mission-img\/([\w-]+)$/);
      if (mi && req.method === 'GET') {
        const body = await env.QT_KV.get(`mission:img:${mi[1]}`, 'arrayBuffer');
        if (!body) return new Response('사진 없음', { status: 404, headers: CORS });
        return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000', ...CORS } });
      }

      // 카톡·문자 링크 미리보기용 대표 이미지
      if ((path === '/og.jpg') && req.method === 'GET') {
        const body = await env.QT_KV.get('og:image', 'arrayBuffer');
        if (!body) return new Response('대표 이미지 없음', { status: 404 });
        return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
      }
      if (path === '/api/og' && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const buf = await req.arrayBuffer();
        if (buf.byteLength > 5 * 1024 * 1024) return json({ ok: false, error: '5MB 이하 이미지로 올려주세요' }, 400);
        await env.QT_KV.put('og:image', buf);
        return json({ ok: true, size: buf.byteLength });
      }

      // 성도용 QT 앱 (관리자 페이지에서 올린 HTML 파일)
      if ((path === '/' || path === '/app') && req.method === 'GET') {
        const app = await env.QT_KV.get('app:html');
        if (!app) return new Response('<meta charset="utf-8"><p style="font:18px sans-serif;padding:30px">QT 앱 준비 중입니다. 관리자 페이지에서 앱 파일을 올려주세요.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        return new Response(app, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
      }
      // 관리자: QT 앱 파일 올리기
      if (path === '/api/app' && req.method === 'PUT') {
        if (!isAdmin(req, env)) return json({ ok: false, error: '권한 없음' }, 401);
        const html = await req.text();
        if (!/<html/i.test(html)) return json({ ok: false, error: 'HTML 파일이 아닙니다' }, 400);
        await env.QT_KV.put('app:html', html);
        return json({ ok: true, size: html.length });
      }
      if (path === '/status') return json({ ok: true, service: '예수비전교회 QT 서버', today: kstDateKey() });
      // 마지막 자동 실행 기록 (자동 실행이 돌았는지, 왜 실패했는지 확인용)
      if (path === '/api/last-run') {
        const log = JSON.parse((await env.QT_KV.get('log:last-run')) || 'null');
        return json(log ? { ok: true, ...log } : { ok: false, error: '자동 수집이 한 번도 실행되지 않았습니다 (Cron 트리거 등록 확인)' }, 200, { 'Cache-Control': 'no-cache' });
      }
      return json({ ok: false, error: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  },

  // 자동 실행 — Cloudflare 대시보드 > 설정 > 트리거 > Cron 에 "*/10 20-22 * * *" 등록
  //   (UTC 20:00~22:50 = 한국시간 오전 5:00~7:50, 10분마다)
  //   ① 오늘 QT 확인(없으면 준비) ② 두란노에 오늘 찬송이 올라오면 번호 읽기 ③ 앞으로 40일 중 준비 안 된 날 1일씩 미리 준비
  async scheduled(event, env, ctx) {
    const today = kstDateKey();
    ctx.waitUntil((async () => {
      const log = { at: new Date().toISOString(), date: today };
      await env.QT_KV.put('log:last-run', JSON.stringify({ ...log, today: '실행 중…' }), { expirationTtl: 60 * 60 * 24 * 30 });
      // 캘린더: 이번 달, 15일 이후엔 다음 달도
      const ym = today.slice(0, 7);
      if (!(await env.QT_KV.get(`cal:${ym}`))) await collectMonth(env, ym).catch(e => console.log('캘린더 실패:', e.message));
      if (Number(today.slice(8, 10)) >= 15) {
        const d = new Date(today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1);
        const next = d.toISOString().slice(0, 7);
        if (!(await env.QT_KV.get(`cal:${next}`))) await collectMonth(env, next).catch(() => {});
      }
      // ① 오늘
      try { const r = await prepareDay(env, today); log.today = `준비됨: ${r.passage} / ${r.verses}절${r.done.length ? ' / 새로 만든 것: ' + r.done.join(', ') : ''}`; }
      catch (e) { log.today = '실패: ' + e.message; }
      // ② 오늘 찬송 (두란노에서 번호만 → 찬송가 파일에서 가사)
      const hy = await getJSON(env, `hymn:${today}`), cur = await getQT(env, today);
      if (hy || cur?.hymnNo) log.hymn = `찬송 ${hy?.hymnNo || cur.hymnNo}장 있음`;
      else { try { const h = await fetchHymn(env, today); log.hymn = `찬송 ${h.hymnNo}장 ${h.hymnTitle}`; } catch (e) { log.hymn = '찬송 아직: ' + e.message; } }
      // ③ 미리 준비 (한 번에 1일 — 10분마다 돌아서 하루에 18일씩 준비됨)
      log.ahead = '앞으로 40일 모두 준비됨';
      for (let i = 1; i <= 40; i++) {
        const d = kstDateKey(new Date(Date.now() + i * 864e5));
        if (!(await calendarPassage(env, d))) continue;
        const q = await getQT(env, d);
        if (q && q.verses?.length && !needsCommentary(q) && (await wordsReady(env, d))) continue;
        try { const r = await prepareDay(env, d); log.ahead = `${d} 준비: ${r.passage}${r.done.length ? ' / ' + r.done.join(', ') : ''}`; }
        catch (e) { log.ahead = `${d} 준비 실패: ${e.message}`; }
        break;
      }
      await env.QT_KV.put('log:last-run', JSON.stringify(log), { expirationTtl: 60 * 60 * 24 * 30 });
    })());
  },
};

// ---------- 관리자 페이지 ----------
export const ADMIN_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QT 서버 관리</title><style>
body{margin:0;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f3f6fa;color:#14213a}
main{max-width:520px;margin:0 auto;padding:18px 14px 60px}h1{font-size:22px;color:#123b6d}
section{background:#fff;border-radius:16px;padding:16px;margin:14px 0;box-shadow:0 3px 14px rgba(20,50,90,.08)}
h2{font-size:17px;margin:0 0 10px}label{display:block;font-weight:700;font-size:14px;margin:10px 0 5px}
input,textarea,select{width:100%;box-sizing:border-box;padding:11px;border:1px solid #d5deea;border-radius:10px;font-size:16px;background:#fff}
button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:11px;background:#1d6fd6;color:#fff;font-size:16px;font-weight:800}
button.sub{background:#e9f1fb;color:#1d6fd6}.msg{font-size:14px;color:#3a5;white-space:pre-wrap;margin-top:8px}
img{max-width:100%;border:1px solid #e3e8ef;border-radius:8px;margin-top:10px}.row{display:flex;gap:8px;align-items:center;font-size:14px;margin-top:8px}.row input{width:auto}
#plist td{padding:5px 3px}
#blist td{padding:7px 3px;border-top:1px solid #eef;vertical-align:middle}
button.del{width:auto;margin:0;padding:7px 10px;font-size:13px;background:#fdecec;color:#c33}
</style></head><body><main>
<h1>QT 서버 관리</h1>
<section><label>관리자 비밀번호</label><input id="tk" type="password" placeholder="ADMIN_TOKEN"><div id="tkm" class="msg"></div></section>

<section><h2>① 한 달치 QT 미리 준비</h2>
<p style="font-size:13px;color:#557;margin:0 0 6px">본문 범위는 두란노 QT 캘린더, 성경 본문은 아래 성경 파일, 소제목·해설·묵상·기도·원어는 AI가 만듭니다. 찬송은 그날 아침 두란노에서 번호만 읽고 가사는 찬송가 파일에서 가져옵니다.</p>
<label>개역개정 성경 파일 (개역개정판NKRV.txt) — 처음 한 번만</label><input id="bf" type="file" accept=".txt,text/plain">
<button class="sub" id="bup">성경 올리기</button><div id="m11" class="msg"></div>
<label>새찬송가 파일 (새찬송가.txt) — 처음 한 번만</label><input id="hf" type="file" accept=".txt,text/plain">
<button class="sub" id="hup">찬송가 올리기</button><div id="m13" class="msg"></div>
<label style="margin-top:18px">준비할 달</label><input id="pym" type="month">
<button id="pm">이 달 전체 미리 준비 (본문·해설·원어)</button><div id="m12" class="msg"></div>
<p style="font-size:12px;color:#889;margin:6px 0 0">하루에 30초~1분 걸립니다. 이 화면을 켜 두세요. 중간에 닫아도 자동 실행(매일 새벽)이 남은 날을 이어서 준비합니다.</p>
<div id="plist"></div></section>

<section><h2>② 악보 올리기</h2>
<label>찬송 번호</label><input id="no" type="number" inputmode="numeric" placeholder="예: 384">
<label>악보 사진/캡처</label><input id="file" type="file" accept="image/*">
<div class="row" style="color:#557">검은 악보는 자동으로 흰 바탕·검은 글씨로 바뀌고, 휴대폰 화면 캡처는 악보 부분만 잘라 올립니다.</div>
<div class="row">위쪽 잘라내기 <input id="crop" type="number" value="0" style="width:80px"> %</div>
<img id="pv" hidden><button id="up">악보 올리기</button><div id="m1" class="msg"></div>
<button class="sub" id="list">올라간 악보 번호 보기</button><div id="m4" class="msg"></div></section>

<section><h2>③ QT 앱 파일 올리기</h2>
<label>예수비전교회_QT_자동갱신.html 선택</label><input id="appf" type="file" accept=".html,text/html">
<button id="appup">앱 올리기</button><div id="m0" class="msg"></div>
<p style="font-size:13px;color:#667">올린 뒤 성도용 주소: <b id="appurl"></b></p>
<label>링크 대표 이미지 (카톡 미리보기, 가로형 1200×630 권장)</label><input id="ogf" type="file" accept="image/*">
<button class="sub" id="ogup">대표 이미지 올리기</button><div id="m6" class="msg"></div><img id="ogpv" hidden></section>

<section><h2>④ 스마트요람 명단·사진</h2>
<label>스마트요람_데이터.json 선택 (명단과 사진이 한 파일에 들어 있습니다)</label><input id="yf" type="file" accept=".json,application/json">
<button id="yup">명단·사진 올리기</button><div id="m8" class="msg"></div>
<label style="margin-top:18px">사진 바꾸기 — 이름 검색</label><input id="ys" placeholder="이름 입력 (예: 김상성)">
<div id="yres"></div>
<label>새 사진</label><input id="yp" type="file" accept="image/*"><img id="ypv" hidden style="width:120px">
<input id="yid" type="hidden"><button class="sub" id="ypup">선택한 분 사진 바꾸기</button><div id="m9" class="msg"></div>
<div class="row" style="margin-top:14px"><input id="ylunar" type="checkbox"> <b>음력 생일</b> (선택한 분 — 체크하면 매년 양력 날짜로 바꿔서 생일 칸에 표시)</div>
<button class="sub" id="ylsave">음력/양력 저장</button><div id="m10" class="msg"></div>
<button class="del" id="ydel" style="width:100%;margin-top:12px;padding:12px;font-size:15px">선택한 분 명단에서 삭제 (전출)</button><div id="m15" class="msg"></div>
<label style="margin-top:22px">🎂 달별 생일자 명단</label>
<select id="bm"><option value="01">1월</option><option value="02">2월</option><option value="03">3월</option><option value="04">4월</option><option value="05">5월</option><option value="06">6월</option><option value="07">7월</option><option value="08">8월</option><option value="09">9월</option><option value="10">10월</option><option value="11">11월</option><option value="12">12월</option></select>
<p style="font-size:12px;color:#889;margin:6px 0 0">음력 생일은 명단에 적힌 음력 날짜 기준으로 나옵니다. 전출하신 분은 [삭제]를 누르면 명단·사진에서 빠집니다.</p>
<div id="blist"></div><div id="m14" class="msg"></div></section>


<section><h2>⑤ 교회 소식 · 주보 올리기</h2>
<div class="row" style="gap:16px"><label style="margin:0;font-weight:700"><input type="radio" name="nkind" value="bulletin" checked style="width:auto"> 📰 주보</label><label style="margin:0;font-weight:700"><input type="radio" name="nkind" value="news" style="width:auto"> 📢 소식</label><label style="margin:0;font-weight:700"><input type="radio" name="nkind" value="event" style="width:auto"> 📅 행사</label></div>
<div id="nedw" style="display:none"><label>행사 날짜</label><input id="ned" type="date"></div>
<label>제목</label><input id="nt">
<label>내용 (선택 — 광고 내용 등)</label><textarea id="nb" rows="5"></textarea>
<label>주보 파일 — PDF 또는 사진 여러 장 (끌어다 놓아도 됩니다)</label>
<div id="ndrop" style="border:2px dashed #b9cbe3;border-radius:12px;padding:18px;text-align:center;color:#557;background:#f7faff">여기로 파일을 끌어다 놓거나 <b>눌러서 선택</b><input id="nf" type="file" accept="image/*,application/pdf" multiple style="display:none"></div>
<div id="npv" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px"></div>
<div class="row"><input id="npin" type="checkbox"> 📌 맨 위에 고정</div>
<input id="nid" type="hidden"><button id="nsv">올리기</button><button class="sub" id="nnew">새로 쓰기 (입력칸 비우기)</button>
<div id="m7" class="msg"></div><div id="nlist"></div></section>

<section><h2>⑥ 하루 QT 다시 준비</h2><label>날짜</label><input id="cd" type="date">
<button id="col">다시 준비 (본문·해설·원어 새로 만들기)</button><button class="sub" id="cm">이번 달 캘린더 읽기</button><button class="sub" id="cmt">AI 해설만 다시 쓰기</button><button class="sub" id="wd">AI 원어만 다시 쓰기</button><button class="sub" id="lr">자동 실행 기록 보기</button><button class="sub" id="dg">캘린더 페이지 진단</button><button class="sub" id="lt">두란노 로그인 테스트</button><div id="m2" class="msg"></div></section>

<section><h2>⑦ QT 직접 입력 (자동 수집이 틀렸을 때)</h2>
<label>날짜</label><input id="d" type="date"><label>본문 범위</label><input id="p" placeholder="역대상 18:9–17">
<label>소제목</label><input id="t"><label>찬송 번호</label><input id="h" type="number"><label>찬송 제목</label><input id="ht">
<label>성경 본문 (한 줄에 한 절, "9 하맛 왕 ..." 형식)</label><textarea id="v" rows="8"></textarea>
<button id="sv">저장</button><div id="m3" class="msg"></div></section>

<section><h2>⑧ 선교기도 이미지 (매달)</h2>
<p style="font-size:13px;color:#557;margin:0 0 6px">이번 달 선교기도 이미지(사진 또는 PDF)만 올리면 앱 <b>선교기도</b> 칸에 그대로 나옵니다.</p>
<div id="mcur" style="font-weight:800;margin:8px 0 4px"></div>
<div id="mpv" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0 10px"></div>
<div id="mdrop" style="border:2px dashed #b9cbe3;border-radius:12px;padding:18px;text-align:center;color:#557;background:#f7faff">새 이미지를 여기로 끌어다 놓거나 <b>눌러서 선택</b><br><small>사진 여러 장 · PDF(쪽마다 한 장으로 바뀜) · 파일 이름을 1, 2, 3 으로 붙이면 1번이 맨 위에 나옵니다</small><input id="mp" type="file" accept="image/*,application/pdf" multiple style="display:none"></div>
<div class="row" id="mrepw" style="display:none"><input id="mrep" type="checkbox" checked> <b>지난 이미지는 지우고 새 이미지로 바꾸기</b></div>
<button id="msv">선교기도 이미지 올리기</button><div id="m5" class="msg"></div></section>

<section><h2>⑨ 주간사역 갤러리 사진 올리기</h2>
<p style="font-size:13px;color:#557;margin:0 0 6px">한 주 사역 사진을 한 묶음으로 올리면 앱 <b>주간사역 갤러리</b>에 바로 나옵니다. <b>새 묶음을 올리면 지난 묶음은 자동으로 지워집니다.</b> 휴대폰 앱의 관리자 모드에서도 똑같이 올리고 고칠 수 있습니다.</p>
<label>날짜</label><input id="gd" type="date">
<label>제목</label><input id="gt" placeholder="예: 10월 둘째 주 주간사역">
<label>설명 (선택)</label><textarea id="gb" rows="3"></textarea>
<label>사진 여러 장 또는 PDF (끌어다 놓아도 됩니다)</label>
<div id="gdrop" style="border:2px dashed #b9cbe3;border-radius:12px;padding:18px;text-align:center;color:#557;background:#f7faff">여기로 사진을 끌어다 놓거나 <b>눌러서 선택</b><input id="gf" type="file" accept="image/*,application/pdf" multiple style="display:none"></div>
<div id="gpv" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px"></div>
<input id="gid" type="hidden"><button id="gsv">갤러리 올리기</button><button class="sub" id="gnew">새로 쓰기 (입력칸 비우기)</button>
<div id="m16" class="msg"></div><div id="glist"></div>
<h2 style="margin-top:22px">🎬 주간사역 영상 (갤러리 아래 재생 칸)</h2>
<p style="font-size:13px;color:#557;margin:0 0 6px">영상 파일을 고르면 이 브라우저가 <b>720p로 자동 압축</b>한 뒤 올립니다 (1분 영상에 약 1분, 이 화면을 켜 둔 채 기다리세요). <b>새 영상을 올리면 지난 영상은 자동으로 지워집니다.</b> 4분 이하 영상만 됩니다.</p>
<div id="vcur" class="msg" style="color:#334"></div>
<label>영상 파일 (mp4, mov 등 — 휴대폰에서 찍은 그대로)</label><input id="vf" type="file" accept="video/*">
<label>제목 (선택)</label><input id="vt" placeholder="예: 10월 둘째 주 사역 영상">
<video id="vpv" style="width:100%;max-height:260px;background:#000;border-radius:10px;margin-top:8px;display:none" controls playsinline></video>
<canvas id="vcv" style="display:none"></canvas>
<button id="vup">압축해서 올리기</button><button class="sub del" id="vdel" style="width:100%;margin-top:8px;padding:12px;font-size:15px">지금 올라간 영상 삭제</button>
<div id="m17" class="msg"></div></section>

<section><h2>⑩ 셀리더교제 자료 올리기</h2>
<p style="font-size:13px;color:#557;margin:0 0 6px">앱 첫 화면 <b>셀리더교제</b> 칸에 들어가면(비밀번호 0109) 여기서 올린 글과 파일이 보입니다. 사진·PDF는 화면에 바로 펼쳐지고, 모든 파일은 내려받을 수 있습니다. <b>새 자료를 올리면 지난 자료는 자동으로 지워집니다.</b> 파일 하나 25MB 이하.</p>
<label>제목</label><input id="ct" placeholder="예: 10월 셀리더 교재">
<label>내용 (선택)</label><textarea id="cb" rows="3"></textarea>
<label>파일 (사진·PDF·한글·엑셀 등 여러 개 — 끌어다 놓아도 됩니다)</label>
<p style="font-size:12px;color:#889;margin:0 0 6px">사진과 PDF만 앱 화면에 쪽마다 펼쳐집니다. 한글(hwp)·워드·엑셀은 내려받기만 되므로, 화면에 보이게 하려면 한글에서 「파일 → PDF로 저장」한 PDF를 함께 올리세요.</p>
<div id="cdrop" style="border:2px dashed #b9cbe3;border-radius:12px;padding:18px;text-align:center;color:#557;background:#f7faff">여기로 파일을 끌어다 놓거나 <b>눌러서 선택</b><input id="cf" type="file" multiple style="display:none"></div>
<div id="cfl" style="margin-top:8px;font-size:14px"></div>
<div class="row"><input id="cpin" type="checkbox"> 📌 맨 위에 고정</div>
<input id="cid" type="hidden"><button id="csv">올리기</button><button class="sub" id="cnew">새로 쓰기 (입력칸 비우기)</button>
<div id="m18" class="msg"></div><div id="clist"></div></section>
</main><script>
const $=q=>document.querySelector(q);const today=new Date(Date.now()+9*36e5).toISOString().slice(0,10);$('#cd').value=$('#d').value=today;
$('#tk').value=sessionStorage.getItem('tk')||'';
const H=()=>({Authorization:'Bearer '+$('#tk').value.trim()});
var tkTimer=null;async function tkCheck(){var v=$('#tk').value.trim();if(!v){$('#tkm').textContent='';return;}
 try{var j=await (await fetch('/api/admin-check',{headers:H(),cache:'no-store'})).json();
  if(!j.set){$('#tkm').style.color='#c33';$('#tkm').textContent='✖ 서버에 관리자 비밀번호(ADMIN_TOKEN)가 등록되어 있지 않습니다 — Cloudflare 설정 > 변수 및 비밀에서 ADMIN_TOKEN을 추가하세요';}
  else if(j.match){$('#tkm').style.color='#3a5';$('#tkm').textContent='✔ 관리자 비밀번호가 맞습니다';if(typeof bShow==='function')bShow();}
  else{$('#tkm').style.color='#c33';$('#tkm').textContent='✖ 관리자 비밀번호가 서버에 등록된 값과 다릅니다';}}catch(e){$('#tkm').textContent='';}}
$('#tk').oninput=e=>{sessionStorage.setItem('tk',e.target.value);clearTimeout(tkTimer);tkTimer=setTimeout(tkCheck,500);};let blob=null;

// ① 성경·찬송가 파일 올리기 / 한 달치 미리 준비
var ABBR='창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 라 느 더 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계'.split(' ');
var BK=${JSON.stringify(BOOKS)};
async function readKo(f){var b=await f.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(b);}catch(e){return new TextDecoder('euc-kr').decode(b);}}
$('#bup').onclick=async function(){var f=$('#bf').files[0];if(!f)return $('#m11').textContent='성경 파일을 선택해 주세요';
 $('#m11').textContent='파일 읽는 중…';var t=await readKo(f),books={},n=0;
 t.split(/\\r?\\n/).forEach(function(l){var m=l.match(/^(\\S+) (\\d+):(\\d+) (.*)$/);if(!m)return;var i=ABBR.indexOf(m[1]);var name=i>=0?BK[i]:(BK.indexOf(m[1])>=0?m[1]:null);if(!name)return;
  var b=books[name]=books[name]||{};var c=b[m[2]]=b[m[2]]||[];c[+m[3]-1]=m[4].trim();n++;});
 var names=Object.keys(books);if(names.length<60)return $('#m11').textContent='성경 파일 형식이 아닙니다 (찾은 책 '+names.length+'권)';
 var bad=[];for(var i=0;i<names.length;i++){$('#m11').textContent='성경 올리는 중 '+(i+1)+' / '+names.length+' ('+names[i]+')';
  try{var r=await (await fetch('/api/bible/'+encodeURIComponent(names[i]),{method:'PUT',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify(books[names[i]])})).json();if(!r.ok)bad.push(names[i]+': '+r.error);}catch(e){bad.push(names[i]);}}
 $('#m11').textContent=bad.length?'일부 실패: '+bad.join(', '):'완료: 성경 '+names.length+'권 '+n.toLocaleString()+'절을 올렸습니다';};
$('#hup').onclick=async function(){var f=$('#hf').files[0];if(!f)return $('#m13').textContent='찬송가 파일을 선택해 주세요';
 var t=await readKo(f),hs={},cur=null;
 t.split(/\\r?\\n/).forEach(function(l){l=l.trim();var m=l.match(/^(\\d{1,3})\\. (.+?)(\\(구 [^)]*\\))?$/);if(m){cur=hs[m[1]]={t:m[2].trim(),l:[]};return;}
  var v=l.match(/^\\d+절\\/(.*)$/);if(v&&cur)cur.l.push(v[1].split(/\\/\\/+/).map(function(g){var a=g.split('/').map(function(x){return x.replace(/\\s+/g,' ').trim();}).filter(Boolean),o=[];for(var k=0;k<a.length;k+=2)o.push(a.slice(k,k+2).join(' '));return o.join('\\n');}).filter(Boolean).join('\\n'));});   // 찬송 가사: 두 구절씩 한 줄로 (문맥에 맞게 줄바꿈)
 var cnt=Object.keys(hs).length;if(cnt<500)return $('#m13').textContent='찬송가 파일 형식이 아닙니다 (찾은 곡 '+cnt+'개)';
 var r=await (await fetch('/api/hymns',{method:'PUT',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify(hs)})).json();
 $('#m13').textContent=r.ok?'완료: 새찬송가 '+r.count+'곡을 올렸습니다':'실패: '+r.error;};
async function pShow(){try{var j=await (await fetch('/api/prepared?ym='+$('#pym').value,{cache:'no-store'})).json();if(!j.ok||!j.days.length){$('#plist').innerHTML='<p class="msg" style="color:#889">이 달 캘린더가 아직 없습니다 (⑥ 이번 달 캘린더 읽기)</p>';return;}
 var ok=function(b){return b?'✔':'<span style="color:#c33">–</span>';};
 $('#plist').innerHTML='<table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:10px"><tr style="color:#557"><td>날짜</td><td>본문</td><td>성경</td><td>해설</td><td>원어</td><td>찬송</td></tr>'+j.days.map(function(d){return '<tr style="border-top:1px solid #eef"><td>'+d.date.slice(5)+'</td><td>'+d.passage+'</td><td>'+ok(d.verses)+'</td><td>'+ok(d.commentary)+'</td><td>'+ok(d.words)+'</td><td>'+(d.hymn?d.hymn+'장':'<span style="color:#aab">당일</span>')+'</td></tr>';}).join('')+'</table>';}catch(e){}}
$('#pym').value=today.slice(0,7);$('#pym').onchange=pShow;pShow();
$('#pm').onclick=async function(){var ym=$('#pym').value;if(!ym)return;
 var j=await (await fetch('/api/prepared?ym='+ym,{cache:'no-store'})).json();if(!j.ok||!j.days.length)return $('#m12').textContent='그 달 캘린더가 없습니다 — ⑥ 이번 달 캘린더 읽기를 먼저 하세요';
 var todo=j.days.filter(function(d){return !(d.verses&&d.commentary&&d.words);}),bad=[];
 for(var i=0;i<todo.length;i++){$('#m12').textContent='준비 중 '+(i+1)+' / '+todo.length+' — '+todo[i].date.slice(5)+' '+todo[i].passage+' (하루 30초~1분)';
  try{var r=await (await fetch('/api/prepare?date='+todo[i].date,{method:'POST',headers:H()})).json();if(!r.ok)bad.push(todo[i].date.slice(5)+' '+r.error);}catch(e){bad.push(todo[i].date.slice(5)+' 연결 끊김');}pShow();}
 $('#m12').textContent=(todo.length?'완료 ('+todo.length+'일 준비)':'이미 모두 준비되어 있습니다')+(bad.length?'\\n실패:\\n'+bad.join('\\n'):'');pShow();};

let autoCrop=true;async function prep(){const f=$('#file').files[0];if(!f)return;
  const img=await createImageBitmap(f);
  // 휴대폰 화면 캡처면 검은 악보 부분만 자동으로 찾아 잘라냄 (어두운 칸이 절반 넘는 줄·열의 범위)
  const t=document.createElement('canvas');t.width=img.width;t.height=img.height;const tx=t.getContext('2d');tx.drawImage(img,0,0);
  const td=tx.getImageData(0,0,t.width,t.height).data,W=t.width,H=t.height,isDark=(i)=>td[i]+td[i+1]+td[i+2]<300;
  const rowDark=y=>{let n=0;for(let x=0;x<W;x+=4)if(isDark((y*W+x)*4))n++;return n/(W/4)>0.5;};
  const colDark=(x,y0,y1)=>{let n=0;for(let y=y0;y<y1;y+=4)if(isDark((y*W+x)*4))n++;return n/((y1-y0)/4)>0.5;};
  // 가장 길게 이어진 '어두운 줄' 묶음 = 악보 영역 (위쪽 검은 상태표시줄 같은 짧은 부분은 무시)
  const longest=(n,test)=>{let best=[0,0],s=-1,gap=0,last=-1;for(let i=0;i<=n;i++){const d=i<n&&test(i);if(d){if(s<0)s=i;last=i;gap=0;}else if(s>=0&&++gap>12||i===n&&s>=0){if(last+1-s>best[1]-best[0])best=[s,last+1];s=-1;gap=0;}}return best;};   // 오선 같은 얇은 흰 줄(12px 이하)은 건너뜀
  const [y0,y1]=longest(H,rowDark);
  let box={x:0,y:0,w:W,h:H},dark=false;
  if(y1-y0>H*0.3){const [x0,x1]=longest(W,x=>colDark(x,y0,y1));
    if(x1-x0>W*0.3){box={x:x0,y:y0,w:x1-x0,h:y1-y0};dark=true;}}
  if(!dark){let s=0;for(let i=0;i<td.length;i+=40)s+=td[i]+td[i+1]+td[i+2];dark=s/(td.length/40)/3<110;}   // 화면 전체가 악보인 경우
  if(box.w<W&&autoCrop){$('#crop').value=6;}autoCrop=false;
  const crop=Math.round(box.h*(+$('#crop').value)/100);
  const c=document.createElement('canvas');c.width=box.w;c.height=box.h-crop;const x=c.getContext('2d');x.drawImage(t,box.x,box.y+crop,box.w,box.h-crop,0,0,box.w,box.h-crop);
  const d=x.getImageData(0,0,c.width,c.height),a=d.data;
  for(let i=0;i<a.length;i+=4){let g=a[i]*.3+a[i+1]*.59+a[i+2]*.11;if(dark)g=255-g;if(g>215)g=255;a[i]=a[i+1]=a[i+2]=g;}
  x.putImageData(d,0,0);const s=Math.min(1,900/c.width);const o=document.createElement('canvas');o.width=c.width*s;o.height=c.height*s;o.getContext('2d').drawImage(c,0,0,o.width,o.height);
  blob=await new Promise(r=>o.toBlob(r,'image/jpeg',.85));$('#pv').src=URL.createObjectURL(blob);$('#pv').hidden=false;}
$('#file').onchange=()=>{autoCrop=true;prep();};$('#crop').onchange=prep;
$('#up').onclick=async()=>{if(!$('#no').value||!blob)return $('#m1').textContent='번호와 사진을 넣어주세요';
 const r=await fetch('/score/'+$('#no').value,{method:'PUT',headers:H(),body:blob});const j=await r.json();$('#m1').textContent=j.ok?$('#no').value+'장 악보를 올렸습니다':'실패: '+j.error;};
$('#list').onclick=async()=>{const j=await (await fetch('/api/scores')).json();$('#m4').textContent=j.scores.length?j.scores.join(', ')+' (총 '+j.scores.length+'곡)':'아직 없습니다';};
$('#col').onclick=async()=>{$('#m2').textContent='다시 준비하는 중… (30초~1분)';const r=await fetch('/api/collect?force=1&date='+$('#cd').value,{method:'POST',headers:H()});const j=await r.json();
 $('#m2').textContent=j.ok?'본문: '+j.passage+'\\n제목: '+(j.title||'-')+'\\n찬송: '+(j.hymnNo?j.hymnNo+'장 '+(j.hymnTitle||''):'- '+(j.hymnErr||'(그날 아침에 두란노에서 읽음)'))+'\\n절 수: '+j.verses.length+'\\n새로 만든 것: '+((j.done||[]).join(', ')||'-'):'실패: '+j.error;pShow();};
$('#appurl').textContent=location.origin+'/';
$('#ogpv').src='/og.jpg?'+Date.now();$('#ogpv').onload=()=>$('#ogpv').hidden=false;
$('#ogup').onclick=async()=>{const f=$('#ogf').files[0];if(!f)return $('#m6').textContent='이미지를 선택해 주세요';
 const img=await createImageBitmap(f);const c=document.createElement('canvas');c.width=1200;c.height=630;const x=c.getContext('2d');
 const r=Math.max(1200/img.width,630/img.height);const w=img.width*r,h=img.height*r;x.drawImage(img,(1200-w)/2,(630-h)/2,w,h);
 const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',.86));
 const j=await (await fetch('/api/og',{method:'PUT',headers:H(),body:blob})).json();
 $('#m6').textContent=j.ok?'대표 이미지를 올렸습니다':'실패: '+j.error;if(j.ok){$('#ogpv').src='/og.jpg?'+Date.now();}};
// 스마트요람: 명단·사진 한꺼번에 올리기 / 한 사람 사진 바꾸기
var yrData=null;
$('#yup').onclick=async function(){var f=$('#yf').files[0];if(!f)return $('#m8').textContent='파일을 선택해 주세요';
 $('#m8').textContent='파일 읽는 중…';var j;try{j=JSON.parse(await f.text());}catch(e){return $('#m8').textContent='스마트요람 데이터 파일(.json)이 아닙니다';}
 var d=j.data||j, ph=j.photos||{};
 var r=await (await fetch('/api/dir',{method:'POST',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify(d)})).json();
 if(!r.ok)return $('#m8').textContent='실패: '+r.error;
 var ids=Object.keys(ph),ok=0,bad=[];
 for(var i=0;i<ids.length;i++){$('#m8').textContent='명단 저장 완료 ('+r.people+'명). 사진 올리는 중 '+(i+1)+' / '+ids.length;
  try{var b=await (await fetch(ph[ids[i]])).blob();var x=await (await fetch('/dir-img/'+encodeURIComponent(ids[i])+'?nodata=1',{method:'PUT',headers:H(),body:b})).json();if(x.ok)ok++;else bad.push(ids[i]);}catch(e){bad.push(ids[i]);}}
 $('#m8').textContent='완료: 가족 '+r.families+'개 / '+r.people+'명 / 사진 '+ok+'장'+(bad.length?' (실패: '+bad.join(', ')+')':'');yrData=null;bShow();};
async function yrGet(){if(yrData)return yrData;var j=await (await fetch('/api/dir',{headers:H()})).json();if(!j.ok)throw new Error(j.error);yrData=[];j.data.families.forEach(function(f){f.m.forEach(function(m){yrData.push({id:m.id,name:m.name,duty:m.duty,head:f.m[0].name,photo:m.photo,birth:m.birth||'',lunar:!!m.lunar});});});return yrData;}
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
$('#ys').oninput=async function(){var q=$('#ys').value.trim();if(!q){$('#yres').innerHTML='';return;}
 try{var list=(await yrGet()).filter(function(m){return m.name.indexOf(q)>=0;}).slice(0,20);
  $('#yres').innerHTML=list.map(function(m){return '<button class="sub" style="margin-top:6px;padding:9px;text-align:left" data-y="'+m.id+'" data-n="'+esc(m.name)+'">'+esc(m.name)+' '+esc(m.duty||'')+' <small>('+esc(m.head)+' 가정'+(m.photo?'':', 사진 없음')+(m.birth?', 생일 '+(m.lunar?'음력 ':'')+m.birth.slice(5):'')+')</small></button>';}).join('')||'<p class="msg" style="color:#c33">없는 이름입니다</p>';}
 catch(e){$('#yres').innerHTML='<p class="msg" style="color:#c33">'+e.message+' (관리자 비밀번호 확인)</p>';}};
$('#yres').onclick=function(e){var b=e.target.closest('[data-y]');if(!b)return;$('#yid').value=b.dataset.y;$('#m9').textContent='선택: '+b.dataset.n+' (ID '+b.dataset.y+')';var p=(yrData||[]).find(function(x){return x.id===b.dataset.y;});$('#ylunar').checked=!!(p&&p.lunar);$('#m10').textContent='';$('#m15').textContent='';};
$('#ylsave').onclick=async function(){if(!$('#yid').value)return $('#m10').textContent='먼저 이름을 검색해서 사람을 선택하세요';
 var j=await (await fetch('/api/dir/lunar',{method:'POST',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify({id:$('#yid').value,lunar:$('#ylunar').checked})})).json();
 $('#m10').textContent=j.ok?j.name+' — '+(j.lunar?'음력':'양력')+' 생일로 저장했습니다':'실패: '+j.error;if(j.ok){yrData=null;bShow();}};
// 전출하신 분 명단에서 삭제 (사진도 함께 지워짐)
async function yDel(id,name,out){
 if(!confirm(name+' 님을 스마트요람 명단에서 삭제할까요?\\n(전출 처리 — 사진도 함께 지워지며 되돌릴 수 없습니다)'))return;
 try{var j=await (await fetch('/api/dir/person?id='+encodeURIComponent(id),{method:'DELETE',headers:H()})).json();
  out.style.color=j.ok?'#3a5':'#c33';out.textContent=j.ok?j.name+' 님을 명단에서 삭제했습니다 (남은 인원 '+j.people+'명)':'실패: '+j.error;
  if(j.ok){yrData=null;if($('#yid').value===id){$('#yid').value='';$('#m9').textContent='';}$('#ys').oninput();bShow();}}
 catch(e){out.style.color='#c33';out.textContent='실패: 연결 오류';}}
$('#ydel').onclick=function(){var id=$('#yid').value;if(!id)return $('#m15').textContent='먼저 이름을 검색해서 사람을 선택하세요';
 var p=(yrData||[]).find(function(x){return x.id===id;});yDel(id,p?p.name:id,$('#m15'));};
// 달별 생일자 명단
async function bShow(){var mo=$('#bm').value;if(!$('#tk').value.trim()){$('#blist').innerHTML='<p class="msg" style="color:#889">관리자 비밀번호를 넣으면 명단이 나옵니다</p>';return;}
 var all;try{all=await yrGet();}catch(e){$('#blist').innerHTML='<p class="msg" style="color:#c33">'+esc(e.message)+' (관리자 비밀번호 확인)</p>';return;}
 var list=all.filter(function(m){return /^\\d{4}-\\d{2}-\\d{2}$/.test(m.birth)&&m.birth.slice(5,7)===mo;}).sort(function(a,b){return a.birth.slice(8).localeCompare(b.birth.slice(8))||a.name.localeCompare(b.name);});
 bList=list;
 $('#blist').innerHTML='<div class="row" style="justify-content:space-between;margin:12px 0 4px"><b style="font-size:16px">'+(+mo)+'월 생일 '+list.length+'명</b>'+(list.length?'<button class="sub" id="bcopy" style="width:auto;margin:0;padding:8px 12px;font-size:14px">📋 명단 복사 (PPT용)</button>':'')+'</div>'+(list.length?'<table style="width:100%;font-size:14px;border-collapse:collapse">'+list.map(function(m){
  return '<tr><td style="width:52px;color:#557">'+(+m.birth.slice(8))+'일'+(m.lunar?'<br><small style="color:#b65">음력</small>':'')+'</td><td><b>'+esc(m.name)+'</b> '+esc(m.duty||'')+'<br><span style="color:#1d4f91;font-weight:700">'+bFmt(m)+'</span><br><small style="color:#889">'+esc(m.head)+' 가정</small></td><td style="text-align:right"><button class="del" data-bd="'+m.id+'" data-n="'+esc(m.name)+'">삭제</button></td></tr>';}).join('')+'</table>':'<p class="msg" style="color:#889">이 달 생일인 분이 없습니다</p>');}
// 생년월일 표시: 1975.11.01 (음력) · 51세
var bList=[];
function bAge(b){var t=new Date(Date.now()+9*36e5),y=t.getUTCFullYear()-(+b.slice(0,4));if((t.getUTCMonth()+1)*100+t.getUTCDate()<(+b.slice(5,7))*100+(+b.slice(8,10)))y--;return y;}
function bFmt(m){return m.birth.replace(/-/g,'.')+(m.lunar?' (음력)':'')+' · '+bAge(m.birth)+'세';}
document.addEventListener('click',async function(e){if(!e.target.closest('#bcopy'))return;
 var txt=bList.map(function(m){return (+m.birth.slice(5,7))+'월 '+(+m.birth.slice(8))+'일\\t'+m.name+' '+(m.duty||'')+'\\t'+m.birth.replace(/-/g,'.')+(m.lunar?' (음력)':'');}).join('\\n');
 try{await navigator.clipboard.writeText(txt);}catch(_){var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
 $('#m14').style.color='#3a5';$('#m14').textContent=bList.length+'명 명단을 복사했습니다 — PPT나 엑셀에 붙여넣기(Ctrl+V) 하세요';});
$('#bm').value=today.slice(5,7);$('#bm').onchange=function(){$('#m14').textContent='';bShow();};
$('#blist').onclick=function(e){var b=e.target.closest('[data-bd]');if(!b)return;yDel(b.dataset.bd,b.dataset.n,$('#m14'));};
var yBlob=null;
$('#yp').onchange=async function(){var f=$('#yp').files[0];if(!f)return;var img=await createImageBitmap(f);var c=document.createElement('canvas');c.width=240;c.height=296;
 var r=Math.max(240/img.width,296/img.height),w=img.width*r,h=img.height*r;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,240,296);x.drawImage(img,(240-w)/2,(296-h)/2,w,h);
 yBlob=await new Promise(function(res){c.toBlob(res,'image/jpeg',.85);});$('#ypv').src=URL.createObjectURL(yBlob);$('#ypv').hidden=false;};
$('#ypup').onclick=async function(){if(!$('#yid').value)return $('#m9').textContent='먼저 이름을 검색해서 사람을 선택하세요';if(!yBlob)return $('#m9').textContent='새 사진을 선택하세요';
 var j=await (await fetch('/dir-img/'+encodeURIComponent($('#yid').value),{method:'PUT',headers:H(),body:yBlob})).json();
 $('#m9').textContent=j.ok?'사진을 바꿨습니다 (앱에서 바로 보입니다)':'실패: '+j.error;if(j.ok){yrData=null;yBlob=null;$('#yp').value='';}};
// 선교기도 이미지 (매달) — 이미지만 올리면 됨 (선교지 이름 없음)
// 파일 여러 개를 고르면 이름의 숫자 순(1, 2, 3 … 10)으로 올림 — 1번이 맨 위
function byName(files){return Array.from(files).sort(function(a,b){return String(a.name).localeCompare(String(b.name),'ko',{numeric:true});});}
let mKeep=[], mNew=[], mItem=null;
async function shrink(f){const img=await createImageBitmap(f);const s=Math.min(1,1600/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=img.width*s;c.height=img.height*s;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.85);}
const thisMonth=()=>new Date(Date.now()+9*36e5).toISOString().slice(0,7);
function mThumbs(){const rep=$('#mrepw').style.display!=='none'&&$('#mrep').checked;
 const all=[...mKeep.map((u,i)=>({u,k:'k',i,t:rep?'지울 것':'지금'})),...mNew.map((u,i)=>({u,k:'n',i,t:'새 이미지'}))];
 $('#mpv').innerHTML=all.map(t=>'<div style="position:relative;'+(t.t==='지울 것'?'opacity:.35':'')+'"><img src="'+t.u+'" style="width:100%;margin:0;aspect-ratio:3/4;object-fit:cover"><span style="position:absolute;left:4px;bottom:4px;background:'+(t.k==='n'?'#1d6fd6':'#667')+';color:#fff;font-size:11px;padding:1px 6px;border-radius:6px">'+t.t+'</span><button data-x="'+t.k+t.i+'" style="position:absolute;top:2px;right:2px;width:26px;height:26px;margin:0;padding:0;border-radius:50%;background:#000a;font-size:14px">✕</button></div>').join('');}
$('#mpv').onclick=e=>{const b=e.target.closest('[data-x]');if(!b)return;const k=b.dataset.x[0],i=+b.dataset.x.slice(1);(k==='k'?mKeep:mNew).splice(i,1);if(!mKeep.length)$('#mrepw').style.display='none';mThumbs();};
$('#mrep').onchange=mThumbs;
async function mAdd(files){for(const f of files){try{if(/pdf/i.test(f.type)||/\\.pdf$/i.test(f.name)){(await pdfFile(f,'#m5')).forEach(p=>mNew.push(p));}else if(/^image/.test(f.type)){mNew.push(await shrink(f));}}catch(e){$('#m5').textContent='파일을 읽지 못했습니다: '+f.name;}}
 if(mNew.length&&mKeep.length)$('#mrepw').style.display='';mThumbs();}
$('#mp').onchange=()=>{const fs=byName($('#mp').files);$('#mp').value='';mAdd(fs);};
$('#mdrop').onclick=e=>{if(e.target.id!=='mp')$('#mp').click();};
$('#mdrop').ondragover=function(e){e.preventDefault();this.style.background='#e9f1fb';};
$('#mdrop').ondragleave=function(){this.style.background='#f7faff';};
$('#mdrop').ondrop=function(e){e.preventDefault();this.style.background='#f7faff';mAdd(byName(e.dataTransfer.files));};
async function mLoad(){try{const j=await (await fetch('/api/mission',{cache:'no-store'})).json();mItem=(j.list||[])[0]||null;}catch(e){mItem=null;}
 mKeep=mItem?[...(mItem.images||(mItem.img?[mItem.img]:[]))]:[];mNew=[];$('#mrepw').style.display='none';$('#mrep').checked=true;
 const cm=mItem&&mItem.month;$('#mcur').innerHTML=mKeep.length?'지금 앱에 나오는 이미지 '+mKeep.length+'장'+(cm?' <span style="color:'+(cm===thisMonth()?'#3a5':'#c33')+'">('+(+cm.slice(5))+'월'+(cm===thisMonth()?'':' — 지난달 자료')+')</span>':''):'<span style="color:#889">아직 올린 이미지가 없습니다</span>';mThumbs();}
$('#msv').onclick=async()=>{const before=mItem?(mItem.images||[]).length:0;
 if(!mNew.length&&mKeep.length===before)return $('#m5').textContent='새 이미지를 넣어 주세요';
 const keep=($('#mrepw').style.display!=='none'&&$('#mrep').checked)?[]:mKeep;
 $('#m5').style.color='#3a5';$('#m5').textContent='올리는 중… (이미지가 많으면 조금 걸립니다)';
 try{let j;
  if(!keep.length&&!mNew.length){j=mItem?await (await fetch('/api/mission?id='+mItem.id,{method:'DELETE',headers:H()})).json():{ok:true};if(j.ok)$('#m5').textContent='이미지를 모두 지웠습니다';}
  else{j=await (await fetch('/api/mission',{method:'POST',headers:{...H(),'Content-Type':'application/json'},body:JSON.stringify({id:mItem?mItem.id:'monthly',month:thisMonth(),field:'',missionary:'',items:[],note:'',keep,imagesData:mNew})})).json();
   if(j.ok)$('#m5').textContent='올렸습니다 — 앱 선교기도에 이미지 '+j.item.images.length+'장이 나옵니다';}
  if(!j.ok){$('#m5').style.color='#c33';$('#m5').textContent='실패: '+j.error;return;}
  mLoad();}catch(e){$('#m5').style.color='#c33';$('#m5').textContent='실패: 연결 오류';}};
mLoad();

// 교회 소식 · 주보 (PC용: PDF는 페이지별 그림으로 바꿔 올림)
let nKeep=[], nNew=[], nData=[];
function nTitle(){var d=new Date(Date.now()+9*36e5);d.setUTCDate(d.getUTCDate()+(7-d.getUTCDay())%7);return (d.getUTCMonth()+1)+'월 '+d.getUTCDate()+'일 주보';}
function nKind(v){if(v){document.querySelector('input[name=nkind][value='+v+']').checked=true;}var c=document.querySelector('input[name=nkind]:checked').value;$('#nedw').style.display=c==='event'?'':'none';return c;}
function nClear(){$('#nid').value='';$('#ned').value='';$('#nt').value=nKind()==='bulletin'?nTitle():'';$('#nb').value='';$('#npin').checked=false;nKeep=[];nNew=[];nThumbs();}
function nThumbs(){var all=nKeep.map(function(u,i){return {s:u,k:'k',i:i};}).concat(nNew.map(function(u,i){return {s:u,k:'n',i:i};}));
 $('#npv').innerHTML=all.map(function(t){return '<div style="position:relative"><img src="'+t.s+'" style="width:100%;margin:0;aspect-ratio:3/4;object-fit:cover"><button data-x="'+t.k+t.i+'" style="position:absolute;top:2px;right:2px;width:26px;height:26px;margin:0;padding:0;border-radius:50%;background:#000a;font-size:14px">✕</button></div>';}).join('');}
$('#npv').onclick=function(e){var b=e.target.closest('[data-x]');if(!b)return;var k=b.dataset.x[0],i=+b.dataset.x.slice(1);(k==='k'?nKeep:nNew).splice(i,1);nThumbs();};
function toJpeg(c){return c.toDataURL('image/jpeg',.85);}
async function imgFile(f){var img=await createImageBitmap(f);var s=Math.min(1,1600/Math.max(img.width,img.height));var c=document.createElement('canvas');c.width=img.width*s;c.height=img.height*s;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);return toJpeg(c);}
function loadPdfJs(){return new Promise(function(res,rej){if(window.pdfjsLib)return res(window.pdfjsLib);var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=function(){pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';res(pdfjsLib);};s.onerror=rej;document.head.appendChild(s);});}
async function pdfFile(f,msgEl){var M=$(msgEl||'#m7');var lib=await loadPdfJs();var pdf=await lib.getDocument({data:await f.arrayBuffer()}).promise;var out=[];
 for(var p=1;p<=Math.min(pdf.numPages,12);p++){M.textContent='PDF '+p+'/'+pdf.numPages+'쪽 변환 중…';var pg=await pdf.getPage(p);var v=pg.getViewport({scale:1});var sc=1600/Math.max(v.width,v.height);var vp=pg.getViewport({scale:sc});
  var c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:x,viewport:vp}).promise;out.push(toJpeg(c));}
 M.textContent='';return out;}
async function nAdd(files){for(var i=0;i<files.length;i++){var f=files[i];try{if(/pdf/i.test(f.type)||/\\.pdf$/i.test(f.name)){var pages=await pdfFile(f);pages.forEach(function(p){nNew.push(p);});}else if(/^image/.test(f.type)){nNew.push(await imgFile(f));}}catch(e){$('#m7').textContent='파일을 읽지 못했습니다: '+f.name;}}nThumbs();}
$('#ndrop').onclick=function(){$('#nf').click();};
$('#nf').onchange=function(){var fs=byName($('#nf').files);$('#nf').value='';nAdd(fs);};
$('#ndrop').ondragover=function(e){e.preventDefault();this.style.background='#e9f1fb';};
$('#ndrop').ondragleave=function(){this.style.background='#f7faff';};
$('#ndrop').ondrop=function(e){e.preventDefault();this.style.background='#f7faff';nAdd(byName(e.dataTransfer.files));};
document.querySelectorAll('input[name=nkind]').forEach(function(r){r.onchange=function(){var c=nKind();if(c==='bulletin'&&!$('#nt').value)$('#nt').value=nTitle();if(c!=='bulletin'&&$('#nt').value===nTitle())$('#nt').value='';};});
$('#nnew').onclick=function(){nClear();$('#m7').textContent='';};
$('#nsv').onclick=async function(){var title=$('#nt').value.trim();if(!title)return $('#m7').textContent='제목을 넣어주세요';
 $('#m7').textContent='올리는 중… (사진이 많으면 조금 걸립니다)';
 var r=await fetch('/api/news',{method:'POST',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify({id:$('#nid').value,kind:nKind(),eventDate:$('#ned').value,title:title,body:$('#nb').value,pin:$('#npin').checked,keep:nKeep,imagesData:nNew})});
 var j=await r.json();$('#m7').textContent=j.ok?'올렸습니다: '+j.item.title+' (사진 '+j.item.images.length+'장)':'실패: '+j.error;if(j.ok){nClear();nLoad();}};
let nData2=[];
async function nLoad(){var j=await (await fetch('/api/news')).json();nData2=j.list||[];
 $('#nlist').innerHTML=nData2.length?'<p style="font-weight:800;margin:16px 0 6px">올린 소식 ('+nData2.length+')</p>'+nData2.map(function(n){var c=(n.images||[]).length;return '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:10px;margin:8px 0"><b>'+(n.pin?'📌 ':'')+(n.kind==='bulletin'?'[주보] ':n.kind==='event'?'[행사'+(n.eventDate?' '+n.eventDate.slice(5).replace('-','/'):'')+'] ':'')+n.title.replace(/</g,'&lt;')+'</b>'+(c?' 📷'+c:'')+' <span style="color:#889;font-size:13px">'+new Date(n.at).toLocaleDateString('ko-KR')+'</span><div class="row"><button class="sub" style="margin:0;padding:8px" data-ne="'+n.id+'">수정</button><button class="sub" style="margin:0;padding:8px;color:#c33" data-nd="'+n.id+'">삭제</button></div></div>';}).join(''):'';}
$('#nlist').onclick=async function(e){var ed=e.target.closest('[data-ne]'),dl=e.target.closest('[data-nd]');
 if(ed){var n=nData2.find(function(x){return x.id===ed.dataset.ne;});nClear();$('#nid').value=n.id;nKind(n.kind||'news');$('#ned').value=n.eventDate||'';$('#nt').value=n.title;$('#nb').value=n.body||'';$('#npin').checked=!!n.pin;nKeep=(n.images||[]).slice();nThumbs();$('#m7').textContent='수정 중: '+n.title;window.scrollTo({top:$('#nt').getBoundingClientRect().top+scrollY-120,behavior:'smooth'});}
 if(dl){if(!confirm('삭제할까요?'))return;var j=await (await fetch('/api/news?id='+dl.dataset.nd,{method:'DELETE',headers:H()})).json();$('#m7').textContent=j.ok?'삭제했습니다':'실패: '+j.error;nLoad();}};
nClear();nLoad();

// ⑨ 주간사역 갤러리 — 사진 묶음 올리기·고치기·지우기 (앱은 /api/gallery 에서 받아감)
let gKeep=[], gNew=[], gData=[];
function gClear(){$('#gid').value='';$('#gd').value=today;$('#gt').value='';$('#gb').value='';gKeep=[];gNew=[];gThumbs();}
function gThumbs(){var all=gKeep.map(function(u,i){return {s:u,k:'k',i:i};}).concat(gNew.map(function(u,i){return {s:u,k:'n',i:i};}));
 $('#gpv').innerHTML=all.map(function(t){return '<div style="position:relative"><img src="'+t.s+'" style="width:100%;margin:0;aspect-ratio:1;object-fit:cover"><button data-x="'+t.k+t.i+'" style="position:absolute;top:2px;right:2px;width:26px;height:26px;margin:0;padding:0;border-radius:50%;background:#000a;font-size:14px">✕</button></div>';}).join('')+(all.length?'<div style="grid-column:1/-1;font-size:12px;color:#889">사진 '+all.length+'장 (한 묶음에 30장까지)</div>':'');}
$('#gpv').onclick=function(e){var b=e.target.closest('[data-x]');if(!b)return;var k=b.dataset.x[0],i=+b.dataset.x.slice(1);(k==='k'?gKeep:gNew).splice(i,1);gThumbs();};
async function gAdd(files){for(var i=0;i<files.length;i++){var f=files[i];try{if(/pdf/i.test(f.type)||/\\.pdf$/i.test(f.name)){(await pdfFile(f,'#m16')).forEach(function(p){gNew.push(p);});}else if(/^image/.test(f.type)){gNew.push(await imgFile(f));}}catch(e){$('#m16').style.color='#c33';$('#m16').textContent='파일을 읽지 못했습니다: '+f.name;}}gThumbs();}
$('#gdrop').onclick=function(e){if(e.target.id!=='gf')$('#gf').click();};
$('#gf').onchange=function(){var fs=byName($('#gf').files);$('#gf').value='';gAdd(fs);};
$('#gdrop').ondragover=function(e){e.preventDefault();this.style.background='#e9f1fb';};
$('#gdrop').ondragleave=function(){this.style.background='#f7faff';};
$('#gdrop').ondrop=function(e){e.preventDefault();this.style.background='#f7faff';gAdd(byName(e.dataTransfer.files));};
$('#gnew').onclick=function(){gClear();$('#m16').textContent='';};
$('#gsv').onclick=async function(){var title=$('#gt').value.trim();$('#m16').style.color='#c33';
 if(!title)return $('#m16').textContent='제목을 넣어주세요';if(!gKeep.length&&!gNew.length)return $('#m16').textContent='사진을 한 장 이상 넣어주세요';
 $('#m16').style.color='#3a5';$('#m16').textContent='올리는 중… (사진이 많으면 조금 걸립니다)';
 try{var j=await (await fetch('/api/gallery',{method:'POST',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify({id:$('#gid').value,date:$('#gd').value,title:title,body:$('#gb').value,keep:gKeep,imagesData:gNew})})).json();
  if(!j.ok){$('#m16').style.color='#c33';$('#m16').textContent='실패: '+j.error;return;}
  $('#m16').textContent='올렸습니다: '+j.item.title+' (사진 '+j.item.images.length+'장) — 앱 주간사역 갤러리에 바로 나옵니다 (지난 묶음은 지워졌습니다)';gClear();gLoad();}
 catch(e){$('#m16').style.color='#c33';$('#m16').textContent='실패: 연결 오류';}};
async function gLoad(){try{var j=await (await fetch('/api/gallery',{cache:'no-store'})).json();gData=j.list||[];}catch(e){gData=[];}
 $('#glist').innerHTML=gData.length?'<p style="font-weight:800;margin:16px 0 6px">올린 갤러리 ('+gData.length+')</p>'+gData.map(function(g){return '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:10px;margin:8px 0"><b>'+esc(g.title)+'</b> 📷'+(g.images||[]).length+' <span style="color:#889;font-size:13px">'+esc(g.date||'')+'</span><div style="display:flex;gap:4px;margin-top:6px;overflow-x:auto">'+(g.images||[]).slice(0,6).map(function(u){return '<img src="'+esc(u)+'" style="width:56px;height:56px;object-fit:cover;margin:0;flex:none">';}).join('')+'</div><div class="row"><button class="sub" style="margin:0;padding:8px" data-ge="'+esc(g.id)+'">수정</button><button class="sub" style="margin:0;padding:8px;color:#c33" data-gd="'+esc(g.id)+'">삭제</button></div></div>';}).join(''):'<p class="msg" style="color:#889">아직 올린 갤러리가 없습니다</p>';}
$('#glist').onclick=async function(e){var ed=e.target.closest('[data-ge]'),dl=e.target.closest('[data-gd]');
 if(ed){var g=gData.find(function(x){return x.id===ed.dataset.ge;});if(!g)return;gClear();$('#gid').value=g.id;$('#gd').value=g.date||today;$('#gt').value=g.title;$('#gb').value=g.body||'';gKeep=(g.images||[]).slice();gThumbs();$('#m16').style.color='#3a5';$('#m16').textContent='수정 중: '+g.title;window.scrollTo({top:$('#gt').getBoundingClientRect().top+scrollY-120,behavior:'smooth'});}
 if(dl){var g2=gData.find(function(x){return x.id===dl.dataset.gd;});if(!confirm((g2?g2.title:'이 갤러리')+'를 삭제할까요?\\n(사진도 함께 지워지며 되돌릴 수 없습니다)'))return;
  var j=await (await fetch('/api/gallery?id='+encodeURIComponent(dl.dataset.gd),{method:'DELETE',headers:H()})).json();$('#m16').style.color=j.ok?'#3a5':'#c33';$('#m16').textContent=j.ok?'삭제했습니다':'실패: '+j.error;gLoad();}};
gClear();gLoad();

// 🎬 주간사역 영상 — 브라우저에서 720p로 다시 녹화(압축)해서 올림. 새 영상을 올리면 서버가 지난 영상을 덮어씀
var VMAX_SEC=240, VTARGET=19*1024*1024;   // 4분까지, 압축 결과 19MB 안쪽을 목표 (서버 한도 25MB)
function vFmt(b){return b>=1048576?(b/1048576).toFixed(1)+'MB':Math.round(b/1024)+'KB';}
function vDur(s){s=Math.round(s||0);return Math.floor(s/60)+'분 '+(s%60)+'초';}
async function vShow(){try{var j=await (await fetch('/api/gallery-video',{cache:'no-store'})).json();var v=j.video;
 $('#vcur').innerHTML=v?'지금 앱에 올라간 영상: <b>'+esc(v.title||'(제목 없음)')+'</b> · '+vFmt(v.size)+(v.dur?' · '+vDur(v.dur):'')+' · '+(v.type==='video/mp4'?'MP4':'WebM')+' <a href="/gallery-video?v='+esc(v.at)+'" target="_blank" style="color:#1d6fd6">재생해 보기</a>':'<span style="color:#889">아직 올린 영상이 없습니다</span>';}catch(e){$('#vcur').textContent='';}}
// 녹화 형식: MP4(H.264)가 되면 그것(모든 휴대폰 재생), 안 되면 WebM
function vMime(){var c=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1.42E01E,opus"','video/mp4;codecs=avc1','video/mp4','video/webm;codecs="h264,opus"','video/webm;codecs="vp9,opus"','video/webm;codecs="vp8,opus"','video/webm'];
 for(var i=0;i<c.length;i++)if(window.MediaRecorder&&MediaRecorder.isTypeSupported(c[i]))return c[i];return '';}
// 영상 → 720p 녹화. 끝나면 {blob, poster, dur, w, h}
function vCompress(file,say){return new Promise(function(res,rej){
 var mime=vMime();if(!mime)return rej(new Error('이 브라우저는 영상 압축을 지원하지 않습니다 — PC Chrome 또는 Edge 최신 버전을 쓰세요'));
 var v=document.createElement('video');v.muted=false;v.playsInline=true;v.preload='auto';v.src=URL.createObjectURL(file);
 v.onerror=function(){rej(new Error('영상 파일을 열 수 없습니다 (형식 확인)'));};
 v.onloadedmetadata=function(){
  var dur=v.duration;if(!isFinite(dur)||dur<=0)return rej(new Error('영상 길이를 읽지 못했습니다'));
  if(dur>VMAX_SEC)return rej(new Error('영상이 '+vDur(dur)+'입니다 — 4분 이하로 잘라서 올려 주세요'));
  var W=v.videoWidth,H=v.videoHeight;if(!W||!H)return rej(new Error('영상 크기를 읽지 못했습니다'));
  var sc=Math.min(1,1280/Math.max(W,H),720/Math.min(W,H));var w=Math.round(W*sc/2)*2,h=Math.round(H*sc/2)*2;
  var cv=$('#vcv');cv.width=w;cv.height=h;var cx=cv.getContext('2d');
  var abr=96000,vbr=Math.max(400000,Math.min(2200000,Math.floor(VTARGET*8/dur)-abr));   // 길이에 맞춰 화질 자동
  var stream=cv.captureStream(30);
  var ac=new (window.AudioContext||window.webkitAudioContext)();var dest=ac.createMediaStreamDestination();
  try{ac.createMediaElementSource(v).connect(dest);dest.stream.getAudioTracks().forEach(function(t){stream.addTrack(t);});}catch(e){}
  var rec,chunks=[];try{rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:vbr,audioBitsPerSecond:abr});}catch(e){return rej(new Error('녹화를 시작할 수 없습니다: '+e.message));}
  rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
  var poster=null,stopped=false,raf=0;
  function draw(){if(stopped)return;cx.drawImage(v,0,0,w,h);if(!poster&&v.currentTime>=0.8){try{poster=cv.toDataURL('image/jpeg',.82);}catch(e){}}
   say('압축 중… '+Math.round(v.currentTime/dur*100)+'% ('+vDur(v.currentTime)+' / '+vDur(dur)+') — 이 화면을 닫지 마세요');
   if(v.requestVideoFrameCallback)v.requestVideoFrameCallback(draw);else raf=requestAnimationFrame(draw);}
  function finish(){if(stopped)return;stopped=true;cancelAnimationFrame(raf);try{rec.stop();}catch(e){}}
  rec.onstop=function(){try{ac.close();}catch(e){}URL.revokeObjectURL(v.src);
   var blob=new Blob(chunks,{type:mime.split(';')[0]});if(!poster){try{poster=cv.toDataURL('image/jpeg',.82);}catch(e){}}
   res({blob:blob,poster:poster,dur:dur,w:w,h:h,mime:mime});};
  v.onended=finish;v.onerror=function(){finish();rej(new Error('재생 중 오류'));};
  v.currentTime=0;ac.resume().then(function(){return v.play();}).then(function(){rec.start(1000);draw();}).catch(function(e){rej(new Error('재생을 시작할 수 없습니다: '+e.message));});
 };});}
function vPut(url,body,type,say,label){return new Promise(function(res,rej){var x=new XMLHttpRequest();x.open('PUT',url);x.setRequestHeader('Authorization','Bearer '+$('#tk').value.trim());x.setRequestHeader('Content-Type',type);
 x.upload.onprogress=function(e){if(e.lengthComputable)say(label+' 올리는 중… '+Math.round(e.loaded/e.total*100)+'%');};
 x.onload=function(){try{var j=JSON.parse(x.responseText);j.ok?res(j):rej(new Error(j.error||'실패'));}catch(e){rej(new Error('서버 응답 오류 '+x.status));}};x.onerror=function(){rej(new Error('연결 오류'));};x.send(body);});}
var vBusy=false;
$('#vup').onclick=async function(){if(vBusy)return;var f=$('#vf').files[0];if(!f)return $('#m17').textContent='영상 파일을 선택해 주세요';
 var say=function(t,err){$('#m17').style.color=err?'#c33':'#3a5';$('#m17').textContent=t;};vBusy=true;$('#vup').disabled=true;
 try{say('원본 '+vFmt(f.size)+' — 영상을 여는 중…');
  var r=await vCompress(f,say);
  if(r.blob.size>25*1024*1024)throw new Error('압축 후에도 '+vFmt(r.blob.size)+'라 올릴 수 없습니다 — 영상을 더 짧게 잘라 주세요');
  say('압축 완료: '+vFmt(f.size)+' → '+vFmt(r.blob.size)+' ('+r.w+'×'+r.h+'). 올리는 중…');
  var j=await vPut('/api/gallery-video?title='+encodeURIComponent($('#vt').value.trim())+'&dur='+Math.round(r.dur),r.blob,r.blob.type||'video/webm',say,'영상');
  if(r.poster){var pb=await (await fetch(r.poster)).blob();await vPut('/api/gallery-poster',pb,'image/jpeg',say,'표지').catch(function(){});}
  var isMp4=/mp4/.test(j.video.type);
  say('올렸습니다 — '+vFmt(j.video.size)+' · '+vDur(j.video.dur)+' · '+(isMp4?'MP4 (모든 휴대폰에서 재생됩니다)':'WebM — 아이폰에서는 재생이 안 될 수 있습니다. Chrome 또는 Edge 최신 버전으로 올리면 MP4가 됩니다')+'\\n지난 영상은 지워졌고, 앱 갤러리 아래 영상 칸에 바로 나옵니다.');
  $('#vpv').src='/gallery-video?v='+j.video.at;$('#vpv').style.display='';$('#vf').value='';vShow();
 }catch(e){say('실패: '+e.message,true);}
 vBusy=false;$('#vup').disabled=false;};
$('#vdel').onclick=async function(){if(!confirm('지금 올라간 주간사역 영상을 지울까요? (앱에서 영상 칸이 사라집니다)'))return;
 var j=await (await fetch('/api/gallery-video',{method:'DELETE',headers:H()})).json();$('#m17').style.color=j.ok?'#3a5':'#c33';$('#m17').textContent=j.ok?'지웠습니다':'실패: '+j.error;$('#vpv').style.display='none';vShow();};
vShow();

// ⑩ 셀리더교제 자료 — 파일은 그대로 올리고(내려받기용), 사진·PDF는 화면에 펼쳐 보이도록 쪽 그림(JPEG)도 함께 올림
var cFiles=[], cKeep=[], cData=[];
function cThumbs(){var rows=cKeep.map(function(f,i){return '<div class="row" style="justify-content:space-between"><span>📎 '+esc(f.name)+' <small style="color:#889">('+vFmt(f.size)+(f.pages&&f.pages.length?' · 화면 '+f.pages.length+'쪽':'')+') — 올라가 있음</small></span><button class="del" data-ck="'+i+'">빼기</button></div>';})
 .concat(cFiles.map(function(it,i){return '<div class="row" style="justify-content:space-between"><span>📎 '+esc(it.file.name)+' <small style="color:#889">('+vFmt(it.file.size)+(it.pages.length?' · 화면 '+it.pages.length+'쪽':'')+')</small></span><button class="del" data-cx="'+i+'">빼기</button></div>';}));
 $('#cfl').innerHTML=rows.join('')||'<p class="msg" style="color:#889">아직 고른 파일이 없습니다</p>';}
async function cAdd(files){for(var i=0;i<files.length;i++){var f=files[i];if(f.size>25*1024*1024){$('#m18').style.color='#c33';$('#m18').textContent=f.name+' 은 25MB가 넘어 올릴 수 없습니다';continue;}
  var it={file:f,pages:[]};try{if(/pdf/i.test(f.type)||/\\.pdf$/i.test(f.name))it.pages=await pdfFile(f,'#m18');else if(/^image/.test(f.type))it.pages=[await imgFile(f)];}catch(e){}cFiles.push(it);
  if(!it.pages.length){$('#m18').style.color='#b65';$('#m18').textContent=f.name+' — 한글(hwp)·워드 같은 문서는 앱 화면에 펼쳐지지 않고 내려받기만 됩니다. 화면에 보이게 하려면 한글에서 「파일 → PDF로 저장」한 PDF를 함께 올려 주세요.';}}cThumbs();}
$('#cfl').onclick=function(e){var k=e.target.closest('[data-ck]'),x=e.target.closest('[data-cx]');if(k)cKeep.splice(+k.dataset.ck,1);if(x)cFiles.splice(+x.dataset.cx,1);if(k||x)cThumbs();};
$('#cf').onchange=function(){var fs=byName($('#cf').files);$('#cf').value='';cAdd(fs);};
$('#cdrop').onclick=function(e){if(e.target.id!=='cf')$('#cf').click();};
$('#cdrop').ondragover=function(e){e.preventDefault();this.style.background='#e9f1fb';};
$('#cdrop').ondragleave=function(){this.style.background='#f7faff';};
$('#cdrop').ondrop=function(e){e.preventDefault();this.style.background='#f7faff';cAdd(byName(e.dataTransfer.files));};
function cClear(){$('#cid').value='';$('#ct').value='';$('#cb').value='';$('#cpin').checked=false;cFiles=[];cKeep=[];cThumbs();$('#csv').textContent='올리기';}
$('#cnew').onclick=function(){cClear();$('#m18').textContent='';};
async function cUploadOne(it,say,label){var f=it.file;var j=await vPut('/api/cell-file?name='+encodeURIComponent(f.name)+'&type='+encodeURIComponent(f.type||'application/octet-stream'),f,f.type||'application/octet-stream',say,label);
 var pages=[];for(var i=0;i<it.pages.length;i++){var pb=await (await fetch(it.pages[i])).blob();var pj=await vPut('/api/cell-file?name='+encodeURIComponent(f.name+' - '+(i+1)+'쪽.jpg')+'&type=image/jpeg',pb,'image/jpeg',say,label+' 화면용 '+(i+1)+'쪽');pages.push(pj.file.url);}
 return {key:j.file.key,name:j.file.name,type:j.file.type,size:j.file.size,url:j.file.url,pages:pages};}
$('#csv').onclick=async function(){var title=$('#ct').value.trim();var say=function(t,err){$('#m18').style.color=err?'#c33':'#3a5';$('#m18').textContent=t;};
 if(!title)return say('제목을 넣어주세요',true);if(!cKeep.length&&!cFiles.length&&!$('#cb').value.trim())return say('파일이나 내용을 넣어주세요',true);
 $('#csv').disabled=true;
 try{var files=cKeep.slice();for(var i=0;i<cFiles.length;i++){files.push(await cUploadOne(cFiles[i],say,'파일 '+(i+1)+'/'+cFiles.length));}
  var j=await (await fetch('/api/cell',{method:'POST',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify({id:$('#cid').value,title:title,body:$('#cb').value,pin:$('#cpin').checked,files:files})})).json();
  if(!j.ok)throw new Error(j.error||'실패');say('올렸습니다: '+j.item.title+' (파일 '+j.item.files.length+'개) — 앱 셀리더교제 칸에 바로 나옵니다');cClear();cLoad();}
 catch(e){say('실패: '+e.message,true);}
 $('#csv').disabled=false;};
async function cLoad(){try{var j=await (await fetch('/api/cell',{headers:H(),cache:'no-store'})).json();cData=j.ok?(j.list||[]):[];if(!j.ok){$('#clist').innerHTML='<p class="msg" style="color:#889">'+(j.error||'')+' (관리자 비밀번호 확인)</p>';return;}}catch(e){cData=[];}
 $('#clist').innerHTML=cData.length?'<p style="font-weight:800;margin:16px 0 6px">올린 자료 ('+cData.length+')</p>'+cData.map(function(c){return '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:10px;margin:8px 0"><b>'+(c.pin?'📌 ':'')+esc(c.title)+'</b> 📎'+(c.files||[]).length+' <span style="color:#889;font-size:13px">'+new Date(c.at).toLocaleDateString('ko-KR')+'</span><div style="font-size:13px;color:#557;margin-top:4px">'+(c.files||[]).map(function(f){return esc(f.name)+' ('+vFmt(f.size)+')';}).join(', ')+'</div><div class="row"><button class="sub" style="margin:0;padding:8px" data-ce="'+esc(c.id)+'">수정</button><button class="sub" style="margin:0;padding:8px;color:#c33" data-cd="'+esc(c.id)+'">삭제</button></div></div>';}).join(''):'<p class="msg" style="color:#889">아직 올린 자료가 없습니다</p>';}
$('#clist').onclick=async function(e){var ed=e.target.closest('[data-ce]'),dl=e.target.closest('[data-cd]');
 if(ed){var c=cData.find(function(x){return x.id===ed.dataset.ce;});if(!c)return;cClear();$('#cid').value=c.id;$('#ct').value=c.title;$('#cb').value=c.body||'';$('#cpin').checked=!!c.pin;cKeep=(c.files||[]).slice();cThumbs();$('#csv').textContent='수정 내용 저장';$('#m18').style.color='#3a5';$('#m18').textContent='수정 중: '+c.title;window.scrollTo({top:$('#ct').getBoundingClientRect().top+scrollY-120,behavior:'smooth'});}
 if(dl){var c2=cData.find(function(x){return x.id===dl.dataset.cd;});if(!confirm((c2?c2.title:'이 자료')+'를 지울까요?\\n(파일도 함께 지워집니다)'))return;var j=await (await fetch('/api/cell?id='+encodeURIComponent(dl.dataset.cd),{method:'DELETE',headers:H()})).json();$('#m18').style.color=j.ok?'#3a5':'#c33';$('#m18').textContent=j.ok?'삭제했습니다':'실패: '+j.error;cLoad();}};
cClear();cLoad();
$('#appup').onclick=async()=>{const f=$('#appf').files[0];if(!f)return $('#m0').textContent='파일을 선택해 주세요';
 const r=await fetch('/api/app',{method:'PUT',headers:{...H(),'Content-Type':'text/html; charset=utf-8'},body:await f.text()});const j=await r.json();
 $('#m0').textContent=j.ok?'앱을 올렸습니다 ('+Math.round(j.size/1024)+'KB). 휴대폰에서 '+location.origin+'/ 로 열어보세요':'실패: '+j.error;};
$('#cm').onclick=async()=>{const ym=$('#cd').value.slice(0,7);const j=await (await fetch('/api/collect-month?ym='+ym,{method:'POST',headers:H()})).json();
 $('#m2').textContent=j.ok?ym+' 본문 범위 '+j.count+'일 저장\\n'+Object.entries(j.days).slice(0,5).map(e=>e[0].slice(5)+' '+e[1]).join('\\n')+'\\n…':'실패: '+j.error;pShow();};
$('#dg').onclick=async()=>{const u='https://www.duranno.com/qt/view/calendar2.asp?clDate='+$('#cd').value.slice(0,7)+'-01';
 const j=await (await fetch('/api/debug?url='+encodeURIComponent(u),{method:'POST',headers:H()})).json();
 $('#m2').textContent=j.ok?'상태: '+j.status+' / 길이: '+j.htmlLength+' / 성경책 이름: '+(j.hasBook?'있음':'없음')+' / 로그인 문구: '+(j.hasLogin?'있음':'없음')+'\\n주소: '+j.finalUrl+'\\n불러오는 주소: '+(j.scripts.join(', ')||'-')+'\\n----\\n'+j.text:'실패: '+j.error;};
$('#lr').onclick=async()=>{const j=await (await fetch('/api/last-run')).json();
 $('#m2').textContent=j.ok?'마지막 자동 실행: '+new Date(j.at).toLocaleString('ko-KR')+'\\n날짜: '+j.date+'\\n오늘: '+j.today+(j.hymn?'\\n찬송: '+j.hymn:'')+(j.ahead?'\\n미리 준비: '+j.ahead:'')+(j.commentary?'\\n해설: '+j.commentary:''):j.error;};
$('#cmt').onclick=async()=>{$('#m2').textContent='AI가 해설을 쓰는 중… (20~40초)';const j=await (await fetch('/api/commentary?date='+$('#cd').value,{method:'POST',headers:H()})).json();
 $('#m2').textContent=j.ok?j.commentary.sections.map(s=>'['+s.title+' '+s.range+']\\n'+s.text+'\\n→ '+s.question).join('\\n\\n'):'실패: '+j.error;};
$('#wd').onclick=async()=>{$('#m2').textContent='AI가 원어 해설을 쓰는 중… (30초~1분)';const j=await (await fetch('/api/words?date='+$('#cd').value,{method:'POST',headers:H()})).json();
 $('#m2').textContent=j.ok?(j.words.background?'📜 '+j.words.background+'\\n\\n':'')+j.words.words.map(w=>w.verse+'절 '+w.ko+' — '+w.orig+' ('+w.read+', '+w.strong+') '+w.mean+'\\n   '+w.desc).join('\\n\\n')+(j.words.summary?'\\n\\n📌 '+j.words.summary:''):'실패: '+j.error;pShow();};
$('#lt').onclick=async()=>{const j=await (await fetch('/api/login-test',{method:'POST',headers:H()})).json();$('#m2').textContent=j.ok?j.message:'실패: '+j.error;};
$('#sv').onclick=async()=>{const verses=$('#v').value.split('\\n').map(l=>l.trim().match(/^(\\d+)\\s+(.+)/)).filter(Boolean).map(m=>[m[1],m[2]]);
 const r=await fetch('/api/qt',{method:'POST',headers:{...H(),'Content-Type':'application/json'},body:JSON.stringify({date:$('#d').value,passage:$('#p').value,title:$('#t').value,hymnNo:$('#h').value,hymnTitle:$('#ht').value,verses})});
 const j=await r.json();$('#m3').textContent=j.ok?'저장했습니다 ('+verses.length+'절)':'실패: '+j.error;};
tkCheck();bShow();
</script></body></html>`;
