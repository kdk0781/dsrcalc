# DSR 계산기 — 금리 자동반영 안정화 패치 (2026.07)

## 🐛 진단된 핵심 문제

| # | 문제 | 위치 | 영향 |
|---|---|---|---|
| 1 | **파서 정규식이 중첩 `{}`에 취약** | `kb_rates.js _parseScript()` | `interest/script.js` 구조가 조금만 바뀌어도 파싱 실패 → **조용히 폴백값(4.88%) 적용** → 사용자는 "반영된 줄 알지만 사실은 폴백" |
| 2 | **캐시 TTL 30분이 너무 길다** | `kb_rates.js _KB_CACHE_MS` | `?v=` 변경 후에도 메모리/스토리지 캐시가 살아있어 즉시 반영 안 됨 |
| 3 | **app.js 레이스 컨디션** | `app.js window.onload` | `addLoan()`이 `applyKBRatesToConfig()` 보다 먼저 실행 → 첫 부채 항목이 폴백 금리로 그려짐 |
| 4 | **이상값 검증 부재** | 전반 | 파싱이 0이나 음수, 100%같은 이상값을 반환해도 그대로 적용 |

## ✅ 적용된 변경사항

### `kb_rates.js` 전면 개편
- **브레이스 카운팅 파서** (`_extractBlock`): 중첩 `{}` 구조에 견고
- **TTL 단축**: 30분 → **5분** (즉시성 ↑)
- **합리성 검증** (`_validateRates`): 0.1~20% 범위 외는 거부 → 자동 폴백
- **window._kbRatesMeta** 노출: 디버깅 메타데이터 (`source`, `parsedAt`, `error`, `cacheKey`)
- **컬러 콘솔 로그**: 🟢LIVE / 🔵CACHE / 🟡FALLBACK 한눈에 식별
- **랜덤 캐시 버스터**: `?_cb=타임스탬프_랜덤` (CDN 우회 강화)
- **검증 실패 캐시 자동 삭제**: 다음 로드에서 즉시 재시도

### `app.js` 초기화 순서 변경
```diff
- addLoan()
- await applyKBRatesToConfig()
- _syncAllRateSelects()
+ await applyKBRatesToConfig()  ← 먼저
+ addLoan()                      ← 정확한 금리로 표시
+ _syncAllRateSelects()
+ _renderRateBadge()             ← 신선도 배지
```

### `ui.js` 신선도 배지 추가 (고도화)
- 헤더에 `🟢 LIVE` / `🔵 CACHE` / `🟡 FALLBACK` 배지 표시
- 클릭 시 `hardRefresh()` 자동 호출 (캐시 초기화 + 새로고침)
- 마우스오버 시 파싱 시각 + 오류 사유 툴팁

### `index.html` 버전 갱신
- 모든 JS/CSS `?v=2604152030` 통일 → 배포 즉시 캐시 무효화

## 🛠 배포 방법

1. 4개 파일을 GitHub Pages 저장소에 덮어쓰기
   - `js/kb_rates.js`
   - `js/app.js`
   - `js/ui.js`
   - `index.html`
2. Commit → Push
3. 1~2분 후 배포 완료

## 🔍 동작 검증 방법

배포 후 사이트 접속 → **F12 콘솔** 열기:

```js
// 1. 적용된 금리 메타데이터 확인
window._kbRatesMeta
// → {source: 'live', parsedAt: '2026-04-15T...', cacheKey: 'kb_rates_2604152030'}

// 2. 실제 적용된 금리 확인
APP_CONFIG.KB_MORTGAGE_RATES.mortgage_level
// → {'5년변동': 5.14, '5년혼합': 5.14, ...}

// 3. 캐시 강제 삭제 후 재로드
clearKBRatesCache()
location.reload()
```

**헤더 배지가 🟢LIVE면 정상**, 🟡FALLBACK이면 콘솔 경고 메시지로 원인 추적 가능 (`fetch_failed` / `parse_failed`).

## 📅 향후 금리 변경 절차

1. `interest/script.js` 의 금리값 수정 → push
2. `dsrcalc/index.html` 의 `?v=` 값을 오늘 날짜로 업데이트 (예: `2604160930`) → push
3. 배포 완료 후 헤더 배지가 🟢LIVE인지 확인

이전과 달리, **TTL이 5분이라 `?v=` 변경 없이도 5분 내 자동 반영**됩니다. `?v=` 변경은 즉시 반영을 강제하고 싶을 때만 필요합니다.
