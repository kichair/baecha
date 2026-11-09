/* 하루 자료 동기화 서버 (Cloudflare Worker + KV)
   - KV 바인딩 이름: DB
   - 비밀 변수(Secret) 이름: HARU_PASSWORD  (앱에서 입력하는 비밀번호)
   요청: 헤더 X-Haru-Key 에 비밀번호를 넣어 보냅니다. */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Haru-Key",
  "Access-Control-Max-Age": "86400"
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS }
  });
}

/* 길이와 상관없이 같은 시간에 비교 (비밀번호 추측 방지) */
async function same(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b)))
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    if (!env.DB) return json({ error: "KV 바인딩(DB)이 설정되지 않았습니다." }, 500);
    if (!env.HARU_PASSWORD) return json({ error: "비밀번호(HARU_PASSWORD)가 설정되지 않았습니다." }, 500);

    const key = request.headers.get("X-Haru-Key") || "";
    if (!(await same(key, env.HARU_PASSWORD))) return json({ error: "비밀번호가 맞지 않습니다." }, 401);

    if (url.pathname === "/api/ping") return json({ ok: true });

    /* 자료와 번호(rev)를 한 덩어리로 저장해 쓰기 횟수를 줄인다 */
    const cur = (await env.DB.get("db", "json")) || { rev: 0, updatedAt: null, by: "", data: null };

    if (url.pathname === "/api/meta" && request.method === "GET") {
      return json({ rev: cur.rev, updatedAt: cur.updatedAt, by: cur.by });
    }

    if (url.pathname === "/api/db" && request.method === "GET") {
      return json(cur);
    }

    if (url.pathname === "/api/db" && request.method === "PUT") {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "잘못된 요청입니다." }, 400); }
      if (!body || typeof body.data !== "object" || body.data === null) return json({ error: "자료가 없습니다." }, 400);

      /* 다른 폰이 먼저 저장했으면 덮어쓰지 않고 알려준다 */
      if (Number(body.baseRev || 0) !== Number(cur.rev || 0)) {
        return json({ conflict: true, rev: cur.rev, updatedAt: cur.updatedAt, by: cur.by }, 409);
      }
      const next = { rev: Number(cur.rev || 0) + 1, updatedAt: new Date().toISOString(), by: String(body.by || "").slice(0, 30) };
      try {
        await env.DB.put("db", JSON.stringify({ ...next, data: body.data }));
      } catch (e) {
        return json({ error: "저장하지 못했습니다(용량 초과일 수 있습니다): " + e.message }, 507);
      }
      return json(next);
    }

    return json({ error: "없는 주소입니다." }, 404);
  }
};
