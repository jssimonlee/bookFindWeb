import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const raw = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
const keyLine = raw.split(/\r?\n/).find((line) => line.trim().startsWith("DATA4LIBRARY_API_KEY="));
const apiKey = keyLine?.slice(keyLine.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
const attempts = Math.min(Math.max(Number.parseInt(process.argv[2] ?? "5", 10) || 5, 1), 20);
const libraryCode = process.argv[3] ?? "141645";
const isbn = process.argv[4] ?? "9788943314477";

if (!apiKey) {
  console.error(".dev.vars에 DATA4LIBRARY_API_KEY가 없습니다.");
  process.exit(2);
}

const durations = [];
console.log(`PC 직접 측정: ${attempts}회 · 도서관코드 ${libraryCode} · ISBN ${isbn}`);

for (let index = 0; index < attempts; index += 1) {
  const url = new URL("https://data4library.kr/api/itemSrch");
  url.searchParams.set("authKey", apiKey);
  url.searchParams.set("libCode", libraryCode);
  url.searchParams.set("type", "ALL");
  url.searchParams.set("isbn13", isbn);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("format", "json");

  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = await response.json();
    const elapsedMs = Math.round(performance.now() - started);
    const error = data?.response?.error ?? data?.error;
    const docs = data?.response?.docs;
    durations.push(elapsedMs);
    console.log(`${index + 1}회: ${elapsedMs}ms · HTTP ${response.status} · ${error ? "API 오류" : `결과 ${Array.isArray(docs) ? docs.length : 0}건`}`);
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - started);
    console.log(`${index + 1}회: ${elapsedMs}ms · 실패 · ${error instanceof Error ? error.name : "알 수 없는 오류"}`);
  }
}

if (durations.length) {
  const average = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
  console.log(`성공 ${durations.length}/${attempts}회 · 최소 ${Math.min(...durations)}ms · 평균 ${average}ms · 최대 ${Math.max(...durations)}ms`);
}
