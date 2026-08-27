import test from "node:test";
import assert from "node:assert/strict";
import { addRecentDataset, buildDataset, matchesLibraryFileName, normalizeIsbn, parseCsvText, readSpreadsheetRows, removeRecentDatasetFile } from "../public/file-data.js";
import { createXlsx } from "../public/xlsx.js";

test("CSV의 ISBN 헤더와 따옴표가 포함된 도서 정보를 읽는다", () => {
  const rows = parseCsvText('ISBN,도서명,저자\r\n9788943314477,"쉼표, 있는 제목","홍길동"\r\n');
  const dataset = buildDataset(rows, { type: "catalog", libraryId: "MX", libraryName: "노을빛", fileName: "노을빛 (2026년 07월).csv" });
  assert.equal(dataset.total, 1);
  assert.equal(dataset.dataMonth, "2026-07");
  assert.equal(dataset.records["9788943314477"].title, "쉼표, 있는 제목");
});

test("ISBN 헤더가 정확하지 않으면 파일을 거부한다", () => {
  assert.throws(
    () => buildDataset([["isbn"], ["9788943314477"]], { type: "recent", libraryId: "MX", libraryName: "노을빛", fileName: "최근.xlsx" }),
    /정확히 "ISBN"/
  );
});

test("ISBN 10자리는 ISBN 13자리로 정규화한다", () => {
  assert.equal(normalizeIsbn("0-306-40615-2"), "9780306406157");
});

test("정보나루 월간 파일명을 선택한 도서관과 연결한다", () => {
  assert.equal(matchesLibraryFileName("화성시립노을빛도서관 장서 대출목록 (2026년 07월).csv", "노을빛"), true);
  assert.equal(matchesLibraryFileName("화성시립병점도서관 장서 대출목록.csv", "노을빛"), false);
  assert.equal(matchesLibraryFileName("화성시립동탄중앙도서관 장서 대출목록.csv", "화성동탄중앙"), true);
});

test("XLSX 첫 번째 시트에서 ISBN 열을 읽는다", async () => {
  const blob = createXlsx(["ISBN", "도서명"], [["9788943314477", "블록상어"]], "최근구매");
  Object.defineProperty(blob, "name", { value: "최근구매.xlsx" });
  const rows = await readSpreadsheetRows(blob);
  const dataset = buildDataset(rows, { type: "recent", libraryId: "MX", libraryName: "노을빛", fileName: blob.name });
  assert.equal(dataset.total, 1);
  assert.equal(dataset.records["9788943314477"].title, "블록상어");
});

test("최근 구매 파일을 여러 개 누적하고 파일별로 삭제한다", () => {
  const first = buildDataset(
    [["ISBN", "도서명"], ["9788943314477", "첫 책"]],
    { type: "recent", libraryId: "MX", libraryName: "노을빛", fileName: "7월 구매.csv" }
  );
  const second = buildDataset(
    [["ISBN", "도서명"], ["9791160079104", "둘째 책"]],
    { type: "recent", libraryId: "MX", libraryName: "노을빛", fileName: "8월 구매.csv" }
  );
  const collection = addRecentDataset(addRecentDataset(null, first), second);
  assert.equal(collection.files.length, 2);
  assert.equal(collection.total, 2);
  assert.equal(collection.records["9791160079104"].title, "둘째 책");

  const remaining = removeRecentDatasetFile(collection, collection.files[0].id);
  assert.equal(remaining.files.length, 1);
  assert.equal(remaining.total, 1);
  assert.equal(remaining.records["9788943314477"], undefined);
});
