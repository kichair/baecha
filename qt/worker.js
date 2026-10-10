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
 *  - (선택)     CELL_PASS  : 셀리더교재 비밀번호 — 없으면 0109
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
 * 2026-10-10 셀리더교재 자료방 (비밀번호 0109): 관리자가 올린 파일(사진·PDF·문서)을 성도가 보고 내려받음
 *   - GET /api/cell (X-Cell-Pass) · POST/DELETE /api/cell (관리자) · PUT /api/cell-file?name=&type= (관리자, 파일 바이트 25MB 이하)
 *   - GET /cell-file/<키>?k=비밀번호(&dl=1 내려받기) — PDF는 올릴 때 쪽마다 그림으로 바꿔 함께 저장해 화면에 바로 펼쳐 보임
 *   - 새 자료를 올리면 지난 자료는 파일까지 자동 삭제 (CELL_MAX=1). 같은 글 수정은 그대로
 *   - 한글(.hwp) 파일은 올릴 때 브라우저가 hwp.js(Apache-2.0, hahnlee/hwp.js)로 그려 쪽마다 사진으로 저장 → 앱에서 원본 모양 그대로 보임 (GET /lib/hwp.min.js)
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
// ---------- 셀리더교재 자료방 ----------
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
      // ---------- 셀리더교재 자료방 ----------
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
      // 한글(.hwp) 그리기 라이브러리 (hwp.js 0.0.3 묶음) — 관리자 페이지·앱 관리자 모드가 한글 파일을 쪽 그림으로 바꿀 때 씀
      if (path === '/lib/hwp.min.js') return new Response(HWP_JS, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000', ...CORS } });
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

// ---------- 한글(.hwp) 그리기 라이브러리 (hwp.js 0.0.3 — Apache License 2.0, https://github.com/hahnlee/hwp.js — 브라우저용으로 묶음) ----------
const HWP_JS = "(()=>{var Ei={};function ae(e,i){if(!(e instanceof i))throw new TypeError(\"Cannot call a class as a function\")}function mi(e,i){for(var t=0;t<i.length;t++){var r=i[t];r.enumerable=r.enumerable||!1,r.configurable=!0,\"value\"in r&&(r.writable=!0),Object.defineProperty(e,r.key,r)}}function me(e,i,t){return i&&mi(e.prototype,i),t&&mi(e,t),e}function p(e,i,t){return i in e?Object.defineProperty(e,i,{value:t,enumerable:!0,configurable:!0,writable:!0}):e[i]=t,e}function Ai(e,i){var t=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);i&&(r=r.filter(function(a){return Object.getOwnPropertyDescriptor(e,a).enumerable})),t.push.apply(t,r)}return t}function ki(e){for(var i=1;i<arguments.length;i++){var t=arguments[i]!=null?arguments[i]:{};i%2?Ai(Object(t),!0).forEach(function(r){p(e,r,t[r])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):Ai(Object(t)).forEach(function(r){Object.defineProperty(e,r,Object.getOwnPropertyDescriptor(t,r))})}return e}function xa(e,i){if(typeof i!=\"function\"&&i!==null)throw new TypeError(\"Super expression must either be null or a function\");e.prototype=Object.create(i&&i.prototype,{constructor:{value:e,writable:!0,configurable:!0}}),i&&Ur(e,i)}function lr(e){return lr=Object.setPrototypeOf?Object.getPrototypeOf:function(t){return t.__proto__||Object.getPrototypeOf(t)},lr(e)}function Ur(e,i){return Ur=Object.setPrototypeOf||function(r,a){return r.__proto__=a,r},Ur(e,i)}function eo(){if(typeof Reflect>\"u\"||!Reflect.construct||Reflect.construct.sham)return!1;if(typeof Proxy==\"function\")return!0;try{return Date.prototype.toString.call(Reflect.construct(Date,[],function(){})),!0}catch{return!1}}function Ze(e){if(e===void 0)throw new ReferenceError(\"this hasn't been initialised - super() hasn't been called\");return e}function to(e,i){return i&&(typeof i==\"object\"||typeof i==\"function\")?i:Ze(e)}function ya(e){var i=eo();return function(){var r=lr(e),a;if(i){var n=lr(this).constructor;a=Reflect.construct(r,arguments,n)}else a=r.apply(this,arguments);return to(this,a)}}function Dr(e,i){return io(e)||no(e,i)||Ea(e,i)||ho()}function ur(e){return ro(e)||ao(e)||Ea(e)||oo()}function ro(e){if(Array.isArray(e))return zr(e)}function io(e){if(Array.isArray(e))return e}function ao(e){if(typeof Symbol<\"u\"&&Symbol.iterator in Object(e))return Array.from(e)}function no(e,i){if(!(typeof Symbol>\"u\"||!(Symbol.iterator in Object(e)))){var t=[],r=!0,a=!1,n=void 0;try{for(var h=e[Symbol.iterator](),f;!(r=(f=h.next()).done)&&(t.push(f.value),!(i&&t.length===i));r=!0);}catch(w){a=!0,n=w}finally{try{!r&&h.return!=null&&h.return()}finally{if(a)throw n}}return t}}function Ea(e,i){if(e){if(typeof e==\"string\")return zr(e,i);var t=Object.prototype.toString.call(e).slice(8,-1);if(t===\"Object\"&&e.constructor&&(t=e.constructor.name),t===\"Map\"||t===\"Set\")return Array.from(e);if(t===\"Arguments\"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t))return zr(e,i)}}function zr(e,i){(i==null||i>e.length)&&(i=e.length);for(var t=0,r=new Array(i);t<i;t++)r[t]=e[t];return r}function oo(){throw new TypeError(`Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ho(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ma(e,i,t){return t={path:i,exports:{},require:function(r,a){return Aa(r,a??t.path)}},e(t,t.exports),t.exports}function Aa(){throw new Error(\"Dynamic requires are not currently supported by @rollup/plugin-commonjs\")}var Ut=ma(function(e){var i=function(){var b=\"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\";return{encode:function(R){for(var V=\"\",Q=0,Ae=0,xe=0,H=0,oe=0,A=0,ne=0,D=0;D<R.length;)Q=R.charCodeAt(D++),H=Q>>2,Ae=R.charCodeAt(D++),oe=(Q&3)<<4|Ae>>4,xe=R.charCodeAt(D++),A=(Ae&15)<<2|xe>>6,ne=xe&63,isNaN(Ae)?A=ne=64:isNaN(xe)&&(ne=64),V+=b.charAt(H)+b.charAt(oe)+b.charAt(A)+b.charAt(ne);return V},decode:function(V){var Q=\"\",Ae=0,xe=0,H=0,oe=0,A=0,ne=0,D=0;V=V.replace(/[^\\w\\+\\/\\=]/g,\"\");for(var he=0;he<V.length;)oe=b.indexOf(V.charAt(he++)),A=b.indexOf(V.charAt(he++)),Ae=oe<<2|A>>4,Q+=String.fromCharCode(Ae),ne=b.indexOf(V.charAt(he++)),xe=(A&15)<<4|ne>>2,ne!==64&&(Q+=String.fromCharCode(xe)),D=b.indexOf(V.charAt(he++)),H=(ne&3)<<6|D,D!==64&&(Q+=String.fromCharCode(H));return Q}}}(),t=typeof Buffer<\"u\"&&typeof process<\"u\"&&typeof process.versions<\"u\"&&process.versions.node,r=function(){};if(typeof Buffer<\"u\"){var a=!Buffer.from;if(!a)try{Buffer.from(\"foo\",\"utf8\")}catch{a=!0}r=a?function(E,b){return b?new Buffer(E,b):new Buffer(E)}:Buffer.from.bind(Buffer),Buffer.alloc||(Buffer.alloc=function(E){return new Buffer(E)}),Buffer.allocUnsafe||(Buffer.allocUnsafe=function(E){return new Buffer(E)})}function n(E){return t?Buffer.alloc(E):new Array(E)}function h(E){return t?Buffer.allocUnsafe(E):new Array(E)}var f=function(b){return t?r(b,\"binary\"):b.split(\"\").map(function(R){return R.charCodeAt(0)&255})},w=/\\u0000/g,v=/[\\u0001-\\u0006]/g,_=function(E){for(var b=[],R=0;R<E[0].length;++R)b.push.apply(b,E[0][R]);return b},T=_,S=function(E,b,R){for(var V=[],Q=b;Q<R;Q+=2)V.push(String.fromCharCode($(E,Q)));return V.join(\"\").replace(w,\"\")},P=S,G=function(E,b,R){for(var V=[],Q=b;Q<b+R;++Q)V.push((\"0\"+E[Q].toString(16)).slice(-2));return V.join(\"\")},z=G,Y=function(E){if(Array.isArray(E[0]))return[].concat.apply([],E);var b=0,R=0;for(R=0;R<E.length;++R)b+=E[R].length;var V=new Uint8Array(b);for(R=0,b=0;R<E.length;b+=E[R].length,++R)V.set(E[R],b);return V},U=Y;t&&(S=function(E,b,R){return Buffer.isBuffer(E)?E.toString(\"utf16le\",b,R).replace(w,\"\"):P(E,b,R)},G=function(E,b,R){return Buffer.isBuffer(E)?E.toString(\"hex\",b,b+R):z(E,b,R)},_=function(E){return E[0].length>0&&Buffer.isBuffer(E[0][0])?Buffer.concat(E[0]):T(E)},f=function(E){return r(E,\"binary\")},U=function(E){return Buffer.isBuffer(E[0])?Buffer.concat(E):Y(E)});var ee=function(E,b){return E[b]},$=function(E,b){return E[b+1]*256+E[b]},K=function(E,b){var R=E[b+1]*256+E[b];return R<32768?R:(65535-R+1)*-1},C=function(E,b){return E[b+3]*(1<<24)+(E[b+2]<<16)+(E[b+1]<<8)+E[b]},X=function(E,b){return(E[b+3]<<24)+(E[b+2]<<16)+(E[b+1]<<8)+E[b]};function J(E,b){var R,V,Q=0;switch(E){case 1:R=ee(this,this.l);break;case 2:R=(b!==\"i\"?$:K)(this,this.l);break;case 4:R=X(this,this.l);break;case 16:Q=2,V=G(this,this.l,E)}return this.l+=E,Q===0?R:V}var Z=function(E,b,R){E[R]=b&255,E[R+1]=b>>>8&255,E[R+2]=b>>>16&255,E[R+3]=b>>>24&255},te=function(E,b,R){E[R]=b&255,E[R+1]=b>>8&255,E[R+2]=b>>16&255,E[R+3]=b>>24&255};function se(E,b,R){var V=0,Q=0;switch(R){case\"hex\":for(;Q<E;++Q)this[this.l++]=parseInt(b.slice(2*Q,2*Q+2),16)||0;return this;case\"utf16le\":var Ae=this.l+E;for(Q=0;Q<Math.min(b.length,E);++Q){var xe=b.charCodeAt(Q);this[this.l++]=xe&255,this[this.l++]=xe>>8}for(;this.l<Ae;)this[this.l++]=0;return this}switch(E){case 1:V=1,this[this.l]=b&255;break;case 2:V=2,this[this.l]=b&255,b>>>=8,this[this.l+1]=b&255;break;case 4:V=4,Z(this,b,this.l);break;case-4:V=4,te(this,b,this.l);break}return this.l+=V,this}function j(E,b){var R=G(this,this.l,E.length>>1);if(R!==E)throw new Error(b+\"Expected \"+E+\" saw \"+R);this.l+=E.length>>1}function ce(E,b){E.l=b,E.read_shift=J,E.chk=j,E.write_shift=se}function ge(E){var b=n(E);return ce(b,0),b}var $e;(function(E){E($e={})})(function(E){E.version=\"1.2.0\";function b(){for(var H=0,oe=new Array(256),A=0;A!=256;++A)H=A,H=H&1?-306674912^H>>>1:H>>>1,H=H&1?-306674912^H>>>1:H>>>1,H=H&1?-306674912^H>>>1:H>>>1,H=H&1?-306674912^H>>>1:H>>>1,H=H&1?-306674912^H>>>1:H>>>1,H=H&1?-306674912^H>>>1:H>>>1,H=H&1?-306674912^H>>>1:H>>>1,H=H&1?-306674912^H>>>1:H>>>1,oe[A]=H;return typeof Int32Array<\"u\"?new Int32Array(oe):oe}var R=b();function V(H,oe){for(var A=oe^-1,ne=H.length-1,D=0;D<ne;)A=A>>>8^R[(A^H.charCodeAt(D++))&255],A=A>>>8^R[(A^H.charCodeAt(D++))&255];return D===ne&&(A=A>>>8^R[(A^H.charCodeAt(D))&255]),A^-1}function Q(H,oe){if(H.length>1e4)return Ae(H,oe);for(var A=oe^-1,ne=H.length-3,D=0;D<ne;)A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255];for(;D<ne+3;)A=A>>>8^R[(A^H[D++])&255];return A^-1}function Ae(H,oe){for(var A=oe^-1,ne=H.length-7,D=0;D<ne;)A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255],A=A>>>8^R[(A^H[D++])&255];for(;D<ne+7;)A=A>>>8^R[(A^H[D++])&255];return A^-1}function xe(H,oe){for(var A=oe^-1,ne=0,D=H.length,he,xt;ne<D;)he=H.charCodeAt(ne++),he<128?A=A>>>8^R[(A^he)&255]:he<2048?(A=A>>>8^R[(A^(192|he>>6&31))&255],A=A>>>8^R[(A^(128|he&63))&255]):he>=55296&&he<57344?(he=(he&1023)+64,xt=H.charCodeAt(ne++)&1023,A=A>>>8^R[(A^(240|he>>8&7))&255],A=A>>>8^R[(A^(128|he>>2&63))&255],A=A>>>8^R[(A^(128|xt>>6&15|(he&3)<<4))&255],A=A>>>8^R[(A^(128|xt&63))&255]):(A=A>>>8^R[(A^(224|he>>12&15))&255],A=A>>>8^R[(A^(128|he>>6&63))&255],A=A>>>8^R[(A^(128|he&63))&255]);return A^-1}E.table=R,E.bstr=V,E.buf=Q,E.str=xe});var Ue=function(){var b={};b.version=\"1.2.0\";function R(o,d){for(var s=o.split(\"/\"),l=d.split(\"/\"),c=0,u=0,g=Math.min(s.length,l.length);c<g;++c){if(u=s[c].length-l[c].length)return u;if(s[c]!=l[c])return s[c]<l[c]?-1:1}return s.length-l.length}function V(o){if(o.charAt(o.length-1)==\"/\")return o.slice(0,-1).indexOf(\"/\")===-1?o:V(o.slice(0,-1));var d=o.lastIndexOf(\"/\");return d===-1?o:o.slice(0,d+1)}function Q(o){if(o.charAt(o.length-1)==\"/\")return Q(o.slice(0,-1));var d=o.lastIndexOf(\"/\");return d===-1?o:o.slice(d+1)}function Ae(o,d){typeof d==\"string\"&&(d=new Date(d));var s=d.getHours();s=s<<6|d.getMinutes(),s=s<<5|d.getSeconds()>>>1,o.write_shift(2,s);var l=d.getFullYear()-1980;l=l<<4|d.getMonth()+1,l=l<<5|d.getDate(),o.write_shift(2,l)}function xe(o){var d=o.read_shift(2)&65535,s=o.read_shift(2)&65535,l=new Date,c=s&31;s>>>=5;var u=s&15;s>>>=4,l.setMilliseconds(0),l.setFullYear(s+1980),l.setMonth(u-1),l.setDate(c);var g=d&31;d>>>=5;var m=d&63;return d>>>=6,l.setHours(d),l.setMinutes(m),l.setSeconds(g<<1),l}function H(o){ce(o,0);for(var d={},s=0;o.l<=o.length-4;){var l=o.read_shift(2),c=o.read_shift(2),u=o.l+c,g={};switch(l){case 21589:s=o.read_shift(1),s&1&&(g.mtime=o.read_shift(4)),c>5&&(s&2&&(g.atime=o.read_shift(4)),s&4&&(g.ctime=o.read_shift(4))),g.mtime&&(g.mt=new Date(g.mtime*1e3));break}o.l=u,d[l]=g}return d}var oe;function A(){return oe||(oe=Ei)}function ne(o,d){if(o[0]==80&&o[1]==75)return yi(o,d);if((o[0]|32)==109&&(o[1]|32)==105)return Xn(o,d);if(o.length<512)throw new Error(\"CFB file size \"+o.length+\" < 512\");var s=3,l=512,c=0,u=0,g=0,m=0,x=0,k=[],y=o.slice(0,512);ce(y,0);var F=D(y);switch(s=F[0],s){case 3:l=512;break;case 4:l=4096;break;case 0:if(F[1]==0)return yi(o,d);default:throw new Error(\"Major Version: Expected 3 or 4 saw \"+s)}l!==512&&(y=o.slice(0,l),ce(y,28));var I=o.slice(0,l);he(y,s);var L=y.read_shift(4,\"i\");if(s===3&&L!==0)throw new Error(\"# Directory Sectors: Expected 0 saw \"+L);y.l+=4,g=y.read_shift(4,\"i\"),y.l+=4,y.chk(\"00100000\",\"Mini Stream Cutoff Size: \"),m=y.read_shift(4,\"i\"),c=y.read_shift(4,\"i\"),x=y.read_shift(4,\"i\"),u=y.read_shift(4,\"i\");for(var B=-1,N=0;N<109&&(B=y.read_shift(4,\"i\"),!(B<0));++N)k[N]=B;var re=xt(o,l);hi(x,u,re,l,k);var de=yn(re,g,k,l);de[g].name=\"!Directory\",c>0&&m!==ye&&(de[m].name=\"!MiniFAT\"),de[k[0]].name=\"!FAT\",de.fat_addrs=k,de.ssz=l;var le={},be=[],kt=[],bt=[];En(g,de,re,be,c,le,kt,m),wn(kt,bt,be),be.shift();var Pt={FileIndex:kt,FullPaths:bt};return d&&d.raw&&(Pt.raw={header:I,sectors:re}),Pt}function D(o){if(o[o.l]==80&&o[o.l+1]==75)return[0,0];o.chk(li,\"Header Signature: \"),o.l+=16;var d=o.read_shift(2,\"u\");return[o.read_shift(2,\"u\"),d]}function he(o,d){var s=9;switch(o.l+=2,s=o.read_shift(2)){case 9:if(d!=3)throw new Error(\"Sector Shift: Expected 9 saw \"+s);break;case 12:if(d!=4)throw new Error(\"Sector Shift: Expected 12 saw \"+s);break;default:throw new Error(\"Sector Shift: Expected 9 or 12 saw \"+s)}o.chk(\"0600\",\"Mini Sector Shift: \"),o.chk(\"000000000000\",\"Reserved: \")}function xt(o,d){for(var s=Math.ceil(o.length/d)-1,l=[],c=1;c<s;++c)l[c-1]=o.slice(c*d,(c+1)*d);return l[s-1]=o.slice(s*d),l}function wn(o,d,s){for(var l=0,c=0,u=0,g=0,m=0,x=s.length,k=[],y=[];l<x;++l)k[l]=y[l]=l,d[l]=s[l];for(;m<y.length;++m)l=y[m],c=o[l].L,u=o[l].R,g=o[l].C,k[l]===l&&(c!==-1&&k[c]!==c&&(k[l]=k[c]),u!==-1&&k[u]!==u&&(k[l]=k[u])),g!==-1&&(k[g]=l),c!==-1&&l!=k[l]&&(k[c]=k[l],y.lastIndexOf(c)<m&&y.push(c)),u!==-1&&l!=k[l]&&(k[u]=k[l],y.lastIndexOf(u)<m&&y.push(u));for(l=1;l<x;++l)k[l]===l&&(u!==-1&&k[u]!==u?k[l]=k[u]:c!==-1&&k[c]!==c&&(k[l]=k[c]));for(l=1;l<x;++l)if(o[l].type!==0){if(m=l,m!=k[m])do m=k[m],d[l]=d[m]+\"/\"+d[l];while(m!==0&&k[m]!==-1&&m!=k[m]);k[l]=-1}for(d[0]+=\"/\",l=1;l<x;++l)o[l].type!==2&&(d[l]+=\"/\")}function gn(o,d,s){for(var l=o.start,c=o.size,u=[],g=l;s&&c>0&&g>=0;)u.push(d.slice(g*Mt,g*Mt+Mt)),c-=Mt,g=X(s,g*4);return u.length===0?ge(0):U(u).slice(0,o.size)}function hi(o,d,s,l,c){var u=ye;if(o===ye){if(d!==0)throw new Error(\"DIFAT chain shorter than expected\")}else if(o!==-1){var g=s[o],m=(l>>>2)-1;if(!g)return;for(var x=0;x<m&&(u=X(g,x*4))!==ye;++x)c.push(u);hi(X(g,l-4),d-1,s,l,c)}}function xn(o,d,s,l,c){var u=[],g=[];c||(c=[]);var m=l-1,x=0,k=0;for(x=d;x>=0;){c[x]=!0,u[u.length]=x,g.push(o[x]);var y=s[Math.floor(x*4/l)];if(k=x*4&m,l<4+k)throw new Error(\"FAT boundary crossed: \"+x+\" 4 \"+l);if(!o[y])break;x=X(o[y],k)}return{nodes:u,data:_([g])}}function yn(o,d,s,l){var c=o.length,u=[],g=[],m=[],x=[],k=l-1,y=0,F=0,I=0,L=0;for(y=0;y<c;++y)if(m=[],I=y+d,I>=c&&(I-=c),!g[I]){x=[];var B=[];for(F=I;F>=0;){B[F]=!0,g[F]=!0,m[m.length]=F,x.push(o[F]);var N=s[Math.floor(F*4/l)];if(L=F*4&k,l<4+L)throw new Error(\"FAT boundary crossed: \"+F+\" 4 \"+l);if(!o[N]||(F=X(o[N],L),B[F]))break}u[I]={nodes:m,data:_([x])}}return u}function En(o,d,s,l,c,u,g,m){for(var x=0,k=l.length?2:0,y=d[o].data,F=0,I=0,L;F<y.length;F+=128){var B=y.slice(F,F+128);ce(B,64),I=B.read_shift(2),L=S(B,0,I-k),l.push(L);var N={name:L,type:B.read_shift(1),color:B.read_shift(1),L:B.read_shift(4,\"i\"),R:B.read_shift(4,\"i\"),C:B.read_shift(4,\"i\"),clsid:B.read_shift(16),state:B.read_shift(4,\"i\"),start:0,size:0},re=B.read_shift(2)+B.read_shift(2)+B.read_shift(2)+B.read_shift(2);re!==0&&(N.ct=fi(B,B.l-8));var de=B.read_shift(2)+B.read_shift(2)+B.read_shift(2)+B.read_shift(2);de!==0&&(N.mt=fi(B,B.l-8)),N.start=B.read_shift(4,\"i\"),N.size=B.read_shift(4,\"i\"),N.size<0&&N.start<0&&(N.size=N.type=0,N.start=ye,N.name=\"\"),N.type===5?(x=N.start,c>0&&x!==ye&&(d[x].name=\"!StreamData\")):N.size>=4096?(N.storage=\"fat\",d[N.start]===void 0&&(d[N.start]=xn(s,N.start,d.fat_addrs,d.ssz)),d[N.start].name=N.name,N.content=d[N.start].data.slice(0,N.size)):(N.storage=\"minifat\",N.size<0?N.size=0:x!==ye&&N.start!==ye&&d[x]&&(N.content=gn(N,d[x].data,(d[m]||{}).data))),N.content&&ce(N.content,0),u[L]=N,g.push(N)}}function fi(o,d){return new Date((C(o,d+4)/1e7*Math.pow(2,32)+C(o,d)/1e7-11644473600)*1e3)}function mn(o,d){return A(),ne(oe.readFileSync(o),d)}function An(o,d){switch(d&&d.type||\"base64\"){case\"file\":return mn(o,d);case\"base64\":return ne(f(i.decode(o)),d);case\"binary\":return ne(f(o),d)}return ne(o,d)}function Qe(o,d){var s=d||{},l=s.root||\"Root Entry\";if(o.FullPaths||(o.FullPaths=[]),o.FileIndex||(o.FileIndex=[]),o.FullPaths.length!==o.FileIndex.length)throw new Error(\"inconsistent CFB structure\");o.FullPaths.length===0&&(o.FullPaths[0]=l+\"/\",o.FileIndex[0]={name:l,type:5}),s.CLSID&&(o.FileIndex[0].clsid=s.CLSID),kn(o)}function kn(o){var d=\"\u0001Sh33tJ5\";if(!Ue.find(o,\"/\"+d)){var s=ge(4);s[0]=55,s[1]=s[3]=50,s[2]=54,o.FileIndex.push({name:d,type:2,content:s,size:4,L:69,R:69,C:69}),o.FullPaths.push(o.FullPaths[0]+d),pr(o)}}function pr(o,d){Qe(o);for(var s=!1,l=!1,c=o.FullPaths.length-1;c>=0;--c){var u=o.FileIndex[c];switch(u.type){case 0:l?s=!0:(o.FileIndex.pop(),o.FullPaths.pop());break;case 1:case 2:case 5:l=!0,isNaN(u.R*u.L*u.C)&&(s=!0),u.R>-1&&u.L>-1&&u.R==u.L&&(s=!0);break;default:s=!0;break}}if(!(!s&&!d)){var g=new Date(1987,1,19),m=0,x=[];for(c=0;c<o.FullPaths.length;++c)o.FileIndex[c].type!==0&&x.push([o.FullPaths[c],o.FileIndex[c]]);for(c=0;c<x.length;++c){var k=V(x[c][0]);for(l=!1,m=0;m<x.length;++m)x[m][0]===k&&(l=!0);l||x.push([k,{name:Q(k).replace(\"/\",\"\"),type:1,clsid:wr,ct:g,mt:g,content:null}])}for(x.sort(function(I,L){return R(I[0],L[0])}),o.FullPaths=[],o.FileIndex=[],c=0;c<x.length;++c)o.FullPaths[c]=x[c][0],o.FileIndex[c]=x[c][1];for(c=0;c<x.length;++c){var y=o.FileIndex[c],F=o.FullPaths[c];if(y.name=Q(F).replace(\"/\",\"\"),y.L=y.R=y.C=-(y.color=1),y.size=y.content?y.content.length:0,y.start=0,y.clsid=y.clsid||wr,c===0)y.C=x.length>1?1:-1,y.size=0,y.type=5;else if(F.slice(-1)==\"/\"){for(m=c+1;m<x.length&&V(o.FullPaths[m])!=F;++m);for(y.C=m>=x.length?-1:m,m=c+1;m<x.length&&V(o.FullPaths[m])!=V(F);++m);y.R=m>=x.length?-1:m,y.type=1}else V(o.FullPaths[c+1]||\"\")==V(F)&&(y.R=c+1),y.type=2}}}function si(o,d){var s=d||{};if(s.fileType==\"mad\")return Vn(o,s);switch(pr(o),s.fileType){case\"zip\":return Wn(o,s)}var l=function(L){for(var B=0,N=0,re=0;re<L.FileIndex.length;++re){var de=L.FileIndex[re];if(de.content){var le=de.content.length;le>0&&(le<4096?B+=le+63>>6:N+=le+511>>9)}}for(var be=L.FullPaths.length+3>>2,kt=B+7>>3,bt=B+127>>7,Pt=kt+N+be+bt,et=Pt+127>>7,kr=et<=109?0:Math.ceil((et-109)/127);Pt+et+kr+127>>7>et;)kr=++et<=109?0:Math.ceil((et-109)/127);var ze=[1,kr,et,bt,be,N,B,0];return L.FileIndex[0].size=B<<6,ze[7]=(L.FileIndex[0].start=ze[0]+ze[1]+ze[2]+ze[3]+ze[4]+ze[5])+(ze[6]+7>>3),ze}(o),c=ge(l[7]<<9),u=0,g=0;{for(u=0;u<8;++u)c.write_shift(1,Pn[u]);for(u=0;u<8;++u)c.write_shift(2,0);for(c.write_shift(2,62),c.write_shift(2,3),c.write_shift(2,65534),c.write_shift(2,9),c.write_shift(2,6),u=0;u<3;++u)c.write_shift(2,0);for(c.write_shift(4,0),c.write_shift(4,l[2]),c.write_shift(4,l[0]+l[1]+l[2]+l[3]-1),c.write_shift(4,0),c.write_shift(4,4096),c.write_shift(4,l[3]?l[0]+l[1]+l[2]-1:ye),c.write_shift(4,l[3]),c.write_shift(-4,l[1]?l[0]-1:ye),c.write_shift(4,l[1]),u=0;u<109;++u)c.write_shift(-4,u<l[2]?l[1]+u:-1)}if(l[1])for(g=0;g<l[1];++g){for(;u<236+g*127;++u)c.write_shift(-4,u<l[2]?l[1]+u:-1);c.write_shift(-4,g===l[1]-1?ye:g+1)}var m=function(L){for(g+=L;u<g-1;++u)c.write_shift(-4,u+1);L&&(++u,c.write_shift(-4,ye))};for(g=u=0,g+=l[1];u<g;++u)c.write_shift(-4,yt.DIFSECT);for(g+=l[2];u<g;++u)c.write_shift(-4,yt.FATSECT);m(l[3]),m(l[4]);for(var x=0,k=0,y=o.FileIndex[0];x<o.FileIndex.length;++x)y=o.FileIndex[x],y.content&&(k=y.content.length,!(k<4096)&&(y.start=g,m(k+511>>9)));for(m(l[6]+7>>3);c.l&511;)c.write_shift(-4,yt.ENDOFCHAIN);for(g=u=0,x=0;x<o.FileIndex.length;++x)y=o.FileIndex[x],y.content&&(k=y.content.length,!(!k||k>=4096)&&(y.start=g,m(k+63>>6)));for(;c.l&511;)c.write_shift(-4,yt.ENDOFCHAIN);for(u=0;u<l[4]<<2;++u){var F=o.FullPaths[u];if(!F||F.length===0){for(x=0;x<17;++x)c.write_shift(4,0);for(x=0;x<3;++x)c.write_shift(4,-1);for(x=0;x<12;++x)c.write_shift(4,0);continue}y=o.FileIndex[u],u===0&&(y.start=y.size?y.start-1:ye);var I=u===0&&s.root||y.name;if(k=2*(I.length+1),c.write_shift(64,I,\"utf16le\"),c.write_shift(2,k),c.write_shift(1,y.type),c.write_shift(1,y.color),c.write_shift(-4,y.L),c.write_shift(-4,y.R),c.write_shift(-4,y.C),y.clsid)c.write_shift(16,y.clsid,\"hex\");else for(x=0;x<4;++x)c.write_shift(4,0);c.write_shift(4,y.state||0),c.write_shift(4,0),c.write_shift(4,0),c.write_shift(4,0),c.write_shift(4,0),c.write_shift(4,y.start),c.write_shift(4,y.size),c.write_shift(4,0)}for(u=1;u<o.FileIndex.length;++u)if(y=o.FileIndex[u],y.size>=4096){for(c.l=y.start+1<<9,x=0;x<y.size;++x)c.write_shift(1,y.content[x]);for(;x&511;++x)c.write_shift(1,0)}for(u=1;u<o.FileIndex.length;++u)if(y=o.FileIndex[u],y.size>0&&y.size<4096){for(x=0;x<y.size;++x)c.write_shift(1,y.content[x]);for(;x&63;++x)c.write_shift(1,0)}for(;c.l<c.length;)c.write_shift(1,0);return c}function bn(o,d){var s=o.FullPaths.map(function(x){return x.toUpperCase()}),l=s.map(function(x){var k=x.split(\"/\");return k[k.length-(x.slice(-1)==\"/\"?2:1)]}),c=!1;d.charCodeAt(0)===47?(c=!0,d=s[0].slice(0,-1)+d):c=d.indexOf(\"/\")!==-1;var u=d.toUpperCase(),g=c===!0?s.indexOf(u):l.indexOf(u);if(g!==-1)return o.FileIndex[g];var m=!u.match(v);for(u=u.replace(w,\"\"),m&&(u=u.replace(v,\"!\")),g=0;g<s.length;++g)if((m?s[g].replace(v,\"!\"):s[g]).replace(w,\"\")==u||(m?l[g].replace(v,\"!\"):l[g]).replace(w,\"\")==u)return o.FileIndex[g];return null}var Mt=64,ye=-2,li=\"d0cf11e0a1b11ae1\",Pn=[208,207,17,224,161,177,26,225],wr=\"00000000000000000000000000000000\",yt={MAXREGSECT:-6,DIFSECT:-4,FATSECT:-3,ENDOFCHAIN:ye,FREESECT:-1,HEADER_SIGNATURE:li,HEADER_MINOR_VERSION:\"3e00\",MAXREGSID:-6,NOSTREAM:-1,HEADER_CLSID:wr,EntryTypes:[\"unknown\",\"storage\",\"stream\",\"lockbytes\",\"property\",\"root\"]};function Sn(o,d,s){A();var l=si(o,s);oe.writeFileSync(d,l)}function Et(o){for(var d=new Array(o.length),s=0;s<o.length;++s)d[s]=String.fromCharCode(o[s]);return d.join(\"\")}function Rn(o,d){var s=si(o,d);switch(d&&d.type||\"buffer\"){case\"file\":return A(),oe.writeFileSync(d.filename,s),s;case\"binary\":return typeof s==\"string\"?s:Et(s);case\"base64\":return i.encode(typeof s==\"string\"?s:Et(s));case\"buffer\":if(t)return Buffer.isBuffer(s)?s:r(s);case\"array\":return typeof s==\"string\"?f(s):s}return s}var mt;function Tn(o){try{var d=o.InflateRaw,s=new d;if(s._processChunk(new Uint8Array([3,0]),s._finishFlushFlag),s.bytesRead)mt=o;else throw new Error(\"zlib does not expose bytesRead\")}catch(l){console.error(\"cannot use native zlib: \"+(l.message||l))}}function Fn(o,d){if(!mt)return xi(o,d);var s=mt.InflateRaw,l=new s,c=l._processChunk(o.slice(o.l),l._finishFlushFlag);return o.l+=l.bytesRead,c}function Hn(o){return mt?mt.deflateRawSync(o):ci(o)}var Cn=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],Bn=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],In=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];function Nn(o){var d=(o<<1|o<<11)&139536|(o<<5|o<<15)&558144;return(d>>16|d>>8|d)&255}for(var ke=typeof Uint8Array<\"u\",At=ke?new Uint8Array(256):[],Wt=0;Wt<256;++Wt)At[Wt]=Nn(Wt);function On(o,d){var s=At[o&255];return d<=8?s>>>8-d:(s=s<<8|At[o>>8&255],d<=16?s>>>16-d:(s=s<<8|At[o>>16&255],s>>>24-d))}function Ln(o,d){var s=d&7,l=d>>>3;return(o[l]|(s<=6?0:o[l+1]<<8))>>>s&3}function gr(o,d){var s=d&7,l=d>>>3;return(o[l]|(s<=5?0:o[l+1]<<8))>>>s&7}function Un(o,d){var s=d&7,l=d>>>3;return(o[l]|(s<=4?0:o[l+1]<<8))>>>s&15}function ui(o,d){var s=d&7,l=d>>>3;return(o[l]|(s<=3?0:o[l+1]<<8))>>>s&31}function di(o,d){var s=d&7,l=d>>>3;return(o[l]|(s<=1?0:o[l+1]<<8))>>>s&127}function Zt(o,d,s){var l=d&7,c=d>>>3,u=(1<<s)-1,g=o[c]>>>l;return s<8-l||(g|=o[c+1]<<8-l,s<16-l)||(g|=o[c+2]<<16-l,s<24-l)||(g|=o[c+3]<<24-l),g&u}function xr(o,d){var s=o.length,l=2*s>d?2*s:d+5,c=0;if(s>=d)return o;if(t){var u=h(l);if(o.copy)o.copy(u);else for(;c<o.length;++c)u[c]=o[c];return u}else if(ke){var g=new Uint8Array(l);if(g.set)g.set(o);else for(;c<o.length;++c)g[c]=o[c];return g}return o.length=l,o}function Be(o){for(var d=new Array(o),s=0;s<o;++s)d[s]=0;return d}var ci=function(){var o=function(){return function(s,l){for(var c=0;c<s.length;){var u=Math.min(65535,s.length-c),g=c+u==s.length;for(l.write_shift(1,+g),l.write_shift(2,u),l.write_shift(2,~u&65535);u-- >0;)l[l.l++]=s[c++]}return l.l}}();return function(d){var s=ge(50+Math.floor(d.length*1.1)),l=o(d,s);return s.slice(0,l)}}();function jt(o,d,s){var l=1,c=0,u=0,g=0,m=0,x=o.length,k=ke?new Uint16Array(32):Be(32);for(u=0;u<32;++u)k[u]=0;for(u=x;u<s;++u)o[u]=0;x=o.length;var y=ke?new Uint16Array(x):Be(x);for(u=0;u<x;++u)k[c=o[u]]++,l<c&&(l=c),y[u]=0;for(k[0]=0,u=1;u<=l;++u)k[u+16]=m=m+k[u-1]<<1;for(u=0;u<x;++u)m=o[u],m!=0&&(y[u]=k[m+16]++);var F=0;for(u=0;u<x;++u)if(F=o[u],F!=0)for(m=On(y[u],l)>>l-F,g=(1<<l+4-F)-1;g>=0;--g)d[m|g<<F]=F&15|u<<4;return l}var yr=ke?new Uint16Array(512):Be(512),Er=ke?new Uint16Array(32):Be(32);if(!ke){for(var qe=0;qe<512;++qe)yr[qe]=0;for(qe=0;qe<32;++qe)Er[qe]=0}(function(){for(var o=[],d=0;d<32;d++)o.push(5);jt(o,Er,32);var s=[];for(d=0;d<=143;d++)s.push(8);for(;d<=255;d++)s.push(9);for(;d<=279;d++)s.push(7);for(;d<=287;d++)s.push(8);jt(s,yr,288)})();var vi=ke?new Uint16Array(32768):Be(32768),_i=ke?new Uint16Array(32768):Be(32768),pi=ke?new Uint16Array(128):Be(128),wi=1,gi=1;function zn(o,d){var s=ui(o,d)+257;d+=5;var l=ui(o,d)+1;d+=5;var c=Un(o,d)+4;d+=4;for(var u=0,g=ke?new Uint8Array(19):Be(19),m=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],x=1,k=ke?new Uint8Array(8):Be(8),y=ke?new Uint8Array(8):Be(8),F=g.length,I=0;I<c;++I)g[Cn[I]]=u=gr(o,d),x<u&&(x=u),k[u]++,d+=3;var L=0;for(k[0]=0,I=1;I<=x;++I)y[I]=L=L+k[I-1]<<1;for(I=0;I<F;++I)(L=g[I])!=0&&(m[I]=y[L]++);var B=0;for(I=0;I<F;++I)if(B=g[I],B!=0){L=At[m[I]]>>8-B;for(var N=(1<<7-B)-1;N>=0;--N)pi[L|N<<B]=B&7|I<<3}var re=[];for(x=1;re.length<s+l;)switch(L=pi[di(o,d)],d+=L&7,L>>>=3){case 16:for(u=3+Ln(o,d),d+=2,L=re[re.length-1];u-- >0;)re.push(L);break;case 17:for(u=3+gr(o,d),d+=3;u-- >0;)re.push(0);break;case 18:for(u=11+di(o,d),d+=7;u-- >0;)re.push(0);break;default:re.push(L),x<L&&(x=L);break}var de=re.slice(0,s),le=re.slice(s);for(I=s;I<286;++I)de[I]=0;for(I=l;I<30;++I)le[I]=0;return wi=jt(de,vi,286),gi=jt(le,_i,30),d}function Gn(o,d){if(o[0]==3&&!(o[1]&3))return[n(d),2];for(var s=0,l=0,c=h(d||1<<18),u=0,g=c.length>>>0,m=0,x=0;!(l&1);){if(l=gr(o,s),s+=3,l>>>1)l>>>1==1?(m=9,x=5):(s=zn(o,s),m=wi,x=gi);else{s&7&&(s+=8-(s&7));var k=o[s>>>3]|o[(s>>>3)+1]<<8;if(s+=32,!d&&g<u+k&&(c=xr(c,u+k),g=c.length),typeof o.copy==\"function\")o.copy(c,u,s>>>3,(s>>>3)+k),u+=k,s+=8*k;else for(;k-- >0;)c[u++]=o[s>>>3],s+=8;continue}for(!d&&g<u+32767&&(c=xr(c,u+32767),g=c.length);;){var y=Zt(o,s,m),F=l>>>1==1?yr[y]:vi[y];if(s+=F&15,F>>>=4,!(F>>>8&255))c[u++]=F;else{if(F==256)break;F-=257;var I=F<8?0:F-4>>2;I>5&&(I=0);var L=u+Bn[F];I>0&&(L+=Zt(o,s,I),s+=I),y=Zt(o,s,x),F=l>>>1==1?Er[y]:_i[y],s+=F&15,F>>>=4;var B=F<4?0:F-2>>1,N=In[F];for(B>0&&(N+=Zt(o,s,B),s+=B),!d&&g<L&&(c=xr(c,L),g=c.length);u<L;)c[u]=c[u-N],++u}}}return[d?c:c.slice(0,u),s+7>>>3]}function xi(o,d){var s=o.slice(o.l||0),l=Gn(s,d);return o.l+=l[1],l[0]}function mr(o,d){if(o)typeof console<\"u\"&&console.error(d);else throw new Error(d)}function yi(o,d){var s=o;ce(s,0);var l=[],c=[],u={FileIndex:l,FullPaths:c};Qe(u,{root:d.root});for(var g=s.length-4;(s[g]!=80||s[g+1]!=75||s[g+2]!=5||s[g+3]!=6)&&g>=0;)--g;s.l=g+4,s.l+=4;var m=s.read_shift(2);s.l+=6;var x=s.read_shift(4);for(s.l=x,g=0;g<m;++g){s.l+=20;var k=s.read_shift(4),y=s.read_shift(4),F=s.read_shift(2),I=s.read_shift(2),L=s.read_shift(2);s.l+=8;var B=s.read_shift(4),N=H(s.slice(s.l+F,s.l+F+I));s.l+=F+I+L;var re=s.l;s.l=B+4,Mn(s,k,y,u,N),s.l=re}return u}function Mn(o,d,s,l,c){o.l+=2;var u=o.read_shift(2),g=o.read_shift(2),m=xe(o);if(u&8257)throw new Error(\"Unsupported ZIP encryption\");for(var x=o.read_shift(4),k=o.read_shift(4),y=o.read_shift(4),F=o.read_shift(2),I=o.read_shift(2),L=\"\",B=0;B<F;++B)L+=String.fromCharCode(o[o.l++]);if(I){var N=H(o.slice(o.l,o.l+I));(N[21589]||{}).mt&&(m=N[21589].mt),((c||{})[21589]||{}).mt&&(m=c[21589].mt)}o.l+=I;var re=o.slice(o.l,o.l+k);switch(g){case 8:re=Fn(o,y);break;case 0:break;default:throw new Error(\"Unsupported ZIP Compression method \"+g)}var de=!1;u&8&&(x=o.read_shift(4),x==134695760&&(x=o.read_shift(4),de=!0),k=o.read_shift(4),y=o.read_shift(4)),k!=d&&mr(de,\"Bad compressed size: \"+d+\" != \"+k),y!=s&&mr(de,\"Bad uncompressed size: \"+s+\" != \"+y);var le=$e.buf(re,0);x>>0!=le>>0&&mr(de,\"Bad CRC32 checksum: \"+x+\" != \"+le),Ar(l,L,re,{unsafe:!0,mt:m})}function Wn(o,d){var s=d||{},l=[],c=[],u=ge(1),g=s.compression?8:0,m=0,x=0,k=0,y=0,F=0,I=o.FullPaths[0],L=I,B=o.FileIndex[0],N=[],re=0;for(x=1;x<o.FullPaths.length;++x)if(L=o.FullPaths[x].slice(I.length),B=o.FileIndex[x],!(!B.size||!B.content||L==\"\u0001Sh33tJ5\")){var de=y,le=ge(L.length);for(k=0;k<L.length;++k)le.write_shift(1,L.charCodeAt(k)&127);le=le.slice(0,le.l),N[F]=$e.buf(B.content,0);var be=B.content;g==8&&(be=Hn(be)),u=ge(30),u.write_shift(4,67324752),u.write_shift(2,20),u.write_shift(2,m),u.write_shift(2,g),B.mt?Ae(u,B.mt):u.write_shift(4,0),u.write_shift(-4,N[F]),u.write_shift(4,be.length),u.write_shift(4,B.content.length),u.write_shift(2,le.length),u.write_shift(2,0),y+=u.length,l.push(u),y+=le.length,l.push(le),y+=be.length,l.push(be),u=ge(46),u.write_shift(4,33639248),u.write_shift(2,0),u.write_shift(2,20),u.write_shift(2,m),u.write_shift(2,g),u.write_shift(4,0),u.write_shift(-4,N[F]),u.write_shift(4,be.length),u.write_shift(4,B.content.length),u.write_shift(2,le.length),u.write_shift(2,0),u.write_shift(2,0),u.write_shift(2,0),u.write_shift(2,0),u.write_shift(4,0),u.write_shift(4,de),re+=u.l,c.push(u),re+=le.length,c.push(le),++F}return u=ge(22),u.write_shift(4,101010256),u.write_shift(2,0),u.write_shift(2,0),u.write_shift(2,F),u.write_shift(2,F),u.write_shift(4,re),u.write_shift(4,y),u.write_shift(2,0),U([U(l),U(c),u])}var $t={htm:\"text/html\",xml:\"text/xml\",gif:\"image/gif\",jpg:\"image/jpeg\",png:\"image/png\",mso:\"application/x-mso\",thmx:\"application/vnd.ms-officetheme\",sh33tj5:\"application/octet-stream\"};function Zn(o,d){if(o.ctype)return o.ctype;var s=o.name||\"\",l=s.match(/\\.([^\\.]+)$/);return l&&$t[l[1]]||d&&(l=(s=d).match(/[\\.\\\\]([^\\.\\\\])+$/),l&&$t[l[1]])?$t[l[1]]:\"application/octet-stream\"}function jn(o){for(var d=i.encode(o),s=[],l=0;l<d.length;l+=76)s.push(d.slice(l,l+76));return s.join(`\\r\n`)+`\\r\n`}function $n(o){var d=o.replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7E-\\xFF=]/g,function(k){var y=k.charCodeAt(0).toString(16).toUpperCase();return\"=\"+(y.length==1?\"0\"+y:y)});d=d.replace(/ $/mg,\"=20\").replace(/\\t$/mg,\"=09\"),d.charAt(0)==`\n`&&(d=\"=0D\"+d.slice(1)),d=d.replace(/\\r(?!\\n)/mg,\"=0D\").replace(/\\n\\n/mg,`\n=0A`).replace(/([^\\r\\n])\\n/mg,\"$1=0A\");for(var s=[],l=d.split(`\\r\n`),c=0;c<l.length;++c){var u=l[c];if(u.length==0){s.push(\"\");continue}for(var g=0;g<u.length;){var m=76,x=u.slice(g,g+m);x.charAt(m-1)==\"=\"?m--:x.charAt(m-2)==\"=\"?m-=2:x.charAt(m-3)==\"=\"&&(m-=3),x=u.slice(g,g+m),g+=m,g<u.length&&(x+=\"=\"),s.push(x)}}return s.join(`\\r\n`)}function Kn(o){for(var d=[],s=0;s<o.length;++s){for(var l=o[s];s<=o.length&&l.charAt(l.length-1)==\"=\";)l=l.slice(0,l.length-1)+o[++s];d.push(l)}for(var c=0;c<d.length;++c)d[c]=d[c].replace(/=[0-9A-Fa-f]{2}/g,function(u){return String.fromCharCode(parseInt(u.slice(1),16))});return f(d.join(`\\r\n`))}function Yn(o,d,s){for(var l=\"\",c=\"\",u=\"\",g,m=0;m<10;++m){var x=d[m];if(!x||x.match(/^\\s*$/))break;var k=x.match(/^(.*?):\\s*([^\\s].*)$/);if(k)switch(k[1].toLowerCase()){case\"content-location\":l=k[2].trim();break;case\"content-type\":u=k[2].trim();break;case\"content-transfer-encoding\":c=k[2].trim();break}}switch(++m,c.toLowerCase()){case\"base64\":g=f(i.decode(d.slice(m).join(\"\")));break;case\"quoted-printable\":g=Kn(d.slice(m));break;default:throw new Error(\"Unsupported Content-Transfer-Encoding \"+c)}var y=Ar(o,l.slice(s.length),g,{unsafe:!0});u&&(y.ctype=u)}function Xn(o,d){if(Et(o.slice(0,13)).toLowerCase()!=\"mime-version:\")throw new Error(\"Unsupported MAD header\");var s=d&&d.root||\"\",l=(t&&Buffer.isBuffer(o)?o.toString(\"binary\"):Et(o)).split(`\\r\n`),c=0,u=\"\";for(c=0;c<l.length;++c)if(u=l[c],!!/^Content-Location:/i.test(u)&&(u=u.slice(u.indexOf(\"file\")),s||(s=u.slice(0,u.lastIndexOf(\"/\")+1)),u.slice(0,s.length)!=s))for(;s.length>0&&(s=s.slice(0,s.length-1),s=s.slice(0,s.lastIndexOf(\"/\")+1),u.slice(0,s.length)!=s););var g=(l[1]||\"\").match(/boundary=\"(.*?)\"/);if(!g)throw new Error(\"MAD cannot find boundary\");var m=\"--\"+(g[1]||\"\"),x=[],k=[],y={FileIndex:x,FullPaths:k};Qe(y);var F,I=0;for(c=0;c<l.length;++c){var L=l[c];L!==m&&L!==m+\"--\"||(I++&&Yn(y,l.slice(F,c),s),F=c)}return y}function Vn(o,d){var s=d||{},l=s.boundary||\"SheetJS\";l=\"------=\"+l;for(var c=[\"MIME-Version: 1.0\",'Content-Type: multipart/related; boundary=\"'+l.slice(2)+'\"',\"\",\"\",\"\"],u=o.FullPaths[0],g=u,m=o.FileIndex[0],x=1;x<o.FullPaths.length;++x)if(g=o.FullPaths[x].slice(u.length),m=o.FileIndex[x],!(!m.size||!m.content||g==\"\u0001Sh33tJ5\")){g=g.replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7E-\\xFF]/g,function(re){return\"_x\"+re.charCodeAt(0).toString(16)+\"_\"}).replace(/[\\u0080-\\uFFFF]/g,function(re){return\"_u\"+re.charCodeAt(0).toString(16)+\"_\"});for(var k=m.content,y=t&&Buffer.isBuffer(k)?k.toString(\"binary\"):Et(k),F=0,I=Math.min(1024,y.length),L=0,B=0;B<=I;++B)(L=y.charCodeAt(B))>=32&&L<128&&++F;var N=F>=I*4/5;c.push(l),c.push(\"Content-Location: \"+(s.root||\"file:///C:/SheetJS/\")+g),c.push(\"Content-Transfer-Encoding: \"+(N?\"quoted-printable\":\"base64\")),c.push(\"Content-Type: \"+Zn(m,g)),c.push(\"\"),c.push(N?$n(y):jn(y))}return c.push(l+`--\\r\n`),c.join(`\\r\n`)}function Dn(o){var d={};return Qe(d,o),d}function Ar(o,d,s,l){var c=l&&l.unsafe;c||Qe(o);var u=!c&&Ue.find(o,d);if(!u){var g=o.FullPaths[0];d.slice(0,g.length)==g?g=d:(g.slice(-1)!=\"/\"&&(g+=\"/\"),g=(g+d).replace(\"//\",\"/\")),u={name:Q(d),type:2},o.FileIndex.push(u),o.FullPaths.push(g),c||Ue.utils.cfb_gc(o)}return u.content=s,u.size=s?s.length:0,l&&(l.CLSID&&(u.clsid=l.CLSID),l.mt&&(u.mt=l.mt),l.ct&&(u.ct=l.ct)),u}function Jn(o,d){Qe(o);var s=Ue.find(o,d);if(s){for(var l=0;l<o.FileIndex.length;++l)if(o.FileIndex[l]==s)return o.FileIndex.splice(l,1),o.FullPaths.splice(l,1),!0}return!1}function Qn(o,d,s){Qe(o);var l=Ue.find(o,d);if(l){for(var c=0;c<o.FileIndex.length;++c)if(o.FileIndex[c]==l)return o.FileIndex[c].name=Q(s),o.FullPaths[c]=s,!0}return!1}function qn(o){pr(o,!0)}return b.find=bn,b.read=An,b.parse=ne,b.write=Rn,b.writeFile=Sn,b.utils={cfb_new:Dn,cfb_add:Ar,cfb_del:Jn,cfb_mov:Qn,cfb_gc:qn,ReadShift:J,CheckField:j,prep_blob:ce,bconcat:U,use_zlib:Tn,_deflateRaw:ci,_inflateRaw:xi,consts:yt},b}();typeof Aa<\"u\"&&typeof DO_NOT_EXPORT_CFB>\"u\"&&(e.exports=Ue)}),W=ma(function(e,i){var t=typeof Uint8Array<\"u\"&&typeof Uint16Array<\"u\"&&typeof Int32Array<\"u\";function r(h,f){return Object.prototype.hasOwnProperty.call(h,f)}i.assign=function(h){for(var f=Array.prototype.slice.call(arguments,1);f.length;){var w=f.shift();if(w){if(typeof w!=\"object\")throw new TypeError(w+\"must be non-object\");for(var v in w)r(w,v)&&(h[v]=w[v])}}return h},i.shrinkBuf=function(h,f){return h.length===f?h:h.subarray?h.subarray(0,f):(h.length=f,h)};var a={arraySet:function(h,f,w,v,_){if(f.subarray&&h.subarray){h.set(f.subarray(w,w+v),_);return}for(var T=0;T<v;T++)h[_+T]=f[w+T]},flattenChunks:function(h){var f,w,v,_,T,S;for(v=0,f=0,w=h.length;f<w;f++)v+=h[f].length;for(S=new Uint8Array(v),_=0,f=0,w=h.length;f<w;f++)T=h[f],S.set(T,_),_+=T.length;return S}},n={arraySet:function(h,f,w,v,_){for(var T=0;T<v;T++)h[_+T]=f[w+T]},flattenChunks:function(h){return[].concat.apply([],h)}};i.setTyped=function(h){h?(i.Buf8=Uint8Array,i.Buf16=Uint16Array,i.Buf32=Int32Array,i.assign(i,a)):(i.Buf8=Array,i.Buf16=Array,i.Buf32=Array,i.assign(i,n))},i.setTyped(t)}),fo=4,bi=0,Pi=1,so=2;function wt(e){for(var i=e.length;--i>=0;)e[i]=0}var lo=0,ka=1,uo=2,co=3,vo=258,Jr=29,zt=256,Ct=zt+1+Jr,vt=30,Qr=19,ba=2*Ct+1,tt=15,br=16,_o=7,qr=256,Pa=16,Sa=17,Ra=18,Gr=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],ar=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],po=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],Ta=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],wo=512,We=new Array((Ct+2)*2);wt(We);var Tt=new Array(vt*2);wt(Tt);var Bt=new Array(wo);wt(Bt);var It=new Array(vo-co+1);wt(It);var ei=new Array(Jr);wt(ei);var dr=new Array(vt);wt(dr);function Pr(e,i,t,r,a){this.static_tree=e,this.extra_bits=i,this.extra_base=t,this.elems=r,this.max_length=a,this.has_stree=e&&e.length}var Fa,Ha,Ca;function Sr(e,i){this.dyn_tree=e,this.max_code=0,this.stat_desc=i}function Ba(e){return e<256?Bt[e]:Bt[256+(e>>>7)]}function Nt(e,i){e.pending_buf[e.pending++]=i&255,e.pending_buf[e.pending++]=i>>>8&255}function Ee(e,i,t){e.bi_valid>br-t?(e.bi_buf|=i<<e.bi_valid&65535,Nt(e,e.bi_buf),e.bi_buf=i>>br-e.bi_valid,e.bi_valid+=t-br):(e.bi_buf|=i<<e.bi_valid&65535,e.bi_valid+=t)}function Ne(e,i,t){Ee(e,t[i*2],t[i*2+1])}function Ia(e,i){var t=0;do t|=e&1,e>>>=1,t<<=1;while(--i>0);return t>>>1}function go(e){e.bi_valid===16?(Nt(e,e.bi_buf),e.bi_buf=0,e.bi_valid=0):e.bi_valid>=8&&(e.pending_buf[e.pending++]=e.bi_buf&255,e.bi_buf>>=8,e.bi_valid-=8)}function xo(e,i){var t=i.dyn_tree,r=i.max_code,a=i.stat_desc.static_tree,n=i.stat_desc.has_stree,h=i.stat_desc.extra_bits,f=i.stat_desc.extra_base,w=i.stat_desc.max_length,v,_,T,S,P,G,z=0;for(S=0;S<=tt;S++)e.bl_count[S]=0;for(t[e.heap[e.heap_max]*2+1]=0,v=e.heap_max+1;v<ba;v++)_=e.heap[v],S=t[t[_*2+1]*2+1]+1,S>w&&(S=w,z++),t[_*2+1]=S,!(_>r)&&(e.bl_count[S]++,P=0,_>=f&&(P=h[_-f]),G=t[_*2],e.opt_len+=G*(S+P),n&&(e.static_len+=G*(a[_*2+1]+P)));if(z!==0){do{for(S=w-1;e.bl_count[S]===0;)S--;e.bl_count[S]--,e.bl_count[S+1]+=2,e.bl_count[w]--,z-=2}while(z>0);for(S=w;S!==0;S--)for(_=e.bl_count[S];_!==0;)T=e.heap[--v],!(T>r)&&(t[T*2+1]!==S&&(e.opt_len+=(S-t[T*2+1])*t[T*2],t[T*2+1]=S),_--)}}function Na(e,i,t){var r=new Array(tt+1),a=0,n,h;for(n=1;n<=tt;n++)r[n]=a=a+t[n-1]<<1;for(h=0;h<=i;h++){var f=e[h*2+1];f!==0&&(e[h*2]=Ia(r[f]++,f))}}function yo(){var e,i,t,r,a,n=new Array(tt+1);for(t=0,r=0;r<Jr-1;r++)for(ei[r]=t,e=0;e<1<<Gr[r];e++)It[t++]=r;for(It[t-1]=r,a=0,r=0;r<16;r++)for(dr[r]=a,e=0;e<1<<ar[r];e++)Bt[a++]=r;for(a>>=7;r<vt;r++)for(dr[r]=a<<7,e=0;e<1<<ar[r]-7;e++)Bt[256+a++]=r;for(i=0;i<=tt;i++)n[i]=0;for(e=0;e<=143;)We[e*2+1]=8,e++,n[8]++;for(;e<=255;)We[e*2+1]=9,e++,n[9]++;for(;e<=279;)We[e*2+1]=7,e++,n[7]++;for(;e<=287;)We[e*2+1]=8,e++,n[8]++;for(Na(We,Ct+1,n),e=0;e<vt;e++)Tt[e*2+1]=5,Tt[e*2]=Ia(e,5);Fa=new Pr(We,Gr,zt+1,Ct,tt),Ha=new Pr(Tt,ar,0,vt,tt),Ca=new Pr(new Array(0),po,0,Qr,_o)}function Oa(e){var i;for(i=0;i<Ct;i++)e.dyn_ltree[i*2]=0;for(i=0;i<vt;i++)e.dyn_dtree[i*2]=0;for(i=0;i<Qr;i++)e.bl_tree[i*2]=0;e.dyn_ltree[qr*2]=1,e.opt_len=e.static_len=0,e.last_lit=e.matches=0}function La(e){e.bi_valid>8?Nt(e,e.bi_buf):e.bi_valid>0&&(e.pending_buf[e.pending++]=e.bi_buf),e.bi_buf=0,e.bi_valid=0}function Eo(e,i,t,r){La(e),r&&(Nt(e,t),Nt(e,~t)),W.arraySet(e.pending_buf,e.window,i,t,e.pending),e.pending+=t}function Si(e,i,t,r){var a=i*2,n=t*2;return e[a]<e[n]||e[a]===e[n]&&r[i]<=r[t]}function Rr(e,i,t){for(var r=e.heap[t],a=t<<1;a<=e.heap_len&&(a<e.heap_len&&Si(i,e.heap[a+1],e.heap[a],e.depth)&&a++,!Si(i,r,e.heap[a],e.depth));)e.heap[t]=e.heap[a],t=a,a<<=1;e.heap[t]=r}function Ri(e,i,t){var r,a,n=0,h,f;if(e.last_lit!==0)do r=e.pending_buf[e.d_buf+n*2]<<8|e.pending_buf[e.d_buf+n*2+1],a=e.pending_buf[e.l_buf+n],n++,r===0?Ne(e,a,i):(h=It[a],Ne(e,h+zt+1,i),f=Gr[h],f!==0&&(a-=ei[h],Ee(e,a,f)),r--,h=Ba(r),Ne(e,h,t),f=ar[h],f!==0&&(r-=dr[h],Ee(e,r,f)));while(n<e.last_lit);Ne(e,qr,i)}function Mr(e,i){var t=i.dyn_tree,r=i.stat_desc.static_tree,a=i.stat_desc.has_stree,n=i.stat_desc.elems,h,f,w=-1,v;for(e.heap_len=0,e.heap_max=ba,h=0;h<n;h++)t[h*2]!==0?(e.heap[++e.heap_len]=w=h,e.depth[h]=0):t[h*2+1]=0;for(;e.heap_len<2;)v=e.heap[++e.heap_len]=w<2?++w:0,t[v*2]=1,e.depth[v]=0,e.opt_len--,a&&(e.static_len-=r[v*2+1]);for(i.max_code=w,h=e.heap_len>>1;h>=1;h--)Rr(e,t,h);v=n;do h=e.heap[1],e.heap[1]=e.heap[e.heap_len--],Rr(e,t,1),f=e.heap[1],e.heap[--e.heap_max]=h,e.heap[--e.heap_max]=f,t[v*2]=t[h*2]+t[f*2],e.depth[v]=(e.depth[h]>=e.depth[f]?e.depth[h]:e.depth[f])+1,t[h*2+1]=t[f*2+1]=v,e.heap[1]=v++,Rr(e,t,1);while(e.heap_len>=2);e.heap[--e.heap_max]=e.heap[1],xo(e,i),Na(t,w,e.bl_count)}function Ti(e,i,t){var r,a=-1,n,h=i[0*2+1],f=0,w=7,v=4;for(h===0&&(w=138,v=3),i[(t+1)*2+1]=65535,r=0;r<=t;r++)n=h,h=i[(r+1)*2+1],!(++f<w&&n===h)&&(f<v?e.bl_tree[n*2]+=f:n!==0?(n!==a&&e.bl_tree[n*2]++,e.bl_tree[Pa*2]++):f<=10?e.bl_tree[Sa*2]++:e.bl_tree[Ra*2]++,f=0,a=n,h===0?(w=138,v=3):n===h?(w=6,v=3):(w=7,v=4))}function Fi(e,i,t){var r,a=-1,n,h=i[0*2+1],f=0,w=7,v=4;for(h===0&&(w=138,v=3),r=0;r<=t;r++)if(n=h,h=i[(r+1)*2+1],!(++f<w&&n===h)){if(f<v)do Ne(e,n,e.bl_tree);while(--f!==0);else n!==0?(n!==a&&(Ne(e,n,e.bl_tree),f--),Ne(e,Pa,e.bl_tree),Ee(e,f-3,2)):f<=10?(Ne(e,Sa,e.bl_tree),Ee(e,f-3,3)):(Ne(e,Ra,e.bl_tree),Ee(e,f-11,7));f=0,a=n,h===0?(w=138,v=3):n===h?(w=6,v=3):(w=7,v=4)}}function mo(e){var i;for(Ti(e,e.dyn_ltree,e.l_desc.max_code),Ti(e,e.dyn_dtree,e.d_desc.max_code),Mr(e,e.bl_desc),i=Qr-1;i>=3&&e.bl_tree[Ta[i]*2+1]===0;i--);return e.opt_len+=3*(i+1)+5+5+4,i}function Ao(e,i,t,r){var a;for(Ee(e,i-257,5),Ee(e,t-1,5),Ee(e,r-4,4),a=0;a<r;a++)Ee(e,e.bl_tree[Ta[a]*2+1],3);Fi(e,e.dyn_ltree,i-1),Fi(e,e.dyn_dtree,t-1)}function ko(e){var i=4093624447,t;for(t=0;t<=31;t++,i>>>=1)if(i&1&&e.dyn_ltree[t*2]!==0)return bi;if(e.dyn_ltree[9*2]!==0||e.dyn_ltree[10*2]!==0||e.dyn_ltree[13*2]!==0)return Pi;for(t=32;t<zt;t++)if(e.dyn_ltree[t*2]!==0)return Pi;return bi}var Hi=!1;function bo(e){Hi||(yo(),Hi=!0),e.l_desc=new Sr(e.dyn_ltree,Fa),e.d_desc=new Sr(e.dyn_dtree,Ha),e.bl_desc=new Sr(e.bl_tree,Ca),e.bi_buf=0,e.bi_valid=0,Oa(e)}function Ua(e,i,t,r){Ee(e,(lo<<1)+(r?1:0),3),Eo(e,i,t,!0)}function Po(e){Ee(e,ka<<1,3),Ne(e,qr,We),go(e)}function So(e,i,t,r){var a,n,h=0;e.level>0?(e.strm.data_type===so&&(e.strm.data_type=ko(e)),Mr(e,e.l_desc),Mr(e,e.d_desc),h=mo(e),a=e.opt_len+3+7>>>3,n=e.static_len+3+7>>>3,n<=a&&(a=n)):a=n=t+5,t+4<=a&&i!==-1?Ua(e,i,t,r):e.strategy===fo||n===a?(Ee(e,(ka<<1)+(r?1:0),3),Ri(e,We,Tt)):(Ee(e,(uo<<1)+(r?1:0),3),Ao(e,e.l_desc.max_code+1,e.d_desc.max_code+1,h+1),Ri(e,e.dyn_ltree,e.dyn_dtree)),Oa(e),r&&La(e)}function Ro(e,i,t){return e.pending_buf[e.d_buf+e.last_lit*2]=i>>>8&255,e.pending_buf[e.d_buf+e.last_lit*2+1]=i&255,e.pending_buf[e.l_buf+e.last_lit]=t&255,e.last_lit++,i===0?e.dyn_ltree[t*2]++:(e.matches++,i--,e.dyn_ltree[(It[t]+zt+1)*2]++,e.dyn_dtree[Ba(i)*2]++),e.last_lit===e.lit_bufsize-1}var To=bo,Fo=Ua,Ho=So,Co=Ro,Bo=Po,Te={_tr_init:To,_tr_stored_block:Fo,_tr_flush_block:Ho,_tr_tally:Co,_tr_align:Bo};function Io(e,i,t,r){for(var a=e&65535|0,n=e>>>16&65535|0,h=0;t!==0;){h=t>2e3?2e3:t,t-=h;do a=a+i[r++]|0,n=n+a|0;while(--h);a%=65521,n%=65521}return a|n<<16|0}var Ot=Io;function No(){for(var e,i=[],t=0;t<256;t++){e=t;for(var r=0;r<8;r++)e=e&1?3988292384^e>>>1:e>>>1;i[t]=e}return i}var Oo=No();function Lo(e,i,t,r){var a=Oo,n=r+t;e^=-1;for(var h=r;h<n;h++)e=e>>>8^a[(e^i[h])&255];return e^-1}var _e=Lo,at={2:\"need dictionary\",1:\"stream end\",0:\"\",\"-1\":\"file error\",\"-2\":\"stream error\",\"-3\":\"data error\",\"-4\":\"insufficient memory\",\"-5\":\"buffer error\",\"-6\":\"incompatible version\"},lt=0,Uo=1,zo=3,Je=4,Ci=5,Oe=0,Bi=1,Fe=-2,Go=-3,Tr=-5,Mo=-1,Wo=1,Kt=2,Zo=3,jo=4,$o=0,Ko=2,vr=8,Yo=9,Xo=15,Vo=8,Do=29,Jo=256,Wr=Jo+1+Do,Qo=30,qo=19,eh=2*Wr+1,th=15,q=3,Ve=258,Ce=Ve+q+1,rh=32,_r=42,Zr=69,nr=73,or=91,hr=103,rt=113,Rt=666,ve=1,Gt=2,nt=3,gt=4,ih=3;function De(e,i){return e.msg=at[i],i}function Ii(e){return(e<<1)-(e>4?9:0)}function Xe(e){for(var i=e.length;--i>=0;)e[i]=0}function Ke(e){var i=e.state,t=i.pending;t>e.avail_out&&(t=e.avail_out),t!==0&&(W.arraySet(e.output,i.pending_buf,i.pending_out,t,e.next_out),e.next_out+=t,i.pending_out+=t,e.total_out+=t,e.avail_out-=t,i.pending-=t,i.pending===0&&(i.pending_out=0))}function pe(e,i){Te._tr_flush_block(e,e.block_start>=0?e.block_start:-1,e.strstart-e.block_start,i),e.block_start=e.strstart,Ke(e.strm)}function ie(e,i){e.pending_buf[e.pending++]=i}function St(e,i){e.pending_buf[e.pending++]=i>>>8&255,e.pending_buf[e.pending++]=i&255}function ah(e,i,t,r){var a=e.avail_in;return a>r&&(a=r),a===0?0:(e.avail_in-=a,W.arraySet(i,e.input,e.next_in,a,t),e.state.wrap===1?e.adler=Ot(e.adler,i,a,t):e.state.wrap===2&&(e.adler=_e(e.adler,i,a,t)),e.next_in+=a,e.total_in+=a,a)}function za(e,i){var t=e.max_chain_length,r=e.strstart,a,n,h=e.prev_length,f=e.nice_match,w=e.strstart>e.w_size-Ce?e.strstart-(e.w_size-Ce):0,v=e.window,_=e.w_mask,T=e.prev,S=e.strstart+Ve,P=v[r+h-1],G=v[r+h];e.prev_length>=e.good_match&&(t>>=2),f>e.lookahead&&(f=e.lookahead);do if(a=i,!(v[a+h]!==G||v[a+h-1]!==P||v[a]!==v[r]||v[++a]!==v[r+1])){r+=2,a++;do;while(v[++r]===v[++a]&&v[++r]===v[++a]&&v[++r]===v[++a]&&v[++r]===v[++a]&&v[++r]===v[++a]&&v[++r]===v[++a]&&v[++r]===v[++a]&&v[++r]===v[++a]&&r<S);if(n=Ve-(S-r),r=S-Ve,n>h){if(e.match_start=i,h=n,n>=f)break;P=v[r+h-1],G=v[r+h]}}while((i=T[i&_])>w&&--t!==0);return h<=e.lookahead?h:e.lookahead}function ot(e){var i=e.w_size,t,r,a,n,h;do{if(n=e.window_size-e.lookahead-e.strstart,e.strstart>=i+(i-Ce)){W.arraySet(e.window,e.window,i,i,0),e.match_start-=i,e.strstart-=i,e.block_start-=i,r=e.hash_size,t=r;do a=e.head[--t],e.head[t]=a>=i?a-i:0;while(--r);r=i,t=r;do a=e.prev[--t],e.prev[t]=a>=i?a-i:0;while(--r);n+=i}if(e.strm.avail_in===0)break;if(r=ah(e.strm,e.window,e.strstart+e.lookahead,n),e.lookahead+=r,e.lookahead+e.insert>=q)for(h=e.strstart-e.insert,e.ins_h=e.window[h],e.ins_h=(e.ins_h<<e.hash_shift^e.window[h+1])&e.hash_mask;e.insert&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[h+q-1])&e.hash_mask,e.prev[h&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=h,h++,e.insert--,!(e.lookahead+e.insert<q)););}while(e.lookahead<Ce&&e.strm.avail_in!==0)}function nh(e,i){var t=65535;for(t>e.pending_buf_size-5&&(t=e.pending_buf_size-5);;){if(e.lookahead<=1){if(ot(e),e.lookahead===0&&i===lt)return ve;if(e.lookahead===0)break}e.strstart+=e.lookahead,e.lookahead=0;var r=e.block_start+t;if((e.strstart===0||e.strstart>=r)&&(e.lookahead=e.strstart-r,e.strstart=r,pe(e,!1),e.strm.avail_out===0)||e.strstart-e.block_start>=e.w_size-Ce&&(pe(e,!1),e.strm.avail_out===0))return ve}return e.insert=0,i===Je?(pe(e,!0),e.strm.avail_out===0?nt:gt):(e.strstart>e.block_start&&(pe(e,!1),e.strm.avail_out===0),ve)}function Fr(e,i){for(var t,r;;){if(e.lookahead<Ce){if(ot(e),e.lookahead<Ce&&i===lt)return ve;if(e.lookahead===0)break}if(t=0,e.lookahead>=q&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+q-1])&e.hash_mask,t=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),t!==0&&e.strstart-t<=e.w_size-Ce&&(e.match_length=za(e,t)),e.match_length>=q)if(r=Te._tr_tally(e,e.strstart-e.match_start,e.match_length-q),e.lookahead-=e.match_length,e.match_length<=e.max_lazy_match&&e.lookahead>=q){e.match_length--;do e.strstart++,e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+q-1])&e.hash_mask,t=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart;while(--e.match_length!==0);e.strstart++}else e.strstart+=e.match_length,e.match_length=0,e.ins_h=e.window[e.strstart],e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+1])&e.hash_mask;else r=Te._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++;if(r&&(pe(e,!1),e.strm.avail_out===0))return ve}return e.insert=e.strstart<q-1?e.strstart:q-1,i===Je?(pe(e,!0),e.strm.avail_out===0?nt:gt):e.last_lit&&(pe(e,!1),e.strm.avail_out===0)?ve:Gt}function ut(e,i){for(var t,r,a;;){if(e.lookahead<Ce){if(ot(e),e.lookahead<Ce&&i===lt)return ve;if(e.lookahead===0)break}if(t=0,e.lookahead>=q&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+q-1])&e.hash_mask,t=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),e.prev_length=e.match_length,e.prev_match=e.match_start,e.match_length=q-1,t!==0&&e.prev_length<e.max_lazy_match&&e.strstart-t<=e.w_size-Ce&&(e.match_length=za(e,t),e.match_length<=5&&(e.strategy===Wo||e.match_length===q&&e.strstart-e.match_start>4096)&&(e.match_length=q-1)),e.prev_length>=q&&e.match_length<=e.prev_length){a=e.strstart+e.lookahead-q,r=Te._tr_tally(e,e.strstart-1-e.prev_match,e.prev_length-q),e.lookahead-=e.prev_length-1,e.prev_length-=2;do++e.strstart<=a&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+q-1])&e.hash_mask,t=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart);while(--e.prev_length!==0);if(e.match_available=0,e.match_length=q-1,e.strstart++,r&&(pe(e,!1),e.strm.avail_out===0))return ve}else if(e.match_available){if(r=Te._tr_tally(e,0,e.window[e.strstart-1]),r&&pe(e,!1),e.strstart++,e.lookahead--,e.strm.avail_out===0)return ve}else e.match_available=1,e.strstart++,e.lookahead--}return e.match_available&&(r=Te._tr_tally(e,0,e.window[e.strstart-1]),e.match_available=0),e.insert=e.strstart<q-1?e.strstart:q-1,i===Je?(pe(e,!0),e.strm.avail_out===0?nt:gt):e.last_lit&&(pe(e,!1),e.strm.avail_out===0)?ve:Gt}function oh(e,i){for(var t,r,a,n,h=e.window;;){if(e.lookahead<=Ve){if(ot(e),e.lookahead<=Ve&&i===lt)return ve;if(e.lookahead===0)break}if(e.match_length=0,e.lookahead>=q&&e.strstart>0&&(a=e.strstart-1,r=h[a],r===h[++a]&&r===h[++a]&&r===h[++a])){n=e.strstart+Ve;do;while(r===h[++a]&&r===h[++a]&&r===h[++a]&&r===h[++a]&&r===h[++a]&&r===h[++a]&&r===h[++a]&&r===h[++a]&&a<n);e.match_length=Ve-(n-a),e.match_length>e.lookahead&&(e.match_length=e.lookahead)}if(e.match_length>=q?(t=Te._tr_tally(e,1,e.match_length-q),e.lookahead-=e.match_length,e.strstart+=e.match_length,e.match_length=0):(t=Te._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++),t&&(pe(e,!1),e.strm.avail_out===0))return ve}return e.insert=0,i===Je?(pe(e,!0),e.strm.avail_out===0?nt:gt):e.last_lit&&(pe(e,!1),e.strm.avail_out===0)?ve:Gt}function hh(e,i){for(var t;;){if(e.lookahead===0&&(ot(e),e.lookahead===0)){if(i===lt)return ve;break}if(e.match_length=0,t=Te._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++,t&&(pe(e,!1),e.strm.avail_out===0))return ve}return e.insert=0,i===Je?(pe(e,!0),e.strm.avail_out===0?nt:gt):e.last_lit&&(pe(e,!1),e.strm.avail_out===0)?ve:Gt}function Ie(e,i,t,r,a){this.good_length=e,this.max_lazy=i,this.nice_length=t,this.max_chain=r,this.func=a}var ct;ct=[new Ie(0,0,0,0,nh),new Ie(4,4,8,4,Fr),new Ie(4,5,16,8,Fr),new Ie(4,6,32,32,Fr),new Ie(4,4,16,16,ut),new Ie(8,16,32,32,ut),new Ie(8,16,128,128,ut),new Ie(8,32,128,256,ut),new Ie(32,128,258,1024,ut),new Ie(32,258,258,4096,ut)];function fh(e){e.window_size=2*e.w_size,Xe(e.head),e.max_lazy_match=ct[e.level].max_lazy,e.good_match=ct[e.level].good_length,e.nice_match=ct[e.level].nice_length,e.max_chain_length=ct[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=q-1,e.match_available=0,e.ins_h=0}function sh(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=vr,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new W.Buf16(eh*2),this.dyn_dtree=new W.Buf16((2*Qo+1)*2),this.bl_tree=new W.Buf16((2*qo+1)*2),Xe(this.dyn_ltree),Xe(this.dyn_dtree),Xe(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new W.Buf16(th+1),this.heap=new W.Buf16(2*Wr+1),Xe(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new W.Buf16(2*Wr+1),Xe(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function Ga(e){var i;return!e||!e.state?De(e,Fe):(e.total_in=e.total_out=0,e.data_type=Ko,i=e.state,i.pending=0,i.pending_out=0,i.wrap<0&&(i.wrap=-i.wrap),i.status=i.wrap?_r:rt,e.adler=i.wrap===2?0:1,i.last_flush=lt,Te._tr_init(i),Oe)}function Ma(e){var i=Ga(e);return i===Oe&&fh(e.state),i}function lh(e,i){return!e||!e.state||e.state.wrap!==2?Fe:(e.state.gzhead=i,Oe)}function Wa(e,i,t,r,a,n){if(!e)return Fe;var h=1;if(i===Mo&&(i=6),r<0?(h=0,r=-r):r>15&&(h=2,r-=16),a<1||a>Yo||t!==vr||r<8||r>15||i<0||i>9||n<0||n>jo)return De(e,Fe);r===8&&(r=9);var f=new sh;return e.state=f,f.strm=e,f.wrap=h,f.gzhead=null,f.w_bits=r,f.w_size=1<<f.w_bits,f.w_mask=f.w_size-1,f.hash_bits=a+7,f.hash_size=1<<f.hash_bits,f.hash_mask=f.hash_size-1,f.hash_shift=~~((f.hash_bits+q-1)/q),f.window=new W.Buf8(f.w_size*2),f.head=new W.Buf16(f.hash_size),f.prev=new W.Buf16(f.w_size),f.lit_bufsize=1<<a+6,f.pending_buf_size=f.lit_bufsize*4,f.pending_buf=new W.Buf8(f.pending_buf_size),f.d_buf=1*f.lit_bufsize,f.l_buf=3*f.lit_bufsize,f.level=i,f.strategy=n,f.method=t,Ma(e)}function uh(e,i){return Wa(e,i,vr,Xo,Vo,$o)}function dh(e,i){var t,r,a,n;if(!e||!e.state||i>Ci||i<0)return e?De(e,Fe):Fe;if(r=e.state,!e.output||!e.input&&e.avail_in!==0||r.status===Rt&&i!==Je)return De(e,e.avail_out===0?Tr:Fe);if(r.strm=e,t=r.last_flush,r.last_flush=i,r.status===_r)if(r.wrap===2)e.adler=0,ie(r,31),ie(r,139),ie(r,8),r.gzhead?(ie(r,(r.gzhead.text?1:0)+(r.gzhead.hcrc?2:0)+(r.gzhead.extra?4:0)+(r.gzhead.name?8:0)+(r.gzhead.comment?16:0)),ie(r,r.gzhead.time&255),ie(r,r.gzhead.time>>8&255),ie(r,r.gzhead.time>>16&255),ie(r,r.gzhead.time>>24&255),ie(r,r.level===9?2:r.strategy>=Kt||r.level<2?4:0),ie(r,r.gzhead.os&255),r.gzhead.extra&&r.gzhead.extra.length&&(ie(r,r.gzhead.extra.length&255),ie(r,r.gzhead.extra.length>>8&255)),r.gzhead.hcrc&&(e.adler=_e(e.adler,r.pending_buf,r.pending,0)),r.gzindex=0,r.status=Zr):(ie(r,0),ie(r,0),ie(r,0),ie(r,0),ie(r,0),ie(r,r.level===9?2:r.strategy>=Kt||r.level<2?4:0),ie(r,ih),r.status=rt);else{var h=vr+(r.w_bits-8<<4)<<8,f=-1;r.strategy>=Kt||r.level<2?f=0:r.level<6?f=1:r.level===6?f=2:f=3,h|=f<<6,r.strstart!==0&&(h|=rh),h+=31-h%31,r.status=rt,St(r,h),r.strstart!==0&&(St(r,e.adler>>>16),St(r,e.adler&65535)),e.adler=1}if(r.status===Zr)if(r.gzhead.extra){for(a=r.pending;r.gzindex<(r.gzhead.extra.length&65535)&&!(r.pending===r.pending_buf_size&&(r.gzhead.hcrc&&r.pending>a&&(e.adler=_e(e.adler,r.pending_buf,r.pending-a,a)),Ke(e),a=r.pending,r.pending===r.pending_buf_size));)ie(r,r.gzhead.extra[r.gzindex]&255),r.gzindex++;r.gzhead.hcrc&&r.pending>a&&(e.adler=_e(e.adler,r.pending_buf,r.pending-a,a)),r.gzindex===r.gzhead.extra.length&&(r.gzindex=0,r.status=nr)}else r.status=nr;if(r.status===nr)if(r.gzhead.name){a=r.pending;do{if(r.pending===r.pending_buf_size&&(r.gzhead.hcrc&&r.pending>a&&(e.adler=_e(e.adler,r.pending_buf,r.pending-a,a)),Ke(e),a=r.pending,r.pending===r.pending_buf_size)){n=1;break}r.gzindex<r.gzhead.name.length?n=r.gzhead.name.charCodeAt(r.gzindex++)&255:n=0,ie(r,n)}while(n!==0);r.gzhead.hcrc&&r.pending>a&&(e.adler=_e(e.adler,r.pending_buf,r.pending-a,a)),n===0&&(r.gzindex=0,r.status=or)}else r.status=or;if(r.status===or)if(r.gzhead.comment){a=r.pending;do{if(r.pending===r.pending_buf_size&&(r.gzhead.hcrc&&r.pending>a&&(e.adler=_e(e.adler,r.pending_buf,r.pending-a,a)),Ke(e),a=r.pending,r.pending===r.pending_buf_size)){n=1;break}r.gzindex<r.gzhead.comment.length?n=r.gzhead.comment.charCodeAt(r.gzindex++)&255:n=0,ie(r,n)}while(n!==0);r.gzhead.hcrc&&r.pending>a&&(e.adler=_e(e.adler,r.pending_buf,r.pending-a,a)),n===0&&(r.status=hr)}else r.status=hr;if(r.status===hr&&(r.gzhead.hcrc?(r.pending+2>r.pending_buf_size&&Ke(e),r.pending+2<=r.pending_buf_size&&(ie(r,e.adler&255),ie(r,e.adler>>8&255),e.adler=0,r.status=rt)):r.status=rt),r.pending!==0){if(Ke(e),e.avail_out===0)return r.last_flush=-1,Oe}else if(e.avail_in===0&&Ii(i)<=Ii(t)&&i!==Je)return De(e,Tr);if(r.status===Rt&&e.avail_in!==0)return De(e,Tr);if(e.avail_in!==0||r.lookahead!==0||i!==lt&&r.status!==Rt){var w=r.strategy===Kt?hh(r,i):r.strategy===Zo?oh(r,i):ct[r.level].func(r,i);if((w===nt||w===gt)&&(r.status=Rt),w===ve||w===nt)return e.avail_out===0&&(r.last_flush=-1),Oe;if(w===Gt&&(i===Uo?Te._tr_align(r):i!==Ci&&(Te._tr_stored_block(r,0,0,!1),i===zo&&(Xe(r.head),r.lookahead===0&&(r.strstart=0,r.block_start=0,r.insert=0))),Ke(e),e.avail_out===0))return r.last_flush=-1,Oe}return i!==Je?Oe:r.wrap<=0?Bi:(r.wrap===2?(ie(r,e.adler&255),ie(r,e.adler>>8&255),ie(r,e.adler>>16&255),ie(r,e.adler>>24&255),ie(r,e.total_in&255),ie(r,e.total_in>>8&255),ie(r,e.total_in>>16&255),ie(r,e.total_in>>24&255)):(St(r,e.adler>>>16),St(r,e.adler&65535)),Ke(e),r.wrap>0&&(r.wrap=-r.wrap),r.pending!==0?Oe:Bi)}function ch(e){var i;return!e||!e.state?Fe:(i=e.state.status,i!==_r&&i!==Zr&&i!==nr&&i!==or&&i!==hr&&i!==rt&&i!==Rt?De(e,Fe):(e.state=null,i===rt?De(e,Go):Oe))}function vh(e,i){var t=i.length,r,a,n,h,f,w,v,_;if(!e||!e.state||(r=e.state,h=r.wrap,h===2||h===1&&r.status!==_r||r.lookahead))return Fe;for(h===1&&(e.adler=Ot(e.adler,i,t,0)),r.wrap=0,t>=r.w_size&&(h===0&&(Xe(r.head),r.strstart=0,r.block_start=0,r.insert=0),_=new W.Buf8(r.w_size),W.arraySet(_,i,t-r.w_size,r.w_size,0),i=_,t=r.w_size),f=e.avail_in,w=e.next_in,v=e.input,e.avail_in=t,e.next_in=0,e.input=i,ot(r);r.lookahead>=q;){a=r.strstart,n=r.lookahead-(q-1);do r.ins_h=(r.ins_h<<r.hash_shift^r.window[a+q-1])&r.hash_mask,r.prev[a&r.w_mask]=r.head[r.ins_h],r.head[r.ins_h]=a,a++;while(--n);r.strstart=a,r.lookahead=q-1,ot(r)}return r.strstart+=r.lookahead,r.block_start=r.strstart,r.insert=r.lookahead,r.lookahead=0,r.match_length=r.prev_length=q-1,r.match_available=0,e.next_in=w,e.input=v,e.avail_in=f,r.wrap=h,Oe}var _h=uh,ph=Wa,wh=Ma,gh=Ga,xh=lh,yh=dh,Eh=ch,mh=vh,Ah=\"pako deflate (from Nodeca project)\",Ft={deflateInit:_h,deflateInit2:ph,deflateReset:wh,deflateResetKeep:gh,deflateSetHeader:xh,deflate:yh,deflateEnd:Eh,deflateSetDictionary:mh,deflateInfo:Ah},Za=!0,ja=!0;try{String.fromCharCode.apply(null,[0])}catch{Za=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch{ja=!1}var Lt=new W.Buf8(256);for(Ge=0;Ge<256;Ge++)Lt[Ge]=Ge>=252?6:Ge>=248?5:Ge>=240?4:Ge>=224?3:Ge>=192?2:1;var Ge;Lt[254]=Lt[254]=1;var kh=function(e){var i,t,r,a,n,h=e.length,f=0;for(a=0;a<h;a++)t=e.charCodeAt(a),(t&64512)===55296&&a+1<h&&(r=e.charCodeAt(a+1),(r&64512)===56320&&(t=65536+(t-55296<<10)+(r-56320),a++)),f+=t<128?1:t<2048?2:t<65536?3:4;for(i=new W.Buf8(f),n=0,a=0;n<f;a++)t=e.charCodeAt(a),(t&64512)===55296&&a+1<h&&(r=e.charCodeAt(a+1),(r&64512)===56320&&(t=65536+(t-55296<<10)+(r-56320),a++)),t<128?i[n++]=t:t<2048?(i[n++]=192|t>>>6,i[n++]=128|t&63):t<65536?(i[n++]=224|t>>>12,i[n++]=128|t>>>6&63,i[n++]=128|t&63):(i[n++]=240|t>>>18,i[n++]=128|t>>>12&63,i[n++]=128|t>>>6&63,i[n++]=128|t&63);return i};function $a(e,i){if(i<65534&&(e.subarray&&ja||!e.subarray&&Za))return String.fromCharCode.apply(null,W.shrinkBuf(e,i));for(var t=\"\",r=0;r<i;r++)t+=String.fromCharCode(e[r]);return t}var bh=function(e){return $a(e,e.length)},Ph=function(e){for(var i=new W.Buf8(e.length),t=0,r=i.length;t<r;t++)i[t]=e.charCodeAt(t);return i},Sh=function(e,i){var t,r,a,n,h=i||e.length,f=new Array(h*2);for(r=0,t=0;t<h;){if(a=e[t++],a<128){f[r++]=a;continue}if(n=Lt[a],n>4){f[r++]=65533,t+=n-1;continue}for(a&=n===2?31:n===3?15:7;n>1&&t<h;)a=a<<6|e[t++]&63,n--;if(n>1){f[r++]=65533;continue}a<65536?f[r++]=a:(a-=65536,f[r++]=55296|a>>10&1023,f[r++]=56320|a&1023)}return $a(f,r)},Rh=function(e,i){var t;for(i=i||e.length,i>e.length&&(i=e.length),t=i-1;t>=0&&(e[t]&192)===128;)t--;return t<0||t===0?i:t+Lt[e[t]]>i?t:i},it={string2buf:kh,buf2binstring:bh,binstring2buf:Ph,buf2string:Sh,utf8border:Rh};function Th(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg=\"\",this.state=null,this.data_type=2,this.adler=0}var Ka=Th,Ya=Object.prototype.toString,Fh=0,Hr=4,_t=0,Ni=1,Oi=2,Hh=-1,Ch=0,Bh=8;function ht(e){if(!(this instanceof ht))return new ht(e);this.options=W.assign({level:Hh,method:Bh,chunkSize:16384,windowBits:15,memLevel:8,strategy:Ch,to:\"\"},e||{});var i=this.options;i.raw&&i.windowBits>0?i.windowBits=-i.windowBits:i.gzip&&i.windowBits>0&&i.windowBits<16&&(i.windowBits+=16),this.err=0,this.msg=\"\",this.ended=!1,this.chunks=[],this.strm=new Ka,this.strm.avail_out=0;var t=Ft.deflateInit2(this.strm,i.level,i.method,i.windowBits,i.memLevel,i.strategy);if(t!==_t)throw new Error(at[t]);if(i.header&&Ft.deflateSetHeader(this.strm,i.header),i.dictionary){var r;if(typeof i.dictionary==\"string\"?r=it.string2buf(i.dictionary):Ya.call(i.dictionary)===\"[object ArrayBuffer]\"?r=new Uint8Array(i.dictionary):r=i.dictionary,t=Ft.deflateSetDictionary(this.strm,r),t!==_t)throw new Error(at[t]);this._dict_set=!0}}ht.prototype.push=function(e,i){var t=this.strm,r=this.options.chunkSize,a,n;if(this.ended)return!1;n=i===~~i?i:i===!0?Hr:Fh,typeof e==\"string\"?t.input=it.string2buf(e):Ya.call(e)===\"[object ArrayBuffer]\"?t.input=new Uint8Array(e):t.input=e,t.next_in=0,t.avail_in=t.input.length;do{if(t.avail_out===0&&(t.output=new W.Buf8(r),t.next_out=0,t.avail_out=r),a=Ft.deflate(t,n),a!==Ni&&a!==_t)return this.onEnd(a),this.ended=!0,!1;(t.avail_out===0||t.avail_in===0&&(n===Hr||n===Oi))&&(this.options.to===\"string\"?this.onData(it.buf2binstring(W.shrinkBuf(t.output,t.next_out))):this.onData(W.shrinkBuf(t.output,t.next_out)))}while((t.avail_in>0||t.avail_out===0)&&a!==Ni);return n===Hr?(a=Ft.deflateEnd(this.strm),this.onEnd(a),this.ended=!0,a===_t):(n===Oi&&(this.onEnd(_t),t.avail_out=0),!0)};ht.prototype.onData=function(e){this.chunks.push(e)};ht.prototype.onEnd=function(e){e===_t&&(this.options.to===\"string\"?this.result=this.chunks.join(\"\"):this.result=W.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg};function ti(e,i){var t=new ht(i);if(t.push(e,!0),t.err)throw t.msg||at[t.err];return t.result}function Ih(e,i){return i=i||{},i.raw=!0,ti(e,i)}function Nh(e,i){return i=i||{},i.gzip=!0,ti(e,i)}var Oh=ht,Lh=ti,Uh=Ih,zh=Nh,Gh={Deflate:Oh,deflate:Lh,deflateRaw:Uh,gzip:zh},Yt=30,Mh=12,Wh=function(i,t){var r,a,n,h,f,w,v,_,T,S,P,G,z,Y,U,ee,$,K,C,X,J,Z,te,se,j;r=i.state,a=i.next_in,se=i.input,n=a+(i.avail_in-5),h=i.next_out,j=i.output,f=h-(t-i.avail_out),w=h+(i.avail_out-257),v=r.dmax,_=r.wsize,T=r.whave,S=r.wnext,P=r.window,G=r.hold,z=r.bits,Y=r.lencode,U=r.distcode,ee=(1<<r.lenbits)-1,$=(1<<r.distbits)-1;e:do{z<15&&(G+=se[a++]<<z,z+=8,G+=se[a++]<<z,z+=8),K=Y[G&ee];t:for(;;){if(C=K>>>24,G>>>=C,z-=C,C=K>>>16&255,C===0)j[h++]=K&65535;else if(C&16){X=K&65535,C&=15,C&&(z<C&&(G+=se[a++]<<z,z+=8),X+=G&(1<<C)-1,G>>>=C,z-=C),z<15&&(G+=se[a++]<<z,z+=8,G+=se[a++]<<z,z+=8),K=U[G&$];r:for(;;){if(C=K>>>24,G>>>=C,z-=C,C=K>>>16&255,C&16){if(J=K&65535,C&=15,z<C&&(G+=se[a++]<<z,z+=8,z<C&&(G+=se[a++]<<z,z+=8)),J+=G&(1<<C)-1,J>v){i.msg=\"invalid distance too far back\",r.mode=Yt;break e}if(G>>>=C,z-=C,C=h-f,J>C){if(C=J-C,C>T&&r.sane){i.msg=\"invalid distance too far back\",r.mode=Yt;break e}if(Z=0,te=P,S===0){if(Z+=_-C,C<X){X-=C;do j[h++]=P[Z++];while(--C);Z=h-J,te=j}}else if(S<C){if(Z+=_+S-C,C-=S,C<X){X-=C;do j[h++]=P[Z++];while(--C);if(Z=0,S<X){C=S,X-=C;do j[h++]=P[Z++];while(--C);Z=h-J,te=j}}}else if(Z+=S-C,C<X){X-=C;do j[h++]=P[Z++];while(--C);Z=h-J,te=j}for(;X>2;)j[h++]=te[Z++],j[h++]=te[Z++],j[h++]=te[Z++],X-=3;X&&(j[h++]=te[Z++],X>1&&(j[h++]=te[Z++]))}else{Z=h-J;do j[h++]=j[Z++],j[h++]=j[Z++],j[h++]=j[Z++],X-=3;while(X>2);X&&(j[h++]=j[Z++],X>1&&(j[h++]=j[Z++]))}}else if(C&64){i.msg=\"invalid distance code\",r.mode=Yt;break e}else{K=U[(K&65535)+(G&(1<<C)-1)];continue r}break}}else if(C&64)if(C&32){r.mode=Mh;break e}else{i.msg=\"invalid literal/length code\",r.mode=Yt;break e}else{K=Y[(K&65535)+(G&(1<<C)-1)];continue t}break}}while(a<n&&h<w);X=z>>3,a-=X,z-=X<<3,G&=(1<<z)-1,i.next_in=a,i.next_out=h,i.avail_in=a<n?5+(n-a):5-(a-n),i.avail_out=h<w?257+(w-h):257-(h-w),r.hold=G,r.bits=z},dt=15,Li=852,Ui=592,zi=0,Cr=1,Gi=2,Zh=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],jh=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],$h=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],Kh=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64],Ht=function(i,t,r,a,n,h,f,w){var v=w.bits,_=0,T=0,S=0,P=0,G=0,z=0,Y=0,U=0,ee=0,$=0,K,C,X,J,Z,te=null,se=0,j,ce=new W.Buf16(dt+1),ge=new W.Buf16(dt+1),$e=null,Ue=0,E,b,R;for(_=0;_<=dt;_++)ce[_]=0;for(T=0;T<a;T++)ce[t[r+T]]++;for(G=v,P=dt;P>=1&&ce[P]===0;P--);if(G>P&&(G=P),P===0)return n[h++]=1<<24|64<<16|0,n[h++]=1<<24|64<<16|0,w.bits=1,0;for(S=1;S<P&&ce[S]===0;S++);for(G<S&&(G=S),U=1,_=1;_<=dt;_++)if(U<<=1,U-=ce[_],U<0)return-1;if(U>0&&(i===zi||P!==1))return-1;for(ge[1]=0,_=1;_<dt;_++)ge[_+1]=ge[_]+ce[_];for(T=0;T<a;T++)t[r+T]!==0&&(f[ge[t[r+T]]++]=T);if(i===zi?(te=$e=f,j=19):i===Cr?(te=Zh,se-=257,$e=jh,Ue-=257,j=256):(te=$h,$e=Kh,j=-1),$=0,T=0,_=S,Z=h,z=G,Y=0,X=-1,ee=1<<G,J=ee-1,i===Cr&&ee>Li||i===Gi&&ee>Ui)return 1;for(;;){E=_-Y,f[T]<j?(b=0,R=f[T]):f[T]>j?(b=$e[Ue+f[T]],R=te[se+f[T]]):(b=96,R=0),K=1<<_-Y,C=1<<z,S=C;do C-=K,n[Z+($>>Y)+C]=E<<24|b<<16|R|0;while(C!==0);for(K=1<<_-1;$&K;)K>>=1;if(K!==0?($&=K-1,$+=K):$=0,T++,--ce[_]===0){if(_===P)break;_=t[r+f[T]]}if(_>G&&($&J)!==X){for(Y===0&&(Y=G),Z+=S,z=_-Y,U=1<<z;z+Y<P&&(U-=ce[z+Y],!(U<=0));)z++,U<<=1;if(ee+=1<<z,i===Cr&&ee>Li||i===Gi&&ee>Ui)return 1;X=$&J,n[X]=G<<24|z<<16|Z-h|0}}return $!==0&&(n[Z+$]=_-Y<<24|64<<16|0),w.bits=G,0},Yh=0,Xa=1,Va=2,Mi=4,Xh=5,Xt=6,ft=0,Vh=1,Dh=2,He=-2,Da=-3,Ja=-4,Jh=-5,Wi=8,Qa=1,Zi=2,ji=3,$i=4,Ki=5,Yi=6,Xi=7,Vi=8,Di=9,Ji=10,cr=11,Me=12,Br=13,Qi=14,Ir=15,qi=16,ea=17,ta=18,ra=19,Vt=20,Dt=21,ia=22,aa=23,na=24,oa=25,ha=26,Nr=27,fa=28,sa=29,fe=30,qa=31,Qh=32,qh=852,ef=592,tf=15,rf=tf;function la(e){return(e>>>24&255)+(e>>>8&65280)+((e&65280)<<8)+((e&255)<<24)}function af(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new W.Buf16(320),this.work=new W.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function en(e){var i;return!e||!e.state?He:(i=e.state,e.total_in=e.total_out=i.total=0,e.msg=\"\",i.wrap&&(e.adler=i.wrap&1),i.mode=Qa,i.last=0,i.havedict=0,i.dmax=32768,i.head=null,i.hold=0,i.bits=0,i.lencode=i.lendyn=new W.Buf32(qh),i.distcode=i.distdyn=new W.Buf32(ef),i.sane=1,i.back=-1,ft)}function tn(e){var i;return!e||!e.state?He:(i=e.state,i.wsize=0,i.whave=0,i.wnext=0,en(e))}function rn(e,i){var t,r;return!e||!e.state||(r=e.state,i<0?(t=0,i=-i):(t=(i>>4)+1,i<48&&(i&=15)),i&&(i<8||i>15))?He:(r.window!==null&&r.wbits!==i&&(r.window=null),r.wrap=t,r.wbits=i,tn(e))}function an(e,i){var t,r;return e?(r=new af,e.state=r,r.window=null,t=rn(e,i),t!==ft&&(e.state=null),t):He}function nf(e){return an(e,rf)}var ua=!0,Or,Lr;function of(e){if(ua){var i;for(Or=new W.Buf32(512),Lr=new W.Buf32(32),i=0;i<144;)e.lens[i++]=8;for(;i<256;)e.lens[i++]=9;for(;i<280;)e.lens[i++]=7;for(;i<288;)e.lens[i++]=8;for(Ht(Xa,e.lens,0,288,Or,0,e.work,{bits:9}),i=0;i<32;)e.lens[i++]=5;Ht(Va,e.lens,0,32,Lr,0,e.work,{bits:5}),ua=!1}e.lencode=Or,e.lenbits=9,e.distcode=Lr,e.distbits=5}function nn(e,i,t,r){var a,n=e.state;return n.window===null&&(n.wsize=1<<n.wbits,n.wnext=0,n.whave=0,n.window=new W.Buf8(n.wsize)),r>=n.wsize?(W.arraySet(n.window,i,t-n.wsize,n.wsize,0),n.wnext=0,n.whave=n.wsize):(a=n.wsize-n.wnext,a>r&&(a=r),W.arraySet(n.window,i,t-r,a,n.wnext),r-=a,r?(W.arraySet(n.window,i,t-r,r,0),n.wnext=r,n.whave=n.wsize):(n.wnext+=a,n.wnext===n.wsize&&(n.wnext=0),n.whave<n.wsize&&(n.whave+=a))),0}function hf(e,i){var t,r,a,n,h,f,w,v,_,T,S,P,G,z,Y=0,U,ee,$,K,C,X,J,Z,te=new W.Buf8(4),se,j,ce=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&e.avail_in!==0)return He;t=e.state,t.mode===Me&&(t.mode=Br),h=e.next_out,a=e.output,w=e.avail_out,n=e.next_in,r=e.input,f=e.avail_in,v=t.hold,_=t.bits,T=f,S=w,Z=ft;e:for(;;)switch(t.mode){case Qa:if(t.wrap===0){t.mode=Br;break}for(;_<16;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(t.wrap&2&&v===35615){t.check=0,te[0]=v&255,te[1]=v>>>8&255,t.check=_e(t.check,te,2,0),v=0,_=0,t.mode=Zi;break}if(t.flags=0,t.head&&(t.head.done=!1),!(t.wrap&1)||(((v&255)<<8)+(v>>8))%31){e.msg=\"incorrect header check\",t.mode=fe;break}if((v&15)!==Wi){e.msg=\"unknown compression method\",t.mode=fe;break}if(v>>>=4,_-=4,J=(v&15)+8,t.wbits===0)t.wbits=J;else if(J>t.wbits){e.msg=\"invalid window size\",t.mode=fe;break}t.dmax=1<<J,e.adler=t.check=1,t.mode=v&512?Ji:Me,v=0,_=0;break;case Zi:for(;_<16;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(t.flags=v,(t.flags&255)!==Wi){e.msg=\"unknown compression method\",t.mode=fe;break}if(t.flags&57344){e.msg=\"unknown header flags set\",t.mode=fe;break}t.head&&(t.head.text=v>>8&1),t.flags&512&&(te[0]=v&255,te[1]=v>>>8&255,t.check=_e(t.check,te,2,0)),v=0,_=0,t.mode=ji;case ji:for(;_<32;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}t.head&&(t.head.time=v),t.flags&512&&(te[0]=v&255,te[1]=v>>>8&255,te[2]=v>>>16&255,te[3]=v>>>24&255,t.check=_e(t.check,te,4,0)),v=0,_=0,t.mode=$i;case $i:for(;_<16;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}t.head&&(t.head.xflags=v&255,t.head.os=v>>8),t.flags&512&&(te[0]=v&255,te[1]=v>>>8&255,t.check=_e(t.check,te,2,0)),v=0,_=0,t.mode=Ki;case Ki:if(t.flags&1024){for(;_<16;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}t.length=v,t.head&&(t.head.extra_len=v),t.flags&512&&(te[0]=v&255,te[1]=v>>>8&255,t.check=_e(t.check,te,2,0)),v=0,_=0}else t.head&&(t.head.extra=null);t.mode=Yi;case Yi:if(t.flags&1024&&(P=t.length,P>f&&(P=f),P&&(t.head&&(J=t.head.extra_len-t.length,t.head.extra||(t.head.extra=new Array(t.head.extra_len)),W.arraySet(t.head.extra,r,n,P,J)),t.flags&512&&(t.check=_e(t.check,r,P,n)),f-=P,n+=P,t.length-=P),t.length))break e;t.length=0,t.mode=Xi;case Xi:if(t.flags&2048){if(f===0)break e;P=0;do J=r[n+P++],t.head&&J&&t.length<65536&&(t.head.name+=String.fromCharCode(J));while(J&&P<f);if(t.flags&512&&(t.check=_e(t.check,r,P,n)),f-=P,n+=P,J)break e}else t.head&&(t.head.name=null);t.length=0,t.mode=Vi;case Vi:if(t.flags&4096){if(f===0)break e;P=0;do J=r[n+P++],t.head&&J&&t.length<65536&&(t.head.comment+=String.fromCharCode(J));while(J&&P<f);if(t.flags&512&&(t.check=_e(t.check,r,P,n)),f-=P,n+=P,J)break e}else t.head&&(t.head.comment=null);t.mode=Di;case Di:if(t.flags&512){for(;_<16;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(v!==(t.check&65535)){e.msg=\"header crc mismatch\",t.mode=fe;break}v=0,_=0}t.head&&(t.head.hcrc=t.flags>>9&1,t.head.done=!0),e.adler=t.check=0,t.mode=Me;break;case Ji:for(;_<32;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}e.adler=t.check=la(v),v=0,_=0,t.mode=cr;case cr:if(t.havedict===0)return e.next_out=h,e.avail_out=w,e.next_in=n,e.avail_in=f,t.hold=v,t.bits=_,Dh;e.adler=t.check=1,t.mode=Me;case Me:if(i===Xh||i===Xt)break e;case Br:if(t.last){v>>>=_&7,_-=_&7,t.mode=Nr;break}for(;_<3;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}switch(t.last=v&1,v>>>=1,_-=1,v&3){case 0:t.mode=Qi;break;case 1:if(of(t),t.mode=Vt,i===Xt){v>>>=2,_-=2;break e}break;case 2:t.mode=ea;break;case 3:e.msg=\"invalid block type\",t.mode=fe}v>>>=2,_-=2;break;case Qi:for(v>>>=_&7,_-=_&7;_<32;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if((v&65535)!==(v>>>16^65535)){e.msg=\"invalid stored block lengths\",t.mode=fe;break}if(t.length=v&65535,v=0,_=0,t.mode=Ir,i===Xt)break e;case Ir:t.mode=qi;case qi:if(P=t.length,P){if(P>f&&(P=f),P>w&&(P=w),P===0)break e;W.arraySet(a,r,n,P,h),f-=P,n+=P,w-=P,h+=P,t.length-=P;break}t.mode=Me;break;case ea:for(;_<14;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(t.nlen=(v&31)+257,v>>>=5,_-=5,t.ndist=(v&31)+1,v>>>=5,_-=5,t.ncode=(v&15)+4,v>>>=4,_-=4,t.nlen>286||t.ndist>30){e.msg=\"too many length or distance symbols\",t.mode=fe;break}t.have=0,t.mode=ta;case ta:for(;t.have<t.ncode;){for(;_<3;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}t.lens[ce[t.have++]]=v&7,v>>>=3,_-=3}for(;t.have<19;)t.lens[ce[t.have++]]=0;if(t.lencode=t.lendyn,t.lenbits=7,se={bits:t.lenbits},Z=Ht(Yh,t.lens,0,19,t.lencode,0,t.work,se),t.lenbits=se.bits,Z){e.msg=\"invalid code lengths set\",t.mode=fe;break}t.have=0,t.mode=ra;case ra:for(;t.have<t.nlen+t.ndist;){for(;Y=t.lencode[v&(1<<t.lenbits)-1],U=Y>>>24,ee=Y>>>16&255,$=Y&65535,!(U<=_);){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if($<16)v>>>=U,_-=U,t.lens[t.have++]=$;else{if($===16){for(j=U+2;_<j;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(v>>>=U,_-=U,t.have===0){e.msg=\"invalid bit length repeat\",t.mode=fe;break}J=t.lens[t.have-1],P=3+(v&3),v>>>=2,_-=2}else if($===17){for(j=U+3;_<j;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}v>>>=U,_-=U,J=0,P=3+(v&7),v>>>=3,_-=3}else{for(j=U+7;_<j;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}v>>>=U,_-=U,J=0,P=11+(v&127),v>>>=7,_-=7}if(t.have+P>t.nlen+t.ndist){e.msg=\"invalid bit length repeat\",t.mode=fe;break}for(;P--;)t.lens[t.have++]=J}}if(t.mode===fe)break;if(t.lens[256]===0){e.msg=\"invalid code -- missing end-of-block\",t.mode=fe;break}if(t.lenbits=9,se={bits:t.lenbits},Z=Ht(Xa,t.lens,0,t.nlen,t.lencode,0,t.work,se),t.lenbits=se.bits,Z){e.msg=\"invalid literal/lengths set\",t.mode=fe;break}if(t.distbits=6,t.distcode=t.distdyn,se={bits:t.distbits},Z=Ht(Va,t.lens,t.nlen,t.ndist,t.distcode,0,t.work,se),t.distbits=se.bits,Z){e.msg=\"invalid distances set\",t.mode=fe;break}if(t.mode=Vt,i===Xt)break e;case Vt:t.mode=Dt;case Dt:if(f>=6&&w>=258){e.next_out=h,e.avail_out=w,e.next_in=n,e.avail_in=f,t.hold=v,t.bits=_,Wh(e,S),h=e.next_out,a=e.output,w=e.avail_out,n=e.next_in,r=e.input,f=e.avail_in,v=t.hold,_=t.bits,t.mode===Me&&(t.back=-1);break}for(t.back=0;Y=t.lencode[v&(1<<t.lenbits)-1],U=Y>>>24,ee=Y>>>16&255,$=Y&65535,!(U<=_);){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(ee&&!(ee&240)){for(K=U,C=ee,X=$;Y=t.lencode[X+((v&(1<<K+C)-1)>>K)],U=Y>>>24,ee=Y>>>16&255,$=Y&65535,!(K+U<=_);){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}v>>>=K,_-=K,t.back+=K}if(v>>>=U,_-=U,t.back+=U,t.length=$,ee===0){t.mode=ha;break}if(ee&32){t.back=-1,t.mode=Me;break}if(ee&64){e.msg=\"invalid literal/length code\",t.mode=fe;break}t.extra=ee&15,t.mode=ia;case ia:if(t.extra){for(j=t.extra;_<j;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}t.length+=v&(1<<t.extra)-1,v>>>=t.extra,_-=t.extra,t.back+=t.extra}t.was=t.length,t.mode=aa;case aa:for(;Y=t.distcode[v&(1<<t.distbits)-1],U=Y>>>24,ee=Y>>>16&255,$=Y&65535,!(U<=_);){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(!(ee&240)){for(K=U,C=ee,X=$;Y=t.distcode[X+((v&(1<<K+C)-1)>>K)],U=Y>>>24,ee=Y>>>16&255,$=Y&65535,!(K+U<=_);){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}v>>>=K,_-=K,t.back+=K}if(v>>>=U,_-=U,t.back+=U,ee&64){e.msg=\"invalid distance code\",t.mode=fe;break}t.offset=$,t.extra=ee&15,t.mode=na;case na:if(t.extra){for(j=t.extra;_<j;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}t.offset+=v&(1<<t.extra)-1,v>>>=t.extra,_-=t.extra,t.back+=t.extra}if(t.offset>t.dmax){e.msg=\"invalid distance too far back\",t.mode=fe;break}t.mode=oa;case oa:if(w===0)break e;if(P=S-w,t.offset>P){if(P=t.offset-P,P>t.whave&&t.sane){e.msg=\"invalid distance too far back\",t.mode=fe;break}P>t.wnext?(P-=t.wnext,G=t.wsize-P):G=t.wnext-P,P>t.length&&(P=t.length),z=t.window}else z=a,G=h-t.offset,P=t.length;P>w&&(P=w),w-=P,t.length-=P;do a[h++]=z[G++];while(--P);t.length===0&&(t.mode=Dt);break;case ha:if(w===0)break e;a[h++]=t.length,w--,t.mode=Dt;break;case Nr:if(t.wrap){for(;_<32;){if(f===0)break e;f--,v|=r[n++]<<_,_+=8}if(S-=w,e.total_out+=S,t.total+=S,S&&(e.adler=t.check=t.flags?_e(t.check,a,S,h-S):Ot(t.check,a,S,h-S)),S=w,(t.flags?v:la(v))!==t.check){e.msg=\"incorrect data check\",t.mode=fe;break}v=0,_=0}t.mode=fa;case fa:if(t.wrap&&t.flags){for(;_<32;){if(f===0)break e;f--,v+=r[n++]<<_,_+=8}if(v!==(t.total&4294967295)){e.msg=\"incorrect length check\",t.mode=fe;break}v=0,_=0}t.mode=sa;case sa:Z=Vh;break e;case fe:Z=Da;break e;case qa:return Ja;case Qh:default:return He}return e.next_out=h,e.avail_out=w,e.next_in=n,e.avail_in=f,t.hold=v,t.bits=_,(t.wsize||S!==e.avail_out&&t.mode<fe&&(t.mode<Nr||i!==Mi))&&nn(e,e.output,e.next_out,S-e.avail_out),T-=e.avail_in,S-=e.avail_out,e.total_in+=T,e.total_out+=S,t.total+=S,t.wrap&&S&&(e.adler=t.check=t.flags?_e(t.check,a,S,e.next_out-S):Ot(t.check,a,S,e.next_out-S)),e.data_type=t.bits+(t.last?64:0)+(t.mode===Me?128:0)+(t.mode===Vt||t.mode===Ir?256:0),(T===0&&S===0||i===Mi)&&Z===ft&&(Z=Jh),Z}function ff(e){if(!e||!e.state)return He;var i=e.state;return i.window&&(i.window=null),e.state=null,ft}function sf(e,i){var t;return!e||!e.state||(t=e.state,!(t.wrap&2))?He:(t.head=i,i.done=!1,ft)}function lf(e,i){var t=i.length,r,a,n;return!e||!e.state||(r=e.state,r.wrap!==0&&r.mode!==cr)?He:r.mode===cr&&(a=1,a=Ot(a,i,t,0),a!==r.check)?Da:(n=nn(e,i,t,t),n?(r.mode=qa,Ja):(r.havedict=1,ft))}var uf=tn,df=rn,cf=en,vf=nf,_f=an,pf=hf,wf=ff,gf=sf,xf=lf,yf=\"pako inflate (from Nodeca project)\",pt={inflateReset:uf,inflateReset2:df,inflateResetKeep:cf,inflateInit:vf,inflateInit2:_f,inflate:pf,inflateEnd:wf,inflateGetHeader:gf,inflateSetDictionary:xf,inflateInfo:yf},ue={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8};function Ef(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name=\"\",this.comment=\"\",this.hcrc=0,this.done=!1}var mf=Ef,on=Object.prototype.toString;function st(e){if(!(this instanceof st))return new st(e);this.options=W.assign({chunkSize:16384,windowBits:0,to:\"\"},e||{});var i=this.options;i.raw&&i.windowBits>=0&&i.windowBits<16&&(i.windowBits=-i.windowBits,i.windowBits===0&&(i.windowBits=-15)),i.windowBits>=0&&i.windowBits<16&&!(e&&e.windowBits)&&(i.windowBits+=32),i.windowBits>15&&i.windowBits<48&&(i.windowBits&15||(i.windowBits|=15)),this.err=0,this.msg=\"\",this.ended=!1,this.chunks=[],this.strm=new Ka,this.strm.avail_out=0;var t=pt.inflateInit2(this.strm,i.windowBits);if(t!==ue.Z_OK)throw new Error(at[t]);if(this.header=new mf,pt.inflateGetHeader(this.strm,this.header),i.dictionary&&(typeof i.dictionary==\"string\"?i.dictionary=it.string2buf(i.dictionary):on.call(i.dictionary)===\"[object ArrayBuffer]\"&&(i.dictionary=new Uint8Array(i.dictionary)),i.raw&&(t=pt.inflateSetDictionary(this.strm,i.dictionary),t!==ue.Z_OK)))throw new Error(at[t])}st.prototype.push=function(e,i){var t=this.strm,r=this.options.chunkSize,a=this.options.dictionary,n,h,f,w,v,_=!1;if(this.ended)return!1;h=i===~~i?i:i===!0?ue.Z_FINISH:ue.Z_NO_FLUSH,typeof e==\"string\"?t.input=it.binstring2buf(e):on.call(e)===\"[object ArrayBuffer]\"?t.input=new Uint8Array(e):t.input=e,t.next_in=0,t.avail_in=t.input.length;do{if(t.avail_out===0&&(t.output=new W.Buf8(r),t.next_out=0,t.avail_out=r),n=pt.inflate(t,ue.Z_NO_FLUSH),n===ue.Z_NEED_DICT&&a&&(n=pt.inflateSetDictionary(this.strm,a)),n===ue.Z_BUF_ERROR&&_===!0&&(n=ue.Z_OK,_=!1),n!==ue.Z_STREAM_END&&n!==ue.Z_OK)return this.onEnd(n),this.ended=!0,!1;t.next_out&&(t.avail_out===0||n===ue.Z_STREAM_END||t.avail_in===0&&(h===ue.Z_FINISH||h===ue.Z_SYNC_FLUSH))&&(this.options.to===\"string\"?(f=it.utf8border(t.output,t.next_out),w=t.next_out-f,v=it.buf2string(t.output,f),t.next_out=w,t.avail_out=r-w,w&&W.arraySet(t.output,t.output,f,w,0),this.onData(v)):this.onData(W.shrinkBuf(t.output,t.next_out))),t.avail_in===0&&t.avail_out===0&&(_=!0)}while((t.avail_in>0||t.avail_out===0)&&n!==ue.Z_STREAM_END);return n===ue.Z_STREAM_END&&(h=ue.Z_FINISH),h===ue.Z_FINISH?(n=pt.inflateEnd(this.strm),this.onEnd(n),this.ended=!0,n===ue.Z_OK):(h===ue.Z_SYNC_FLUSH&&(this.onEnd(ue.Z_OK),t.avail_out=0),!0)};st.prototype.onData=function(e){this.chunks.push(e)};st.prototype.onEnd=function(e){e===ue.Z_OK&&(this.options.to===\"string\"?this.result=this.chunks.join(\"\"):this.result=W.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg};function ri(e,i){var t=new st(i);if(t.push(e,!0),t.err)throw t.msg||at[t.err];return t.result}function Af(e,i){return i=i||{},i.raw=!0,ri(e,i)}var kf=st,bf=ri,Pf=Af,Sf=ri,Rf={Inflate:kf,inflate:bf,inflateRaw:Pf,ungzip:Sf},Tf=W.assign,hn={};Tf(hn,Gh,Rf,ue);var ii=hn,fn=function e(i,t,r){ae(this,e),p(this,\"header\",void 0),p(this,\"info\",void 0),p(this,\"sections\",void 0),this.header=i,this.info=t,this.sections=r},sn=function e(i,t){ae(this,e),p(this,\"version\",void 0),p(this,\"signature\",void 0),this.version=i,this.signature=t},ai=function(){function e(i,t,r,a){ae(this,e),p(this,\"major\",void 0),p(this,\"minor\",void 0),p(this,\"build\",void 0),p(this,\"revision\",void 0),this.major=i,this.minor=t,this.build=r,this.revision=a}return me(e,[{key:\"isCompatible\",value:function(t){return this.major===t.major&&this.minor<=t.minor}},{key:\"gte\",value:function(t){return this.major>t.major?!0:this.major<t.major?!1:this.minor>t.minor?!0:this.minor<t.minor?!1:this.build>t.build?!0:this.build<t.build?!1:this.revision>=t.revision}},{key:\"toString\",value:function(){return\"\".concat(this.major,\".\").concat(this.minor,\".\").concat(this.build,\".\").concat(this.revision)}},{key:\"toJSON\",value:function(){return this.toString()}}]),e}(),jr;(function(e){e[e.None=0]=\"None\",e[e.Single=1]=\"Single\",e[e.Image=2]=\"Image\",e[e.Gradation=4]=\"Gradation\"})(jr||(jr={}));var Ff=jr,M=16,Ye;(function(e){e[e.HWPTAG_DOCUMENT_PROPERTIES=M]=\"HWPTAG_DOCUMENT_PROPERTIES\",e[e.HWPTAG_ID_MAPPINGS=M+1]=\"HWPTAG_ID_MAPPINGS\",e[e.HWPTAG_BIN_DATA=M+2]=\"HWPTAG_BIN_DATA\",e[e.HWPTAG_FACE_NAME=M+3]=\"HWPTAG_FACE_NAME\",e[e.HWPTAG_BORDER_FILL=M+4]=\"HWPTAG_BORDER_FILL\",e[e.HWPTAG_CHAR_SHAPE=M+5]=\"HWPTAG_CHAR_SHAPE\",e[e.HWPTAG_TAB_DEF=M+6]=\"HWPTAG_TAB_DEF\",e[e.HWPTAG_NUMBERING=M+7]=\"HWPTAG_NUMBERING\",e[e.HWPTAG_BULLET=M+8]=\"HWPTAG_BULLET\",e[e.HWPTAG_PARA_SHAPE=M+9]=\"HWPTAG_PARA_SHAPE\",e[e.HWPTAG_STYLE=M+10]=\"HWPTAG_STYLE\",e[e.HWPTAG_DOC_DATA=M+11]=\"HWPTAG_DOC_DATA\",e[e.HWPTAG_DISTRIBUTE_DOC_DATA=M+12]=\"HWPTAG_DISTRIBUTE_DOC_DATA\",e[e.RESERVED=M+13]=\"RESERVED\",e[e.HWPTAG_COMPATIBLE_DOCUMENT=M+14]=\"HWPTAG_COMPATIBLE_DOCUMENT\",e[e.HWPTAG_LAYOUT_COMPATIBILITY=M+15]=\"HWPTAG_LAYOUT_COMPATIBILITY\",e[e.HWPTAG_TRACKCHANGE=M+16]=\"HWPTAG_TRACKCHANGE\",e[e.HWPTAG_MEMO_SHAPE=M+76]=\"HWPTAG_MEMO_SHAPE\",e[e.HWPTAG_FORBIDDEN_CHAR=M+78]=\"HWPTAG_FORBIDDEN_CHAR\",e[e.HWPTAG_TRACK_CHANGE=M+80]=\"HWPTAG_TRACK_CHANGE\",e[e.HWPTAG_TRACK_CHANGE_AUTHOR=M+81]=\"HWPTAG_TRACK_CHANGE_AUTHOR\"})(Ye||(Ye={}));var Pe;(function(e){e[e.HWPTAG_PARA_HEADER=M+50]=\"HWPTAG_PARA_HEADER\",e[e.HWPTAG_PARA_TEXT=M+51]=\"HWPTAG_PARA_TEXT\",e[e.HWPTAG_PARA_CHAR_SHAPE=M+52]=\"HWPTAG_PARA_CHAR_SHAPE\",e[e.HWPTAG_PARA_LINE_SEG=M+53]=\"HWPTAG_PARA_LINE_SEG\",e[e.HWPTAG_PARA_RANGE_TAG=M+54]=\"HWPTAG_PARA_RANGE_TAG\",e[e.HWPTAG_CTRL_HEADER=M+55]=\"HWPTAG_CTRL_HEADER\",e[e.HWPTAG_LIST_HEADER=M+56]=\"HWPTAG_LIST_HEADER\",e[e.HWPTAG_PAGE_DEF=M+57]=\"HWPTAG_PAGE_DEF\",e[e.HWPTAG_FOOTNOTE_SHAPE=M+58]=\"HWPTAG_FOOTNOTE_SHAPE\",e[e.HWPTAG_PAGE_BORDER_FILL=M+59]=\"HWPTAG_PAGE_BORDER_FILL\",e[e.HWPTAG_SHAPE_COMPONENT=M+60]=\"HWPTAG_SHAPE_COMPONENT\",e[e.HWPTAG_TABLE=M+61]=\"HWPTAG_TABLE\",e[e.HWPTAG_SHAPE_COMPONENT_LINE=M+62]=\"HWPTAG_SHAPE_COMPONENT_LINE\",e[e.HWPTAG_SHAPE_COMPONENT_RECTANGLE=M+63]=\"HWPTAG_SHAPE_COMPONENT_RECTANGLE\",e[e.HWPTAG_SHAPE_COMPONENT_ELLIPSE=M+64]=\"HWPTAG_SHAPE_COMPONENT_ELLIPSE\",e[e.HWPTAG_SHAPE_COMPONENT_ARC=M+65]=\"HWPTAG_SHAPE_COMPONENT_ARC\",e[e.HWPTAG_SHAPE_COMPONENT_POLYGON=M+66]=\"HWPTAG_SHAPE_COMPONENT_POLYGON\",e[e.HWPTAG_SHAPE_COMPONENT_CURVE=M+67]=\"HWPTAG_SHAPE_COMPONENT_CURVE\",e[e.HWPTAG_SHAPE_COMPONENT_OLE=M+68]=\"HWPTAG_SHAPE_COMPONENT_OLE\",e[e.HWPTAG_SHAPE_COMPONENT_PICTURE=M+69]=\"HWPTAG_SHAPE_COMPONENT_PICTURE\",e[e.HWPTAG_SHAPE_COMPONENT_CONTAINER=M+70]=\"HWPTAG_SHAPE_COMPONENT_CONTAINER\",e[e.HWPTAG_CTRL_DATA=M+71]=\"HWPTAG_CTRL_DATA\",e[e.HWPTAG_EQEDIT=M+72]=\"HWPTAG_EQEDIT\",e[e.RESERVED=M+73]=\"RESERVED\",e[e.HWPTAG_SHAPE_COMPONENT_TEXTART=M+74]=\"HWPTAG_SHAPE_COMPONENT_TEXTART\",e[e.HWPTAG_FORM_OBJECT=M+75]=\"HWPTAG_FORM_OBJECT\",e[e.HWPTAG_MEMO_SHAPE=M+76]=\"HWPTAG_MEMO_SHAPE\",e[e.HWPTAG_MEMO_LIST=M+77]=\"HWPTAG_MEMO_LIST\",e[e.HWPTAG_CHART_DATA=M+79]=\"HWPTAG_CHART_DATA\",e[e.HWPTAG_VIDEO_DATA=M+82]=\"HWPTAG_VIDEO_DATA\",e[e.HWPTAG_SHAPE_COMPONENT_UNKNOWN=M+99]=\"HWPTAG_SHAPE_COMPONENT_UNKNOWN\"})(Pe||(Pe={}));var Hf=function e(i,t){ae(this,e),p(this,\"extension\",void 0),p(this,\"payload\",void 0),this.extension=i,this.payload=t},we=function(){function e(i){ae(this,e),p(this,\"view\",void 0),p(this,\"offsetByte\",0),this.view=new DataView(i)}return me(e,[{key:\"readUInt32\",value:function(){var t=this.view.getUint32(this.offsetByte,!0);return this.offsetByte+=4,t}},{key:\"readInt32\",value:function(){var t=this.view.getInt32(this.offsetByte,!0);return this.offsetByte+=4,t}},{key:\"readInt16\",value:function(){var t=this.view.getUint16(this.offsetByte,!0);return this.offsetByte+=2,t}},{key:\"readUInt16\",value:function(){var t=this.view.getUint16(this.offsetByte,!0);return this.offsetByte+=2,t}},{key:\"readInt8\",value:function(){var t=this.view.getInt8(this.offsetByte);return this.offsetByte+=1,t}},{key:\"readUInt8\",value:function(){var t=this.view.getUint8(this.offsetByte);return this.offsetByte+=1,t}},{key:\"readRecord\",value:function(){var t=this.readUInt32(),r=t&1023,a=t>>10&1023,n=t>>20&4095;return n===4095?[r,a,this.readUInt32()]:[r,a,n]}},{key:\"read\",value:function(t){var r=this.view.buffer.slice(this.offsetByte,this.offsetByte+t);return this.offsetByte+=t,r}},{key:\"readString\",value:function(){for(var t=this.readUInt16(),r=[],a=0;a<t;a+=1)r.push(String.fromCharCode(this.readUInt16()));return r.join(\"\")}},{key:\"remainByte\",value:function(){return this.view.byteLength-this.offsetByte}},{key:\"skipByte\",value:function(t){this.offsetByte+=t}},{key:\"isEOF\",value:function(){return this.view.byteLength<=this.offsetByte}}]),e}();function Le(e,i,t){for(var r=e>>i,a=0,n=0;n<=t-i;n+=1)a<<=1,a+=1;return r&a}function Se(e){return[Le(e,0,7),Le(e,8,15),Le(e,16,23)]}function fr(e,i){var t=1<<i;return(e&t)===t}var Cf=function e(i,t,r,a,n,h,f,w,v,_,T,S,P){ae(this,e),p(this,\"fontId\",void 0),p(this,\"fontScale\",void 0),p(this,\"fontSpacing\",void 0),p(this,\"fontRatio\",void 0),p(this,\"fontLocation\",void 0),p(this,\"fontBaseSize\",void 0),p(this,\"attr\",void 0),p(this,\"shadow\",void 0),p(this,\"shadow2\",void 0),p(this,\"color\",void 0),p(this,\"underLineColor\",void 0),p(this,\"shadeColor\",void 0),p(this,\"shadowColor\",void 0),p(this,\"fontBackgroundId\",null),p(this,\"strikeColor\",null),this.fontId=i,this.fontScale=t,this.fontSpacing=r,this.fontRatio=a,this.fontLocation=n,this.fontBaseSize=h/100,this.attr=f,this.shadow=Se(w),this.shadow2=Se(v),this.color=Se(_),this.underLineColor=Se(T),this.shadeColor=Se(S),this.shadowColor=Se(P)},Bf=function e(){ae(this,e),p(this,\"page\",0),p(this,\"footnote\",0),p(this,\"endnote\",0),p(this,\"picture\",0),p(this,\"table\",0),p(this,\"equation\",0)},If=function e(){ae(this,e),p(this,\"listId\",0),p(this,\"paragraphId\",0),p(this,\"charIndex\",0)},ln=function(){function e(){ae(this,e),p(this,\"sectionSize\",0),p(this,\"charShapes\",[]),p(this,\"fontFaces\",[]),p(this,\"binData\",[]),p(this,\"borderFills\",[]),p(this,\"paragraphShapes\",[]),p(this,\"startingIndex\",new Bf),p(this,\"caratLocation\",new If)}return me(e,[{key:\"getCharShpe\",value:function(t){return this.charShapes[t]}}]),e}(),Nf=function(){function e(){ae(this,e),p(this,\"name\",\"\"),p(this,\"alternative\",\"\"),p(this,\"default\",\"\"),p(this,\"panose\",null)}return me(e,[{key:\"getFontFamily\",value:function(){var t=[\"\".concat(this.name)];if(this.alternative&&t.push('\"'.concat(this.alternative,'\"')),this.default&&t.push('\"'.concat(this.default,'\"')),this.panose){var r=this.panose.getFontFamily();t.push(r)}return t.join(\",\")}}]),e}(),Of=function e(){ae(this,e),p(this,\"align\",0)},Lf=function e(i,t){ae(this,e),p(this,\"attribute\",void 0),p(this,\"style\",void 0),p(this,\"backgroundColor\",null),this.attribute=i,this.style=t},Uf=function(){function e(){ae(this,e),p(this,\"family\",0),p(this,\"serifStyle\",0),p(this,\"weight\",0),p(this,\"proportion\",0),p(this,\"contrast\",0),p(this,\"strokeVariation\",0),p(this,\"armStyle\",0),p(this,\"letterForm\",0),p(this,\"midline\",0),p(this,\"xHeight\",0)}return me(e,[{key:\"getFontFamily\",value:function(){if(this.family===3)return\"cursive\";if(this.family===2){if(this.serifStyle>1&&this.serifStyle<11)return\"sans\";if(this.serifStyle>10&&this.serifStyle<14)return\"sans-serf\"}return\"\"}}]),e}(),zf=new ArrayBuffer(0),da=function e(i,t,r){var a=arguments.length>3&&arguments[3]!==void 0?arguments[3]:zf;ae(this,e),p(this,\"children\",[]),p(this,\"payload\",void 0),p(this,\"tagID\",void 0),p(this,\"size\",void 0),p(this,\"parentTagID\",void 0),this.tagID=i,this.size=t,this.parentTagID=r,this.payload=a};function un(e){for(var i=new we(e.buffer),t=new da(0,0,0);!i.isEOF();){for(var r=i.readRecord(),a=Dr(r,3),n=a[0],h=a[1],f=a[2],w=t,v=i.read(f),_=0;_<h;_+=1)w=w.children.slice(-1).pop();w.children.push(new da(n,f,w.tagID,v))}return t}var Gf=function(){function e(i,t){var r=this;ae(this,e),p(this,\"record\",void 0),p(this,\"result\",new ln),p(this,\"container\",void 0),p(this,\"visit\",function(a){switch(a.tagID){case Ye.HWPTAG_DOCUMENT_PROPERTIES:{r.visitDocumentPropertes(a);break}case Ye.HWPTAG_CHAR_SHAPE:{r.visitCharShape(a);break}case Ye.HWPTAG_FACE_NAME:{r.visitFaceName(a);break}case Ye.HWPTAG_BIN_DATA:{r.visitBinData(a);break}case Ye.HWPTAG_BORDER_FILL:{r.visitBorderFill(a);break}case Ye.HWPTAG_PARA_SHAPE:{r.visitParagraphShape(a);break}}a.children.forEach(r.visit)}),this.record=un(i),this.container=t}return me(e,[{key:\"visitDocumentPropertes\",value:function(t){var r=new we(t.payload);this.result.sectionSize=r.readUInt16(),this.result.startingIndex.page=r.readUInt16(),this.result.startingIndex.footnote=r.readUInt16(),this.result.startingIndex.endnote=r.readUInt16(),this.result.startingIndex.picture=r.readUInt16(),this.result.startingIndex.table=r.readUInt16(),this.result.startingIndex.equation=r.readUInt16(),this.result.caratLocation.listId=r.readUInt32(),this.result.caratLocation.paragraphId=r.readUInt32(),this.result.caratLocation.charIndex=r.readUInt32()}},{key:\"visitCharShape\",value:function(t){var r=new we(t.payload),a=new Cf([r.readUInt16(),r.readUInt16(),r.readUInt16(),r.readUInt16(),r.readUInt16(),r.readUInt16(),r.readUInt16()],[r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8()],[r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8()],[r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8(),r.readUInt8()],[r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8(),r.readInt8()],r.readInt32(),r.readUInt32(),r.readUInt8(),r.readUInt8(),r.readUInt32(),r.readUInt32(),r.readUInt32(),r.readUInt32());t.size>68&&(a.fontBackgroundId=r.readUInt16()),t.size>70&&(a.underLineColor=Se(r.readInt32())),this.result.charShapes.push(a)}},{key:\"visitFaceName\",value:function(t){var r=new we(t.payload),a=r.readUInt8(),n=fr(a,7),h=fr(a,6),f=fr(a,5),w=new Nf;if(w.name=r.readString(),n&&(r.skipByte(1),w.alternative=r.readString()),h){var v=new Uf;v.family=r.readInt8(),v.serifStyle=r.readInt8(),v.weight=r.readInt8(),v.proportion=r.readInt8(),v.contrast=r.readInt8(),v.strokeVariation=r.readInt8(),v.armStyle=r.readInt8(),v.letterForm=r.readInt8(),v.midline=r.readInt8(),v.xHeight=r.readInt8(),w.panose=v}f&&(w.default=r.readString()),this.result.fontFaces.push(w)}},{key:\"visitBinData\",value:function(t){var r=new we(t.payload);r.readUInt16();var a=r.readUInt16(),n=r.readString(),h=\"Root Entry/BinData/BIN\".concat(\"\".concat(a.toString(16).toUpperCase()).padStart(4,\"0\"),\".\").concat(n),f=Ut.find(this.container,h).content;this.result.binData.push(new Hf(n,ii.inflate(f,{windowBits:-15})))}},{key:\"visitBorderFill\",value:function(t){var r=new we(t.payload),a=new Lf(r.readUInt16(),{left:{type:r.readUInt8(),width:r.readUInt8(),color:Se(r.readUInt32())},right:{type:r.readUInt8(),width:r.readUInt8(),color:Se(r.readUInt32())},top:{type:r.readUInt8(),width:r.readUInt8(),color:Se(r.readUInt32())},bottom:{type:r.readUInt8(),width:r.readUInt8(),color:Se(r.readUInt32())}});r.skipByte(6),r.readUInt32()===Ff.Single&&(a.backgroundColor=Se(r.readUInt32())),this.result.borderFills.push(a)}},{key:\"visitParagraphShape\",value:function(t){var r=new we(t.payload),a=r.readUInt32(),n=new Of;n.align=Le(a,2,4),this.result.paragraphShapes.push(n)}},{key:\"parse\",value:function(){return this.record.children.forEach(this.visit),this.result}}]),e}();function O(e,i,t,r){var a=e.charCodeAt(0),n=i.charCodeAt(0),h=t.charCodeAt(0),f=r.charCodeAt(0);return a<<24|n<<16|h<<8|f}var Re;(function(e){e[e.Table=O(\"t\",\"b\",\"l\",\" \")]=\"Table\",e[e.Line=O(\"$\",\"l\",\"i\",\"n\")]=\"Line\",e[e.Rectangle=O(\"$\",\"r\",\"e\",\"c\")]=\"Rectangle\",e[e.Ellipse=O(\"$\",\"e\",\"l\",\"l\")]=\"Ellipse\",e[e.Arc=O(\"$\",\"a\",\"r\",\"c\")]=\"Arc\",e[e.Polygon=O(\"$\",\"p\",\"o\",\"l\")]=\"Polygon\",e[e.Curve=O(\"$\",\"c\",\"u\",\"r\")]=\"Curve\",e[e.Equation=O(\"e\",\"q\",\"e\",\"d\")]=\"Equation\",e[e.Picture=O(\"$\",\"p\",\"i\",\"c\")]=\"Picture\",e[e.OLE=O(\"$\",\"o\",\"l\",\"e\")]=\"OLE\",e[e.Connected=O(\"$\",\"c\",\"o\",\"n\")]=\"Connected\",e[e.GenShapeObject=O(\"g\",\"s\",\"o\",\" \")]=\"GenShapeObject\"})(Re||(Re={}));var $r;(function(e){e[e.Section=O(\"s\",\"e\",\"c\",\"d\")]=\"Section\",e[e.Column=O(\"c\",\"o\",\"l\",\"d\")]=\"Column\",e[e.Header=O(\"h\",\"e\",\"a\",\"d\")]=\"Header\",e[e.Footer=O(\"f\",\"o\",\"o\",\"t\")]=\"Footer\",e[e.Footnote=O(\"f\",\"n\",\" \",\" \")]=\"Footnote\",e[e.Endnote=O(\"e\",\"n\",\" \",\" \")]=\"Endnote\",e[e.AutoNumber=O(\"a\",\"t\",\"n\",\"o\")]=\"AutoNumber\",e[e.NewNumber=O(\"n\",\"w\",\"n\",\"o\")]=\"NewNumber\",e[e.PageHide=O(\"p\",\"g\",\"h\",\"d\")]=\"PageHide\",e[e.PageCT=O(\"p\",\"g\",\"c\",\"t\")]=\"PageCT\",e[e.PageNumberPosition=O(\"p\",\"g\",\"n\",\"p\")]=\"PageNumberPosition\",e[e.Indexmark=O(\"i\",\"d\",\"x\",\"m\")]=\"Indexmark\",e[e.Bookmark=O(\"b\",\"o\",\"k\",\"m\")]=\"Bookmark\",e[e.Overlapping=O(\"t\",\"c\",\"p\",\"s\")]=\"Overlapping\",e[e.Comment=O(\"t\",\"d\",\"u\",\"t\")]=\"Comment\",e[e.HiddenComment=O(\"t\",\"c\",\"m\",\"t\")]=\"HiddenComment\"})($r||($r={}));var ca;(function(e){e[e.Unknown=O(\"%\",\"u\",\"n\",\"k\")]=\"Unknown\",e[e.Date=O(\"$\",\"d\",\"t\",\"e\")]=\"Date\",e[e.DocDate=O(\"%\",\"d\",\"d\",\"t\")]=\"DocDate\",e[e.Path=O(\"%\",\"p\",\"a\",\"t\")]=\"Path\",e[e.Bookmark=O(\"%\",\"b\",\"m\",\"k\")]=\"Bookmark\",e[e.MailMerge=O(\"%\",\"m\",\"m\",\"g\")]=\"MailMerge\",e[e.CrossRef=O(\"%\",\"x\",\"r\",\"f\")]=\"CrossRef\",e[e.Formula=O(\"%\",\"f\",\"m\",\"u\")]=\"Formula\",e[e.ClickHere=O(\"%\",\"c\",\"l\",\"k\")]=\"ClickHere\",e[e.Summary=O(\"$\",\"s\",\"m\",\"r\")]=\"Summary\",e[e.UserInfo=O(\"%\",\"u\",\"s\",\"r\")]=\"UserInfo\",e[e.HyperLink=O(\"%\",\"h\",\"l\",\"k\")]=\"HyperLink\",e[e.RevisionSign=O(\"%\",\"s\",\"i\",\"g\")]=\"RevisionSign\",e[e.RevisionDelete=O(\"%\",\"%\",\"*\",\"d\")]=\"RevisionDelete\",e[e.RevisionAttach=O(\"%\",\"%\",\"*\",\"a\")]=\"RevisionAttach\",e[e.RevisionClipping=O(\"%\",\"%\",\"*\",\"C\")]=\"RevisionClipping\",e[e.RevisionSawtooth=O(\"%\",\"%\",\"*\",\"S\")]=\"RevisionSawtooth\",e[e.RevisionThinking=O(\"%\",\"%\",\"*\",\"T\")]=\"RevisionThinking\",e[e.RevisionPraise=O(\"%\",\"%\",\"*\",\"P\")]=\"RevisionPraise\",e[e.RevisionLine=O(\"%\",\"%\",\"*\",\"L\")]=\"RevisionLine\",e[e.RevisionSimpleChange=O(\"%\",\"%\",\"*\",\"c\")]=\"RevisionSimpleChange\",e[e.RevisionHyperLink=O(\"%\",\"%\",\"*\",\"h\")]=\"RevisionHyperLink\",e[e.RevisionLineAttach=O(\"%\",\"%\",\"*\",\"A\")]=\"RevisionLineAttach\",e[e.RevisionLineLink=O(\"%\",\"%\",\"*\",\"i\")]=\"RevisionLineLink\",e[e.RevisionLineRansfer=O(\"%\",\"%\",\"*\",\"t\")]=\"RevisionLineRansfer\",e[e.RevisionRightMove=O(\"%\",\"%\",\"*\",\"r\")]=\"RevisionRightMove\",e[e.RevisionLeftMove=O(\"%\",\"%\",\"*\",\"l\")]=\"RevisionLeftMove\",e[e.RevisionTransfer=O(\"%\",\"%\",\"*\",\"n\")]=\"RevisionTransfer\",e[e.RevisionSimpleInsert=O(\"%\",\"%\",\"*\",\"e\")]=\"RevisionSimpleInsert\",e[e.RevisionSplit=O(\"%\",\"s\",\"p\",\"l\")]=\"RevisionSplit\",e[e.RevisionChange=O(\"%\",\"%\",\"m\",\"r\")]=\"RevisionChange\",e[e.Memo=O(\"%\",\"%\",\"m\",\"e\")]=\"Memo\",e[e.PrivateInfoSecurity=O(\"%\",\"c\",\"p\",\"r\")]=\"PrivateInfoSecurity\",e[e.TableOfContents=O(\"%\",\"t\",\"o\",\"c\")]=\"TableOfContents\"})(ca||(ca={}));var Mf=function e(){ae(this,e),p(this,\"vertRelTo\",0)},dn=function(){function e(){ae(this,e),p(this,\"id\",0),p(this,\"attribute\",new Mf),p(this,\"verticalOffset\",0),p(this,\"horizontalOffset\",0),p(this,\"width\",0),p(this,\"height\",0),p(this,\"zIndex\",0),p(this,\"margin\",[0,0,0,0]),p(this,\"uid\",0),p(this,\"split\",0)}return me(e,[{key:\"setAttribute\",value:function(t){this.attribute.vertRelTo=Le(t,3,4)}}]),e}(),Wf=function(e){xa(t,e);var i=ya(t);function t(){var r;ae(this,t);for(var a=arguments.length,n=new Array(a),h=0;h<a;h++)n[h]=arguments[h];return r=i.call.apply(i,[this].concat(n)),p(Ze(r),\"type\",0),p(Ze(r),\"info\",null),p(Ze(r),\"content\",[]),r}return t}(dn),cn=function(e){xa(t,e);var i=ya(t);function t(){var r;ae(this,t);for(var a=arguments.length,n=new Array(a),h=0;h<a;h++)n[h]=arguments[h];return r=i.call.apply(i,[this].concat(n)),p(Ze(r),\"tableAttribute\",0),p(Ze(r),\"rowCount\",0),p(Ze(r),\"columnCount\",0),p(Ze(r),\"borderFillID\",0),p(Ze(r),\"content\",[]),r}return me(t,[{key:\"addRow\",value:function(a,n){this.content[a]||(this.content[a]=[]),this.content[a].push(n)}}]),t}(dn),vn=function e(){ae(this,e),p(this,\"width\",0),p(this,\"height\",0),p(this,\"paddingLeft\",0),p(this,\"paddingRight\",0),p(this,\"paddingTop\",0),p(this,\"paddingBottom\",0),p(this,\"headerPadding\",0),p(this,\"footerPadding\",0),p(this,\"content\",[]),p(this,\"orientation\",0),p(this,\"bookBindingMethod\",0)},sr=function(){function e(){ae(this,e),p(this,\"content\",[]),p(this,\"shapeBuffer\",[]),p(this,\"controls\",[]),p(this,\"lineSegments\",[]),p(this,\"shapeIndex\",0),p(this,\"aligns\",0),p(this,\"textSize\",0)}return me(e,[{key:\"getShapeEndPos\",value:function(t){return t===this.shapeBuffer.length-1?this.content.length-1:this.shapeBuffer[t+1].pos-1}},{key:\"getNextSize\",value:function(t){var r=this.lineSegments[t+1];return r?r.start:this.textSize}}]),e}(),Kr=function e(i,t){ae(this,e),p(this,\"attribute\",void 0),p(this,\"items\",[]),this.attribute=i,this.items=t},je;(function(e){e[e.Char=0]=\"Char\",e[e.Inline=1]=\"Inline\",e[e.Extened=2]=\"Extened\"})(je||(je={}));var Jt=function e(i,t){ae(this,e),p(this,\"type\",void 0),p(this,\"value\",void 0),this.type=i,this.value=t},Zf=function e(i,t){ae(this,e),p(this,\"pos\",0),p(this,\"shapeIndex\",0),this.pos=i,this.shapeIndex=t},jf=function e(){ae(this,e),p(this,\"start\",0),p(this,\"y\",0),p(this,\"height\",0),p(this,\"textHeight\",0),p(this,\"baseLineGap\",0),p(this,\"lineSpacing\",0),p(this,\"startByte\",0),p(this,\"width\",0)},Qt=function(){function e(i){ae(this,e),p(this,\"cursor\",void 0),p(this,\"records\",void 0),this.records=i,this.cursor=0}return me(e,[{key:\"hasNext\",value:function(){return this.cursor<this.records.length}},{key:\"current\",value:function(){return this.records[this.cursor]}},{key:\"read\",value:function(){var t=this.records[this.cursor];return this.cursor+=1,t}}]),e}();function ni(e){return e.id===Re.Table}function Yr(e){return e.id===Re.GenShapeObject}function $f(e){return e.type===Re.Picture}var Xr;(function(e){e[e.Normal=0]=\"Normal\",e[e.Parallel=1]=\"Parallel\",e[e.Justify=2]=\"Justify\"})(Xr||(Xr={}));var Vr;(function(e){e[e.Left=0]=\"Left\",e[e.Right=1]=\"Right\",e[e.Justify=2]=\"Justify\"})(Vr||(Vr={}));var Kf=function e(){ae(this,e),p(this,\"id\",0),p(this,\"type\",Xr.Normal),p(this,\"count\",0),p(this,\"direction\",Vr.Left),p(this,\"isSameWidth\",!0),p(this,\"gap\",0),p(this,\"widths\",[]),p(this,\"borderStyle\",0),p(this,\"borderWidth\",0),p(this,\"borderColor\",0)},Yf=function(){function e(i){ae(this,e),p(this,\"record\",void 0),p(this,\"result\",void 0),p(this,\"content\",[]),this.record=un(i),this.result=new vn}return me(e,[{key:\"visitPageDef\",value:function(t){var r=new we(t.payload);this.result.width=r.readUInt32(),this.result.height=r.readUInt32(),this.result.paddingLeft=r.readUInt32(),this.result.paddingRight=r.readUInt32(),this.result.paddingTop=r.readUInt32(),this.result.paddingBottom=r.readUInt32(),this.result.headerPadding=r.readUInt32(),this.result.footerPadding=r.readUInt32();var a=r.readUInt32();this.result.orientation=Le(a,0,0),this.result.bookBindingMethod=Le(a,1,2)}},{key:\"visitParaText\",value:function(t,r){for(var a=new we(t.payload),n=0;n<t.size;){var h=a.readUInt16();switch(h){case 0:case 10:case 13:{r.content.push(new Jt(je.Char,h)),r.textSize+=1,n+=2;break}case 4:case 5:case 6:case 7:case 8:case 9:case 19:case 20:{r.content.push(new Jt(je.Inline,h)),r.textSize+=8,a.skipByte(14),n+=16;break}case 1:case 2:case 3:case 11:case 12:case 14:case 15:case 16:case 17:case 18:case 21:case 22:case 23:{r.content.push(new Jt(je.Extened,h)),a.skipByte(14),r.textSize+=8,n+=16;break}default:r.content.push(new Jt(je.Char,String.fromCharCode(h))),r.textSize+=1,n+=2}}}},{key:\"visitCharShape\",value:function(t,r){var a=new we(t.payload),n=new Zf(a.readUInt32(),a.readUInt32());r.shapeBuffer.push(n)}},{key:\"visitCommonControl\",value:function(t,r){r.setAttribute(t.readUInt32()),r.verticalOffset=t.readUInt32(),r.horizontalOffset=t.readUInt32(),r.width=t.readUInt32(),r.height=t.readUInt32(),r.zIndex=t.readUInt32(),r.margin=[t.readInt16(),t.readInt16(),t.readInt16(),t.readInt16()],r.uid=t.readUInt32(),r.split=t.readInt32()}},{key:\"visitTableControl\",value:function(t){var r=new cn;return r.id=Re.Table,this.visitCommonControl(t,r),r}},{key:\"getControl\",value:function(t){var r=t.readUInt32();if(r===Re.Table)return this.visitTableControl(t);if(r===Re.GenShapeObject){var a=new Wf;return a.id=r,this.visitCommonControl(t,a),a}if(r===$r.Column){var n=new Kf,h=t.readUInt16();if(n.type=Le(h,0,1),n.count=Le(h,2,9),n.direction=Le(h,10,11),n.isSameWidth=fr(h,12),n.id=r,n.gap=t.readUInt16(),!n.isSameWidth){for(var f=[],w=0;w<n.count;w+=1)f.push(t.readUInt16());n.widths=f}return t.readUInt16(),n.borderStyle=t.readUInt8(),n.borderWidth=t.readUInt8(),n.borderColor=t.readUInt32(),n}return{id:r}}},{key:\"visitControlHeader\",value:function(t,r){for(var a=new we(t.payload),n=this.getControl(a),h=new Qt(t.children);h.hasNext();)this.visit(h,r,n);r.controls.push(n)}},{key:\"visitCellListHeader\",value:function(t){var r={column:t.readUInt16(),row:t.readUInt16(),colSpan:t.readUInt16(),rowSpan:t.readUInt16(),width:t.readUInt32(),height:t.readUInt32(),padding:[t.readUInt16(),t.readUInt16(),t.readUInt16(),t.readUInt16()]};return t.isEOF()||(r.borderFillID=t.readUInt16()-1),r}},{key:\"visitListHeader\",value:function(t,r,a){if(!a)throw new Error(\"Except: control, Recived: \".concat(a));var n=new we(t.payload),h=t.size===30?n.readInt16():n.readInt32();n.readUInt32();for(var f=[],w=0;w<h;w+=1){var v=r.read();this.visitParagraphHeader(v,f,a)}if(t.parentTagID===Pe.HWPTAG_CTRL_HEADER&&ni(a)){var _=this.visitCellListHeader(n),T=new Kr(_,f);a.addRow(_.row,T)}t.parentTagID===Pe.HWPTAG_SHAPE_COMPONENT&&Yr(a)&&a.content.push(new Kr(null,f))}},{key:\"visitTable\",value:function(t,r){var a=new we(t.payload);if(!r)throw new Error(\"Expect control\");if(r.id!==Re.Table)throw new Error(\"Expect: \".concat(Re.Table,\", Recived: \").concat(r.id));r.tableAttribute=a.readUInt32(),r.rowCount=a.readUInt16(),r.columnCount=a.readUInt16(),a.skipByte(10+2*r.rowCount),r.borderFillID=a.readUInt16()}},{key:\"visitShapeComponent\",value:function(t,r,a){for(var n=new Qt(t.children);n.hasNext();)this.visit(n,r,a)}},{key:\"visitPicture\",value:function(t,r){if(!Yr(r))throw new Error(\"Control type not matched\");var a=new we(t.payload);a.skipByte(4*17+3),r.type=Re.Picture,r.info={binID:a.readUInt16()-1}}},{key:\"visitLineSegment\",value:function(t,r){for(var a=new we(t.payload);!a.isEOF();){var n=new jf;n.start=a.readUInt32(),n.y=a.readInt32(),n.height=a.readInt32(),n.textHeight=a.readInt32(),n.baseLineGap=a.readInt32(),n.lineSpacing=a.readInt32(),n.startByte=a.readInt32(),n.width=a.readInt32(),a.readUInt32(),r.lineSegments.push(n)}}},{key:\"visit\",value:function(t,r,a){var n=t.read();switch(n.tagID){case Pe.HWPTAG_LIST_HEADER:{this.visitListHeader(n,t,a);break}case Pe.HWPTAG_PAGE_DEF:{this.visitPageDef(n);break}case Pe.HWPTAG_PARA_TEXT:{this.visitParaText(n,r);break}case Pe.HWPTAG_PARA_CHAR_SHAPE:{this.visitCharShape(n,r);break}case Pe.HWPTAG_CTRL_HEADER:{this.visitControlHeader(n,r);break}case Pe.HWPTAG_TABLE:{this.visitTable(n,a);break}case Pe.HWPTAG_SHAPE_COMPONENT:{this.visitShapeComponent(n,r,a);break}case Pe.HWPTAG_SHAPE_COMPONENT_PICTURE:{this.visitPicture(n,a);break}case Pe.HWPTAG_PARA_LINE_SEG:{this.visitLineSegment(n,r);break}}}},{key:\"visitParagraphHeader\",value:function(t,r,a){var n=new sr,h=new we(t.payload);h.skipByte(8),n.shapeIndex=h.readUInt16();for(var f=new Qt(t.children);f.hasNext();)this.visit(f,n,a);r.push(n)}},{key:\"traverse\",value:function(t){for(var r=new Qt(t.children);r.hasNext();)this.visitParagraphHeader(r.read(),this.content)}},{key:\"parse\",value:function(){return this.traverse(this.record),this.result.content=this.content,this.result}}]),e}(),va=256,_a=new ai(5,1,0,0),pa=\"HWP Document File\";function Xf(e){var i=Ut.find(e,\"FileHeader\");if(!i)throw new Error(\"Cannot find FileHeader\");var t=i.content;if(t.length!==va)throw new Error(\"FileHeader must be \".concat(va,\" bytes, Received: \").concat(t.length));var r=String.fromCharCode.apply(String,ur(Array.from(t.slice(0,17))));if(pa!==r)throw new Error(\"hwp file's signature should be \".concat(pa,\". Received version: \").concat(r));var a=Array.from(t.slice(32,36)).reverse(),n=Dr(a,4),h=n[0],f=n[1],w=n[2],v=n[3],_=new ai(h,f,w,v);if(!_.isCompatible(_a))throw new Error(\"hwp.js only support \".concat(_a,\" format. Received version: \").concat(_));return new sn(_,r)}function Vf(e){var i=Ut.find(e,\"DocInfo\");if(!i)throw new Error(\"DocInfo not exist\");var t=i.content,r=ii.inflate(t,{windowBits:-15});return new Gf(r,e).parse()}function Df(e,i){var t=Ut.find(e,\"Root Entry/BodyText/Section\".concat(i));if(!t)throw new Error(\"Section not exist\");var r=t.content,a=ii.inflate(r,{windowBits:-15});return new Yf(a).parse()}function oi(e,i){for(var t=Ut.read(e,i),r=Xf(t),a=Vf(t),n=[],h=0;h<a.sectionSize;h+=1)n.push(Df(t,h));return new fn(r,a,n)}function _n(e,i,t,r){for(var a=t,n=0,h=-1,f=i,w=[],v=[],_=0;_<e.length;_+=1){var T=e[_],S=Math.min.apply(Math,ur(T.map(function(U){return U.attribute.height})));if(v.push(S),n+=S,a>=n)w.push(T);else{h=_;break}}for(var P=0;P<f.length;P+=1){var G=w[0],z=f[P];z&&G.splice(z.attribute.column,0,z)}if(f=[],w.forEach(function(U,ee){U.forEach(function($){if($.attribute.height>a){var K=$.attribute.height,C=$.attribute.rowSpan,X=C-(h-ee-2);$.attribute.height=a,$.attribute.rowSpan=X,f[$.attribute.column]=new Kr(ki(ki({},$.attribute),{},{row:0,height:K-a,rowSpan:C-X}),[])}}),a-=v[ee]}),h<0)return[w];var Y=_n(e.slice(h),f,r,r);return[w].concat(ur(Y))}var Jf=function(){function e(i){var t=this;ae(this,e),p(this,\"section\",void 0),p(this,\"currentSection\",void 0),p(this,\"currentParagraph\",new sr),p(this,\"readIndex\",0),p(this,\"contentHeight\",0),p(this,\"currentHeight\",0),p(this,\"controlIndex\",0),p(this,\"startChatIndex\",0),p(this,\"endCharIndex\",0),p(this,\"shapeBufferIndex\",0),p(this,\"latestY\",0),p(this,\"result\",[]),p(this,\"visitParagraph\",function(r){t.readIndex=0,t.controlIndex=0,t.startChatIndex=0,t.endCharIndex=0,t.shapeBufferIndex=0,t.currentParagraph=new sr,r.lineSegments.forEach(function(a,n){t.visitLine(a,n,r)}),t.exitParagraph(r)}),this.section=i,this.currentSection=this.createSection(),this.contentHeight=i.height-i.headerPadding-i.footerPadding-i.paddingTop-i.paddingBottom}return me(e,[{key:\"createSection\",value:function(){var t=new vn;return t.width=this.section.width,t.height=this.section.height,t.paddingTop=this.section.paddingTop,t.paddingRight=this.section.paddingRight,t.paddingBottom=this.section.paddingBottom,t.paddingLeft=this.section.paddingLeft,t.headerPadding=this.section.headerPadding,t.footerPadding=this.section.footerPadding,t}},{key:\"getLine\",value:function(t,r,a){for(var n=t.start,h=a.getNextSize(r),f=[],w=n;w<h;){var v=a.content[this.readIndex];v.type===je.Char?w+=1:w+=8,f.push(v),this.readIndex+=1}return f}},{key:\"checkoutShpeBuffer\",value:function(t){for(var r=t.getShapeEndPos(this.shapeBufferIndex),a=0;this.endCharIndex<=r&&this.shapeBufferIndex<t.shapeBuffer.length-1;){r=t.getShapeEndPos(this.shapeBufferIndex);var n=t.shapeBuffer[this.shapeBufferIndex];this.currentParagraph.shapeBuffer.push({shapeIndex:n.shapeIndex,pos:a}),a+=r-this.startChatIndex-a,this.shapeBufferIndex+=1}var h=t.shapeBuffer[this.shapeBufferIndex];this.currentParagraph.shapeBuffer.push({shapeIndex:h.shapeIndex,pos:a})}},{key:\"exitParagraph\",value:function(t){this.checkoutShpeBuffer(t),this.currentSection.content.push(this.currentParagraph)}},{key:\"exitPage\",value:function(t){this.exitParagraph(t),this.result.push(this.currentSection),this.currentSection=this.createSection(),this.currentParagraph=new sr,this.currentParagraph.shapeIndex=t.shapeIndex,this.currentHeight=0}},{key:\"createTable\",value:function(t,r){var a=t.reduce(function(h,f){var w=Math.min.apply(Math,ur(f.map(function(v){return v.attribute.height})));return h+w},0),n=new cn;return n.id=Re.Table,n.width=r,n.height=a,n.content=t,n.rowCount=t.length,n}},{key:\"visitLine\",value:function(t,r,a){var n=this,h=this.getLine(t,r,a);(t.y===0||t.y<this.latestY)&&(this.exitPage(a),this.startChatIndex=this.endCharIndex,this.currentHeight=0),this.latestY=t.y,this.currentHeight+=t.height+t.lineSpacing,h.forEach(function(f){if(f.type!==je.Extened){n.currentParagraph.content.push(f),n.endCharIndex+=1;return}var w=a.controls[n.controlIndex];if(n.controlIndex+=1,!ni(w)){n.currentParagraph.content.push(f),n.currentParagraph.controls.push(w),n.endCharIndex+=1;return}n.currentHeight-=t.height+t.lineSpacing;var v=_n(w.content,[],n.contentHeight-n.currentHeight,n.contentHeight).map(function(_){return n.createTable(_,w.width)});v.forEach(function(_,T){n.currentParagraph.content.push(f),n.currentParagraph.controls.push(_),v.length>1&&T!==v.length-1&&(n.exitPage(a),n.startChatIndex=n.endCharIndex)}),n.currentHeight+=v[v.length-1].height,n.endCharIndex+=1})}},{key:\"build\",value:function(){return this.section.content.forEach(this.visitParagraph),this.result.shift(),this.result.push(this.currentSection),this.result}}]),e}();function Qf(e){var i=[];return e.sections.forEach(function(t){i=i.concat(new Jf(t).build())}),e.sections=i,e}var qt=\"hwpjs-pe-no-print\",er=\"hwpjs-pe-preserve-print\",tr=\"hwpjs-pe-preserve-ancestor\",qf=\"BODY\";function wa(e,i){var t=e;for(i(t,!0),t=t.parentElement;t&&t.nodeName!==qf;)i(t,!1),t=t.parentElement}function ga(e,i){for(var t=e.previousElementSibling;t;)i(t,!1),t=t.previousElementSibling;for(t=e.nextElementSibling;t;)i(t,!1),t=t.nextElementSibling}function es(e){var i=`\n    @page {\n      margin: 0;\n    }\n\n    @media print {\n      html, body {\n        width: 100%;\n        height: 100%;\n        background-color: #FFF;\n      }\n\n      .`.concat(qt,` {\n        display: none !important;\n      }\n\n      .`).concat(tr,` {\n        display: block !important;\n        margin: 0 !important;\n        padding: 0 !important;\n        border: none !important;\n        box-shadow: none !important;\n        overflow: visible !important;\n      }\n\n      .`).concat(tr,` > *  {\n        box-shadow: none !important;\n        overflow: visible !important;\n      }\n\n      .`).concat(er,` {\n        box-shadow: none !important;\n        height: 100% !important;\n        margin: 0 !important;\n      }\n\n      * {\n        -webkit-print-color-adjust: exact !important;\n        color-adjust: exact !important;\n      }\n    }\n  `),t=document.createElement(\"style\");t.type=\"text/css\",t.innerText=i,document.head.appendChild(t);var r=function(f){f.classList.contains(er)||f.classList.add(qt)},a=function(f,w){f.classList.remove(qt),f.classList.add(er),w||f.classList.add(tr)},n=function(f){f.classList.remove(qt),f.classList.remove(er),f.classList.remove(tr)};e.forEach(function(h){wa(h,function(f,w){a(f,w),ga(f,r)})}),window.print(),e.forEach(function(h){wa(h,function(f){n(f),ga(f,n)})}),t.remove()}var ts=function(){function e(i,t,r){var a=this;if(ae(this,e),p(this,\"pages\",void 0),p(this,\"observer\",void 0),p(this,\"container\",void 0),p(this,\"content\",void 0),p(this,\"modal\",null),p(this,\"pageNumber\",null),p(this,\"infoButton\",null),p(this,\"printButton\",null),p(this,\"handleModalClick\",function(f){f.currentTarget===f.target&&a.modal&&(a.modal.style.display=\"none\")}),p(this,\"handleInfoButtionClick\",function(){a.modal&&(a.modal.style.display=\"flex\")}),p(this,\"handlePrintButtionClick\",function(){es(a.pages)}),this.content=t,this.pages=r,this.container=this.drawContainer(i),this.modal=this.drawModal(i),this.observer=new IntersectionObserver(function(f){f.forEach(function(w){if(w.isIntersecting&&w.isIntersecting&&w.target.parentElement){var v=w.target.getAttribute(\"data-page-number\"),_=Number(v)+1;a.updatePageNumber(_)}})},{root:this.content,rootMargin:\"0px\"}),this.pages.forEach(function(f){a.observer.observe(f.querySelector(\".hwpjs-observer\"))}),this.draw(),!document.getElementById(\"hwpjs-header-css\")){var n=`\n      .hwpjs-header-control {\n        transition: background .2s;\n      }\n      .hwpjs-header-control:hover {\n        background: #DDD;\n      }\n      .hwpjs-header-control:active {\n        background: #AAA;\n      }\n      `,h=document.createElement(\"style\");h.type=\"text/css\",h.id=\"hwpjs-header-css\",h.innerText=n,document.head.appendChild(h)}}return me(e,[{key:\"updatePageNumber\",value:function(t){this.pageNumber&&(this.pageNumber.textContent=t.toString())}},{key:\"distory\",value:function(){var t=this,r,a,n;this.pages.forEach(function(h){t.observer.unobserve(h)}),(r=this.modal)===null||r===void 0||r.removeEventListener(\"click\",this.handleModalClick),this.modal=null,(a=this.infoButton)===null||a===void 0||a.removeEventListener(\"click\",this.handleInfoButtionClick),this.infoButton=null,(n=this.printButton)===null||n===void 0||n.removeEventListener(\"click\",this.handleInfoButtionClick),this.printButton=null,this.pageNumber=null}},{key:\"drawContainer\",value:function(t){var r=document.createElement(\"div\");r.style.position=\"absolute\",r.style.zIndex=\"1\",r.style.top=\"0\",r.style.right=\"0\",r.style.left=\"0\",r.style.boxShadow=\"0 1px 3px rgba(204, 204, 204, 1)\",r.style.backgroundColor=\"rgb(249, 249, 250)\",r.style.height=\"32px\";var a=document.createElement(\"div\");return a.style.display=\"flex\",a.style.alignItems=\"center\",a.style.height=\"100%\",a.style.margin=\"0 auto\",a.style.maxWidth=\"1000px\",a.style.width=\"100%\",a.style.padding=\"0 24px\",r.appendChild(a),t.appendChild(r),a}},{key:\"drawModal\",value:function(t){var r=document.createElement(\"div\");r.style.position=\"absolute\",r.style.zIndex=\"2\",r.style.top=\"0\",r.style.right=\"0\",r.style.bottom=\"0\",r.style.left=\"0\",r.style.background=\"rgba(0, 0, 0, 0.7)\",r.style.display=\"none\",r.style.justifyContent=\"center\",r.style.alignItems=\"center\",r.style.cursor=\"pointer\";var a=document.createElement(\"div\");a.style.background=\"#FFF\",a.style.borderRadius=\"5px\",a.style.padding=\"0 24px\",a.style.cursor=\"initial\",a.style.boxShadow=\"0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19)\";var n=document.createElement(\"h1\"),h=document.createElement(\"a\");h.href=\"https://github.com/hahnlee/hwp.js\",h.textContent=\"hwp.js\",h.target=\"_blink\",h.rel=\"noopener noreferrer\",n.appendChild(h);var f=document.createElement(\"p\");f.textContent=\"\\uBCF8 \\uC81C\\uD488\\uC740 \\uD55C\\uAE00\\uACFC\\uCEF4\\uD4E8\\uD130\\uC758 \\uD55C/\\uAE00 \\uBB38\\uC11C \\uD30C\\uC77C(.hwp) \\uACF5\\uAC1C \\uBB38\\uC11C\\uB97C \\uCC38\\uACE0\\uD558\\uC5EC \\uAC1C\\uBC1C\\uD558\\uC600\\uC2B5\\uB2C8\\uB2E4.\";var w=document.createElement(\"p\");return w.textContent=\"Copyright 2020 Han Lee <hanlee.dev@gmail.com> and other contributors.\",a.appendChild(n),a.appendChild(f),a.appendChild(w),r.appendChild(a),t.appendChild(r),r.addEventListener(\"click\",this.handleModalClick),r}},{key:\"drawPageNumber\",value:function(){this.pageNumber=document.createElement(\"span\"),this.pageNumber.textContent=\"1\";var t=document.createElement(\"span\");t.textContent=\"/\".concat(this.pages.length,\"\\uCABD\"),this.container.appendChild(this.pageNumber),this.container.appendChild(t)}},{key:\"drawInfoIcon\",value:function(){var t=document.createElement(\"div\");t.style.marginLeft=\"10px\",t.style.cursor=\"pointer\",t.style.height=\"100%\",t.style.padding=\"5px\",t.classList.add(\"hwpjs-header-control\"),t.innerHTML='<svg width=\"393\" height=\"394\" viewBox=\"0 0 393 394\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" overflow=\"hidden\" style=\"height: 100%;width: auto;\"><defs><clipPath id=\"hwpjs-header-info\"><rect x=\"463\" y=\"144\" width=\"393\" height=\"394\"/></clipPath></defs><g clip-path=\"url(#--hwpjs-header-info)\" transform=\"translate(-463 -144)\"><path d=\"M640.245 292.076 640.245 471.79 678.755 471.79 678.755 292.076ZM640.245 209.21 640.245 247.602 678.755 247.602 678.755 209.21ZM463 144 856 144 856 537 463 537Z\" fill-rule=\"evenodd\"/></g></svg>',t.addEventListener(\"click\",this.handleInfoButtionClick),this.container.appendChild(t),this.infoButton=t}},{key:\"drawPrintIcon\",value:function(){var t=document.createElement(\"div\");t.style.cursor=\"pointer\",t.style.height=\"100%\",t.style.padding=\"5px\",t.classList.add(\"hwpjs-header-control\"),t.innerHTML='<svg width=\"284\" height=\"253\" viewBox=\"0 0 284 253\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" overflow=\"hidden\" style=\"height: 100%;width: auto;\"><defs><clipPath id=\"hwpjs-header-print\"><rect x=\"498\" y=\"82\" width=\"284\" height=\"253\"/></clipPath></defs><g clip-path=\"url(#--hwpjs-header-print)\" transform=\"translate(-498 -82)\"><rect x=\"559\" y=\"93\" width=\"162\" height=\"231\" stroke=\"#000000\" stroke-width=\"20\" stroke-miterlimit=\"8\" fill=\"none\"/><path d=\"M756.613 155.95C751.961 155.95 748.189 159.719 748.189 164.368 748.189 169.018 751.961 172.787 756.613 172.787 761.266 172.787 765.038 169.018 765.038 164.368 765.038 159.719 761.266 155.95 756.613 155.95ZM499 140 781 140 781 228.612 781 275 720.698 275 720.698 228.612 559.302 228.612 559.302 275 499 275 499 228.612Z\" fill-rule=\"evenodd\"/><path d=\"M588 286 647.556 286\" stroke=\"#000000\" stroke-width=\"20\" stroke-miterlimit=\"8\" fill=\"none\" fill-rule=\"evenodd\"/><path d=\"M588 254 670.667 254\" stroke=\"#000000\" stroke-width=\"20\" stroke-miterlimit=\"8\" fill=\"none\" fill-rule=\"evenodd\"/></g></svg>',t.style.marginLeft=\"auto\",t.addEventListener(\"click\",this.handlePrintButtionClick),this.container.appendChild(t),this.printButton=t}},{key:\"draw\",value:function(){this.drawPageNumber(),this.drawPrintIcon(),this.drawInfoIcon()}}]),e}(),rr=[\"0.1mm\",\"0.12mm\",\"0.15mm\",\"0.2mm\",\"0.25mm\",\"0.3mm\",\"0.4mm\",\"0.5mm\",\"0.6mm\",\"0.7mm\",\"1.0mm\",\"1.5mm\",\"2.0mm\",\"3.0mm\",\"4.0mm\",\"5.0mm\"],ir={0:\"none\",1:\"solid\",2:\"dashed\",3:\"dotted\",8:\"double\"},rs={0:\"justify\",1:\"left\",2:\"right\",3:\"center\"},pn=function(){function e(i,t){var r=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{type:\"binary\"};ae(this,e),p(this,\"hwpDocument\",new fn(new sn(new ai(5,0,0,0),\"HWP Document File\"),new ln,[])),p(this,\"container\",void 0),p(this,\"viewer\",window.document.createElement(\"div\")),p(this,\"pages\",[]),p(this,\"header\",null),this.container=i,this.hwpDocument=Qf(oi(t,r)),this.draw()}return me(e,[{key:\"distory\",value:function(){var t,r;this.pages=[],(t=this.header)===null||t===void 0||t.distory(),(r=this.viewer.parentElement)===null||r===void 0||r.removeChild(this.viewer)}},{key:\"createPage\",value:function(t,r){var a=document.createElement(\"div\");a.style.boxShadow=\"0 1px 3px 1px rgba(60,64,67,.15)\",a.style.backgroundColor=\"#FFF\",a.style.margin=\"0 auto\",a.style.position=\"relative\",a.style.pageBreakAfter=\"always\",a.style.width=\"\".concat(t.width/7200,\"in\"),a.style.height=\"\".concat(t.height/7200,\"in\"),a.style.paddingTop=\"\".concat((t.paddingTop+t.headerPadding)/7200,\"in\"),a.style.paddingRight=\"\".concat(t.paddingRight/7200,\"in\"),a.style.paddingBottom=\"\".concat(t.paddingBottom/7200,\"in\"),a.style.paddingLeft=\"\".concat(t.paddingLeft/7200,\"in\"),a.setAttribute(\"data-page-number\",r.toString());var n=document.createElement(\"div\");return n.style.height=\"2px\",n.style.position=\"absolute\",n.style.width=\"100%\",n.style.top=\"50%\",n.style.left=\"0\",n.classList.add(\"hwpjs-observer\"),n.setAttribute(\"data-page-number\",r.toString()),a.appendChild(n),this.pages.push(a),a}},{key:\"getRGBStyle\",value:function(t){var r=Dr(t,3),a=r[0],n=r[1],h=r[2];return\"rgb(\".concat(a,\", \").concat(n,\", \").concat(h,\")\")}},{key:\"drawViewer\",value:function(){this.viewer.style.backgroundColor=\"#E8EAED\",this.viewer.style.position=\"relative\",this.viewer.style.overflow=\"hidden\",this.viewer.style.width=\"100%\",this.viewer.style.height=\"100%\"}},{key:\"drawBorderFill\",value:function(t,r){if(r!==void 0){var a=this.hwpDocument.info.borderFills[r];t.style.borderTopColor=this.getRGBStyle(a.style.top.color),t.style.borderRightColor=this.getRGBStyle(a.style.right.color),t.style.borderBottomColor=this.getRGBStyle(a.style.bottom.color),t.style.borderLeftColor=this.getRGBStyle(a.style.left.color),t.style.borderTopWidth=rr[a.style.top.width],t.style.borderRightWidth=rr[a.style.right.width],t.style.borderBottomWidth=rr[a.style.bottom.width],t.style.borderLeftWidth=rr[a.style.left.width],t.style.borderTopStyle=ir[a.style.top.type],t.style.borderRightStyle=ir[a.style.right.type],t.style.borderBottomStyle=ir[a.style.bottom.type],t.style.borderLeftStyle=ir[a.style.left.type],a.backgroundColor&&(t.style.backgroundColor=this.getRGBStyle(a.backgroundColor))}}},{key:\"drawColumn\",value:function(t,r){var a=this,n=document.createElement(\"td\"),h=r.attribute,f=h.width,w=h.height,v=h.colSpan,_=h.rowSpan,T=h.borderFillID;n.style.width=\"\".concat(f/100,\"pt\"),n.style.height=\"\".concat(w/100,\"pt\"),n.colSpan=v,n.rowSpan=_,this.drawBorderFill(n,T),r.items.forEach(function(S){a.drawParagraph(n,S)}),t.appendChild(n)}},{key:\"drawTable\",value:function(t,r){var a=this,n=document.createElement(\"table\");n.style.display=\"inline-table\",n.style.borderCollapse=\"collapse\",n.style.width=\"\".concat(r.width/100,\"pt\"),n.style.height=\"\".concat(r.height/100,\"pt\");for(var h=document.createElement(\"tbody\"),f=function(_){var T=document.createElement(\"tr\");r.content[_].forEach(function(S){a.drawColumn(T,S)}),h.appendChild(T)},w=0;w<r.rowCount;w+=1)f(w);n.appendChild(h),t.appendChild(n)}},{key:\"drawShape\",value:function(t,r){var a=this,n=document.createElement(\"div\");if(n.style.width=\"\".concat(r.width/100,\"pt\"),n.style.height=\"\".concat(r.height/100,\"pt\"),r.attribute.vertRelTo===0?(n.style.position=\"absolute\",n.style.top=\"\".concat(r.verticalOffset/100,\"pt\"),n.style.left=\"\".concat(r.horizontalOffset/100,\"pt\")):(n.style.marginTop=\"\".concat(r.verticalOffset/100,\"pt\"),n.style.marginLeft=\"\".concat(r.horizontalOffset/100,\"pt\")),n.style.zIndex=\"\".concat(r.zIndex),n.style.verticalAlign=\"middle\",n.style.display=\"inline-block\",$f(r)){var h=this.hwpDocument.info.binData[r.info.binID],f=new Blob([h.payload],{type:\"images/\".concat(h.extension)}),w=window.URL.createObjectURL(f);n.style.backgroundImage='url(\"'.concat(w,'\")'),n.style.backgroundRepeat=\"no-repeat\",n.style.backgroundPosition=\"center\",n.style.backgroundSize=\"contain\"}r.content.forEach(function(v){v.items.forEach(function(_){a.drawParagraph(n,_)})}),t.appendChild(n)}},{key:\"drawControl\",value:function(t,r){if(ni(r)){this.drawTable(t,r);return}Yr(r)&&this.drawShape(t,r)}},{key:\"drawText\",value:function(t,r,a,n){var h=this,f=r.content.slice(a.pos,n+1),w=[],v=0;f.forEach(function($){if(typeof $.value==\"string\"){w.push($.value);return}if($.type===je.Extened){var K=r.controls[v];v+=1,h.drawControl(t,K)}$.value===13&&w.push(`\n`)});var _=w.join(\"\"),T=document.createElement(\"div\");T.textContent=_;var S=this.hwpDocument.info.getCharShpe(a.shapeIndex);if(S){var P=S.fontBaseSize,G=S.fontRatio,z=S.color,Y=S.fontId,U=P*(G[0]/100);T.style.fontSize=\"\".concat(U,\"pt\"),T.style.lineBreak=\"anywhere\",T.style.whiteSpace=\"pre-wrap\",T.style.color=this.getRGBStyle(z);var ee=this.hwpDocument.info.fontFaces[Y[0]];T.style.fontFamily=ee.getFontFamily()}t.appendChild(T)}},{key:\"drawParagraph\",value:function(t,r){var a=this,n=document.createElement(\"div\");n.style.margin=\"0\";var h=this.hwpDocument.info.paragraphShapes[r.shapeIndex];n.style.textAlign=rs[h.align],r.shapeBuffer.forEach(function(f,w){var v=r.getShapeEndPos(w);a.drawText(n,r,f,v)}),t.append(n)}},{key:\"drawSection\",value:function(t,r,a){var n=this,h=this.createPage(r,a);h.style.marginBottom=\"20px\",r.content.forEach(function(f){n.drawParagraph(h,f)}),t.appendChild(h)}},{key:\"draw\",value:function(){var t=this;this.drawViewer();var r=document.createElement(\"div\");r.style.height=\"100%\",r.style.padding=\"52px 24px 24px 24px\",r.style.overflow=\"auto\",r.style.position=\"relative\",r.style.zIndex=\"0\",this.hwpDocument.sections.forEach(function(a,n){t.drawSection(r,a,n)}),this.header=new ts(this.viewer,this.container,this.pages),this.viewer.appendChild(r),this.container.appendChild(this.viewer)}}]),e}();window.HWP={parse:oi,Viewer:pn};})();\n";

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

<section><h2>⑩ 셀리더교재 자료 올리기</h2>
<p style="font-size:13px;color:#557;margin:0 0 6px">앱 첫 화면 <b>셀리더교재</b> 칸에 들어가면(비밀번호 0109) 여기서 올린 글과 파일이 보입니다. 사진·PDF는 화면에 바로 펼쳐지고, 모든 파일은 내려받을 수 있습니다. <b>새 자료를 올리면 지난 자료는 자동으로 지워집니다.</b> 파일 하나 25MB 이하.</p>
<label>제목</label><input id="ct" placeholder="예: 10월 셀리더 교재">
<label>내용 (선택)</label><textarea id="cb" rows="3"></textarea>
<label>파일 (사진·PDF·한글·엑셀 등 여러 개 — 끌어다 놓아도 됩니다)</label>
<p style="font-size:12px;color:#889;margin:0 0 6px">사진·PDF·한글(hwp) 파일은 앱 화면에 쪽마다 원본 모양대로 펼쳐집니다. 워드·엑셀·hwpx 는 내려받기만 됩니다 (hwpx 는 한글에서 hwp 나 PDF로 저장해 올리세요).</p>
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
  else if(j.match){$('#tkm').style.color='#3a5';$('#tkm').textContent='✔ 관리자 비밀번호가 맞습니다';if(typeof bShow==='function')bShow();if(typeof cLoad==='function')cLoad();}
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

// ⑩ 셀리더교재 자료 — 파일은 그대로 올리고(내려받기용), 사진·PDF는 화면에 펼쳐 보이도록 쪽 그림(JPEG)도 함께 올림
var HWP_LIB=location.origin+'/lib/hwp.min.js';
// ---- 한글(.hwp) 파일 → 쪽 그림 (hwp.js 로 그린 뒤 html2canvas 로 사진) — 관리자 페이지·앱 공용 ----
function loadScript(src){ return new Promise(function(res,rej){ if(document.querySelector('script[src="'+src+'"]')) return res(); var sc=document.createElement('script'); sc.src=src; sc.onload=res; sc.onerror=function(){ rej(new Error('불러오기 실패: '+src)); }; document.head.appendChild(sc); }); }
function cropBottom(cv){ var x=cv.getContext('2d'), w=cv.width, h=cv.height, d=x.getImageData(0,0,w,h).data, last=0;   // 아래쪽 빈 공간 잘라내기 (쪽의 45%는 남김)
  for(var y=h-1;y>=0&&!last;y-=2){ for(var px=0;px<w;px+=4){ var i=(y*w+px)*4; if(d[i]<245||d[i+1]<245||d[i+2]<245){ last=y; break; } } }
  var nh=Math.min(h,Math.max(Math.round(h*0.45),last+Math.round(h*0.04))); if(nh>=h-8) return cv;
  var o=document.createElement('canvas'); o.width=w; o.height=nh; o.getContext('2d').drawImage(cv,0,0,w,nh,0,0,w,nh); return o; }
async function hwpPages(blob,say){
  if(say) say('한글 문서를 그리는 중…');
  await loadScript(HWP_LIB); await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  var box=document.createElement('div'); box.style.cssText='position:fixed;left:-20000px;top:0;width:1000px;height:800px;overflow:hidden;background:#fff'; document.body.appendChild(box);
  try{
    var bin=new Uint8Array(await blob.arrayBuffer());
    new HWP.Viewer(box,bin,{type:'array'});
    hwpFixSpacing(box,bin);
    var pages=Array.prototype.slice.call(box.firstElementChild.children[2].children).filter(function(p){ return p.getBoundingClientRect().height>50; });
    var out=[];
    for(var i=0;i<pages.length;i++){ if(say) say('한글 문서 '+(i+1)+'/'+pages.length+'쪽을 사진으로 바꾸는 중…'); var cv=await html2canvas(pages[i],{scale:2,backgroundColor:'#fff',logging:false}); out.push(cropBottom(cv).toDataURL('image/jpeg',.85)); }
    if(!out.length) throw new Error('쪽을 찾지 못했습니다');
    return out;
  } finally { box.remove(); }
}
// 원본 줄 간격 살리기: 한글 파일 안의 줄 높이·줄 간격(1/7200인치)을 읽어 문단마다 같은 간격을 주고, 빈 문단도 그 높이만큼 비움 (그리기 라이브러리는 이 값을 쓰지 않음)
function hwpFixSpacing(box,bin){
  try{
    var strip=function(t){ return String(t||'').replace(/\\s+/g,''); };
    var doc=HWP.parse(bin,{type:'array'}), paras=[], freq={};
    doc.sections.forEach(function(s){ s.content.forEach(function(p){ var segs=p.lineSegments||[]; var px=segs.map(function(l){ return (l.height+l.lineSpacing)/7200*96; });
      var pitch=px.length?px.reduce(function(a,b){ return a+b; },0)/px.length:0;
      paras.push({ text:strip(p.content.filter(function(c){ return c.type===0; }).map(function(c){ return c.value; }).join('')), pitch:pitch });
      px.forEach(function(v){ var k=Math.round(v); freq[k]=(freq[k]||0)+1; }); }); });
    var mode=+(Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; })[0]||0), oi=0;
    Array.prototype.slice.call(box.firstElementChild.children[2].children).forEach(function(pg){ Array.prototype.slice.call(pg.children).forEach(function(div){
      if(div.className||div.querySelector('table')) return;
      var d=strip(div.innerText), pitch=0;
      for(var j=oi;j<Math.min(paras.length,oi+6);j++){ if(paras[j].text===d){ pitch=paras[j].pitch; oi=j+1; break; } }
      if(!pitch) pitch=mode; if(!pitch) return;
      div.style.minHeight=pitch+'px';
      Array.prototype.slice.call(div.children).forEach(function(t){ if(t.tagName==='DIV'&&!t.querySelector('table')) t.style.lineHeight=pitch+'px'; }); }); });
  }catch(e){}
}
var isHwp=function(f){ return /\\.hwp$/i.test(f.name||'')||/haansofthwp$/i.test(f.type||''); };   // hwpx(새 형식)는 아직 안 됨

