import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQueryValues, parseQueryInput } from "../public/query-input.js";

test("ISBN 앞뒤 공백과 탭, 보이지 않는 문자를 제거한다", () => {
  assert.deepEqual(parseQueryInput("  \t\u200B978-89-4331-447-7\uFEFF  \r\n"), ["9788943314477"]);
});

test("엑셀에서 ISBN과 책 제목 열을 함께 붙여넣어도 ISBN만 사용한다", () => {
  assert.deepEqual(parseQueryInput("9788943314477\t블록상어\t출판사"), ["9788943314477"]);
});

test("엑셀이 앞뒤 공백을 보존하려고 붙인 큰따옴표는 ISBN에서만 제거한다", () => {
  assert.deepEqual(parseQueryInput('  "  978-89-4331-447-7  "  '), ["9788943314477"]);
  assert.deepEqual(parseQueryInput('"어느 날의 책"'), ['"어느 날의 책"']);
});

test("공백이나 탭으로 나란히 입력한 ISBN을 각각 분리한다", () => {
  assert.deepEqual(parseQueryInput("9788943314477 9791160079104\n9780306406157\t책 제목"), [
    "9788943314477",
    "9791160079104",
    "9780306406157"
  ]);
});

test("책 제목의 정상적인 띄어쓰기는 유지하고 연속 공백만 정리한다", () => {
  assert.deepEqual(parseQueryInput("  어느   날의   책  "), ["어느 날의 책"]);
});

test("API로 받은 값도 정리한 뒤 중복을 제거한다", () => {
  assert.deepEqual(normalizeQueryValues([" 9788943314477 ", "978-89-4331-447-7"]), ["9788943314477"]);
});
