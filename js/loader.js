/* =============================================================================
   js/loader.js — HTML Partial 주입기
   ─────────────────────────────────────────────────────────────────────────────
   · GitHub Pages 정적 환경에서 서버 include 를 대체합니다
   · <div data-partial="partials/modals.html"></div> 형태의 플레이스홀더를
     fetch 로 읽어 innerHTML 로 주입합니다
   · window.__partialsReady (Promise) 가 완료된 뒤 앱이 초기화됩니다
   ─────────────────────────────────────────────────────────────────────────────
   사용법 (index.html):
     <div data-partial="partials/modals.html"></div>
     <div data-partial="partials/guide.html"></div>
     <div data-partial="partials/notice.html"></div>
   ============================================================================= */

window.__partialsReady = (async () => {
  const targets = document.querySelectorAll('[data-partial]');
  if (!targets.length) return;

  await Promise.all([...targets].map(async el => {
    const src = el.dataset.partial;
    try {
      const res  = await fetch(src + '?_v=' + (window._ASSET_VER || 'dev'));
      if (!res.ok) throw new Error(`${src} → HTTP ${res.status}`);
      el.innerHTML = await res.text();
    } catch (e) {
      console.warn('[loader] partial 로드 실패:', src, e);
    }
  }));
})();
