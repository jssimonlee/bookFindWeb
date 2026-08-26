import test from "node:test";
import assert from "node:assert/strict";
import { createXlsx } from "../public/xlsx.js";

test("검색 결과를 Excel XLSX 파일로 만든다", async () => {
  const blob = createXlsx(["상태", "서명"], [["소장", "모순 & 사랑"]]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const content = new TextDecoder().decode(bytes);
  assert.ok(content.includes("xl/worksheets/sheet1.xml"));
  assert.ok(content.includes("모순 &amp; 사랑"));
});
