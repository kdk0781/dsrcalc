/* =============================================================================
   share.js — DSR 계산기 임시 링크 검증 + PWA 설치 안내  VER 2026.07-STRICT
   ─────────────────────────────────────────────────────────────────────────────
   ★ v2026.07-STRICT 변경사항
     · Firebase claimToken 호출하여 일회성 차단 활성화
     · nonce 있는 토큰은 Firebase 검증 필수
     · 사유별 에러 메시지 (expired / used_other / not_found)

   ★ loadingCard 는 HTML에서 기본 표시 상태
     JS가 validateToken() 후 mainCard 또는 errorCard 로 전환
   ★ ES5 호환 (async/await, const/let, ?. 없음)
   ============================================================================= */

console.log('[share.js] v2026.07-STRICT 로드됨');

var deferredPrompt = null;

// ─── 카드 전환 ───────────────────────────────────────────────────────────────
// loadingCard / mainCard / errorCard 중 하나만 표시
function _showCard(id) {
  var ids = ['loadingCard', 'mainCard', 'errorCard'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.style.display = (ids[i] === id) ? 'block' : 'none';
  }
}

// ─── 토큰 파싱 ───────────────────────────────────────────────────────────────
// admin.js _toUrlSafeB64 와 정확히 대응:
//   encode: btoa(encodeURIComponent(str)).replace(+,-).replace(/,_).stripPad
//   decode: token.replace(-,+).replace(_,/) + padding → atob → decodeURIComponent
function _parseToken(token) {
  if (!token || typeof token !== 'string') return null;

  // 시도 1: URL-safe base64 (신형 — admin.js _toUrlSafeB64)
  try {
    var b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    var p1 = JSON.parse(decodeURIComponent(atob(b64)));
    if (p1 && typeof p1.exp === 'number') return p1;
  } catch(e1) {}

  // 시도 2: 표준 base64 (구형 호환)
  try {
    var p2 = JSON.parse(decodeURIComponent(atob(token)));
    if (p2 && typeof p2.exp === 'number') return p2;
  } catch(e2) {}

  return null;
}

// ─── 사유별 에러 메시지 (Firebase 차단 사유) ─────────────────────────────────
function _showErrorWithReason(reason) {
  var ec = document.getElementById('errorCard');
  if (!ec) { _showCard('errorCard'); return; }

  var titleEl = ec.querySelector('.error-title');
  var descEl  = ec.querySelector('.error-desc');

  // 사유별 메시지 매핑
  var msgs = {
    'expired': {
      title: '\uc720\ud6a8\uae30\uac04 \ub9cc\ub8cc',
      desc:  '\ud574\ub2f9 \ub9c1\ud06c\ub294 \uc720\ud6a8\uae30\uac04(24\uc2dc\uac04)\uc774 \ub9cc\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4.<br>\ub2f4\ub2f9\uc790\uc5d0\uac8c \uc0c8\ub85c\uc6b4 \ub9c1\ud06c\ub97c \uc694\uccad\ud574\uc8fc\uc138\uc694.'
    },
    'used_other': {
      title: '\ub2e4\ub978 \uae30\uae30\uc5d0\uc11c \uc0ac\uc6a9\ub41c \ub9c1\ud06c',
      desc:  '\uc774 \ub9c1\ud06c\ub294 \uc774\ubbf8 \ub2e4\ub978 \uae30\uae30\uc5d0\uc11c \uc0ac\uc6a9\ub418\uc5c8\uc2b5\ub2c8\ub2e4.<br>\ubcf8\uc778\uc758 \uae30\uae30\uc5d0\uc11c\ub9cc \uc0ac\uc6a9 \uac00\ub2a5\ud569\ub2c8\ub2e4.<br><br>\ub2f4\ub2f9\uc790\uc5d0\uac8c \uc0c8\ub85c\uc6b4 \ub9c1\ud06c\ub97c \uc694\uccad\ud574\uc8fc\uc138\uc694.'
    },
    'not_found': {
      title: '\uc720\ud6a8\ud558\uc9c0 \uc54a\uc740 \ub9c1\ud06c',
      desc:  '\ud574\ub2f9 \ub9c1\ud06c \uc815\ubcf4\ub97c \ud655\uc778\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.<br>\ub2f4\ub2f9\uc790\uc5d0\uac8c \uc0c8\ub85c\uc6b4 \ub9c1\ud06c\ub97c \uc694\uccad\ud574\uc8fc\uc138\uc694.'
    }
  };
  var m = msgs[reason] || msgs['not_found'];
  if (titleEl) titleEl.textContent = m.title;
  if (descEl)  descEl.innerHTML    = m.desc;
  _showCard('errorCard');
}