var cFiles=[], cKeep=[], cData=[];
function cThumbs(){var rows=cKeep.map(function(f,i){return '<div class="row" style="justify-content:space-between"><span>📎 '+esc(f.name)+' <small style="color:#889">('+vFmt(f.size)+(f.pages&&f.pages.length?' · 화면 '+f.pages.length+'쪽':'')+') — 올라가 있음</small></span><button class="del" data-ck="'+i+'">빼기</button></div>';})
 .concat(cFiles.map(function(it,i){return '<div class="row" style="justify-content:space-between"><span>📎 '+esc(it.file.name)+' <small style="color:#889">('+vFmt(it.file.size)+(it.pages.length?' · 화면 '+it.pages.length+'쪽':'')+')</small></span><button class="del" data-cx="'+i+'">빼기</button></div>';}));
 $('#cfl').innerHTML=rows.join('')||'<p class="msg" style="color:#889">아직 고른 파일이 없습니다</p>';}
async function cAdd(files){for(var i=0;i<files.length;i++){var f=files[i];if(f.size>25*1024*1024){$('#m18').style.color='#c33';$('#m18').textContent=f.name+' 은 25MB가 넘어 올릴 수 없습니다';continue;}
  var it={file:f,pages:[]};var sayP=function(t){$('#m18').style.color='#3a5';$('#m18').textContent=t;};
  try{if(/pdf/i.test(f.type)||/\\.pdf$/i.test(f.name))it.pages=await pdfFile(f,'#m18');else if(/^image/.test(f.type))it.pages=[await imgFile(f)];else if(isHwp(f))it.pages=await hwpPages(f,sayP);}catch(e){$('#m18').style.color='#c33';$('#m18').textContent=f.name+' 화면용 쪽 만들기 실패: '+e.message;}
  cFiles.push(it);if(it.pages.length)$('#m18').textContent='';
  else{$('#m18').style.color='#b65';$('#m18').textContent=f.name+' — 이 형식은 앱 화면에 펼쳐지지 않고 내려받기만 됩니다 (사진·PDF·한글 hwp 는 화면에 보입니다. hwpx 는 한글에서 hwp 또는 PDF로 저장해 주세요).';}}cThumbs();}
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
  if(!j.ok)throw new Error(j.error||'실패');say('올렸습니다: '+j.item.title+' (파일 '+j.item.files.length+'개) — 앱 셀리더교재 칸에 바로 나옵니다');cClear();cLoad();}
 catch(e){say('실패: '+e.message,true);}
 $('#csv').disabled=false;};
