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
  assert.equal(toIsbn13("0-306-40615-2"), "9780306406157");
  assert.equal(classifyQuery("모순").isIsbn, false);
  const url = new URL(buildHwaseongSearchUrl("모순 & 사랑", "MP"));
  assert.equal(url.searchParams.get("searchAdvTitle"), "모순 & 사랑");
  assert.equal(url.searchParams.get("searchManageCodeArr"), "MP");
});

test("화성시 검색 HTML에서 소장 정보를 읽는다", () => {
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

test("화성시 소장 결과를 그대로 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(HIT_HTML, { status: 200 });
  try {
    const library = LIBRARIES.find((item) => item.id === "MP");
    const result = await searchOne("9791160079104", library);
    assert.equal(result.status, "found");
    assert.equal(result.registration, "DBE000090615");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("로컬 파일 일치 ISBN은 화성시 검색 후 브라우저 병합을 요청한다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('<span id="totalCnt">0</span>', { status: 200 });
  };
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9788943314477", library, {}, { localMatch: true });
    assert.equal(result.status, "local_pending");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("홈페이지와 로컬 파일에 없는 ISBN은 미소장으로 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<span id="totalCnt">0</span>', { status: 200 });
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9791162544976", library);
    assert.equal(result.status, "not_found");
    assert.equal(result.source, "hwaseong");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("외부 검색 오류에 단계와 진단번호를 남긴다", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => new Response("점검 중", { status: 503 });
  console.error = (message) => logs.push(String(message));
  try {
    const library = LIBRARIES.find((item) => item.id === "MX");
    const result = await searchOne("9788943314477", library, { id: "test1234-01", log: true });
    assert.equal(result.status, "error");
    assert.match(result.error, /진단번호 test1234-01/);
    assert.match(logs[0], /"stage":"hwaseong"/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});
