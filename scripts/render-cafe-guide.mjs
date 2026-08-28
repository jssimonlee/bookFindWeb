import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sharpModule = process.env.RENDER_SHARP_PATH;
if (!sharpModule) throw new Error("RENDER_SHARP_PATH 환경 변수가 필요합니다.");
const { default: sharp } = await import(pathToFileURL(sharpModule).href);

const projectRoot = path.resolve(import.meta.dirname, "..");
const screenshotPath = path.join(projectRoot, "docs", "hsbook-site-viewport.png");
const outputPath = path.join(projectRoot, "docs", "naver-cafe-guide.png");
const screenshot = await sharp(screenshotPath)
  .extract({ left: 0, top: 0, width: 1280, height: 750 })
  .png()
  .toBuffer();
const screenshotUrl = `data:image/png;base64,${screenshot.toString("base64")}`;

const svg = `
<svg width="1080" height="2000" viewBox="0 0 1080 2000" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#edf4fd"/><stop offset="1" stop-color="#edf2f8"/></linearGradient>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#173f78"/><stop offset=".6" stop-color="#2164b2"/><stop offset="1" stop-color="#4d8dd1"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="13" flood-color="#25446b" flood-opacity=".13"/></filter>
    <style>
      text { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
      .ink { fill: #162033; } .muted { fill: #52657c; } .blue { fill: #205aa1; }
      .card { fill: #fff; stroke: #d6e1ee; stroke-width: 2; }
      .title { font-size: 30px; font-weight: 800; letter-spacing: -1px; }
      .body { font-size: 20px; } .small { font-size: 17px; }
    </style>
  </defs>
  <rect width="1080" height="2000" fill="url(#bg)"/>
  <rect width="1080" height="340" fill="url(#hero)"/>
  <text x="70" y="82" fill="#cce3ff" font-size="24" font-weight="800">화성시 도서관 · 구매 전 소장 확인</text>
  <text x="70" y="150" fill="#fff" font-size="49" font-weight="900" letter-spacing="-2">구입하려는 책,</text>
  <text x="70" y="217" fill="#fff" font-size="44" font-weight="900" letter-spacing="-2">이미 도서관에 있는지 먼저 확인하세요</text>
  <text x="70" y="285" fill="#e5f1ff" font-size="24">ISBN 목록을 한 번에 검색해 중복 구매를 줄이는 무료 웹 도구입니다.</text>
  <rect x="885" y="70" width="125" height="125" rx="34" fill="#ffffff" fill-opacity=".13" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>
  <text x="947" y="155" fill="#fff" text-anchor="middle" font-size="57" font-weight="900">책</text>

  <rect class="card" x="55" y="380" width="640" height="170" rx="23" filter="url(#shadow)"/>
  <text class="blue" x="85" y="428" font-size="25" font-weight="800">이 사이트의 목적</text>
  <text class="ink body" x="85" y="468"><tspan x="85">도서 구매 전에 선택한 화성시 도서관의 소장 여부를</tspan><tspan x="85" dy="34">확인하여 이미 있는 책을 구매 대상에서 제외합니다.</tspan></text>
  <rect x="715" y="380" width="310" height="170" rx="23" fill="#e8f3ff" stroke="#cfe1f5" stroke-width="2" filter="url(#shadow)"/>
  <text x="870" y="450" text-anchor="middle" class="blue" font-size="35" font-weight="900">최대 500권</text>
  <text x="870" y="493" text-anchor="middle" class="muted" font-size="20">ISBN을 한 번에 확인</text>

  <rect x="58" y="592" width="8" height="31" rx="4" fill="#2364ac"/><text class="ink title" x="82" y="620">기본 사용법</text>
  <rect class="card" x="55" y="645" width="970" height="585" rx="24" filter="url(#shadow)"/>
  <image href="${screenshotUrl}" x="70" y="660" width="940" height="551" preserveAspectRatio="xMidYMid slice"/>
  <g font-size="24" font-weight="900" text-anchor="middle" fill="#fff">
    <circle cx="137" cy="835" r="27" fill="#ec5b45" stroke="#fff" stroke-width="5"/><text x="137" y="844">1</text>
    <circle cx="603" cy="825" r="27" fill="#ec5b45" stroke="#fff" stroke-width="5"/><text x="603" y="834">2</text>
    <circle cx="415" cy="1115" r="27" fill="#ec5b45" stroke="#fff" stroke-width="5"/><text x="415" y="1124">3</text>
  </g>

  <g>
    <rect class="card" x="55" y="1260" width="477" height="135" rx="20"/>
    <rect x="77" y="1283" width="45" height="45" rx="13" fill="#2364ac"/><text x="99" y="1315" text-anchor="middle" fill="#fff" font-size="22" font-weight="900">1</text>
    <text class="ink" x="140" y="1308" font-size="22" font-weight="800">ISBN 붙여넣기</text>
    <text class="muted small" x="140" y="1340"><tspan x="140">한 줄에 한 권씩 입력합니다.</tspan><tspan x="140" dy="28">공백·탭·하이픈·따옴표는 자동 정리됩니다.</tspan></text>

    <rect class="card" x="548" y="1260" width="477" height="135" rx="20"/>
    <rect x="570" y="1283" width="45" height="45" rx="13" fill="#2364ac"/><text x="592" y="1315" text-anchor="middle" fill="#fff" font-size="22" font-weight="900">2</text>
    <text class="ink" x="633" y="1308" font-size="22" font-weight="800">도서관 선택</text>
    <text class="muted small" x="633" y="1340"><tspan x="633">전체도서관 또는 확인할 개별 도서관을</tspan><tspan x="633" dy="28">선택합니다.</tspan></text>

    <rect class="card" x="55" y="1412" width="477" height="135" rx="20"/>
    <rect x="77" y="1435" width="45" height="45" rx="13" fill="#2364ac"/><text x="99" y="1467" text-anchor="middle" fill="#fff" font-size="22" font-weight="900">3</text>
    <text class="ink" x="140" y="1460" font-size="22" font-weight="800">소장 여부 확인</text>
    <text class="muted small" x="140" y="1492"><tspan x="140">버튼을 누르면 입력 순서대로 결과가</tspan><tspan x="140" dy="28">표시되고 책 제목에서 상세 검색이 열립니다.</tspan></text>

    <rect class="card" x="548" y="1412" width="477" height="135" rx="20"/>
    <rect x="570" y="1435" width="45" height="45" rx="13" fill="#2364ac"/><text x="592" y="1467" text-anchor="middle" fill="#fff" font-size="22" font-weight="900">4</text>
    <text class="ink" x="633" y="1460" font-size="22" font-weight="800">Excel 다운로드</text>
    <text class="muted small" x="633" y="1492"><tspan x="633">검색 결과를 순번과 상태가 포함된</tspan><tspan x="633" dy="28">엑셀 파일로 저장할 수 있습니다.</tspan></text>
  </g>

  <rect x="55" y="1575" width="970" height="128" rx="22" fill="#eaf4ff" stroke="#c7dcf6" stroke-width="2"/>
  <text class="blue" x="82" y="1618" font-size="22" font-weight="800">선택 기능 · 사서제한 도서까지 함께 검색</text>
  <text class="muted small" x="82" y="1652"><tspan x="82">개별 도서관을 선택하고 도서관정보나루의 최신 월간 장서 파일을 등록하면 공개 홈페이지에서</tspan><tspan x="82" dy="28">보이지 않는 책도 비교할 수 있습니다. 최근 구매 목록도 함께 등록할 수 있습니다.</tspan></text>

  <rect x="58" y="1740" width="8" height="31" rx="4" fill="#2364ac"/><text class="ink title" x="82" y="1768">검색 결과 표시</text>
  <g text-anchor="middle">
    <rect class="card" x="55" y="1795" width="232" height="100" rx="17"/><text x="171" y="1833" fill="#17804d" font-size="20" font-weight="800">소장</text><text x="171" y="1865" class="muted" font-size="15">홈페이지에서 확인</text>
    <rect class="card" x="301" y="1795" width="232" height="100" rx="17"/><text x="417" y="1833" fill="#2464ae" font-size="20" font-weight="800">최근 구매</text><text x="417" y="1865" class="muted" font-size="15">구매 목록에서 확인</text>
    <rect class="card" x="547" y="1795" width="232" height="100" rx="17"/><text x="663" y="1833" fill="#aa6912" font-size="20" font-weight="800">사서제한 추정</text><text x="663" y="1865" class="muted" font-size="15">월간 장서 파일에서 확인</text>
    <rect class="card" x="793" y="1795" width="232" height="100" rx="17"/><text x="909" y="1833" fill="#596579" font-size="20" font-weight="800">미소장</text><text x="909" y="1865" class="muted" font-size="15">선택 범위에서 미확인</text>
  </g>

  <rect x="55" y="1925" width="970" height="62" rx="18" fill="#173f78"/>
  <text x="82" y="1965" fill="#fff" font-size="25" font-weight="800">hsbook.pages.dev</text>
  <text x="998" y="1963" text-anchor="end" fill="#d7e8fa" font-size="17">회원가입 없이 바로 사용</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outputPath);
console.log(outputPath);
