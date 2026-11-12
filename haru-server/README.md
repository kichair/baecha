# 하루 동기화 서버 (Cloudflare Worker + KV)

업무폰·개인폰이 같은 자료를 공유하기 위한 작은 서버입니다. 화면(`haru-site/index.html`)과는 별개로 만듭니다.

1. Cloudflare 대시보드 → Storage & databases → KV → Create namespace (이름 예: `haru-data`)
2. Workers & Pages → Create → Create Worker (Hello World) → 이름 `haru-api` → Deploy → Edit code → `worker.js` 내용 붙여넣기 → Deploy
3. haru-api → Settings → Bindings → Add → KV namespace → 변수 이름 `DB`, 1번에서 만든 namespace 선택
4. haru-api → Settings → Variables and Secrets → Add → Type: Secret, 이름 `HARU_PASSWORD`, 값: 원하는 비밀번호
5. 앱의 `☁ 동기화 설정`에 서버 주소(`https://haru-api.<계정>.workers.dev`), 비밀번호, 폰 이름을 입력
