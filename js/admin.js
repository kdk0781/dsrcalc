/* =============================================================================
   js/admin.js — index.html 관리자 기능 모듈  VER 2026.07-FINAL
   ─────────────────────────────────────────────────────────────────────────────
   ★ Firebase 일회성 토큰 연동 버전 (B에게 전달 시 차단)

   ★ 의존 파일 (앞에 로드되어야 함):
      js/config.js          → _C (SHORTENER_API, REPORT_COPY_DAILY_LIMIT)
      js/modal.js           → showAlert(msg, focusId, icon)
      js/report.js          → _forceCopy(text, successMsg)
      js/firebase-shared.js → window.kbFirebase
      firebase SDK          → window.firebase (compat)

   ★ 신버전 식별 로그 (F12 콘솔에 반드시 찍혀야 함):
      [AdminShare] v2026.07-FINAL 로드됨
      [AdminShare] generateAdminShareLink() 호출됨
      [AdminShare] nonce 생성: xxxxxxxxxxxxxxxx
      [kbFirebase] 토큰 등록 완료: xxxxxx…
      [AdminShare] ✅ Firebase 등록 OK · nonce: xxxxxxxxxxxxxxxx
   ============================================================================= */

console.log('[AdminShare] v2026.07-FINAL 로드됨');

// ─── 세션 확인 ───────────────────────────────────────────────────────────────
function checkAdminAuth() {
  if (localStorage.getItem('kb_guest_mode') === 'true') return;
  try {
    var raw = localStorage.getItem('kb_admin_session');
    if (!raw) return;
    var session = JSON.parse(raw);
    if (session && session.isAuth && Date.now() < session.expires) {
      var el = document.getElementById('adminShareContainer');
      if (el) el.style.display = 'block';
    } else {
      localStorage.removeItem('kb_admin_session');
    }
  } catch(e) {}
}

// ─── 로그아웃 ────────────────────────────────────────────────────────────────
function adminLogout() {
  var modal = document.getElementById('logoutConfirmModal');
  if (modal) {
    modal.style.display = 'flex';
  } else {
    if (window.confirm('\ub85c\uadf8\uc544\uc6c3 \ud558\uc2dc\uac00\uc2b5\ub2c8\uae4c?')) {
      proceedAdminLogout();
    }
  }
}

function closeLogoutModal() {
  var modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.style.display = 'none';
}

function proceedAdminLogout() {
  closeLogoutModal();
  localStorage.removeItem('kb_admin_session');

  var el = document.getElementById('adminShareContainer');
  if (el) el.style.display = 'none';

  try {
    var autoRaw = localStorage.getItem('kb_admin_autologin');
    if (autoRaw) {
      var auto = JSON.parse(autoRaw);
      if (auto && auto.enabled) {
        localStorage.setItem('kb_admin_init_state', JSON.stringify({
          id: auto.id, pw: auto.pw, autoCheck: true, autoLogin: true
        }));
      }
    }
  } catch(e) {}

  var base = window.location.href.split('?')[0].split('#')[0];
  var dir  = base.substring(0, base.lastIndexOf('/') + 1);
  window.location.href = dir + 'admin.html';
}

