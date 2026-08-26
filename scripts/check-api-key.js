import { readFile } from "node:fs/promises";

const raw = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
const line = raw.split(/\r?\n/).find((value) => value.trim().startsWith("DATA4LIBRARY_API_KEY="));
const apiKey = line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");

if (!apiKey) {
  console.error("API 키가 비어 있습니다.");
  process.exit(2);
}

const url = new URL("https://data4library.kr/api/itemSrch");
url.searchParams.set("authKey", apiKey);
url.searchParams.set("libCode", "141088");
url.searchParams.set("type", "ALL");
url.searchParams.set("isbn13", "9791160079104");
url.searchParams.set("pageNo", "1");
url.searchParams.set("pageSize", "1");
url.searchParams.set("format", "json");

try {
  const response = await fetch(url);
  const data = await response.json();
  const error = data?.response?.error ?? data?.error;
  const docs = data?.response?.docs;
  if (!response.ok || error) {
    console.error(`API 인증 실패: ${error?.message ?? `HTTP ${response.status}`}`);
    process.exit(1);
  }
  console.log(`API 키 인증 성공 · 시험 조회 결과 ${Array.isArray(docs) ? docs.length : 0}건`);
} catch (error) {
  console.error(`API 연결 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  process.exit(1);
}
