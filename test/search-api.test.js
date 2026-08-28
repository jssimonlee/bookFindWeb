import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/search.js";

test("검색 API는 사람 확인이나 외부 API 키 없이 화성시 결과를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response('<span id="totalCnt">0</span>', { status: 200 });
  };
  const request = new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: ["9791162544976"], libraryId: "MX" })
  });
  try {
    const response = await onRequest({ request, env: { DIAGNOSTIC_LOGGING: "false" } });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /"status":"not_found"/);
    assert.equal(response.headers.get("Set-Cookie"), null);
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("로컬 파일 일치 표시는 브라우저 병합 상태로 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<span id="totalCnt">0</span>', { status: 200 });
  const request = new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: ["9788943314477"], libraryId: "MX", localFallback: [true] })
  });
  try {
    const response = await onRequest({ request, env: { DIAGNOSTIC_LOGGING: "false" } });
    assert.match(await response.text(), /"status":"local_pending"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("검색 API는 과도하게 큰 JSON 요청을 거부한다", async () => {
  const request = new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: ["9788943314477"], libraryId: "MX", padding: "x".repeat(20_000) })
  });
  const response = await onRequest({ request, env: { DIAGNOSTIC_LOGGING: "false" } });
  assert.equal(response.status, 413);
  assert.match(await response.text(), /요청 내용이 너무 큽니다/);
});

test("검색 API는 중복 검색어를 한 번만 조회한다", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response('<span id="totalCnt">0</span>', { status: 200 });
  };
  const request = new Request("https://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: ["9788943314477", "9788943314477"], libraryId: "MX" })
  });
  try {
    const response = await onRequest({ request, env: { DIAGNOSTIC_LOGGING: "false" } });
    assert.equal(response.status, 200);
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
