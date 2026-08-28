import { createXlsx } from "./xlsx.js";
import { addRecentDataset, buildDataset, loadDataset, matchesLibraryFileName, normalizeIsbn, normalizeRecentCollection, readSpreadsheetRows, removeDataset, removeRecentDatasetFile, saveDataset } from "./file-data.js";
import { parseQueryInput } from "./query-input.js";

const elements = {
  form: document.querySelector("#search-form"),
  queries: document.querySelector("#queries"),
  queryCount: document.querySelector("#query-count"),
  maxQueryBadge: document.querySelector("#max-query-badge"),
  library: document.querySelector("#library"),
  dataSummary: document.querySelector("#data-summary"),
  restrictedToggle: document.querySelector("#restricted-search-toggle"),
  restrictedToggleState: document.querySelector("#restricted-toggle-state"),
  restrictedUnavailable: document.querySelector("#restricted-unavailable"),
  restrictedHelpButton: document.querySelector("#restricted-help-button"),
  restrictedSettings: document.querySelector("#restricted-settings"),
  openDataLink: document.querySelector("#open-data-link"),
  catalogFile: document.querySelector("#catalog-file"),
  recentFile: document.querySelector("#recent-file"),
  catalogStatus: document.querySelector("#catalog-status"),
  catalogGuidance: document.querySelector("#catalog-guidance"),
  recentStatus: document.querySelector("#recent-status"),
  recentFiles: document.querySelector("#recent-files"),
  catalogRemove: document.querySelector("#catalog-remove"),
  recentRemove: document.querySelector("#recent-remove"),
  dataError: document.querySelector("#data-error"),
  searchButton: document.querySelector("#search-button"),
  buttonLabel: document.querySelector(".button-label"),
  limitWarning: document.querySelector("#limit-warning"),
  formError: document.querySelector("#form-error"),
  resultsSection: document.querySelector("#results-section"),
  resultNotes: document.querySelector("#result-notes"),
  resultSummary: document.querySelector("#result-summary"),
  resultBody: document.querySelector("#result-body"),
  mobileResults: document.querySelector("#mobile-results"),
  excelButton: document.querySelector("#excel-button"),
  libraryChangeDialog: document.querySelector("#library-change-dialog"),
  libraryChangeMessage: document.querySelector("#library-change-message"),
  libraryChangeFiles: document.querySelector("#library-change-files"),
  libraryChangeCancel: document.querySelector("#library-change-cancel"),
  libraryChangeConfirm: document.querySelector("#library-change-confirm")
};

const state = {
  config: null,
  results: [],
  searching: false,
  localData: { catalog: null, recent: null },
  activeLibraryId: "ALL"
};
const PREFERRED_LIBRARY_KEY = "bookfind.preferredLibraryId";
const RESTRICTED_SEARCH_KEY = "bookfind.restrictedSearchByLibrary";

function readPreferredLibrary() {
  try { return localStorage.getItem(PREFERRED_LIBRARY_KEY) || "ALL"; }
  catch { return "ALL"; }
}

function savePreferredLibrary() {
  try { localStorage.setItem(PREFERRED_LIBRARY_KEY, elements.library.value); }
  catch { /* 브라우저 저장소를 사용할 수 없으면 현재 선택만 유지합니다. */ }
}

function readRestrictedSearchSettings() {
  try { return JSON.parse(localStorage.getItem(RESTRICTED_SEARCH_KEY) || "{}"); }
  catch { return {}; }
}

function restrictedSearchEnabled() {
  return elements.restrictedToggle.checked && elements.library.value !== "ALL";
}

function saveRestrictedSearchSetting() {
  const libraryId = elements.library.value;
  if (!libraryId || libraryId === "ALL") return;
  try {
    const settings = readRestrictedSearchSettings();
    settings[libraryId] = elements.restrictedToggle.checked;
    localStorage.setItem(RESTRICTED_SEARCH_KEY, JSON.stringify(settings));
  } catch { /* 저장할 수 없으면 현재 선택만 사용합니다. */ }
}

