import { findLibrary } from "../../server/libraries.js";
import { searchOne } from "../../server/search.js";

const MAX_QUERIES = 20;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const requestLog = new Map();

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

async function handlePost(context) {
  const { request, env } = context;
  if (!checkRateLimit(request)) return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);

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
  const library = findLibrary(String(body.libraryId || ""));
  if (!queries.length) return jsonError("ISBN 또는 책 제목을 한 개 이상 입력해 주세요.", 400);
  if (queries.length > MAX_QUERIES) return jsonError(`한 번에 최대 ${MAX_QUERIES}개까지 검색할 수 있습니다.`, 400);
  if (queries.some((query) => query.length > 200)) return jsonError("검색어는 200자 이내로 입력해 주세요.", 400);
  if (!library) return jsonError("선택한 도서관을 찾을 수 없습니다.", 400);

  const encoder = new TextEncoder();
  const batchDiagnosticId = crypto.randomUUID().slice(0, 8);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      send({ type: "start", total: queries.length });
      for (let index = 0; index < queries.length; index += 1) {
        if (request.signal.aborted) break;
        const diagnosticId = `${batchDiagnosticId}-${String(index + 1).padStart(2, "0")}`;
        const result = await searchOne(queries[index], library, {
          id: diagnosticId,
          log: env.DIAGNOSTIC_LOGGING !== "false"
        }, { localMatch: localFallback[index] === true });
        send({ type: "result", index, result });
      }
      send({ type: "complete" });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function onRequest(context) {
  if (context.request.method === "POST") return handlePost(context);
  return jsonError("지원하지 않는 요청 방식입니다.", 405);
}
