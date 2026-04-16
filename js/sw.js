/* =============================================================================
   sw.js — Service Worker (PWA 설치 조건 충족 + 캐싱 전략)  VER 2026.07
   ─────────────────────────────────────────────────────────────────────────────
   ★ 역할
     1. beforeinstallprompt 이벤트 발생을 위한 필수 조건 충족
     2. 오프라인 대응 (간단한 캐시 전략)
     3. 업데이트 시 자동 캐시 무효화

   ★ 전략: Network-First (항상 최신 버전 우선, 실패 시 캐시)
     → 관리자 파일 업로드 후 즉시 반영되도록
     → 오프라인일 때만 캐시 사용
   ============================================================================= */

const CACHE_NAME = 'dsrcalc-v2026.07.1';

// 기본 쉘(페이지 뼈대) 캐싱 — 오프라인 폴백용
const SHELL_FILES = [
  './',
  './index.html',
  './share.html',
  './report.html',
  './app_main.json',
  './ico/favicon-light.png'
];

// ─── install: 기본 쉘 캐싱 ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // 개별 파일 실패해도 install 은 성공시킴
        return Promise.all(
          SHELL_FILES.map(url =>
            cache.add(url).catch(err => console.warn('[sw] cache 실패:', url, err.message))
          )
        );
      })
      .then(() => self.skipWaiting())  // 새 버전 즉시 활성화
  );
});

// ─── activate: 구버전 캐시 정리 ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // 열려있는 모든 탭 즉시 제어
  );
});

// ─── fetch: Network-First 전략 ─────────────────────────────────────────────
// 항상 네트워크 우선 시도, 실패 시 캐시 사용
self.addEventListener('fetch', event => {
  const { request } = event;

  // GET 요청만 처리 (POST 는 건너뜀)
  if (request.method !== 'GET') return;

  // chrome-extension:// 이나 외부 도메인 요청은 건너뜀
  if (!request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // 성공 응답이면 캐시 업데이트
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 반환
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // 캐시도 없으면 index.html 폴백 (SPA 스타일)
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // 그것도 없으면 에러
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// ─── message: 외부 제어 (하드 새로고침 연동) ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => event.ports[0]?.postMessage({ ok: true }));
  }
});