function getQueries() {
  return parseQueryInput(elements.queries.value);
}

function cleanQueryField() {
  const queries = getQueries();
  const cleaned = queries.join("\n");
  if (elements.queries.value !== cleaned) elements.queries.value = cleaned;
  updateCount();
  return queries;
}

function updateCount() {
  const count = getQueries().length;
  const max = state.config?.maxQueries ?? 20;
  elements.queryCount.textContent = `${count} / ${max}`;
  elements.queryCount.style.color = count > max ? "var(--red)" : "";
  if (count > max) {
    elements.limitWarning.textContent = `현재 ${count}개가 입력되어 ${count - max}개 초과했습니다. ${max}개 이하로 나누어 검색해 주세요.`;
    elements.limitWarning.hidden = false;
  } else {
    elements.limitWarning.textContent = "";
    elements.limitWarning.hidden = true;
  }
  elements.searchButton.disabled = state.searching || !count || count > max;
}

function showError(message = "") {
  elements.formError.textContent = message;
  elements.formError.hidden = !message;
}

function statusInfo(status, source = "") {
  if (status === "restricted_estimated" && source === "monthly_file") return ["사서제한 추정 · 월간", "status-estimated"];
  return {
    found: ["소장", "status-found"],
    recent_purchase: ["최근 구매 확인", "status-recent"],
    restricted_estimated: ["사서제한 추정", "status-estimated"],
    not_found: ["미소장", "status-absent"],
    fallback_unavailable: ["확인 제한", "status-absent"],
    error: ["검색 오류", "status-error"]
  }[status] ?? ["확인 필요", "status-error"];
}

function safeText(value) { return String(value ?? ""); }

function resultTitleText(result) {
  if (result.title) return result.title;
  if (result.status === "recent_purchase") return "최근 구매 목록에서 확인됨";
  if (result.status === "restricted_estimated" && result.source === "monthly_file") return "월간 장서 데이터에서 확인됨";
  if (result.status === "error") return result.error || "검색 중 오류가 발생했습니다.";
  return "";
}

function appendResult(result, sequence) {
  const [label, className] = statusInfo(result.status, result.source);
  const row = document.createElement("tr");
  const displayTitle = resultTitleText(result);
  const values = [result.isbn || result.query, displayTitle, result.author, result.publisher, result.year, result.room, result.registration, result.callNumber, result.count ?? ""];
  const sequenceCell = document.createElement("td");
  sequenceCell.className = "sequence-column";
  sequenceCell.textContent = String(sequence);
  const statusCell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `status-pill ${className}`;
  pill.textContent = label;
  statusCell.append(pill);
  row.append(sequenceCell, statusCell);
  values.forEach((value, index) => {
    const cell = document.createElement("td");
    if (index === 1 && result.searchUrl && result.title) {
      const link = document.createElement("a");
      link.href = result.searchUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = safeText(value);
      cell.append(link);
    } else {
      cell.textContent = safeText(value) || "—";
    }
    row.append(cell);
  });
  elements.resultBody.append(row);

  const card = document.createElement("article");
  card.className = "result-card";
  const head = document.createElement("div"); head.className = "result-card-head";
  const mobilePill = pill.cloneNode(true);
  const mobileMeta = document.createElement("div"); mobileMeta.className = "result-card-meta";
  const mobileSequence = document.createElement("span"); mobileSequence.className = "result-sequence"; mobileSequence.textContent = `#${sequence}`;
  mobileMeta.append(mobileSequence, mobilePill);
  const isbn = document.createElement("span"); isbn.className = "isbn"; isbn.textContent = result.isbn || result.query;
  head.append(mobileMeta, isbn); card.append(head);
  const title = document.createElement("h3");
  if (result.searchUrl && result.title) {
    const link = document.createElement("a"); link.href = result.searchUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = result.title;
    title.append(link);
  } else title.textContent = resultTitleText(result) || "검색 결과 없음";
  card.append(title);
  const details = [["저작자", result.author], ["발행자", result.publisher], ["자료실", result.room], ["등록번호", result.registration], ["청구기호", result.callNumber]];
  const list = document.createElement("dl");
  details.filter(([, value]) => value).forEach(([key, value]) => {
    const term = document.createElement("dt"); term.textContent = key;
    const description = document.createElement("dd"); description.textContent = value;
    list.append(term, description);
  });
  card.append(list); elements.mobileResults.append(card);
}

