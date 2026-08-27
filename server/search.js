const HWASEONG_SEARCH_URL =
  "https://www.hscitylib.or.kr/iutlib/menu/11340/program/30002/searchResultList.do";
const HWASEONG_TIMEOUT_MS = 12_000;

function writeDiagnostic(diagnostics, event, details = {}) {
  if (!diagnostics?.id || diagnostics.log !== true) return;
  const payload = {
    marker: "bookfind",
    event,
    diagnosticId: diagnostics.id,
    libraryId: diagnostics.libraryId,
    queryHint: diagnostics.queryHint,
    ...details
  };
  const message = `[bookfind] ${JSON.stringify(payload)}`;
  if (event === "search_error") console.error(message);
  else console.log(message);
}

export function classifyQuery(rawQuery) {
  const query = String(rawQuery ?? "").trim();
  const compact = query.replace(/[\s-]/g, "");
  const isIsbn = /^(?:\d{9}[\dXx]|\d{13})$/.test(compact);
  return { query, isIsbn, isbn: isIsbn ? compact : "" };
}

export function toIsbn13(isbn) {
  const compact = String(isbn ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{13}$/.test(compact)) return compact;
  if (!/^\d{9}[\dX]$/.test(compact)) return compact;
  const body = `978${compact.slice(0, 9)}`;
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function buildHwaseongSearchUrl(rawQuery, libraryId, sitePath = "intro") {
  const { query, isIsbn, isbn } = classifyQuery(rawQuery);
  const safeSitePath = /^[a-z0-9]+$/.test(sitePath) ? sitePath : "intro";
  const url = new URL(`https://www.hscitylib.or.kr/${safeSitePath}/program/searchResultList.do`);
  url.searchParams.set("searchType", "DETAIL");
  url.searchParams.set("searchManageCodeArr", libraryId);
  url.searchParams.set("searchAdvContentsType", "All");
  url.searchParams.set("searchAdvTitle", isIsbn ? "" : query);
  url.searchParams.set("searchAdvIsbn", isIsbn ? isbn : "");
  url.searchParams.set("currentPageNo", "1");
  url.searchParams.set("searchDisplay", "10");
  return url.toString();
}

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10;
      const number = Number.parseInt(entity.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function cleanText(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attributeValue(tag = "", name) {
  const expression = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "is");
  return decodeHtml(tag.match(expression)?.[2] ?? "").trim();
}

function extractSpans(fragment = "") {
  return [...fragment.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((match) =>
    cleanText(match[1])
  );
}

function extractBookSegments(html) {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bbookArea\b[^"']*["'][^>]*>/gi)].map((match) => match.index);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function detailCallFromSegment(segment) {
  return segment.match(/fnDetail\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/i);
}

function registrationsFromSegment(segment) {
  return [...segment.matchAll(/fn(?:Reservation|MutualLoan|BaroLoan)Apply\(\s*'[^']*'\s*,\s*'([^']+)'/gi)]
    .map((match) => match[1]);
}

function registrationTargetsFromHtml(html) {
  const segments = extractBookSegments(html);
  const firstIsbn = detailCallFromSegment(segments[0] ?? "")?.[3] ?? "";
  return segments.flatMap((segment) => {
    const detailCall = detailCallFromSegment(segment);
    if (!detailCall || (firstIsbn && detailCall[3] !== firstIsbn)) return [];
    return [{
      bookKey: detailCall[1],
      pubFormCode: detailCall[4],
      registrations: registrationsFromSegment(segment)
    }];
  });
}

export function parseBibliographicRegistration(html) {
  const value = html.match(/<th\b[^>]*>\s*등록번호\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "";
  return cleanText(value);
}

export function parseHwaseongHtml(html, fallbackIsbn = "") {
  const total = Number.parseInt(html.match(/id=["']totalCnt["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "0", 10) || 0;
  const segments = extractBookSegments(html);
  const segment = segments[0];
  if (!segment) return null;
  const titleTag = segment.match(/<p\b[^>]*class=["'][^"']*\bbook_name\b[^"']*\bkor\b[^"']*["'][^>]*>[\s\S]*?(<a\b[^>]*>)/i)?.[1]
    ?? segment.match(/<p\b[^>]*class=["'][^"']*\bbook_name\b[^"']*["'][^>]*>[\s\S]*?(<a\b[^>]*>)/i)?.[1]
    ?? "";
  const title = attributeValue(titleTag, "title");
  if (!title) return null;

  const detailCall = detailCallFromSegment(segment);
  const infoList = segment.match(/<ul\b[^>]*class=["'][^"']*\binfo-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? "";
  const rows = [...infoList.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => match[1]);
  const bibliographic = extractSpans(rows[0] ?? "");
  const callNumber = extractSpans(rows[2] ?? "")[0] ?? "";
  let room = cleanText(rows[3] ?? "");
  const roomPrefix = room.match(/^\[([^\]]+)]\s*(.*)$/);
  if (roomPrefix?.[2]?.startsWith(`[${roomPrefix[1]}]`)) room = roomPrefix[2];
  const registration = [...new Set(registrationTargetsFromHtml(html).flatMap((target) => target.registrations))].join(", ");

  return {
    isbn: detailCall?.[3] || fallbackIsbn,
    title,
    author: bibliographic[0] ?? "",
    publisher: bibliographic[1] ?? "",
    year: bibliographic[2] ?? "",
    room,
    registration,
    callNumber,
    count: total || 1
  };
}

async function fetchWithTimeout(url, init = {}, timeoutMs = HWASEONG_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBibliographicRegistration(bookKey, pubFormCode) {
  const form = new URLSearchParams({ bookKey, pubFormCode });
  const response = await fetchWithTimeout("https://www.hscitylib.or.kr/search/include/bibliographicInfo.do", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form.toString()
  });
  if (!response.ok) return "";
  return parseBibliographicRegistration(await response.text());
}

async function fetchHwaseong(query, library) {
  const requestUrl = new URL(HWASEONG_SEARCH_URL);
  const searchUrl = buildHwaseongSearchUrl(query, library.id, library.sitePath);
  const selected = new URL(searchUrl);
  requestUrl.search = selected.search;
  requestUrl.searchParams.set("searchDisplay", "100");
  const response = await fetchWithTimeout(requestUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "User-Agent": "HwaseongLibraryBookFinder/1.0"
    }
  });
  if (!response.ok) throw new Error(`화성시 도서관 응답 오류 (${response.status})`);
  const html = await response.text();
  const book = parseHwaseongHtml(html, classifyQuery(query).isbn);
  if (book) {
    const targets = registrationTargetsFromHtml(html);
    const registrations = new Set(targets.flatMap((target) => target.registrations));
    const missingTargets = targets.filter((target) => !target.registrations.length);
    const recovered = await Promise.all(missingTargets.map((target) =>
      fetchBibliographicRegistration(target.bookKey, target.pubFormCode).catch(() => "")
    ));
    recovered.filter(Boolean).forEach((registration) => registrations.add(registration));
    book.registration = [...registrations].join(", ");
  }
  return { book, searchUrl };
}

export async function searchOne(rawQuery, library, diagnostics = {}, options = {}) {
  const classified = classifyQuery(rawQuery);
  const base = { query: classified.query, libraryId: library.id, libraryName: library.name };
  const trace = {
    id: diagnostics.id,
    log: diagnostics.log,
    libraryId: library.id,
    queryHint: classified.isIsbn ? `isbn:*${classified.isbn.slice(-4)}` : `title:length-${classified.query.length}`
  };
  const searchStarted = Date.now();
  let stage = "hwaseong";
  let stageStarted = searchStarted;
  writeDiagnostic(trace, "search_start");

  try {
    const hwaseong = await fetchHwaseong(classified.query, library);
    writeDiagnostic(trace, "upstream_complete", {
      service: "hwaseong",
      elapsedMs: Date.now() - stageStarted,
      found: Boolean(hwaseong.book)
    });
    if (hwaseong.book) {
      writeDiagnostic(trace, "search_complete", { status: "found", elapsedMs: Date.now() - searchStarted });
      return { ...base, status: "found", source: "hwaseong", searchUrl: hwaseong.searchUrl, ...hwaseong.book };
    }

    if (!classified.isIsbn || library.id === "ALL") {
      writeDiagnostic(trace, "search_complete", { status: "not_found", elapsedMs: Date.now() - searchStarted });
      return {
        ...base,
        status: "not_found",
        source: "hwaseong",
        searchUrl: hwaseong.searchUrl,
        isbn: classified.isbn,
        title: classified.isIsbn ? "" : classified.query
      };
    }

    if (options.localMatch === true) {
      writeDiagnostic(trace, "search_complete", { status: "local_pending", elapsedMs: Date.now() - searchStarted });
      return {
        ...base,
        status: "local_pending",
        source: "local",
        searchUrl: hwaseong.searchUrl,
        isbn: classified.isbn,
        title: ""
      };
    }

    writeDiagnostic(trace, "search_complete", { status: "not_found", elapsedMs: Date.now() - searchStarted });
    return {
      ...base,
      status: "not_found",
      source: "hwaseong",
      searchUrl: hwaseong.searchUrl,
      isbn: classified.isbn,
      title: ""
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "검색 중 알 수 없는 오류가 발생했습니다.";
    writeDiagnostic(trace, "search_error", {
      stage,
      stageElapsedMs: Date.now() - stageStarted,
      elapsedMs: Date.now() - searchStarted,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage,
      attempts: Number.isInteger(error?.attempts) ? error.attempts : undefined
    });
    return {
      ...base,
      status: "error",
      source: "system",
      isbn: classified.isbn,
      title: classified.isIsbn ? "" : classified.query,
      error: `${errorMessage}${trace.id ? ` · 진단번호 ${trace.id}` : ""}`,
      diagnosticId: trace.id || undefined
    };
  }
}