// ─── URL-safe base64 ─────────────────────────────────────────────────────────
function _toUrlSafeB64(str) {
  return btoa(encodeURIComponent(str))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── 하루 발급 카운터 ────────────────────────────────────────────────────────
function _shareDailyKey() {
  var d = new Date();
  var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
  var day = String(d.getDate()); if (day.length < 2) day = '0' + day;
  return 'kb_share_cnt_' + d.getFullYear() + m + day;
}

function _checkShareLimit() {
  var limit = (_C && _C.REPORT_COPY_DAILY_LIMIT) ? _C.REPORT_COPY_DAILY_LIMIT : 10;
  var key   = _shareDailyKey();
  var cnt   = parseInt(localStorage.getItem(key) || '0', 10);
  if (cnt >= limit) return { ok: false, cnt: cnt, limit: limit };
  localStorage.setItem(key, String(cnt + 1));
  return { ok: true, cnt: cnt + 1, limit: limit };
}

// ─── is.gd URL 단축 ──────────────────────────────────────────────────────────
function _shortenAdminUrl(longUrl) {
  var api = (_C && _C.SHORTENER_API)
    ? _C.SHORTENER_API
    : 'https://is.gd/create.php?format=simple&url=';
  return fetch(api + encodeURIComponent(longUrl))
    .then(function(r) {
      if (!r.ok) throw new Error('http');
      return r.text();
    })
    .then(function(s) {
      s = s.trim();
      if (s.indexOf('http') === 0) return s;
      throw new Error('bad');
    })
    .catch(function() { return longUrl; });
}

// ─── 클립보드 복사 (report.js _forceCopy 폴백) ───────────────────────────────
function _copyAdminLink(text, msg) {
  if (typeof _forceCopy === 'function') {
    _forceCopy(text, msg);
    return;
  }
  var ta = document.createElement('textarea');
  ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.value = text; ta.focus(); ta.select();
  try {
    document.execCommand('copy');
    if (typeof showAlert === 'function') showAlert(msg, null, '\u2705');
    else alert('\ub9c1\ud06c\uac00 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4.');
  } catch(e) {
    alert(text);
  }
  document.body.removeChild(ta);
}

// ═════════════════════════════════════════════════════════════════════════════
//  ★★★ Firebase 일회성 토큰 연동 핵심 ★★★
// ═════════════════════════════════════════════════════════════════════════════

// ─── nonce 생성 (Firebase 토큰 ID, 16자 hex) ─────────────────────────────────
function _genNonce() {
  try {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
  } catch(e) {}
  return (Math.random().toString(36).slice(2, 12) + Date.now().toString(36)).slice(0, 16);
}

// ─── 임시 링크 생성 (Firebase 등록 + 단축 + 공유) ───────────────────────────
function generateAdminShareLink() {
  console.log('[AdminShare] generateAdminShareLink() 호출됨');

  // 한도 체크
  var limitCheck = _checkShareLimit();
  if (!limitCheck.ok) {
    if (typeof showAlert === 'function') {
      showAlert(
        '\uc624\ub298 \ubc1c\uae09 \ud55c\ub3c4(' + limitCheck.limit + '\ud68c)\ub97c \ucd08\uacfc\ud588\uc2b5\ub2c8\ub2e4.<br>' +
        '<span style="font-size:12px;">\ub0b4\uc77c \uc790\uc815\uc5d0 \ucd08\uae30\ud654\ub429\ub2c8\ub2e4.</span>',
        null, '\uD83D\uDEAB'
      );
    }
    return;
  }

  var btn      = document.getElementById('btnAdminShare');
  var origHtml = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<div class="admin-share-icon">\u23F3</div>' +
      '<div class="admin-share-text">' +
      '<span class="share-title-main">\ub9c1\ud06c \uc0dd\uc131 \uc911...</span>' +
      '</div>';
  }

  // ★ 토큰 생성 — payload 에 nonce 포함 (Firebase 일회성 차단용)
  var nonce     = _genNonce();
  var expMs     = Date.now() + 86400000;
  var payload   = { exp: expMs, nonce: nonce };
  var token     = _toUrlSafeB64(JSON.stringify(payload));
  var base      = window.location.href.split('?')[0].split('#')[0];
  var baseDir   = base.substring(0, base.lastIndexOf('/') + 1);
  var longUrl   = baseDir + 'share.html?t=' + token;
  var remaining = limitCheck.limit - limitCheck.cnt;

  console.log('[AdminShare] nonce 생성:', nonce);
  console.log('[AdminShare] payload:', payload);

  var successMsg =
    '\uD83D\uDD17 <b>\uace0\uac1d\uc6a9 \uc571 \uc124\uce58 \ub9c1\ud06c\uac00 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4.</b><br><br>' +
    '<span style="font-size:12px; display:block;">' +
    '\u2022 \ubc1c\uae09 \ud6c4 <b>24\uc2dc\uac04 \ub3d9\uc548\ub9cc \uc720\ud6a8</b>\ud569\ub2c8\ub2e4.<br>' +
    '\u2022 <b>\ud55c \ub300\uc758 \uae30\uae30\uc5d0\uc11c\ub9cc \uc811\uc18d \uac00\ub2a5</b>\ud569\ub2c8\ub2e4.<br>' +
    '\u2022 \uc624\ub298 \ub0a8\uc740 \ubc1c\uae09 \ud69f\uc218: <b>' + remaining + '\ud68c</b>' +
    '</span>';

  function restore() {
    if (btn) { btn.disabled = false; if (origHtml) btn.innerHTML = origHtml; }
  }

  // ★ Firebase 토큰 등록 (graceful)
  var registerPromise;
  if (window.kbFirebase && typeof window.kbFirebase.registerToken === 'function') {
    console.log('[AdminShare] Firebase 등록 시도 중...');
    registerPromise = window.kbFirebase.registerToken(nonce, expMs);
  } else {
    console.warn('[AdminShare] ⚠ window.kbFirebase 없음 — firebase-shared.js 로드 확인 필요');
    registerPromise = Promise.resolve({ ok: false, reason: 'no_firebase' });
  }

  // ★ 단축 + Firebase 등록 병렬 처리
  Promise.all([
    _shortenAdminUrl(longUrl),
    registerPromise
  ]).then(function(results) {
    var shortUrl  = results[0];
    var regResult = results[1];

    if (!regResult.ok) {
      console.warn('[AdminShare] ⚠ Firebase 등록 실패 (토큰은 정상 발급, 일회성 차단만 비활성):', regResult.reason);
    } else {
      console.log('[AdminShare] ✅ Firebase 등록 OK · nonce:', nonce);
    }

    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      return navigator.share({
        title: 'KB DSR \uacc4\uc0b0\uae30 (\uace0\uac1d\uc6a9)',
        text:  'DSR \uacc4\uc0b0\uae30 \uac04\ud3b8 \uc811\uc18d \ub9c1\ud06c\uc785\ub2c8\ub2e4. (24\uc2dc\uac04 \uc720\ud6a8)',
        url:   shortUrl
      }).catch(function(err) {
        if (err.name !== 'AbortError') _copyAdminLink(shortUrl, successMsg);
      });
    } else {
      _copyAdminLink(shortUrl, successMsg);
    }
  }).catch(function(e) {
    console.error('[AdminShare] 오류:', e);
    if (typeof showAlert === 'function') {
      showAlert('\ub9c1\ud06c \uc0dd\uc131 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.', null, '\u26A0\uFE0F');
    }
  }).then(restore);
}
