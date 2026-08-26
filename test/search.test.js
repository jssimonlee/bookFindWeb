import test from "node:test";
import assert from "node:assert/strict";
import { LIBRARIES } from "../server/libraries.js";
import { buildHwaseongSearchUrl, classifyQuery, parseHwaseongHtml, searchOne, toIsbn13 } from "../server/search.js";

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
