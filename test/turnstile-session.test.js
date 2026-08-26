import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/search.js";

test("Turnstile 인증 한 번으로 이어지는 분할 검색 요청을 허용한다", async () => {
  const originalFetch = globalThis.fetch;
  let verificationCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("challenges.cloudflare.com")) {
      verificationCalls += 1;
      return Response.json({ success: true, hostname: "localhost" });
    }
    if (url.includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    throw new Error(`예상하지 못한 요청: ${url}`);
  };

  const env = {
    DATA4LIBRARY_API_KEY: "test-api-key",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret"
  };
  const makeRequest = (turnstileToken, cookie = "") => new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ queries: ["제목 검색"], libraryId: "ALL", turnstileToken })
  });

  try {
    const first = await onRequest({ request: makeRequest("valid-token"), env });
    assert.equal(first.status, 200);
    const setCookie = first.headers.get("Set-Cookie");
    assert.match(setCookie, /bookfind_turnstile_session=/);
    await first.text();

    const cookie = setCookie.split(";", 1)[0];
    const second = await onRequest({ request: makeRequest("", cookie), env });
    assert.equal(second.status, 200);
    await second.text();
    assert.equal(verificationCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