// ─── 토큰 검증 (Firebase 일회성 클레임 기반) ─────────────────────────────────
function validateToken() {
  try {
    var urlParams = new URLSearchParams(window.location.search);
    var token = urlParams.get('t');

    // ── 케이스 1: URL에 토큰 있음 ────────────────────────────────────────────
    if (token) {
      var payload = _parseToken(token);

      // 페이로드 파싱 실패 → 잘못된 토큰
      if (!payload || typeof payload.exp !== 'number') {
        _showErrorWithReason('not_found');
        return;
      }

      // 즉시 만료 체크 (네트워크 호출 전)
      if (Date.now() > payload.exp) {
        _showErrorWithReason('expired');
        return;
      }

      // ★ Firebase 클레임 (nonce 있는 신형 토큰만)
      // 구형 토큰(nonce 없음) → 만료 체크만으로 통과 (기존 동작 유지)
      if (payload.nonce && window.kbFirebase && window.kbFirebase.claimToken) {
        window.kbFirebase.claimToken(payload.nonce, payload.exp).then(function(result) {
          if (result.ok) {
            try { sessionStorage.setItem('kb_valid_share', 'true'); } catch(e) {}
            try { window.history.replaceState(null, '', 'share.html'); } catch(e) {}
            _showCard('mainCard');
            if (result.fallback) {
              console.warn('[share] Firebase fallback 모드로 통과 (일회성 차단 비활성)');
            } else if (result.firstClaim) {
              console.log('[share] 첫 클레임 — 이 디바이스에 토큰 귀속 완료');
            } else {
              console.log('[share] 같은 디바이스 재방문 — 정상 통과');
            }
          } else {
            _showErrorWithReason(result.reason || 'not_found');
          }
        }).catch(function(e) {
          // claimToken 자체가 throw — 비상 fallback
          console.error('[share] claimToken 예외:', e);
          try { sessionStorage.setItem('kb_valid_share', 'true'); } catch(e2) {}
          try { window.history.replaceState(null, '', 'share.html'); } catch(e2) {}
          _showCard('mainCard');
        });
      } else {
        // 구형 토큰 또는 Firebase 미로드 → 만료 체크만 (구버전 호환)
        try { sessionStorage.setItem('kb_valid_share', 'true'); } catch(e) {}
        try { window.history.replaceState(null, '', 'share.html'); } catch(e) {}
        _showCard('mainCard');
        if (!payload.nonce) console.log('[share] 구형 토큰 (nonce 없음) — 만료 체크만');
      }
      return;
    }

    // ── 케이스 2: 토큰 없지만 같은 세션 내 검증 통과 (PWA 설치 후 재진입 등) ──
    try {
      if (sessionStorage.getItem('kb_valid_share') === 'true') {
        _showCard('mainCard');
        return;
      }
    } catch(e) {}

    // ── 케이스 3: 토큰 없고 세션 기록도 없음 (직접 접근) ────────────────────
    _showErrorWithReason('not_found');

  } catch(e) {
    console.error('[validateToken]', e);
    _showCard('errorCard');
  }
}

// ─── PWA 설치 성공 화면 ──────────────────────────────────────────────────────
function showInstallSuccess() {
  document.body.innerHTML =
    '<div style="min-height:100vh;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;padding:20px;' +
    'background:var(--bg-page);text-align:center;">' +
    '<div style="font-size:60px;margin-bottom:20px;">\u2705</div>' +
    '<h2 style="font-size:22px;font-weight:800;color:var(--text-primary);margin-bottom:12px;">' +
    '\uc571 \uc124\uce58\uac00 \uc2dc\uc791\ub418\uc5c8\uc2b5\ub2c8\ub2e4!</h2>' +
    '<p style="font-size:15px;color:var(--text-secondary);line-height:1.6;word-break:keep-all;">' +
    '\ud648 \ud654\uba74\uc5d0 \uc0dd\uc131\ub41c<br>' +
    '<b>\'DSR \uacc4\uc0b0\uae30\'</b> \uc544\uc774\ucf58\uc73c\ub85c \uc811\uc18d\ud574\uc8fc\uc138\uc694.</p>' +
    '</div>';
}

