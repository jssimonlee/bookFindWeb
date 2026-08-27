const DB_NAME = "bookfind-local-data";
const DB_VERSION = 1;
const STORE_NAME = "datasets";

function decodeXml(value = "") {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number.parseInt(number, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attributeValue(attributes, name) {
  return decodeXml(attributes.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? "");
}

export function normalizeIsbn(value) {
  const compact = String(value ?? "").trim().replace(/[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{13}$/.test(compact)) return compact;
  if (!/^\d{9}[\dX]$/.test(compact)) return "";
  const body = `978${compact.slice(0, 9)}`;
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function matchesLibraryFileName(fileName, libraryName) {
  const normalize = (value) => value
    .normalize("NFKC")
    .replace(/화성(특례)?시립|화성(특례)?시|시립|^화성|도서관|어린이|작은|복합문화센터|[^0-9A-Za-z가-힣]/g, "")
    .toLowerCase();
  const expected = normalize(libraryName);
  return !expected || normalize(fileName).includes(expected);
}

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}

function readCsvBlob(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
    const text = replacementCount > 2 ? new TextDecoder("euc-kr").decode(bytes) : utf8;
    return parseCsvText(text);
  });
}

function findZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error("올바른 XLSX 파일이 아닙니다.");
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("XLSX 압축 목록을 읽을 수 없습니다.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, { method, bytes: bytes.slice(dataOffset, dataOffset + compressedSize) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function unzipText(entry) {
  if (!entry) return "";
  if (entry.method === 0) return new TextDecoder().decode(entry.bytes);
  if (entry.method !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("이 브라우저에서는 해당 XLSX 압축 형식을 읽을 수 없습니다. CSV로 저장해 등록해 주세요.");
  }
  const stream = new Blob([entry.bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function readXlsxBlob(blob) {
  const entries = findZipEntries(await blob.arrayBuffer());
  const sharedXml = await unzipText(entries.get("xl/sharedStrings.xml"));
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((part) => decodeXml(part[1])).join("")
  );
  const sheetName = [...entries.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort()[0];
  if (!sheetName) throw new Error("XLSX에서 첫 번째 시트를 찾을 수 없습니다.");
  const sheetXml = await unzipText(entries.get(sheetName));
  const rows = [];
  for (const match of sheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
    const reference = attributeValue(match[1], "r");
    const rowIndex = Math.max(0, Number.parseInt(reference.match(/\d+$/)?.[0] ?? "1", 10) - 1);
    const type = attributeValue(match[1], "t");
    const raw = match[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
    const inline = [...match[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((part) => decodeXml(part[1])).join("");
    const value = type === "s" ? (shared[Number.parseInt(raw, 10)] ?? "") : (type === "inlineStr" ? inline : decodeXml(raw));
    rows[rowIndex] ??= [];
    rows[rowIndex][columnIndex(reference)] = value;
  }
  return rows.filter(Boolean);
}

export async function readSpreadsheetRows(file) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return readCsvBlob(file);
  if (extension === "xlsx") return readXlsxBlob(file);
  throw new Error("CSV 또는 XLSX 파일만 등록할 수 있습니다.");
}

function findHeader(headers, candidates) {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

export function buildDataset(rows, { type, libraryId, libraryName, fileName }) {
  if (!rows.length) throw new Error("파일에 데이터가 없습니다.");
  const headers = rows[0].map((value) => String(value ?? "").trim().replace(/^\uFEFF/, ""));
  const isbnIndex = headers.indexOf("ISBN");
  if (isbnIndex < 0) throw new Error('첫 번째 행에 정확히 "ISBN"이라는 헤더가 있어야 합니다.');
  const titleIndex = findHeader(headers, ["도서명", "서명"]);
  const authorIndex = findHeader(headers, ["저자", "저작자"]);
  const publisherIndex = findHeader(headers, ["출판사", "발행자"]);
  const yearIndex = findHeader(headers, ["발행년도", "발행년"]);
  const dateIndex = findHeader(headers, ["등록일자", "구매일자", "구입일자"]);
  const countIndex = findHeader(headers, ["도서권수", "권수"]);
  const records = {};
  let latestDate = "";
  for (const row of rows.slice(1)) {
    const isbn = normalizeIsbn(row[isbnIndex]);
    if (!isbn) continue;
    const registrationDate = dateIndex >= 0 ? String(row[dateIndex] ?? "").trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(registrationDate) && registrationDate > latestDate) latestDate = registrationDate;
    const count = countIndex >= 0 ? Number.parseInt(row[countIndex], 10) || 0 : 0;
    if (records[isbn]) {
      if (count) records[isbn].count = (records[isbn].count || 0) + count;
      continue;
    }
    records[isbn] = {
      isbn,
      title: titleIndex >= 0 ? String(row[titleIndex] ?? "").trim() : "",
      author: authorIndex >= 0 ? String(row[authorIndex] ?? "").trim() : "",
      publisher: publisherIndex >= 0 ? String(row[publisherIndex] ?? "").trim() : "",
      year: yearIndex >= 0 ? String(row[yearIndex] ?? "").trim() : "",
      registrationDate,
      count: count || null
    };
  }
  const total = Object.keys(records).length;
  if (!total) throw new Error("유효한 ISBN이 한 건도 없습니다.");
  const month = fileName.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월/);
  return {
    key: `${type}:${libraryId}`,
    type,
    libraryId,
    libraryName,
    fileName,
    dataMonth: month ? `${month[1]}-${month[2].padStart(2, "0")}` : "",
    latestDate,
    importedAt: new Date().toISOString(),
    total,
    records
  };
}

function recentFileFromDataset(dataset) {
  return {
    id: dataset.id || `${dataset.fileName}:${dataset.importedAt}`,
    fileName: dataset.fileName,
    dataMonth: dataset.dataMonth || "",
    latestDate: dataset.latestDate || "",
    importedAt: dataset.importedAt,
    total: dataset.total,
    records: dataset.records
  };
}

function mergeRecentRecords(files) {
  const records = {};
  for (const file of files) Object.assign(records, file.records || {});
  return records;
}

export function normalizeRecentCollection(dataset) {
  if (!dataset) return null;
  const files = Array.isArray(dataset.files) ? dataset.files : [recentFileFromDataset(dataset)];
  const records = mergeRecentRecords(files);
  return {
    key: `recent:${dataset.libraryId}`,
    type: "recent",
    libraryId: dataset.libraryId,
    libraryName: dataset.libraryName,
    importedAt: dataset.importedAt,
    total: Object.keys(records).length,
    files,
    records
  };
}

export function addRecentDataset(collection, dataset) {
  const current = normalizeRecentCollection(collection);
  const files = (current?.files || []).filter((file) => file.fileName !== dataset.fileName);
  files.push(recentFileFromDataset(dataset));
  const records = mergeRecentRecords(files);
  return {
    key: `recent:${dataset.libraryId}`,
    type: "recent",
    libraryId: dataset.libraryId,
    libraryName: dataset.libraryName,
    importedAt: new Date().toISOString(),
    total: Object.keys(records).length,
    files,
    records
  };
}

export function removeRecentDatasetFile(collection, fileId) {
  const current = normalizeRecentCollection(collection);
  if (!current) return null;
  const files = current.files.filter((file) => file.id !== fileId);
  if (!files.length) return null;
  const records = mergeRecentRecords(files);
  return { ...current, total: Object.keys(records).length, files, records };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("이 브라우저에서는 파일 저장 기능을 사용할 수 없습니다."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("브라우저 저장소를 열 수 없습니다."));
  });
}

function runTransaction(mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error("브라우저 저장소 작업에 실패했습니다."));
    transaction.oncomplete = () => database.close();
  }));
}

export function saveDataset(dataset) {
  return runTransaction("readwrite", (store) => store.put(dataset));
}

export function loadDataset(type, libraryId) {
  return runTransaction("readonly", (store) => store.get(`${type}:${libraryId}`));
}

export function removeDataset(type, libraryId) {
  return runTransaction("readwrite", (store) => store.delete(`${type}:${libraryId}`));
}
