/* =============================================================================
   share.js — DSR 계산기 임시 링크 검증 + PWA 설치 안내
   share.html 과 세트 (loadingCard / mainCard / errorCard)

   ★ loadingCard 는 HTML에서 기본 표시 상태
     JS가 validateToken() 후 mainCard 또는 errorCard 로 전환
   ★ ES5 호환 (async/await, const/let, ?. 없음)
   ============================================================================= */

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

// ─── 토큰 검증 ───────────────────────────────────────────────────────────────
function validateToken() {
  try {
    var urlParams = new URLSearchParams(window.location.search);
    var token = urlParams.get('t');

    // 케이스 1: URL에 토큰 있음
    if (token) {
      var payload = _parseToken(token);
      if (payload && payload.exp && Date.now() <= payload.exp) {
        // 검증 성공 — sessionStorage 에 기록 후 주소창 세탁
        try { sessionStorage.setItem('kb_valid_share', 'true'); } catch(e) {}
        try { window.history.replaceState(null, '', 'share.html'); } catch(e) {}
        _showCard('mainCard');
      } else {
        // 토큰 있지만 만료 or 파싱 실패
        _showCard('errorCard');
      }
      return;
    }

    // 케이스 2: 토큰 없지만 같은 세션에서 이미 검증 통과
    // (PWA 설치 과정에서 페이지가 재로드되는 경우)
    try {
      if (sessionStorage.getItem('kb_valid_share') === 'true') {
        _showCard('mainCard');
        return;
      }
    } catch(e) {}

    // 케이스 3: 토큰 없고 세션 기록도 없음 (직접 접근)
    _showCard('errorCard');

  } catch(e) {
    // 예기치 않은 오류 → 에러 카드 표시 (블랙스크린 방지)
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
    //    (loadingCard는 HTML에서 기본 표시 중 — 여기서 교체)
    validateToken();

    // 3. PWA 설치 이벤트 캐치
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
    });

    // 4. 설치 버튼
    var btnInstall = document.getElementById('btnInstall');
    if (btnInstall) {
      btnInstall.addEventListener('click', function() {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(result) {
            if (result.outcome === 'accepted') {
              deferredPrompt = null;
              showInstallSuccess();
            }
          });
        } else {
          var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          if (isIOS) {
            alert('\uc544\uc774\ud3f0 \ud558\ub2e8\uc758 [\uacf5\uc720] \ubc84\ud2bc\uc744 \ub204\ub978 \ud6c4\n' +
                  '[\ud648 \ud654\uba74\uc5d0 \ucd94\uac00]\ub97c \uc120\ud0dd\ud558\uc5ec \uc124\uce58\ud574\uc8fc\uc138\uc694.');
          } else {
            alert('\ube0c\ub77c\uc6b0\uc800 \uba54\ub274(\uc6b0\uce21 \uc0c1\ub2e8 \u22ee)\uc5d0\uc11c\n' +
                  '\'\uc571 \uc124\uce58\' \ub610\ub294 \'\ud648 \ud654\uba74\uc5d0 \ucd94\uac00\'\ub97c \uc120\ud0dd\ud574\uc8fc\uc138\uc694.');
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
