import { findLibrary } from "../../server/libraries.js";
import { searchOne } from "../../server/search.js";

const MAX_QUERIES = 20;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const SESSION_COOKIE = "bookfind_turnstile_session";
const SESSION_TTL_SECONDS = 15 * 60;
const DATA4LIBRARY_CACHE_TTL_SECONDS = 24 * 60 * 60;
const requestLog = new Map();

function createData4LibraryCache(request) {
  const cache = globalThis.caches?.default;
  if (!cache) return null;
  const origin = new URL(request.url).origin;
  const keyFor = (libraryId, isbn) => new Request(
    `${origin}/__bookfind-cache/data4library/v1/${encodeURIComponent(libraryId)}/${encodeURIComponent(isbn)}`,
    { method: "GET" }
  );

  return {
    async get(libraryId, isbn) {
      try {
        const response = await cache.match(keyFor(libraryId, isbn));
        return response ? await response.json() : null;
      } catch {
        return null;
      }
    },
    async set(libraryId, isbn, result) {
      try {
        await cache.put(
          keyFor(libraryId, isbn),
          Response.json(result, {
            headers: { "Cache-Control": `public, max-age=${DATA4LIBRARY_CACHE_TTL_SECONDS}` }
          })
        );
      } catch {
        // 캐시 장애가 실제 검색 결과를 오류로 바꾸지 않도록 무시합니다.
      }
    }
  };
}

function jsonError(message, status, details) {
  return Response.json(
    { error: message, ...(details ? { details } : {}) },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function checkRateLimit(request) {
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const recent = (requestLog.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);

  if (requestLog.size > 1_000) {
    for (const [key, values] of requestLog) {
      if (!values.some((time) => now - time < RATE_WINDOW_MS)) requestLog.delete(key);
    }
  }
  return recent.length <= RATE_LIMIT;
}

async function verifyTurnstile(request, token, secret) {
  if (!secret) return { success: true };
  if (!token || token.length > 2_048) return { success: false, reason: "인증을 완료해 주세요." };

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) form.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  if (!response.ok) return { success: false, reason: "인증 서버에 연결할 수 없습니다." };
  const result = await response.json();
  if (!result.success) return { success: false, reason: "인증이 만료되었거나 유효하지 않습니다." };

  const requestHost = new URL(request.url).hostname;
  if (result.hostname && result.hostname !== requestHost) {
    return { success: false, reason: "인증 도메인이 일치하지 않습니다." };
  }
  return { success: true };
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sessionKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createSessionCookie(secret) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    exp: Date.now() + SESSION_TTL_SECONDS * 1_000
  })));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(secret), new TextEncoder().encode(payload));
  const value = `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  return `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/api/search; HttpOnly; Secure; SameSite=Strict`;
}

async function hasValidSession(request, secret) {
  if (!secret) return false;
  const cookieHeader = request.headers.get("Cookie") || "";
  const value = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await sessionKey(secret),
      base64UrlDecode(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) return false;
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return Number.isFinite(data.exp) && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function handlePost(context) {
  const { request, env } = context;
  if (!checkRateLimit(request)) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) return jsonError("JSON 요청만 사용할 수 있습니다.", 415);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("요청 내용을 읽을 수 없습니다.", 400);
  }

  const queries = Array.isArray(body.queries)
    ? body.queries.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const localFallback = Array.isArray(body.localFallback)
    ? body.localFallback.slice(0, MAX_QUERIES).map((value) => value === true)
    : [];
  const fallbackMode = ["none", "file"].includes(body.fallbackMode) ? body.fallbackMode : "api";
  const library = findLibrary(String(body.libraryId || ""));
  if (!queries.length) return jsonError("ISBN 또는 책 제목을 한 개 이상 입력해 주세요.", 400);
  if (queries.length > MAX_QUERIES) return jsonError(`한 번에 최대 ${MAX_QUERIES}개까지 검색할 수 있습니다.`, 400);
  if (queries.some((query) => query.length > 200)) return jsonError("검색어는 200자 이내로 입력해 주세요.", 400);
  if (!library) return jsonError("선택한 도서관을 찾을 수 없습니다.", 400);
  if (fallbackMode === "api" && !env.DATA4LIBRARY_API_KEY) return jsonError("서버에 도서관정보나루 API 키가 설정되지 않았습니다.", 503);

  let sessionCookie = null;
  if (!(await hasValidSession(request, env.TURNSTILE_SECRET_KEY))) {
    const turnstile = await verifyTurnstile(request, body.turnstileToken, env.TURNSTILE_SECRET_KEY);
    if (!turnstile.success) return jsonError(turnstile.reason, 403);
    if (env.TURNSTILE_SECRET_KEY) sessionCookie = await createSessionCookie(env.TURNSTILE_SECRET_KEY);
  }

  const encoder = new TextEncoder();
  const batchDiagnosticId = crypto.randomUUID().slice(0, 8);
  const data4LibraryCache = createData4LibraryCache(request);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      send({ type: "start", total: queries.length });
      for (let index = 0; index < queries.length; index += 1) {
        if (request.signal.aborted) break;
        const diagnosticId = `${batchDiagnosticId}-${String(index + 1).padStart(2, "0")}`;
        const result = await searchOne(queries[index], library, env.DATA4LIBRARY_API_KEY, {
          id: diagnosticId,
          log: env.DIAGNOSTIC_LOGGING !== "false"
        }, data4LibraryCache, {
          skipData4Library: localFallback[index] === true,
          disableData4Library: fallbackMode === "file",
          homepageOnly: fallbackMode === "none"
        });
        send({ type: "result", index, result });
      }
      send({ type: "complete" });
      controller.close();
    }
  });

  const headers = {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
  };
  if (sessionCookie) headers["Set-Cookie"] = sessionCookie;
  return new Response(stream, {
    headers
  });
}

export function onRequest(context) {
  if (context.request.method === "POST") return handlePost(context);
  return jsonError("지원하지 않는 요청 방식입니다.", 405);
}
