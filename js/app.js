/* =============================================================================
   js/app.js — 앱 진입점 (window.onload)  VER 2026.07
   · partials 주입 완료 후 초기화
   · ★ 변경: KB 금리 로드를 addLoan() 보다 먼저 수행 (레이스 컨디션 제거)
   · 하드 새로고침 (캐시 초기화 포함)
   · URL 세탁 (_r 파라미터 제거)
   · 의존: 모든 다른 JS 파일들 (마지막에 로드되어야 함)
   ============================================================================= */

// ─── 주소창 세탁 (index.html 직접 접근 시) ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.href.includes('index.html')) {
    window.history.replaceState(null, '', window.location.href.split('index.html')[0]);
  }
  const url = new URL(window.location.href);
  if (url.searchParams.has('_r')) {
    url.searchParams.delete('_r');
    history.replaceState(null, '', url.pathname + (url.search !== '?' ? url.search : ''));
  }
});

// ─── 앱 초기화 ────────────────────────────────────────────────────────────────
window.onload = async function () {
  // partials 주입 완료 대기
  if (window.__partialsReady) await window.__partialsReady;

  // 테마 / 모달 초기화
  applySystemTheme();
  initNotice();

  // 모달 확인 버튼 연결
  const confirmBtn = document.getElementById('modalConfirm');
  if (confirmBtn) confirmBtn.onclick = handleModalConfirm;

  // 스케줄 최대 높이 CSS 변수 적용
  document.documentElement.style.setProperty('--schedule-max-height', _C.SCHEDULE_MAX_HEIGHT_PX + 'px');

  // 리포트 발급 카운터 뱃지 초기화
  if (typeof initCopyBtn === 'function') initCopyBtn();

  // calculateLogic 후크 (재분석 카운트 동기화)
  if (typeof calculateLogic === 'function') {
    const _origFn = calculateLogic;
    window.calculateLogic = function() {
      _origFn.apply(this, arguments);
      if (typeof _syncLoanCount === 'function') _syncLoanCount();
    };
  }

  // ─── 관리자 세션 체크 ────────────────────────────────────────────────────
  (function checkAdminSession() {
    try {
      if (localStorage.getItem('kb_guest_mode') === 'true') return;
      var sessionStr = localStorage.getItem('kb_admin_session');
      if (!sessionStr) return;
      var session = JSON.parse(sessionStr);
      if (session && session.isAuth && Date.now() < session.expires) {
        var el = document.getElementById('adminShareContainer');
        if (el) el.style.display = 'block';
      } else {
        localStorage.removeItem('kb_admin_session');
      }
    } catch (e) {}
  })();
  if (typeof checkAdminAuth === 'function') checkAdminAuth();

  // ─── ★ KB 금리 자동 로드 (addLoan 보다 먼저!) ────────────────────────────
  // 이전: addLoan() → applyKBRatesToConfig() → _syncAllRateSelects()
  //   문제: 첫 부채 항목이 폴백 금리로 그려짐
  // 변경: applyKBRatesToConfig() → addLoan() → _syncAllRateSelects()
  //   결과: 첫 부채 항목부터 정확한 금리 표시
  if (typeof applyKBRatesToConfig === 'function') {
    _showLoading(true);
    try {
      await applyKBRatesToConfig();
    } catch (e) {
      console.warn('[app] 금리 로드 중 오류 — 폴백값 사용', e);
    } finally {
      _showLoading(false);
    }
  }

  // 첫 부채 항목 추가 (이제 정확한 금리로 표시됨)
  addLoan();

  // 셀렉트 텍스트 동기화 (안전망)
  if (typeof _syncAllRateSelects === 'function') _syncAllRateSelects();

  // 금리 신선도 배지 렌더링 (ui.js 에 정의된 경우)
  if (typeof _renderRateBadge === 'function') _renderRateBadge();
};

/** 로딩 오버레이 표시/숨김 — common.js / 레거시 호환 */
function _showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  overlay.style.display = show ? 'flex' : 'none';
  document.body.style.overflow = show ? 'hidden' : '';
}

// ─── 단계 카드 활성/완료 헬퍼 ────────────────────────────────────────────────
function _lstepActive(id, subText) {
  const steps = ['lstep1','lstep2','lstep3'];
  const idx   = steps.indexOf(id);
  steps.slice(0, idx).forEach(sid => {
    const el = document.getElementById(sid);
    if (el) { el.classList.remove('active'); el.classList.add('done'); }
  });
  const cur = document.getElementById(id);
  if (cur) cur.classList.add('active');
  const sub = document.getElementById('loadingSub');
  if (sub && subText) sub.textContent = subText;
}

// ─── 하드 새로고침 ────────────────────────────────────────────────────────────
async function hardRefresh() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  ['lstep1','lstep2','lstep3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active','done');
  });

  try {
    // ① 서비스 워커 해제
    _lstepActive('lstep1', 'Service Worker를 최신 버전으로 업데이트합니다.');
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
    }
    await new Promise(r => setTimeout(r, 500));

    // ② 브라우저 캐시 삭제
    _lstepActive('lstep2', '브라우저 캐시를 초기화합니다.');
    if (typeof clearKBRatesCache === 'function') await clearKBRatesCache();
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    await new Promise(r => setTimeout(r, 500));

    // ③ 최신 금리 (재로드 후 페이지 자체가 reload 되므로 여기서는 시각 효과)
    _lstepActive('lstep3', 'KB 금리 정보를 최신 상태로 갱신합니다.');
    await new Promise(r => setTimeout(r, 700));

    // 완료
    ['lstep1','lstep2','lstep3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('active'); el.classList.add('done'); }
    });
    const sub = document.getElementById('loadingSub');
    if (sub) sub.textContent = '완료! 새로고침합니다.';
    await new Promise(r => setTimeout(r, 400));

    const ts = Date.now();
    const url = new URL(window.location.href);
    url.searchParams.set('_r', ts);
    window.location.replace(url.toString());
  } catch (e) {
    console.warn('[hardRefresh] 일부 캐시 삭제 실패:', e);
    await new Promise(r => setTimeout(r, 600));
    window.location.reload();
  }
}

// ─── ESC 키로 가이드 모달 닫기 ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const guideModal = document.getElementById('guideModal');
    if (guideModal && guideModal.style.display !== 'none') closeGuide();
  }
});
