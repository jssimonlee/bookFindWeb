const INVISIBLE_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE_CHARACTERS, "");
}

function cleanCell(value) {
  return cleanText(value).trim().replace(/\s+/g, " ");
}

function unwrapSpreadsheetQuotes(value) {
  const text = cleanText(value).trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/""/g, '"').trim();
  }
  return text;
}

function asIsbn(value) {
  const compact = unwrapSpreadsheetQuotes(value).replace(/[\s-]/g, "").toUpperCase();
  return /^(?:\d{9}[\dX]|\d{13})$/.test(compact) ? compact : "";
}

function parseLine(rawLine) {
  const line = cleanText(rawLine);
  const cells = line.split(/\t+/).map(cleanCell).filter(Boolean);
  if (!cells.length) return [];

  // 엑셀에서 ISBN 열과 다른 열을 함께 붙여넣은 경우 ISBN 셀만 사용합니다.
  const cellIsbns = cells.map(asIsbn).filter(Boolean);
  if (cellIsbns.length) return cellIsbns;

  const cleaned = cleanCell(line);
  const singleIsbn = asIsbn(cleaned);
  if (singleIsbn) return [singleIsbn];

  // 공백으로 구분해 입력한 여러 개의 완전한 ISBN도 각각 한 권으로 처리합니다.
  const words = cleaned.split(/\s+/);
  const wordIsbns = words.map(asIsbn);
  if (words.length > 1 && wordIsbns.every(Boolean)) return wordIsbns;

  return cleaned ? [cleaned] : [];
}

export function parseQueryInput(value) {
  const queries = cleanText(value).split(/\r?\n/).flatMap(parseLine);
  return [...new Set(queries)];
}

export function normalizeQueryValues(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.flatMap((value) => parseQueryInput(value)))];
}
