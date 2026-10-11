# 예수비전교회 QT 서버 (Cloudflare Workers)

- `worker.js` : 서버 전체. Cloudflare 코드 편집기에 붙여넣고 배포
- `app.html` : 성도용 앱 (예수비전교회_QT_자동갱신.html). 관리자 페이지 ③ 또는 앱 관리자 모드에서 올림

`worker.js` 가 서버 전체입니다. Cloudflare 대시보드 > Workers > `jvc-qt` > 코드 편집에 **파일 전체를 붙여넣고 배포**하면 됩니다.
(KV 바인딩 `QT_KV`, 비밀값 `ADMIN_TOKEN` 등 설정은 그대로 두면 됩니다.)

## 2026-10-10 바뀐 것

### ⑨ 주간사역 갤러리 (관리자 페이지 맨 아래)
- 날짜·제목·설명을 넣고 사진 여러 장(또는 PDF)을 올리면 한 묶음으로 저장됩니다.
- 올린 묶음은 아래 목록에서 **수정**(사진 빼기·더하기, 제목 바꾸기) / **삭제** 할 수 있습니다.
- **새 묶음을 올리면 지난 묶음은 사진까지 자동 삭제**됩니다 (worker.js 의 `GALLERY_MAX = 1`). 여러 주를 남기고 싶으면 이 숫자를 키우면 됩니다.
- 파일 이름을 `1.jpg`, `2.jpg`, `3.jpg` 처럼 붙이면 1번이 맨 위에 나옵니다. (선교기도·주보도 같음)

### 🎬 주간사역 영상 (관리자 페이지 ⑨ 아래쪽)
- PC Chrome/Edge에서 영상 파일을 고르면 **브라우저가 720p로 자동 압축**(1분 영상에 약 1분)한 뒤 올립니다. 길이에 맞춰 화질을 조절해 25MB 안에 들어가게 합니다 (4분 이하).
- Chrome/Edge 최신 버전이면 MP4(H.264)로 만들어져 아이폰·안드로이드 모두 재생됩니다. 다른 브라우저는 WebM이 될 수 있어 아이폰에서 안 나올 수 있습니다.
- **새 영상을 올리면 지난 영상은 자동 삭제(덮어쓰기)**. 영상은 1개만 보관. "지금 올라간 영상 삭제"로 지울 수도 있습니다.
- 주소: `GET /api/gallery-video`(정보) · `PUT /api/gallery-video`(영상 바이트, 관리자) · `PUT /api/gallery-poster`(표지) · `DELETE /api/gallery-video` · 재생 `GET /gallery-video`(Range 지원) · `GET /gallery-poster`

### 해설·원어 (AI)
- 해설·시대적 배경에 성경 지명이 나오면 지금 지도의 이름을 괄호로: 갈라디아(터키). 앱도 지명 사전으로 이미 쓴 해설에 붙여 보여줌 (책 이름·겹치는 낱말은 제외)
- 원어 핵심 단어를 5~7개(보통 6개)로 늘림. 해설 틀(⭐ 열쇠 단어·📖 직역·[어원]·[시제]·[핵심 절]·요약)은 그대로. 2026-10-10부터의 날짜는 자동으로 새 기준으로 다시 씀

### 📎 셀리더교재 자료방 (비밀번호 1122)
- 앱 첫 화면의 "오늘도 감사" 칸이 **셀리더교재**로 바뀜. 비밀번호(1122, 서버 확인 — 바꾸려면 Cloudflare 변수 `CELL_PASS`)를 넣으면 관리자가 올린 글·파일이 보임
- 사진·PDF·**한글(hwp)** 파일은 올릴 때 브라우저가 쪽마다 그림으로 바꿔 함께 저장 → 앱에서 원본 모양대로 펼쳐짐(누르면 크게 보기). 모든 파일은 ⬇ 다운로드. 파일 하나 25MB 이하
- 한글은 hwp.js(Apache-2.0, hahnlee/hwp.js)를 worker 가 `/lib/hwp.min.js` 로 서빙하고 html2canvas(cdnjs)로 사진화. 서버에 쪽 그림이 없는 한글 파일은 앱이 열 때 그 자리에서 자동으로 그려 보여주고, 관리자가 열면 그 결과를 서버에 저장(이후 바로 뜸). 목록의 「📄 쪽 만들기」로 직접 변환도 가능. hwpx·워드·엑셀은 내려받기만
- 올리기: PC 관리자 페이지 ⑩ 또는 앱 관리자 모드 "📎 셀리더교재 자료 올리기". PDF는 올릴 때 쪽마다 그림으로 바꿔 함께 저장
- **새 자료를 올리면 지난 자료는 파일까지 자동 삭제**(`CELL_MAX = 1`). 같은 글 수정은 그대로
- 주소: `GET /api/cell`(X-Cell-Pass) · `PUT /api/cell-file?name=&type=` · `POST/DELETE /api/cell`(관리자) · `GET /cell-file/<키>?k=비밀번호[&dl=1]`