function updateSummary(done, total) {
  const found = state.results.filter((item) => item.status === "found").length;
  const recent = state.results.filter((item) => item.status === "recent_purchase").length;
  const estimated = state.results.filter((item) => item.status === "restricted_estimated").length;
  elements.resultSummary.textContent = done < total
    ? `${total}건 중 ${done}건 확인 중 · 소장 ${found} · 최근 구매 ${recent} · 사서제한 추정 ${estimated}`
    : `총 ${total}건 · 소장 ${found} · 최근 구매 ${recent} · 사서제한 추정 ${estimated} · 그 외 ${total - found - recent - estimated}`;
}

function mergeLocalResult(result, match) {
  if (!match) return { ...result, status: "not_found", source: "hwaseong" };
  const record = match.record;
  return {
    ...result,
    status: match.type === "recent" ? "recent_purchase" : "restricted_estimated",
    source: match.type === "recent" ? "recent_file" : "monthly_file",
    isbn: record.isbn,
    title: record.title || "",
    author: record.author || "",
    publisher: record.publisher || "",
    year: record.year || "",
    registration: "",
    room: "",
    callNumber: "",
    count: record.count ?? null
  };
}

async function readNdjson(response, total, indexOffset = 0, localMatches = []) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneCount = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "result") {
        const result = event.result.status === "local_pending"
          ? mergeLocalResult(event.result, localMatches[event.index])
          : event.result;
        state.results[indexOffset + event.index] = result;
        appendResult(result, indexOffset + event.index + 1);
        elements.resultNotes.hidden = false;
        doneCount = state.results.filter(Boolean).length;
        updateSummary(doneCount, total);
        elements.buttonLabel.textContent = `${doneCount} / ${total} 검색 중`;
      }
    }
  }
}

async function submitSearch(event) {
  event.preventDefault(); showError();
  const queries = cleanQueryField();
  if (!queries.length || state.searching) return;

  state.searching = true; state.results = [];
  elements.resultBody.replaceChildren(); elements.mobileResults.replaceChildren();
  elements.resultNotes.hidden = true;
  elements.resultsSection.hidden = false; elements.excelButton.disabled = true;
  elements.searchButton.classList.add("loading"); elements.buttonLabel.textContent = `0 / ${queries.length} 검색 중`;
  updateSummary(0, queries.length); updateCount();
  elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const batchSize = state.config.batchSize ?? 20;
    for (let offset = 0; offset < queries.length; offset += batchSize) {
      const batch = queries.slice(offset, offset + batchSize);
      const localMatches = batch.map(findLocalMatch);
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: batch,
          libraryId: elements.library.value,
          localFallback: localMatches.map(Boolean)
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `검색 서버 오류 (${response.status})`);
      }
      await readNdjson(response, queries.length, offset, localMatches);
    }
    updateSummary(state.results.filter(Boolean).length, queries.length);
    elements.excelButton.disabled = !state.results.filter(Boolean).length;
  } catch (error) {
    showError(error.message || "검색 중 오류가 발생했습니다.");
  } finally {
    state.searching = false;
    elements.searchButton.classList.remove("loading"); elements.buttonLabel.textContent = "소장 여부 확인하기";
    updateCount();
  }
}

