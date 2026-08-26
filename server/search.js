import { normalizeLibraryName } from "./libraries.js";

const HWASEONG_SEARCH_URL =
  "https://www.hscitylib.or.kr/iutlib/menu/11340/program/30002/searchResultList.do";
const DATA4LIBRARY_URL = "https://data4library.kr/api";
const REQUEST_TIMEOUT_MS = 12_000;
const resolvedLibraryCodes = new Map();

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

export function buildHwaseongSearchUrl(rawQuery, libraryId) {
  const { query, isIsbn, isbn } = classifyQuery(rawQuery);
  const url = new URL(HWASEONG_SEARCH_URL);
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

export function parseHwaseongHtml(html, fallbackIsbn = "") {
  const total = Number.parseInt(html.match(/id=["']totalCnt["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "0", 10) || 0;
  const bookStart = html.search(/<div\b[^>]*class=["'][^"']*\bbookArea\b[^"']*["'][^>]*>/i);
  if (bookStart < 0) return null;

  const nextBook = html.slice(bookStart + 1).search(/<div\b[^>]*class=["'][^"']*\bbookArea\b/i);
  const segment = nextBook < 0 ? html.slice(bookStart) : html.slice(bookStart, bookStart + 1 + nextBook);
  const titleTag = segment.match(/<p\b[^>]*class=["'][^"']*\bbook_name\b[^"']*\bkor\b[^"']*["'][^>]*>[\s\S]*?(<a\b[^>]*>)/i)?.[1]
    ?? segment.match(/<p\b[^>]*class=["'][^"']*\bbook_name\b[^"']*["'][^>]*>[\s\S]*?(<a\b[^>]*>)/i)?.[1]
    ?? "";
  const title = attributeValue(titleTag, "title");
  if (!title) return null;

  const detailCall = segment.match(/fnDetail\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/i);
  const infoList = segment.match(/<ul\b[^>]*class=["'][^"']*\binfo-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? "";
  const rows = [...infoList.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => match[1]);
  const bibliographic = extractSpans(rows[0] ?? "");
  const callNumber = extractSpans(rows[2] ?? "")[0] ?? "";
  let room = cleanText(rows[3] ?? "");
  const roomPrefix = room.match(/^\[([^\]]+)]\s*(.*)$/);
  if (roomPrefix?.[2]?.startsWith(`[${roomPrefix[1]}]`)) room = roomPrefix[2];
  const registration = segment.match(/fn(?:Reservation|MutualLoan|BaroLoan)Apply\(\s*'[^']*'\s*,\s*'([^']+)'/i)?.[1] ?? "";

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

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHwaseong(query, library) {
  const searchUrl = buildHwaseongSearchUrl(query, library.id);
  const response = await fetchWithTimeout(searchUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "User-Agent": "HwaseongLibraryBookFinder/1.0"
    }
  });
  if (!response.ok) throw new Error(`화성시 도서관 응답 오류 (${response.status})`);
  const html = await response.text();
  return { book: parseHwaseongHtml(html, classifyQuery(query).isbn), searchUrl };
}

function unwrapApiEntries(container, pluralKey, singularKey) {
  const entries = container?.[pluralKey];
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => entry?.[singularKey] ?? entry).filter(Boolean);
}

function assertData4LibraryResponse(data) {
  const error = data?.response?.error ?? data?.error;
  if (!error) return;
  const message = error.message ?? error.msg ?? error.code ?? "알 수 없는 API 오류";
  throw new Error(`도서관정보나루 API 오류 (${message})`);
}

async function resolveData4LibraryCode(library, apiKey) {
  if (library.data4libraryCode) return library.data4libraryCode;
  if (resolvedLibraryCodes.has(library.id)) return resolvedLibraryCodes.get(library.id);

  const url = new URL(`${DATA4LIBRARY_URL}/libSrch`);
  url.searchParams.set("authKey", apiKey);
  url.searchParams.set("region", "31");
  url.searchParams.set("dtl_region", "41590");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("format", "json");

  // 정보나루는 format=json 파라미터로 응답 형식을 정하며,
  // 일부 환경에서 Accept: application/json 요청을 406으로 거부합니다.
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`도서관정보나루 도서관 조회 오류 (${response.status})`);
  const data = await response.json();
  assertData4LibraryResponse(data);
  const libraries = unwrapApiEntries(data?.response, "libs", "lib");
  const candidates = [library.name, ...library.aliases].map(normalizeLibraryName).filter(Boolean);
  const match = libraries.find((entry) => {
    const remoteName = normalizeLibraryName(entry.libName ?? entry.lib_name ?? "");
    return candidates.some((candidate) => remoteName === candidate || remoteName.includes(candidate) || candidate.includes(remoteName));
  });
  const code = match?.libCode ?? match?.lib_code ?? null;
  resolvedLibraryCodes.set(library.id, code);
  return code;
}

async function fetchData4Library(isbn, library, apiKey) {
  const libraryCode = await resolveData4LibraryCode(library, apiKey);
  if (!libraryCode) return { state: "unsupported", book: null };

  const url = new URL(`${DATA4LIBRARY_URL}/itemSrch`);
  url.searchParams.set("authKey", apiKey);
  url.searchParams.set("libCode", libraryCode);
  url.searchParams.set("type", "ALL");
  url.searchParams.set("isbn13", isbn);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("format", "json");

  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`도서관정보나루 응답 오류 (${response.status})`);
  const data = await response.json();
  assertData4LibraryResponse(data);
  const docs = unwrapApiEntries(data?.response, "docs", "doc");
  if (!docs.length) return { state: "not_found", book: null };

  const doc = docs[0];
  const callNumberEntry = unwrapApiEntries(doc, "callNumbers", "callNumber")[0] ?? {};
  const classNumber = doc.class_no ?? "";
  const bookCode = callNumberEntry.book_code ?? "";
  return {
    state: "found",
    book: {
      isbn,
      title: doc.bookname ?? "",
      author: doc.authors ?? "",
      publisher: doc.publisher ?? "",
      year: doc.publication_year ?? "",
      room: callNumberEntry.shelf_loc_name ?? "",
      registration: "",
      callNumber: [classNumber, bookCode].filter(Boolean).join("-"),
      count: null
    }
  };
}

export async function searchOne(rawQuery, library, apiKey) {
  const classified = classifyQuery(rawQuery);
  const base = { query: classified.query, libraryId: library.id, libraryName: library.name };

  try {
    const hwaseong = await fetchHwaseong(classified.query, library);
    if (hwaseong.book) {
      return { ...base, status: "found", source: "hwaseong", searchUrl: hwaseong.searchUrl, ...hwaseong.book };
    }

    if (!classified.isIsbn || library.id === "ALL") {
      return {
        ...base,
        status: "not_found",
        source: "hwaseong",
        searchUrl: hwaseong.searchUrl,
        isbn: classified.isbn,
        title: classified.isIsbn ? "" : classified.query
      };
    }

    const fallback = await fetchData4Library(toIsbn13(classified.isbn), library, apiKey);
    if (fallback.state === "found") {
      return {
        ...base,
        status: "restricted_estimated",
        source: "data4library",
        searchUrl: hwaseong.searchUrl,
        ...fallback.book
      };
    }
    return {
      ...base,
      status: fallback.state === "unsupported" ? "fallback_unavailable" : "not_found",
      source: "data4library",
      searchUrl: hwaseong.searchUrl,
      isbn: classified.isbn,
      title: ""
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      source: "system",
      isbn: classified.isbn,
      title: classified.isIsbn ? "" : classified.query,
      error: error instanceof Error ? error.message : "검색 중 알 수 없는 오류가 발생했습니다."
    };
  }
}