async function cLoad(){try{var j=await (await fetch('/api/cell',{headers:H(),cache:'no-store'})).json();cData=j.ok?(j.list||[]):[];if(!j.ok){$('#clist').innerHTML='<p class="msg" style="color:#889">'+(j.error||'')+' (관리자 비밀번호 확인)</p>';return;}}catch(e){cData=[];}
 $('#clist').innerHTML=cData.length?'<p style="font-weight:800;margin:16px 0 6px">올린 자료 ('+cData.length+')</p>'+cData.map(function(c){return '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:10px;margin:8px 0"><b>'+(c.pin?'📌 ':'')+esc(c.title)+'</b> 📎'+(c.files||[]).length+' <span style="color:#889;font-size:13px">'+new Date(c.at).toLocaleDateString('ko-KR')+'</span><div style="font-size:13px;color:#557;margin-top:4px">'+(c.files||[]).map(function(f){return esc(f.name)+' ('+vFmt(f.size)+(f.pages&&f.pages.length?' · 화면 '+f.pages.length+'쪽':'')+')';}).join(', ')+'</div><div class="row"><button class="sub" style="margin:0;padding:8px" data-ce="'+esc(c.id)+'">수정</button>'+((c.files||[]).some(function(f){return !(f.pages&&f.pages.length)&&isHwp(f);})?'<button class="sub" style="margin:0;padding:8px" data-cm="'+esc(c.id)+'">📄 한글 파일 화면용 쪽 만들기</button>':'')+'<button class="sub" style="margin:0;padding:8px;color:#c33" data-cd="'+esc(c.id)+'">삭제</button></div></div>';}).join(''):'<p class="msg" style="color:#889">아직 올린 자료가 없습니다</p>';}