function downloadExcel() {
  const headers = ["순번", "상태", "ISBN/검색어", "서명", "저작자", "발행자", "발행년", "자료실", "등록번호", "청구기호", "권수"];
  const rows = state.results.filter(Boolean).map((result, index) => [
    index + 1, statusInfo(result.status, result.source)[0], result.isbn || result.query, result.title, result.author, result.publisher,
    result.year, result.room, result.registration, result.callNumber, result.count ?? ""
  ]);
  const blob = createXlsx(headers, rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  link.href = url; link.download = `화성시도서관_검색결과_${date}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function selectedLibrary() {
  return state.config?.libraries.find((library) => library.id === elements.library.value) ?? null;
}

function showDataError(message = "") {
  elements.dataError.textContent = message;
  elements.dataError.hidden = !message;
}

function describeDataset(dataset) {
  if (!dataset) return "등록된 파일 없음";
  const date = dataset.dataMonth || dataset.latestDate || dataset.importedAt.slice(0, 10);
  return `${dataset.fileName} · ${dataset.total.toLocaleString()}건 · ${date}`;
}

function renderRecentFiles(collection) {
  elements.recentFiles.replaceChildren();
  for (const file of collection?.files || []) {
    const row = document.createElement("div");
    row.className = "recent-file-item";
    const text = document.createElement("span");
    const date = file.latestDate || file.dataMonth || file.importedAt?.slice(0, 10) || "날짜 없음";
    text.textContent = `${file.fileName} · ${file.total.toLocaleString()}건 · ${date}`;
    text.title = text.textContent;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "삭제";
    button.dataset.recentFileId = file.id;
    button.addEventListener("click", () => deleteRecentFile(file.id));
    row.append(text, button);
    elements.recentFiles.append(row);
  }
}

function updateDataTools() {
  const library = selectedLibrary();
  const individual = library && library.id !== "ALL";
  const enabled = individual && restrictedSearchEnabled();
  const recentCount = state.localData.recent?.files?.length || 0;
  const registered = Boolean(state.localData.catalog) || recentCount;
  elements.dataSummary.textContent = registered
    ? `월간 ${state.localData.catalog ? "등록" : "없음"} · 최근 ${recentCount}개`
    : "등록 없음";
  elements.restrictedToggle.disabled = !individual;
  elements.restrictedToggleState.textContent = enabled
    ? "현재: 사서제한 도서까지 함께 검색 중"
    : "현재: 화성시 도서관 홈페이지에서만 검색 중";
  elements.restrictedSettings.hidden = !enabled;
  elements.restrictedToggle.setAttribute("aria-expanded", String(enabled));
  elements.restrictedUnavailable.hidden = individual;
  if (individual) {
    elements.restrictedUnavailable.classList.remove("open");
    elements.restrictedHelpButton.setAttribute("aria-expanded", "false");
  }
  const searchName = library?.openDataName || "화성시립";
  elements.openDataLink.href = `https://www.data4library.kr/openDataL?srchText=${encodeURIComponent(searchName)}`;
  elements.openDataLink.textContent = individual && library.openDataName
    ? `정보나루에서 ${library.name} 월간 CSV 받기 ↗`
    : "정보나루에서 화성시립 도서관 찾기 ↗";
  elements.openDataLink.setAttribute("aria-disabled", String(!individual));
  elements.catalogFile.disabled = !individual;
  elements.recentFile.disabled = !individual;
  document.querySelectorAll(".file-button").forEach((label) => label.classList.toggle("disabled", !individual));
  elements.catalogStatus.textContent = describeDataset(state.localData.catalog);
  elements.recentStatus.textContent = recentCount
    ? `${recentCount}개 파일 · 중복 제외 ${state.localData.recent.total.toLocaleString()}건`
    : "등록된 파일 없음";
  elements.catalogStatus.title = elements.catalogStatus.textContent;
  elements.recentStatus.title = elements.recentStatus.textContent;
  elements.catalogRemove.hidden = !state.localData.catalog;
  elements.recentRemove.hidden = !recentCount;
  const cutoff = state.localData.catalog?.latestDate || state.localData.catalog?.dataMonth || "";
  elements.catalogGuidance.hidden = !cutoff;
  elements.catalogGuidance.textContent = cutoff
    ? `이 월간자료의 최신 등록일은 ${cutoff}입니다. 이 날짜 이후 구매한 도서 목록은 아래 ‘최근 구매’에 추가하세요.`
    : "";
  renderRecentFiles(state.localData.recent);
  updateCount();
}

async function loadLocalData() {
  showDataError();
  const libraryId = elements.library.value;
  if (!libraryId || libraryId === "ALL") {
    state.localData = { catalog: null, recent: null };
    elements.restrictedToggle.checked = false;
    updateDataTools();
    return;
  }
  try {
    const [catalog, recent] = await Promise.all([loadDataset("catalog", libraryId), loadDataset("recent", libraryId)]);
    if (elements.library.value !== libraryId) return;
    state.localData = { catalog, recent: normalizeRecentCollection(recent) };
    elements.restrictedToggle.checked = readRestrictedSearchSettings()[libraryId] === true;
  } catch (error) {
    state.localData = { catalog: null, recent: null };
    showDataError(error.message || "저장된 보조 데이터를 불러올 수 없습니다.");
  }
  updateDataTools();
}

function libraryNameById(libraryId) {
  return state.config?.libraries.find((library) => library.id === libraryId)?.name || "선택한 도서관";
}

function confirmLibraryChange(previousLibraryId, nextLibraryId) {
  const files = [];
  if (state.localData.catalog) files.push({ type: "월간 장서", name: state.localData.catalog.fileName || "등록한 월간 장서 파일" });
  for (const file of state.localData.recent?.files || []) {
    files.push({ type: "최근 구매", name: file.fileName || "등록한 최근 구매 파일" });
  }
  elements.libraryChangeMessage.textContent = `${libraryNameById(previousLibraryId)} 도서관에서 ${libraryNameById(nextLibraryId)} 도서관으로 변경합니다.`;
  elements.libraryChangeFiles.replaceChildren(...files.map((file) => {
    const item = document.createElement("li");
    const type = document.createElement("span");
    const name = document.createElement("b");
    type.textContent = file.type;
    name.textContent = file.name;
    item.append(type, name);
    return item;
  }));

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      elements.libraryChangeCancel.removeEventListener("click", cancel);
      elements.libraryChangeConfirm.removeEventListener("click", confirm);
      elements.libraryChangeDialog.removeEventListener("cancel", cancelDialog);
      elements.libraryChangeDialog.close();
      resolve(confirmed);
    };
    const cancel = () => finish(false);
    const confirm = () => finish(true);
    const cancelDialog = (event) => { event.preventDefault(); finish(false); };
    elements.libraryChangeCancel.addEventListener("click", cancel);
    elements.libraryChangeConfirm.addEventListener("click", confirm);
    elements.libraryChangeDialog.addEventListener("cancel", cancelDialog);
    elements.libraryChangeDialog.showModal();
    elements.libraryChangeCancel.focus();
  });
}