### 📚 참고하기 (한절 묵상 아래)
- 본문과 이어지는 성경 시대 풍습·제도·지리 이야기를 AI가 4~6문장으로 (commentary.note). 관련 풍습이 없는 날은 비움(skip). 2026-10-10부터
- 자동 실행이 앞으로의 날짜를 미리 채우며, 관리자 ① "이 달 전체 미리 준비"를 누르면 한 번에 채움. ⑥ "AI 해설만 다시 쓰기"는 참고하기도 새로 씀

### 함께 기도해요 — 기도제목 고치기
- 관리자가 이름·내용·비공개 여부를 고칠 수 있는 주소가 생겼습니다. (아래 API 참고)

## 앱(휴대폰)에서 쓰는 주소

| 주소 | 누가 | 하는 일 |
|---|---|---|
| `GET /api/gallery` | 누구나 | 갤러리 목록 `{ok, list:[{id,date,title,body,images:['/gallery-img/…'],at}]}` (최근 날짜가 앞) |
| `POST /api/gallery` | 관리자 | 올리기·고치기 `{id?, date, title, body?, keep?:[남길 사진 주소], imagesData?:[data:image/jpeg;base64,…]}` |
| `DELETE /api/gallery?id=` | 관리자 | 묶음 삭제 (사진도 함께) |
| `GET /gallery-img/<키>` | 누구나 | 사진 |
| `POST /api/prayers/edit` | 관리자 | 기도제목 고치기 `{id, name?, prayer?, private?}` — 보낸 칸만 바뀜 |
| `DELETE /api/prayers?id=` | 관리자 | 기도제목 삭제 (전부터 있던 것) |

관리자 호출은 헤더 `Authorization: Bearer <관리자 비밀번호>` 를 붙입니다. (앱 관리자 모드가 스마트요람 수정 때 쓰는 것과 같은 방식)

## 앱(app.html) 2026-10-10 바뀐 것
- **주간사역 갤러리**: HTML에 박힌 사진 대신 서버 `/api/gallery` 에서 받아옴. 묶음이 여럿이면 제목 버튼으로 골라 봄, 넘기기·점·탭 확대 그대로. 서버에 묶음이 없으면 예전 사진 8장(파일 안 예비용)을 보여줌
- **관리자 모드 📷 주간사역 갤러리 올리기** 칸: 휴대폰에서 사진 여러 장 골라 올리기(이름 1·2·3 순), 수정·삭제. 「💾 서버에 저장」에도 포함
- **중보기도 수정**: 번호·날짜·함께 기도한 수를 그대로 둔 채 내용만 고침 (`/api/prayers/edit`). 서버가 옛 버전이면 예전 방식으로 자동 전환
- **주간사역 영상 칸**: 갤러리 바로 아래, 같은 크기. 영상이 있을 때만 보이고 위쪽을 한 번 누르면 재생·다시 누르면 멈춤 (아래 재생 막대도 사용 가능)
- **화면 나누기**: 홈(교회 사진·바로가기·갤러리·영상) / 오늘의 말씀(찬송·말씀·기도) / 나의 묵상 / QT 달력 / 공동체 소식 / 알림 설정 — 고른 화면만 보이고, 위에 "‹ 홈" 단추와 제목 줄
- **갤러리 사진 크게 보기**: 지금 보이는 사진으로 열림(전에는 마지막 사진만). 두 손가락 확대, 끌기, 옆으로 넘기기, 두 번 두드려 확대, "3 / 8" 표시
- **휴대폰 뒤로 가기**: 열린 창(사진 보기 포함)은 닫고, 다른 화면이면 홈으로. 홈에서는 기존처럼 "앱을 닫으시겠습니까?" 확인
- **스마트요람**: 구글맵·네이버맵·다음맵 링크 삭제(주소 글자만), 가족 관계 "처"는 "아내"로 표시
- **교회 소식**: 본문에 `1.` `2)` `①` 같은 번호가 있으면 번호마다 칸을 따로 만들고 연한 색 7가지를 돌아가며 입힘 (칸 높이는 글 양대로). 번호가 없거나 하나뿐이면 예전처럼 한 단락

## 2026-10-11 스마트요람 생일 양력·음력 / 교역자
- **양력·음력 구별** (서버 `worker.js`): 배포 뒤 명단을 처음 읽을 때 한 번만 자동으로 손봄 (`DIR_FIX_V`, `data.fixV` 로 기억)
  - 셀교적부(PDF)에 `음`으로 적힌 분은 음력, `양`은 양력. 교적부에 표시가 없는 분은 **2000년 이전 출생 = 음력, 2000년 이후 출생 = 양력** (목사님 지시)
  - 이름과 id가 둘 다 맞는 분만 바꿈 (`DIR_LUNAR_IDS`, 120명). 그 뒤 새로 넣는 분은 등록 창의 「음력 생일」 체크로