$('#clist').onclick=async function(e){var ed=e.target.closest('[data-ce]'),dl=e.target.closest('[data-cd]'),mk=e.target.closest('[data-cm]');
 if(mk){var c0=cData.find(function(x){return x.id===mk.dataset.cm;});if(!c0)return;await cMakePages(c0);return;}
 if(ed){var c=cData.find(function(x){return x.id===ed.dataset.ce;});if(!c)return;cClear();$('#cid').value=c.id;$('#ct').value=c.title;$('#cb').value=c.body||'';$('#cpin').checked=!!c.pin;cKeep=(c.files||[]).slice();cThumbs();$('#csv').textContent='수정 내용 저장';$('#m18').style.color='#3a5';$('#m18').textContent='수정 중: '+c.title;window.scrollTo({top:$('#ct').getBoundingClientRect().top+scrollY-120,behavior:'smooth'});}
 if(dl){var c2=cData.find(function(x){return x.id===dl.dataset.cd;});if(!confirm((c2?c2.title:'이 자료')+'를 지울까요?\\n(파일도 함께 지워집니다)'))return;var j=await (await fetch('/api/cell?id='+encodeURIComponent(dl.dataset.cd),{method:'DELETE',headers:H()})).json();$('#m18').style.color=j.ok?'#3a5':'#c33';$('#m18').textContent=j.ok?'삭제했습니다':'실패: '+j.error;cLoad();}};
