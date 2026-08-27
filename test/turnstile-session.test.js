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
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    DIAGNOSTIC_LOGGING: "false"
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

test("로컬 파일 일치 표시가 있으면 API 응답도 정보나루를 호출하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (input) => {
    upstreamCalls += 1;
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    throw new Error(`예상하지 못한 요청: ${input}`);
  };
  const request = new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: ["9788943314477"], libraryId: "MX", localFallback: [true] })
  });
  try {
    const response = await onRequest({ request, env: { DATA4LIBRARY_API_KEY: "test-key", DIAGNOSTIC_LOGGING: "false" } });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(text, /"status":"local_pending"/);
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("월간 파일 방식은 정보나루 API 키가 없어도 검색할 수 있다", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (input) => {
    upstreamCalls += 1;
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    throw new Error(`예상하지 못한 요청: ${input}`);
  };
  const request = new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: ["9791162544976"], libraryId: "MX", fallbackMode: "file" })
  });
  try {
    const response = await onRequest({ request, env: { DIAGNOSTIC_LOGGING: "false" } });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /"source":"local_files"/);
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("홈페이지만 검색은 정보나루 API 키 없이 화성시 결과만 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (input) => {
    upstreamCalls += 1;
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    throw new Error(`예상하지 못한 요청: ${input}`);
  };
  const request = new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: ["9791162544976"], libraryId: "MX", fallbackMode: "none" })
  });
  try {
    const response = await onRequest({ request, env: { DIAGNOSTIC_LOGGING: "false" } });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /"source":"hwaseong"/);
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