// ─── 인앱 브라우저 감지 ──────────────────────────────────────────────────────
function checkInAppBrowser() {
  var ua = navigator.userAgent.toLowerCase();
  var isKakao = ua.indexOf('kakaotalk') > -1;
  var isInApp  = isKakao ||
    ua.indexOf('line')      > -1 ||
    ua.indexOf('inapp')     > -1 ||
    ua.indexOf('instagram') > -1 ||
    ua.indexOf('facebook')  > -1;

  if (!isInApp) return false;

  var currentUrl = location.href;

  // Android 카카오 → Chrome Intent 리다이렉트
  if (ua.indexOf('android') > -1 && isKakao) {
    location.href = 'intent://' +
      currentUrl.replace(/https?:\/\//i, '') +
      '#Intent;scheme=https;package=com.android.chrome;end';
    return true;
  }

  // 그 외 인앱 → 외부 브라우저 안내 화면 (body 전체 교체)
  document.body.innerHTML =
    '<div style="min-height:100vh;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;padding:20px;' +
    'background:#F4F6FB;text-align:center;">' +
    '<div style="font-size:50px;margin-bottom:20px;">\uD83E\uDDED</div>' +
    '<h2 style="font-size:20px;font-weight:800;color:#12203A;margin-bottom:12px;">' +
    '\uae30\ubcf8 \ube0c\ub77c\uc6b0\uc800\ub85c \uc5f4\uc5b4\uc8fc\uc138\uc694</h2>' +
    '<p style="font-size:14px;color:#485070;line-height:1.6;' +
    'word-break:keep-all;margin-bottom:24px;">' +
    '\uc571 \ub0b4 \ube0c\ub77c\uc6b0\uc800\uc5d0\uc11c\ub294 \uc571 \uc124\uce58\uac00 \uc9c0\uc6d0\ub418\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.<br><br>' +
    '\uc6b0\uce21 \ud558\ub2e8\uc758 <b>[\ub098\uce68\ubc18]</b> \ub610\ub294 <b>[\u22ee]</b>\uc744 \ub208\ub7ec<br>' +
    '<b style="color:#3B82F6;">\'\ub2e4\ub978 \ube0c\ub77c\uc6b0\uc800\ub85c \uc5f4\uae30\'</b>' +
    '\ub97c \uc120\ud0dd\ud574\uc8fc\uc138\uc694.</p>' +
    '<button id="_shareCopyBtn" style="padding:14px 24px;background:#1A2B5A;' +
    'color:#fff;border-radius:12px;font-weight:700;border:none;">' +
    '\uD83D\uDD17 \ud604\uc7ac \ub9c1\ud06c \ubcf5\uc0ac\ud558\uae30</button>' +
    '</div>';

  var copyBtn = document.getElementById('_shareCopyBtn');
  if (copyBtn) {
    copyBtn.onclick = function() {
      var ta = document.createElement('textarea');
      document.body.appendChild(ta);
      ta.value = currentUrl;
      ta.select();
      try { document.execCommand('copy'); } catch(e) {}
      document.body.removeChild(ta);
      alert('\ub9c1\ud06c\uac00 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4.\n' +
            '\uc0ac\ud30c\ub9ac\ub098 \ud06c\ub860 \uc8fc\uc18c\uc0c1\uc5d0 \ubd99\uc5ec\ub123\uc5b4 \uc8fc\uc138\uc694.');
    };
  }
  return true;
}

// ─── 메인 초기화 (window.onload) ─────────────────────────────────────────────
window.onload = function() {
  // 안전 블록: 어떤 오류가 발생해도 errorCard 표시 (블랙스크린 방지)
  try {
    // 1. 인앱 브라우저 → 안내 화면으로 대체 후 종료
    if (checkInAppBrowser()) return;

    // 2. 토큰 검증 → mainCard 또는 errorCard 표시
    validateToken();

    // ★★★ 2-B. Service Worker 등록 (PWA 설치 필수 조건) ★★★
    // beforeinstallprompt 이벤트는 SW 활성 상태일 때만 발생
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(function(reg) {
          console.log('[share.js] ✅ Service Worker 등록 OK (scope:', reg.scope + ')');
        })
        .catch(function(err) {
          console.warn('[share.js] ⚠ Service Worker 등록 실패:', err && err.message);
        });
    } else {
      console.warn('[share.js] ⚠ 브라우저가 Service Worker 미지원 — PWA 설치 불가');
    }

    // 3. PWA 설치 이벤트 캐치
    window.addEventListener('beforeinstallprompt', function(e) {
      console.log('[share.js] ✅ beforeinstallprompt 이벤트 발생 — 설치 가능');
      e.preventDefault();
      deferredPrompt = e;
    });

    // 3-B. 설치 완료 감지 (Android Chrome/Samsung Internet)
    window.addEventListener('appinstalled', function() {
      console.log('[share.js] ✅ PWA 설치 완료');
      deferredPrompt = null;
      showInstallSuccess();
    });

    // 4. 설치 버튼
    var btnInstall = document.getElementById('btnInstall');
    if (btnInstall) {
      btnInstall.addEventListener('click', function() {
        if (deferredPrompt) {
          console.log('[share.js] 설치 프롬프트 표시');
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(result) {
            console.log('[share.js] 사용자 선택:', result.outcome);
            if (result.outcome === 'accepted') {
              deferredPrompt = null;
              showInstallSuccess();
            }
          });
        } else {
          console.warn('[share.js] ⚠ deferredPrompt 없음 — SW 미등록 or 이미 설치됨 or 조건 미충족');
          var ua    = navigator.userAgent;
          var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
          var isSamsung = /SamsungBrowser/i.test(ua);
          var isAndroid = /Android/i.test(ua);

          if (isIOS) {
            alert('\uc544\uc774\ud3f0 \ud558\ub2e8\uc758 [\uacf5\uc720] \ubc84\ud2bc\uc744 \ub204\ub978 \ud6c4\n' +
                  '[\ud648 \ud654\uba74\uc5d0 \ucd94\uac00]\ub97c \uc120\ud0dd\ud558\uc5ec \uc124\uce58\ud574\uc8fc\uc138\uc694.');
          } else if (isSamsung) {
            alert('\uc0bc\uc131 \ube0c\ub77c\uc6b0\uc800:\n' +
                  '\ud558\ub2e8 \uc911\uc559 [\u2630 \uba54\ub274] \ubc84\ud2bc \u2192\n' +
                  '[\ud398\uc774\uc9c0 \ucd94\uac00] \u2192 [\ud648 \ud654\uba74] \uc120\ud0dd');
          } else if (isAndroid) {
            alert('\ud06c\ub86c \ube0c\ub77c\uc6b0\uc800:\n' +
                  '\uc6b0\uce21 \uc0c1\ub2e8 [\u22ee \uba54\ub274] \u2192\n' +
                  '[\uc571 \uc124\uce58] \ub610\ub294 [\ud648 \ud654\uba74\uc5d0 \ucd94\uac00] \uc120\ud0dd');
          } else {
            alert('\ube0c\ub77c\uc6b0\uc800 \uba54\ub274\uc5d0\uc11c\n' +
                  '[\uc571 \uc124\uce58] \ub610\ub294 [\ud648 \ud654\uba74\uc5d0 \ucd94\uac00]\ub97c \uc120\ud0dd\ud574\uc8fc\uc138\uc694.');
          }
        }
      });
    }

    // 5. 1회성 접속 버튼
    var btnOneTime = document.getElementById('btnOneTime');
    if (btnOneTime) {
      btnOneTime.addEventListener('click', function() {
        try { localStorage.setItem('kb_guest_mode', 'true'); } catch(e) {}
        window.location.href = 'index.html';
      });
    }

  } catch(globalErr) {
    // 최후 안전망: 예상치 못한 오류 → 에러 카드
    console.error('[share.js 초기화 오류]', globalErr);
    try { _showCard('errorCard'); } catch(e) {
      // _showCard 도 실패하는 극단적 상황 → 직접 DOM 조작
      var ec = document.getElementById('errorCard');
      if (ec) ec.style.display = 'block';
      var lc = document.getElementById('loadingCard');
      if (lc) lc.style.display = 'none';
    }
  }
};