// 이미 올라간 한글 파일을 내려받아 쪽 그림을 만들어 붙임
async function cMakePages(c){var say=function(t,err){$('#m18').style.color=err?'#c33':'#3a5';$('#m18').textContent=t;};
 try{var files=(c.files||[]).slice();for(var i=0;i<files.length;i++){var f=files[i];if((f.pages&&f.pages.length)||!isHwp(f))continue;
   say(f.name+' 내려받는 중…');var blob=await (await fetch(f.url+'?k='+encodeURIComponent($('#tk').value.trim()))).blob();
   var pages=await hwpPages(blob,say);var urls=[];for(var k=0;k<pages.length;k++){var pb=await (await fetch(pages[k])).blob();var pj=await vPut('/api/cell-file?name='+encodeURIComponent(f.name+' - '+(k+1)+'쪽.jpg')+'&type=image/jpeg',pb,'image/jpeg',say,f.name+' 화면용 '+(k+1)+'쪽');urls.push(pj.file.url);}
   files[i]=Object.assign({},f,{pages:urls});}
  var j=await (await fetch('/api/cell',{method:'POST',headers:Object.assign({},H(),{'Content-Type':'application/json'}),body:JSON.stringify({id:c.id,title:c.title,body:c.body||'',pin:!!c.pin,files:files})})).json();
  if(!j.ok)throw new Error(j.error||'실패');say('화면용 쪽을 만들어 붙였습니다 — 앱에서 바로 보입니다');cLoad();}catch(e){say('실패: '+e.message,true);}}
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
