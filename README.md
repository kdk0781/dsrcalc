# KB DSR 계산기 — 파일 구조 가이드

> **버전:** 2026.05-C | **리팩토링:** 2026년 3월

---

## 📁 폴더 구조

```
kb/dsrcalc/
│
├── index.html          ← 메인 페이지 (뼈대만 — partials 자동 주입)
├── admin.html          ← 관리자 로그인 페이지
├── share.html          ← 앱 설치 1회성 링크 게이트
├── report.html         ← DSR 진단 리포트 뷰어
│
├── common.css          ← CSS 진입점 (@import style.css)
├── style.css           ← 메인 테마 변수 · 공통 컴포넌트 (1778줄)
├── admin.css           ← 관리자 페이지 전용 스타일
│
├── app_main.json       ← PWA 매니페스트 (사용자용)
├── app_admin.json      ← PWA 매니페스트 (관리자용)
│
├── css/
│   ├── report.css      ← report.html 전용 스타일 (라이트/다크 테마 변수)
│   ├── share.css       ← share.html 전용 스타일
│   └── modal.css       ← 전화번호 워터마크 모달 전용 스타일
│
├── js/
│   ├── loader.js       ← partials 주입기 (index.html 에서 가장 먼저 로드)
│   ├── kb_rates.js     ← KB 금리 파서 · 캐시 관리
│   ├── config.js       ← APP_CONFIG 전역 설정 블록 ★ 주요 설정값 위치
│   ├── utils.js        ← 순수 유틸 함수 (getNum, calcPMT 등)
│   ├── modal.js        ← 모달 로직 (showAlert, 큐, 전화번호 모달)
│   ├── ui.js           ← UI 렌더링 (부채 항목, 금리 경고, 가이드, 공지)
│   ├── calc.js         ← DSR 연산 엔진 · 역행 계산기 · 추천 문구
│   ├── schedule.js     ← 상환 스케줄 렌더링
│   ├── report.js       ← 리포트 빌드 · HMAC OTL · 공유 (index.html 용)
│   ├── report-page.js  ← report.html 전용 렌더러 (HMAC 검증 · 애니메이션)
│   ├── admin.js        ← 관리자 UI (세션 체크, 링크 생성, 로그아웃)
│   ├── admin-login.js  ← admin.html 전용 로그인/설정 변경 로직
│   ├── share.js        ← share.html 전용 HMAC 검증 + PWA 설치
│   └── app.js          ← window.onload 진입점 (index.html 에서 마지막 로드)
│
└── partials/
    ├── guide.html      ← 사용자/관리자 가이드 모달 HTML
    ├── notice.html     ← 공지 팝업 HTML
    └── modals.html     ← 알림·전화번호·로그아웃 모달 HTML
```

---

## ⚙️ 주요 설정 위치

| 변경 사항 | 파일 | 위치 |
|---|---|---|
| 금리 기본값 · 규제선 · 리포트 만료일 | `js/config.js` | `APP_CONFIG` 블록 |
| 공지 팝업 강제 노출 | `js/config.js` | `NOTICE_VERSION` 올림 |
| 공지 팝업 내용 변경 | `partials/notice.html` | 텍스트 직접 수정 |
| 앱 설치 링크 유효시간 | `js/admin.js` | `SHARE_LINK_TTL_MS` |
| 리포트 일일 발급 한도 | `js/config.js` | `REPORT_COPY_DAILY_LIMIT` |
| HMAC 서명 키 변경 | `js/report.js` + `js/share.js` | `_OTL_SIGN_KEY` (두 파일 동시 수정) |
| 관리자 초기 비밀번호 | `js/admin-login.js` | `DEFAULT_CONFIG.pw` |
| JS/CSS 캐시 갱신 | `index.html` 하단 | `?v=` 쿼리 값 올림 |

---

## 🔄 캐시 갱신 방법

JS/CSS 파일 수정 후 `index.html` 하단의 `?v=` 값을 수정 날짜로 올립니다.

```html
<!-- 예: 2026년 3월 30일 수정 → v=2603301200 형식 -->
<script src="js/config.js?v=2603301200"></script>
```

`kb_rates.js?v=` 를 올리면 KB 금리 캐시(localStorage)도 자동 무효화됩니다.

---

## 🔐 보안 키 동기화

아래 3곳의 `_OTL_SIGN_KEY` 는 항상 동일한 값이어야 합니다.

```
js/report.js      const _OTL_SIGN_KEY = 'KB_DSR_OTL_SIGN_2026';
js/share.js       const _OTL_SIGN_KEY = 'KB_DSR_OTL_SIGN_2026';
js/report-page.js const _RPT_SIGN_KEY = 'KB_DSR_OTL_SIGN_2026';
```

키를 바꾸면 기존 발급된 **모든 링크가 즉시 무효화**됩니다.

---

## 📦 partials 동작 방식

`js/loader.js` 가 `DOMContentLoaded` 전에 `[data-partial]` 속성을 가진 `<div>` 를
`fetch` 로 읽어 `innerHTML` 로 주입합니다.

```html
<!-- index.html -->
<div data-partial="partials/guide.html"></div>
<div data-partial="partials/notice.html"></div>
<div data-partial="partials/modals.html"></div>
```

공지 내용을 바꾸려면 `partials/notice.html` 만 수정하면 됩니다.

---

*KB DSR 계산기 © 2026*
