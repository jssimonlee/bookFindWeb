import test from "node:test";
import assert from "node:assert/strict";
import { LIBRARIES } from "../server/libraries.js";
import { buildHwaseongSearchUrl, classifyQuery, parseBibliographicRegistration, parseHwaseongHtml, searchOne, toIsbn13 } from "../server/search.js";

const HIT_HTML = `
  <div>검색결과 총 <span id="totalCnt">4</span> 건</div>
  <div class="bookList listViewStyle"><ul class="listWrap"><li><div class="bookArea">
    <p class="book_name kor on"><a onclick="fnDetail('2201540968', '2201540966', '9791160079104', 'MO');" title="만들어진 붕괴"><b>단행본</b>만들어진 붕괴</a></p>
    <ul class="info-list normal clearfix">
      <li class="kor on"><span>데이비드 A. 스톡맨 지음</span><span>한즈미디어</span><span>2023</span></li>
      <li class="han"><span>저자</span><span>출판사</span><span>2023</span></li>
      <li><span>320.942-스835ㅁ</span><span>부록없음</span></li>
      <li><span><b>[병점]</b> [병점]종합자료실</span></li>
    </ul>
    <a onclick="fnMutualLoanApply('2201540968','DBE000090615')">상호대차</a>
  </div></li></ul></div>`;

test("ISBN과 제목을 구분하고 검색 URL을 안전하게 만든다", () => {
  assert.deepEqual(classifyQuery("979-11-6007-910-4"), { query: "979-11-6007-910-4", isIsbn: true, isbn: "9791160079104" });
  assert.equal(classifyQuery("0-306-40615-2").isIsbn, true);
  assert.equal(toIsbn13("0-306-40615-2"), "9780306406157");
  assert.equal(classifyQuery("모순").isIsbn, false);
  const url = new URL(buildHwaseongSearchUrl("모순 & 사랑", "MP"));
  assert.equal(url.searchParams.get("searchAdvTitle"), "모순 & 사랑");
  assert.equal(url.searchParams.get("searchManageCodeArr"), "MP");
  const noeulUrl = new URL(buildHwaseongSearchUrl("9788943314477", "MX", "neblib"));
  assert.equal(noeulUrl.pathname, "/neblib/program/searchResultList.do");
});

test("화성시 검색 HTML에서 첫 소장 정보를 읽는다", () => {
  assert.deepEqual(parseHwaseongHtml(HIT_HTML), {
    isbn: "9791160079104",
    title: "만들어진 붕괴",
    author: "데이비드 A. 스톡맨 지음",
    publisher: "한즈미디어",
    year: "2023",
    room: "[병점]종합자료실",
    registration: "DBE000090615",
    callNumber: "320.942-스835ㅁ",
    count: 4
  });
  assert.equal(parseHwaseongHtml('<span id="totalCnt">0</span>'), null);
});

test("같은 ISBN의 여러 소장본 등록번호를 모두 합친다", () => {
  const html = `${HIT_HTML}<div class="bookArea">
    <p class="book_name kor on"><a onclick="fnDetail('2201540970', '2201540969', '9791160079104', 'MO');" title="만들어진 붕괴">만들어진 붕괴</a></p>
    <a onclick="fnReservationApply('2201540970','DBE000090616')">예약</a>
  </div>`;
  assert.equal(parseHwaseongHtml(html).registration, "DBE000090615, DBE000090616");
});

test("서지정보 표에서 등록번호를 읽는다", () => {
  assert.equal(parseBibliographicRegistration('<tr><th scope="row">등록번호</th><td class="ta_l">WEM000003684</td></tr>'), "WEM000003684");
});

