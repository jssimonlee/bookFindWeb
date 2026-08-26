# 화성시 도서관 책 찾기

ISBN 또는 책 제목으로 화성시 도서관 소장 자료를 검색하는 Cloudflare Pages 웹 애플리케이션입니다.

## 검색 방식

1. 화성시 도서관 공개 검색에서 먼저 조회합니다.
2. 선택한 개별 도서관에서 ISBN이 검색되지 않으면 도서관정보나루 `itemSrch` API로 다시 조회합니다.
3. 정보나루에만 존재하는 자료는 확정 상태가 아닌 **사서제한 추정**으로 표시합니다.

제목 검색과 `전체도서관` 검색은 화성시 도서관 검색 결과만 사용합니다. 정보나루 보조 검색은 ISBN과 개별 도서관을 선택했을 때만 수행됩니다.

## 제공 기능

- ISBN 10자리·13자리 또는 책 제목 검색
- 줄 단위 다중 검색(한 번에 최대 200건, 내부적으로 20건씩 안전하게 분할)
- 최신 화성시 도서관 32개관과 전체도서관 선택
- 신규 도서관의 정보나루 코드 자동 탐색
- 실제 진행률과 결과 스트리밍
- 소장·사서제한 추정·미소장·오류 상태 구분
- 검색 결과를 실제 `.xlsx` 파일로 다운로드
- 반응형 모바일 화면
- 선택적 Cloudflare Turnstile 보호와 기본 요청 제한

절판 검색과 네이버 도서 API 기능은 포함하지 않습니다.

## 로컬 실행

Node.js 20 이상이 필요합니다.

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
```

`.dev.vars`의 `DATA4LIBRARY_API_KEY`에 새 인증키를 넣은 다음 실행합니다.

```powershell
npm run dev
```

기본 주소는 `http://localhost:8788`입니다. `.dev.vars`는 Git에서 제외되어 있습니다. 인증키가 들어간 파일은 절대 커밋하지 마세요.

테스트는 다음 명령으로 실행합니다.

```powershell
npm test
```

## Cloudflare Pages 무료 배포

### 1. GitHub 저장소 연결

이 폴더를 GitHub 저장소에 올린 후 Cloudflare 대시보드에서 다음 순서로 연결합니다.

1. **Workers & Pages → Create application → Pages → Import an existing Git repository**
2. Production branch: `main`
3. Framework preset: `None`
4. Build command: 비워 두기
5. Build output directory: `public`
6. Root directory: 저장소 최상위 폴더

`functions` 폴더는 Cloudflare Pages Functions로 자동 배포됩니다.

### 2. API 키를 Secret으로 설정

Pages 프로젝트의 **Settings → Variables and Secrets**에서 다음 값을 추가합니다.

| 이름 | 종류 | 값 |
|---|---|---|
| `DATA4LIBRARY_API_KEY` | Secret/Encrypt | 새 도서관정보나루 인증키 |
| `TURNSTILE_SITE_KEY` | 일반 변수 | Turnstile 사이트 키 |
| `TURNSTILE_SECRET_KEY` | Secret/Encrypt | Turnstile 비밀 키 |

Production과 Preview 환경을 각각 확인하고, 변수를 저장한 다음 다시 배포합니다. API 인증키를 HTML, JavaScript 또는 `wrangler.jsonc`에 직접 넣으면 안 됩니다.

### 3. 공개 서비스용 Turnstile 설정

Cloudflare의 **Turnstile → Add widget**에서 무료 위젯을 만든 뒤 다음 호스트를 등록합니다.

- 배포된 `프로젝트명.pages.dev`
- 사용하는 사용자 정의 도메인

발급된 사이트 키와 비밀 키를 위 표의 환경 변수로 설정합니다. 두 값을 설정하면 검색 화면에 Turnstile이 자동으로 나타나며, 서버에서도 토큰을 검증합니다.

### 4. 선택 사항: 무료 WAF 속도 제한

사용자 정의 도메인을 Cloudflare에 연결한 경우 무료 WAF Rate Limiting 규칙 한 개를 `/api/search`에 적용하는 것을 권장합니다.

- 경로: `/api/search`
- 기준: IP
- 예시 임계값: 10초 동안 10회
- 조치: 10초 동안 Block

애플리케이션 내부에도 IP별 분당 12회의 기본 제한이 있지만 서버리스 인스턴스마다 나뉘는 보조 장치입니다. 공개 서비스에서는 Turnstile을 주 보호 수단으로 사용하세요.

## 무료 플랜에 맞춘 제한

- Cloudflare Workers 무료 플랜의 요청 한도에 맞춰 정적 파일은 Function을 거치지 않습니다.
- `/api/*`만 Pages Functions로 라우팅합니다.
- 화면에서는 최대 200개의 검색어를 받고, Cloudflare 외부 호출 제한을 지키기 위해 요청당 20개씩 분할합니다.
- Turnstile 인증 성공 후 15분 동안 암호화 서명된 HttpOnly 세션을 사용하므로 분할 요청마다 다시 인증할 필요가 없습니다.
- 외부 요청은 순차 처리하고 12초 타임아웃을 적용합니다.
- 별도 데이터베이스, KV, 유료 서비스는 사용하지 않습니다.

## 결과 상태

| 상태 | 의미 |
|---|---|
| 소장 | 화성시 도서관 공개 검색에서 확인됨 |
| 사서제한 추정 | 공개 검색에는 없고 정보나루에는 있음 |
| 미소장 | 두 검색 모두에서 확인되지 않음 |
| 확인 제한 | 해당 도서관의 정보나루 코드를 확인할 수 없음 |
| 검색 오류 | 외부 사이트 또는 API 연결 실패 |

화성시 도서관과 정보나루의 데이터 갱신 시점이 다를 수 있으므로, 결과 화면에서 화성시 도서관 검색 링크를 열어 최종 상태를 다시 확인해야 합니다.

## 주요 파일

```text
public/                 정적 웹 화면과 Excel 생성 코드
functions/api/          Cloudflare Pages Functions API
server/libraries.js     화성시 도서관 코드·별칭 목록
server/search.js        화성시 검색 및 정보나루 보조 검색
test/                   파서·검색 흐름·XLSX 테스트
wrangler.jsonc          Cloudflare 로컬/배포 설정
```