async function changeLibrary() {
  const nextLibraryId = elements.library.value;
  const previousLibraryId = state.activeLibraryId;
  const hasFiles = Boolean(state.localData.catalog || state.localData.recent?.files?.length);
  if (previousLibraryId !== "ALL" && previousLibraryId !== nextLibraryId && hasFiles) {
    const confirmed = await confirmLibraryChange(previousLibraryId, nextLibraryId);
    if (!confirmed) {
      elements.library.value = previousLibraryId;
      return;
    }
    try {
      const removals = [];
      if (state.localData.catalog) removals.push(removeDataset("catalog", previousLibraryId));
      if (state.localData.recent?.files?.length) removals.push(removeDataset("recent", previousLibraryId));
      await Promise.all(removals);
    } catch (error) {
      elements.library.value = previousLibraryId;
      showDataError(error.message || "기존 파일을 삭제할 수 없어 도서관을 변경하지 않았습니다.");
      return;
    }
  }
  state.activeLibraryId = nextLibraryId;
  savePreferredLibrary();
  await loadLocalData();
}

async function importLocalFile(type, file) {
  const library = selectedLibrary();
  if (!library || library.id === "ALL") throw new Error("개별 도서관을 먼저 선택해 주세요.");
  if (type === "catalog" && !matchesLibraryFileName(file.name, library.name)) {
    throw new Error(`파일명에서 ${library.name} 도서관을 확인할 수 없습니다. 선택한 도서관과 파일을 확인해 주세요.`);
  }
  const rows = await readSpreadsheetRows(file);
  const dataset = buildDataset(rows, { type, libraryId: library.id, libraryName: library.name, fileName: file.name });
  if (type === "recent") {
    const collection = addRecentDataset(state.localData.recent, dataset);
    await saveDataset(collection);
    state.localData.recent = collection;
  } else {
    await saveDataset(dataset);
    state.localData.catalog = dataset;
  }
  updateDataTools();
}