test("화성시 미검색 ISBN은 정보나루 결과를 사서제한 추정으로 표시한다", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    return Response.json({ response: { docs: [{ doc: {
      bookname: "숨은 책", authors: "저자", publisher: "출판사", publication_year: "2024", class_no: "813.7",
      callNumbers: [{ callNumber: { shelf_loc_name: "보존서고", book_code: "홍12ㅅ" } }]
    } }] } });
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MP");
    const result = await searchOne("9781234567890", library, "test-key");
    assert.equal(result.status, "restricted_estimated");
    assert.equal(result.title, "숨은 책");
    assert.equal(result.callNumber, "813.7-홍12ㅅ");
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes("itemSrch"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("정상 정보나루 결과는 캐시하고 같은 검색에서 다시 사용한다", async () => {
  const originalFetch = globalThis.fetch;
  let data4LibraryCalls = 0;
  const stored = new Map();
  const cache = {
    async get(libraryId, isbn) {
      return stored.get(`${libraryId}:${isbn}`) ?? null;
    },
    async set(libraryId, isbn, result) {
      stored.set(`${libraryId}:${isbn}`, result);
    }
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    data4LibraryCalls += 1;
    return Response.json({ response: { docs: [{ doc: {
      bookname: "캐시된 책", authors: "저자", publisher: "출판사", publication_year: "2024",
      callNumbers: []
    } }] } });
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const first = await searchOne("9788943314477", library, "test-key", {}, cache);
    const second = await searchOne("9788943314477", library, "test-key", {}, cache);
    assert.equal(first.status, "restricted_estimated");
    assert.equal(second.status, "restricted_estimated");
    assert.equal(second.title, "캐시된 책");
    assert.equal(data4LibraryCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("정보나루 시간 초과는 한 번만 자동 재시도한다", async () => {
  const originalFetch = globalThis.fetch;
  let data4LibraryCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    data4LibraryCalls += 1;
    if (data4LibraryCalls === 1) {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    }
    return Response.json({ response: { docs: [{ doc: {
      bookname: "재시도 성공", authors: "저자", publisher: "출판사", publication_year: "2024",
      callNumbers: []
    } }] } });
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9788943314477", library, "test-key");
    assert.equal(result.status, "restricted_estimated");
    assert.equal(result.title, "재시도 성공");
    assert.equal(data4LibraryCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("정보나루 522 같은 일시적 서버 오류도 한 번 자동 재시도한다", async () => {
  const originalFetch = globalThis.fetch;
  let data4LibraryCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    data4LibraryCalls += 1;
    if (data4LibraryCalls === 1) return new Response("연결 시간 초과", { status: 522 });
    return Response.json({ response: { docs: [{ doc: {
      bookname: "522 재시도 성공", authors: "저자", publisher: "출판사", publication_year: "2026",
      callNumbers: []
    } }] } });
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9791162544976", library, "test-key");
    assert.equal(result.status, "restricted_estimated");
    assert.equal(result.title, "522 재시도 성공");
    assert.equal(data4LibraryCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("로컬 파일에 ISBN이 있으면 화성시 검색 후 정보나루 API를 건너뛴다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    throw new Error("정보나루 API가 호출되면 안 됩니다.");
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9788943314477", library, "test-key", {}, null, { skipData4Library: true });
    assert.equal(result.status, "local_pending");
    assert.equal(result.source, "local");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("월간 파일 방식은 파일에 없는 ISBN도 정보나루 API를 호출하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    throw new Error("정보나루 API가 호출되면 안 됩니다.");
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9791162544976", library, "", {}, null, { disableData4Library: true });
    assert.equal(result.status, "not_found");
    assert.equal(result.source, "local_files");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("홈페이지만 검색 방식은 화성시 검색 결과만 사용한다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    throw new Error("정보나루 API가 호출되면 안 됩니다.");
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9791162544976", library, "", {}, null, { homepageOnly: true });
    assert.equal(result.status, "not_found");
    assert.equal(result.source, "hwaseong");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("정보나루 오류 결과는 캐시하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  let cacheWrites = 0;
  const cache = {
    async get() { return null; },
    async set() { cacheWrites += 1; }
  };
  globalThis.fetch = async (input) => {
    if (String(input).includes("hscitylib")) return new Response('<span id="totalCnt">0</span>', { status: 200 });
    return new Response("접근 거부", { status: 403 });
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9788943314477", library, "test-key", {}, cache);
    assert.equal(result.status, "error");
    assert.equal(cacheWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("외부 검색 오류에 단계와 진단번호를 남긴다", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => new Response("점검 중", { status: 503 });
  console.log = () => {};
  console.error = (message) => logs.push(String(message));
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9788943314477", library, "test-key", { id: "test1234-01", log: true });
    assert.equal(result.status, "error");
    assert.equal(result.diagnosticId, "test1234-01");
    assert.match(result.error, /진단번호 test1234-01/);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /"stage":"hwaseong"/);
    assert.match(logs[0], /응답 오류 \(503\)/);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }
});
