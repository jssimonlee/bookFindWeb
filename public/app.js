import { createXlsx } from "./xlsx.js";

const elements = {
  form: document.querySelector("#search-form"),
  queries: document.querySelector("#queries"),
  queryCount: document.querySelector("#query-count"),
  library: document.querySelector("#library"),
  searchButton: document.querySelector("#search-button"),
  buttonLabel: document.querySelector(".button-label"),
  exampleButton: document.querySelector("#example-button"),
  limitWarning: document.querySelector("#limit-warning"),
  formError: document.querySelector("#form-error"),
  setupWarning: document.querySelector("#setup-warning"),
  resultsSection: document.querySelector("#results-section"),
  resultSummary: document.querySelector("#result-summary"),
  resultBody: document.querySelector("#result-body"),
  mobileResults: document.querySelector("#mobile-results"),
  excelButton: document.querySelector("#excel-button"),
  turnstileArea: document.querySelector("#turnstile-area"),
  turnstileWidget: document.querySelector("#turnstile-widget")
};

const state = { config: null, results: [], searching: false, turnstileToken: "", turnstileWidgetId: null };

function getQueries() {
  return [...new Set(elements.queries.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
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
  elements.searchButton.disabled = state.searching || !state.config?.apiReady || !count || count > max;
}

function showError(message = "") {
  elements.formError.textContent = message;
  elements.formError.hidden = !message;
}

function statusInfo(status) {
  return {
    found: ["소장", "status-found"],
    restricted_estimated: ["사서제한 추정", "status-estimated"],
    not_found: ["미소장", "status-absent"],
    fallback_unavailable: ["확인 제한", "status-absent"],
    error: ["검색 오류", "status-error"]
  }[status] ?? ["확인 필요", "status-error"];
}

function safeText(value) { return String(value ?? ""); }

function appendResult(result) {
  const [label, className] = statusInfo(result.status);
  const row = document.createElement("tr");
  const values = [result.isbn || result.query, result.title, result.author, result.publisher, result.year, result.room, result.callNumber, result.count ?? ""];
  const statusCell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `status-pill ${className}`;
  pill.textContent = label;
  statusCell.append(pill);
  row.append(statusCell);
  values.forEach((value, index) => {
    const cell = document.createElement("td");
    if (index === 1 && result.searchUrl && value) {
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
  const isbn = document.createElement("span"); isbn.className = "isbn"; isbn.textContent = result.isbn || result.query;
  head.append(mobilePill, isbn); card.append(head);
  const title = document.createElement("h3");
  if (result.searchUrl && result.title) {
    const link = document.createElement("a"); link.href = result.searchUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = result.title;
    title.append(link);
  } else title.textContent = result.title || result.error || "검색 결과 없음";
  card.append(title);
  const details = [["저작자", result.author], ["발행자", result.publisher], ["자료실", result.room], ["청구기호", result.callNumber]];
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
  const estimated = state.results.filter((item) => item.status === "restricted_estimated").length;
  elements.resultSummary.textContent = done < total
    ? `${total}건 중 ${done}건 확인 중 · 소장 ${found} · 사서제한 추정 ${estimated}`
    : `총 ${total}건 · 소장 ${found} · 사서제한 추정 ${estimated} · 그 외 ${total - found - estimated}`;
}

async function readNdjson(response, total, indexOffset = 0) {
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
        state.results[indexOffset + event.index] = event.result;
        appendResult(event.result);
        doneCount = state.results.filter(Boolean).length;
        updateSummary(doneCount, total);
        elements.buttonLabel.textContent = `${doneCount} / ${total} 검색 중`;
      }
    }
  }
}

async function submitSearch(event) {
  event.preventDefault(); showError();
  const queries = getQueries();
  if (!queries.length || state.searching) return;
  if (state.config.turnstileSiteKey && !state.turnstileToken) return showError("자동 검색 방지 인증을 완료해 주세요.");

  state.searching = true; state.results = [];
  elements.resultBody.replaceChildren(); elements.mobileResults.replaceChildren();
  elements.resultsSection.hidden = false; elements.excelButton.disabled = true;
  elements.searchButton.classList.add("loading"); elements.buttonLabel.textContent = `0 / ${queries.length} 검색 중`;
  updateSummary(0, queries.length); updateCount();
  elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const batchSize = state.config.batchSize ?? 20;
    for (let offset = 0; offset < queries.length; offset += batchSize) {
      const batch = queries.slice(offset, offset + batchSize);
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: batch,
          libraryId: elements.library.value,
          turnstileToken: offset === 0 ? state.turnstileToken : ""
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `검색 서버 오류 (${response.status})`);
      }
      await readNdjson(response, queries.length, offset);
    }
    updateSummary(state.results.filter(Boolean).length, queries.length);
    elements.excelButton.disabled = !state.results.filter(Boolean).length;
  } catch (error) {
    showError(error.message || "검색 중 오류가 발생했습니다.");
  } finally {
    state.searching = false;
    elements.searchButton.classList.remove("loading"); elements.buttonLabel.textContent = "도서 검색하기";
    if (window.turnstile && state.turnstileWidgetId !== null) window.turnstile.reset(state.turnstileWidgetId);
    state.turnstileToken = ""; updateCount();
  }
}

function downloadExcel() {
  const headers = ["상태", "ISBN/검색어", "서명", "저작자", "발행자", "발행년", "자료실", "등록번호", "청구기호", "권수"];
  const rows = state.results.filter(Boolean).map((result) => [
    statusInfo(result.status)[0], result.isbn || result.query, result.title, result.author, result.publisher,
    result.year, result.room, result.registration, result.callNumber, result.count ?? ""
  ]);
  const blob = createXlsx(headers, rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  link.href = url; link.download = `화성시도서관_검색결과_${date}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function setupTurnstile(siteKey) {
  elements.turnstileArea.hidden = false;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true; script.defer = true; script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  state.turnstileWidgetId = window.turnstile.render(elements.turnstileWidget, {
    sitekey: siteKey,
    theme: "light",
    callback: (token) => { state.turnstileToken = token; showError(); },
    "expired-callback": () => { state.turnstileToken = ""; }
  });
}

async function initialize() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("설정을 불러올 수 없습니다.");
    state.config = await response.json();
    elements.library.replaceChildren(...state.config.libraries.map((library) => {
      const option = document.createElement("option"); option.value = library.id; option.textContent = library.name; return option;
    }));
    elements.library.value = "ALL"; elements.library.disabled = false;
    if (!state.config.apiReady) {
      elements.setupWarning.textContent = "도서관정보나루 API 키가 아직 서버에 설정되지 않아 검색할 수 없습니다.";
      elements.setupWarning.hidden = false;
    }
    if (state.config.turnstileSiteKey) await setupTurnstile(state.config.turnstileSiteKey);
  } catch (error) {
    showError(error.message || "초기 설정 중 오류가 발생했습니다.");
  } finally { updateCount(); }
}

elements.queries.addEventListener("input", updateCount);
elements.exampleButton.addEventListener("click", () => { elements.queries.value = "9791160079104\n모순"; updateCount(); elements.queries.focus(); });
elements.form.addEventListener("submit", submitSearch);
elements.excelButton.addEventListener("click", downloadExcel);
initialize();