- **생일 창**(앱 「이번 달 생일」·「오늘 생일」): 날짜 칸에 `양력` / `음력 8월 26일` 표시. 음력은 올해 양력 날짜로 바꿔서 그 달에 나옴. 관리자 모드면 날짜 칸을 눌러 양력 ⇄ 음력 (바로 서버에 저장)
- **관리자 페이지 ④ 달별 생일자 명단**: 앱과 같은 계산(음력 → 올해 양력 날짜), 줄마다 [음력으로]/[양력으로] 단추, 「📋 명단 복사」 양식은 `10월 6일 ⇥ 박창흥 목사 ⇥ 1966.08.26 (음력 8월 26일)`
- `GET /api/birthdays` 에 `id` 추가, `POST /api/dir/lunar` 는 `{id, lunar}` 또는 `{ids:[…], lunar}` (관리자)
- **교역자 칸**: 스마트요람 분류 맨 끝(요람 잠그기 바로 위)에 가로로 긴 「교역자」 칸 — 직분이 목사·전도사·강도사·사모인 분. 가정별로 목사님 가정 → 전도사님 가정 순. 청년·성도 칸에서는 빠짐
- **교역자 3가정 자동 추가** (`DIR_CLERGY`, 이미 있으면 건너뜀): 박창흥 목사·오승숙 사모(박은빈 청년이 혼자 있던 가정에 부모님으로 들어감) / 이승준 전도사·박은솔 사모 / 이수찬 전도사·김다미 사모 — 생년월일·양음·휴대폰·주소는 교적부대로, ID는 교회 요람 시스템 ID 그대로(1·2·3538·3765·3789·3790)
- **권찰 교적부·사진리스트 반영** (`DIR_FIX_V = 2`): 권찰 교적부의 `양` 표시대로 고희정·이진실·차보연·최서영·최영아·오수정은 양력으로 바로잡음(2000년 규칙보다 교적부가 우선). 권찰 9분 + 박창흥 목사·오승숙 사모·이승준 전도사 사진 12장을 서버 코드에 넣어 두고(`DIR_PHOTOS`, 240×296 JPEG) 처음 명단을 읽을 때 한 번 저장. 사진리스트에 사진이 없는 김다미·박은솔·이수찬은 기본 정보만. 교적부에 있어도 보관·이사인 강만호·강내영·정유림은 명단에 넣지 않음
- **관리자 ④ 명단·사진 올리기**: `{"photos":{ID:dataURL}}` 만 든 파일이면 명단은 그대로 두고 사진만 올림 (예전처럼 `data`+`photos` 파일이면 명단도 저장)

## 앱 HTML에 넣을 코드 (예시 — 이미 app.html 에 들어 있음)

앱의 주간사역 갤러리가 지금은 HTML 안에 사진이 박혀 있다면, 아래처럼 서버에서 받아오도록 바꿉니다.

```js
// 갤러리 보여주기
async function loadGallery() {
  const j = await (await fetch(API + '/api/gallery', { cache: 'no-store' })).json();
  const box = document.querySelector('#gallery');       // 갤러리 칸
  box.innerHTML = (j.list || []).map(g => `
    <div class="album">
      <b>${g.title}</b> <small>${g.date}</small>
      ${g.body ? `<p>${g.body}</p>` : ''}
      <div class="pics">${g.images.map(u => `<img src="${API + u}" loading="lazy">`).join('')}</div>
    </div>`).join('') || '<p>아직 올린 사진이 없습니다</p>';
}

// 관리자 모드: 휴대폰에서 사진 고르고 올리기 (사진은 1600px 이하 JPEG로 줄여서 보냄)
async function shrink(f) {
  const img = await createImageBitmap(f);
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .85);
}
async function uploadGallery(title, date, files, id, keep) {
  const sorted = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));   // 1, 2, 3 순서
  const imagesData = [];
  for (const f of sorted) imagesData.push(await shrink(f));
  const r = await fetch(API + '/api/gallery', { method: 'POST',
    headers: { Authorization: 'Bearer ' + ADMIN_PW, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, date, keep, imagesData }) });
  return r.json();
}

// 관리자 모드: 기도제목 고치기
async function editPrayer(id, prayer, name, isPrivate) {
  const r = await fetch(API + '/api/prayers/edit', { method: 'POST',
    headers: { Authorization: 'Bearer ' + ADMIN_PW, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, prayer, name, private: isPrivate }) });
  return r.json();
}
```

앱 HTML 파일(예수비전교회_QT_자동갱신.html)을 주시면 위 내용을 앱 안에 직접 넣어 드립니다.