async function handleFileInput(type, input) {
  const file = input.files?.[0];
  if (!file) return;
  showDataError();
  const status = type === "catalog" ? elements.catalogStatus : elements.recentStatus;
  status.textContent = "파일을 읽는 중...";
  try {
    await importLocalFile(type, file);
  } catch (error) {
    showDataError(error.message || "파일을 등록할 수 없습니다.");
    updateDataTools();
  } finally {
    input.value = "";
  }
}

async function deleteLocalData(type) {
  const libraryId = elements.library.value;
  if (!libraryId || libraryId === "ALL") return;
  try {
    await removeDataset(type, libraryId);
    state.localData[type] = null;
    updateDataTools();
  } catch (error) {
    showDataError(error.message || "보조 데이터를 삭제할 수 없습니다.");
  }
}

async function deleteRecentFile(fileId) {
  const libraryId = elements.library.value;
  if (!libraryId || libraryId === "ALL") return;
  try {
    const collection = removeRecentDatasetFile(state.localData.recent, fileId);
    if (collection) await saveDataset(collection);
    else await removeDataset("recent", libraryId);
    state.localData.recent = collection;
    updateDataTools();
  } catch (error) {
    showDataError(error.message || "최근 구매 파일을 삭제할 수 없습니다.");
  }
}

function findLocalMatch(query) {
  const isbn = normalizeIsbn(query);
  if (!isbn || elements.library.value === "ALL" || !restrictedSearchEnabled()) return null;
  const recent = state.localData.recent?.records?.[isbn];
  if (recent) return { type: "recent", record: recent };
  const catalog = state.localData.catalog?.records?.[isbn];
  if (catalog) return { type: "catalog", record: catalog };
  return null;
}

async function initialize() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("설정을 불러올 수 없습니다.");
    state.config = await response.json();
    elements.maxQueryBadge.textContent = `최대 ${state.config.maxQueries}권`;
    elements.library.replaceChildren(...state.config.libraries.map((library) => {
      const option = document.createElement("option"); option.value = library.id; option.textContent = library.name; return option;
    }));
    const preferredLibrary = readPreferredLibrary();
    elements.library.value = state.config.libraries.some((library) => library.id === preferredLibrary) ? preferredLibrary : "ALL";
    state.activeLibraryId = elements.library.value;
    elements.library.disabled = false;
    await loadLocalData();
  } catch (error) {
    showError(error.message || "초기 설정 중 오류가 발생했습니다.");
  } finally { updateCount(); }
}

elements.queries.addEventListener("input", updateCount);
elements.queries.addEventListener("blur", cleanQueryField);
elements.library.addEventListener("change", changeLibrary);
elements.restrictedToggle.addEventListener("change", () => {
  saveRestrictedSearchSetting();
  updateDataTools();
});
elements.restrictedHelpButton.addEventListener("click", () => {
  const open = elements.restrictedUnavailable.classList.toggle("open");
  elements.restrictedHelpButton.setAttribute("aria-expanded", String(open));
});
elements.catalogFile.addEventListener("change", () => handleFileInput("catalog", elements.catalogFile));
elements.recentFile.addEventListener("change", () => handleFileInput("recent", elements.recentFile));
elements.catalogRemove.addEventListener("click", () => deleteLocalData("catalog"));
elements.recentRemove.addEventListener("click", () => deleteLocalData("recent"));
elements.form.addEventListener("submit", submitSearch);
elements.excelButton.addEventListener("click", downloadExcel);
initialize();
