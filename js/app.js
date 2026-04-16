/* =============================================================================
   js/app.js — 앱 진입점 (window.onload)
   · partials 주입 완료 후 초기화 시작
   · KB 금리 로드 → 스케줄 최대 높이 설정 → 부채 항목 1개 추가
   · 하드 새로고침 (캐시 초기화 포함)
   · URL 세탁 (_r 파라미터 제거)
   · 의존: 모든 다른 JS 파일들 (마지막에 로드되어야 함)
   ============================================================================= */

// ─── 주소창 세탁 (index.html 직접 접근 시) ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.href.includes('index.html')) {
    window.history.replaceState(null, '', window.location.href.split('index.html')[0]);
  }
  // URL ?_r 파라미터 정리 (하드 새로고침 후)
  const url = new URL(window.location.href);
  if (url.searchParams.has('_r')) {
    url.searchParams.delete('_r');
    history.replaceState(null, '', url.pathname + (url.search !== '?' ? url.search : ''));
  }
});

// ─── 앱 초기화 ────────────────────────────────────────────────────────────────
window.onload = async function () {
  // partials 주입 완료 대기 (loader.js 가 먼저 로드된 경우)
  if (window.__partialsReady) await window.__partialsReady;

  // 테마 / 모달 / UI 초기화
  applySystemTheme();
  initNotice();
  addLoan();

  // 모달 확인 버튼 연결
  const confirmBtn = document.getElementById('modalConfirm');
  if (confirmBtn) confirmBtn.onclick = handleModalConfirm;

  // 스케줄 최대 높이 CSS 변수 적용
  document.documentElement.style.setProperty('--schedule-max-height', _C.SCHEDULE_MAX_HEIGHT_PX + 'px');

  // 리포트 발급 카운터 뱃지 초기화
  initCopyBtn();

  // 분석 완료 시 부채 카운트 동기화 (report.js 의 재분석 판별용)
  // calculateLogic() 결과 렌더링 직후 호출
  const _origCalcLogic = window.calculateLogic;
  if (typeof calculateLogic === 'function') {
    const _origFn = calculateLogic;
    window.calculateLogic = function() {
      _origFn.apply(this, arguments);
      if (typeof _syncLoanCount === 'function') _syncLoanCount();
    };
  }

  // ─── 관리자 세션 체크 ────────────────────────────────────────────────────
  // ★ 외부 js/admin.js 에 의존하지 않고 app.js 에 직접 내장
  //    → js/admin.js 로드 실패 / 미배포 상황에서도 반드시 동작 보장
  (function checkAdminSession() {
    try {
      // 고객 낙인 확인
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

  // js/admin.js 에도 checkAdminAuth 가 있으면 호환성 유지
  if (typeof checkAdminAuth === 'function') checkAdminAuth();

  // ★★★ Service Worker 등록 (PWA 설치 필수 조건) ★★★
  // beforeinstallprompt 이벤트는 SW 활성 상태일 때만 발생
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => {
        console.log('[app.js] ✅ Service Worker 등록 OK (scope:', reg.scope + ')');
      })
      .catch(err => {
        console.warn('[app.js] ⚠ Service Worker 등록 실패:', err?.message);
      });
  }

  // PWA 설치 프롬프트 캐치 (index.html 에서도 설치 가능하도록)
  window._deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    console.log('[app.js] ✅ beforeinstallprompt 이벤트 발생');
    e.preventDefault();
    window._deferredPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    console.log('[app.js] ✅ PWA 설치 완료');
    window._deferredPrompt = null;
  });

  // KB 금리 자동 로드
  if (typeof applyKBRatesToConfig === 'function') {
    _showLoading(true);
    try {
      await applyKBRatesToConfig();
      _syncAllRateSelects();
    } finally {
      _showLoading(false);
    }
  }
};

/** 로딩 오버레이 표시/숨김 */
// _showLoading: common.js 에 정의됨

// ─── 하드 새로고침 ────────────────────────────────────────────────────────────
// ── 단계 카드 활성/완료 헬퍼 ────────────────────────────────────────────────
function _lstepActive(id, subText) {
  // 이전 단계 done 처리
  const steps = ['lstep1','lstep2','lstep3'];
  const idx   = steps.indexOf(id);
  steps.slice(0, idx).forEach(sid => {
    const el = document.getElementById(sid);
    if (el) { el.classList.remove('active'); el.classList.add('done'); }
  });
  // 현재 단계 active
  const cur = document.getElementById(id);
  if (cur) cur.classList.add('active');
  // 서브 텍스트 업데이트
  const sub = document.getElementById('loadingSub');
  if (sub && subText) sub.textContent = subText;
}

async function hardRefresh() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // 모든 단계 초기화
  ['lstep1','lstep2','lstep3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active','done');
  });

  try {
    // ① 서비스 워커 업데이트
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

    // ③ 최신 금리 불러오기
    _lstepActive('lstep3', 'KB 금리 정보를 최신 상태로 갱신합니다.');
    await new Promise(r => setTimeout(r, 700));

    // 완료 후 리로드
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
