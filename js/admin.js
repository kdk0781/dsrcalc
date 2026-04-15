/* =============================================================================
   js/admin.js — index.html 관리자 기능 모듈 (10번째 로드)
   ─────────────────────────────────────────────────────────────────────────────
   ★ 의존 파일 (앞에 로드되어야 함):
      js/config.js  → _C (SHORTENER_API, REPORT_COPY_DAILY_LIMIT)
      js/modal.js   → showAlert(msg, focusId, icon)
      js/report.js  → _forceCopy(text, successMsg)
   ─────────────────────────────────────────────────────────────────────────────
   포함 함수:
   · checkAdminAuth()          — 세션 확인 → adminShareContainer 표시
   · adminLogout()             — 로그아웃 모달 표시 (없으면 confirm 폴백)
   · closeLogoutModal()        — 로그아웃 모달 닫기
   · proceedAdminLogout()      — 로그아웃 실행 → admin.html 이동
   · generateAdminShareLink()  — URL-safe 토큰 + is.gd 단축 + 공유
   ============================================================================= */

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
    // partials 미주입 대비 confirm 폴백
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

  // adminShareContainer 즉시 숨김
  var el = document.getElementById('adminShareContainer');
  if (el) el.style.display = 'none';

  // 자동 로그인 정보 있으면 로그인 페이지 복원용 init_state 저장
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

// ─── 임시 링크 생성 ──────────────────────────────────────────────────────────

// URL-safe base64: btoa(encodeURIComponent(str)) + + → - / → _ 패딩제거
// share.js _parseToken 시도1 과 정확히 매칭
function _toUrlSafeB64(str) {
  return btoa(encodeURIComponent(str))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// 하루 발급 카운터
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

// is.gd URL 단축 (실패 시 원본 반환) — Promise 체인 방식
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

// 클립보드 복사 (report.js 의 _forceCopy 가 없을 때 자체 폴백)
function _copyAdminLink(text, msg) {
  if (typeof _forceCopy === 'function') {
    _forceCopy(text, msg);
    return;
  }
  // _forceCopy 없을 때 직접 처리
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

function generateAdminShareLink() {
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

  // 토큰 생성 (URL-safe base64, share.js 와 매칭)
  var payload   = { exp: Date.now() + 86400000 };
  var token     = _toUrlSafeB64(JSON.stringify(payload));
  var base      = window.location.href.split('?')[0].split('#')[0];
  var baseDir   = base.substring(0, base.lastIndexOf('/') + 1);
  var longUrl   = baseDir + 'share.html?t=' + token;
  var remaining = limitCheck.limit - limitCheck.cnt;

  var successMsg =
    '\uD83D\uDD17 <b>\uace0\uac1d\uc6a9 \uc571 \uc124\uce58 \ub9c1\ud06c\uac00 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4.</b><br><br>' +
    '<span style="font-size:12px; display:block;">' +
    '\u2022 \ubc1c\uae09 \ud6c4 <b>24\uc2dc\uac04 \ub3d9\uc548\ub9cc \uc720\ud6a8</b>\ud569\ub2c8\ub2e4.<br>' +
    '\u2022 \uc624\ub298 \ub0a8\uc740 \ubc1c\uae09 \ud69f\uc218: <b>' + remaining + '\ud68c</b>' +
    '</span>';

  function restore() {
    if (btn) { btn.disabled = false; if (origHtml) btn.innerHTML = origHtml; }
  }

  _shortenAdminUrl(longUrl)
    .then(function(shortUrl) {
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
    })
    .catch(function(e) {
      console.error('[AdminShare]', e);
      if (typeof showAlert === 'function') {
        showAlert('\ub9c1\ud06c \uc0dd\uc131 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.', null, '\u26A0\uFE0F');
      }
    })
    .then(restore);
}
