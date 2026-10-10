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
- **교회 소식**: 본문에 `1.` `2)` `①` 같은 번호가 있으면 번호마다 칸을 따로 만들고 연한 색 7가지를 돌아가며 입힘 (칸 높이는 글 양대로). 번호가 없거나 하나뿐이면 예전처럼 한 단락

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
