/* =============================================================================
   js/admin-login.js  ·  admin.html 전용 로그인 스크립트
   admin.html 맨 끝 <script src="js/admin-login.js"> 정적 로드
   → 실행 시점에 DOM 완전 파싱 완료 → 파일 끝 _adminInit() 직접 호출
   ============================================================================= */

// ─── 전역 상태 ────────────────────────────────────────────────────────────────
var _ADMIN_MCB    = null;           // 모달 확인 콜백
var _ADMIN_AK     = 'kb_admin_autologin';
var _ADMIN_IK     = 'kb_admin_init_state';
var _ADMIN_CFG_K  = 'kb_admin_config';
var _ADMIN_DEFCFG = { id:'admin', pw:'admin', mainUrl:'index.html', phone:'' };

// ─── 설정 읽기/쓰기 ───────────────────────────────────────────────────────────
function getAdminConfig() {
  try {
    var s = localStorage.getItem(_ADMIN_CFG_K);
    return s ? JSON.parse(s) : _ADMIN_DEFCFG;
  } catch(e) { return _ADMIN_DEFCFG; }
}
function saveAdminConfig(c) {
  localStorage.setItem(_ADMIN_CFG_K, JSON.stringify(c));
}

// ─── 모달 표시/닫기 ───────────────────────────────────────────────────────────
function _adminShowModal(msg, icon, cb) {
  var m = document.getElementById('customModal');
  if (!m) {
    alert(msg);
    if (typeof cb === 'function') cb();
    return;
  }
  var iconEl = document.getElementById('modalIcon');
  var msgEl  = document.getElementById('modalMsg');
  if (iconEl) iconEl.innerText = icon || '\u26A0\uFE0F'; 
  if (msgEl)  msgEl.innerHTML  = String(msg).replace(/\n/g, '<br>');
  _ADMIN_MCB = (typeof cb === 'function') ? cb : null;
  m.style.display = 'flex';
}

function _adminCloseModal() {
  var m = document.getElementById('customModal');
  if (m) m.style.display = 'none';
  if (_ADMIN_MCB) {
    var fn = _ADMIN_MCB;
    _ADMIN_MCB = null;
    fn();
  }
}

// ─── 자동 로그인 ──────────────────────────────────────────────────────────────
function _adminSaveAuto(id, pw) {
  localStorage.setItem(_ADMIN_AK, JSON.stringify({id:id, pw:pw, enabled:true}));
}
function _adminClearAuto() { localStorage.removeItem(_ADMIN_AK); }
function _adminGetAuto() {
  try {
    var r = localStorage.getItem(_ADMIN_AK);
    if (!r) return null;
    var d = JSON.parse(r);
    return (d && d.enabled) ? d : null;
  } catch(e) { return null; }
}
function _adminGetInit() {
  try {
    var r = localStorage.getItem(_ADMIN_IK);
    return r ? JSON.parse(r) : null;
  } catch(e) { return null; }
}
function _adminClearInit() { localStorage.removeItem(_ADMIN_IK); }

// ─── 폼 채우기 ────────────────────────────────────────────────────────────────
function _adminFill(id, pw, chk) {
  var idEl  = document.getElementById('adminId');
  var pwEl  = document.getElementById('adminPw');
  var chkEl = document.getElementById('autoLoginChk'); // 없어도 null 처리
  if (idEl)  idEl.value   = id  || '';
  if (pwEl)  pwEl.value   = pw  || '';
  if (chkEl) chkEl.checked = !!chk;
}

// ─── 자동 로그인 실행 ─────────────────────────────────────────────────────────
function _adminAutoRun(id, pw) {
  var card = document.querySelector('.admin-card');
  var btn  = document.querySelector('.btn-login');
  if (card && btn) {
    var badge = document.createElement('div');
    badge.className = 'admin-auto-badge';
    badge.innerHTML = '\u26A1 자동 로그인 중...'; 
    card.insertBefore(badge, btn);
  }
  setTimeout(function() { _adminDoLogin(id, pw); }, 800);
}

// ─── 로그인 메인 로직 ─────────────────────────────────────────────────────────
function attemptLogin() {
  var idEl = document.getElementById('adminId');
  var pwEl = document.getElementById('adminPw');
  var id   = idEl ? idEl.value.trim() : '';
  var pw   = pwEl ? pwEl.value.trim() : '';
  _adminDoLogin(id, pw);
}

function _adminDoLogin(id, pw) {
  var cfg  = getAdminConfig();
  var chkEl = document.getElementById('autoLoginChk');
  var chk   = chkEl ? chkEl.checked : false;

  if (id === cfg.id && pw === cfg.pw) {
    if (chk) { _adminSaveAuto(id, pw); } else { _adminClearAuto(); }
    localStorage.removeItem('kb_guest_mode');
    localStorage.setItem('kb_admin_session', JSON.stringify({
      isAuth:  true,
      expires: Date.now() + 86400000,
      mainUrl: cfg.mainUrl
    }));
    _adminShowModal(
      '로그인이 완료되었습니다.<br>대표 페이지로 이동합니다.',
      '\u2705', 
      function() { window.location.href = cfg.mainUrl; }
    );
  } else {
    var badge = document.querySelector('.admin-auto-badge');
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    _adminShowModal('아이디 또는 비밀번호가 일치하지 않습니다.', '\uD83D\uDEAB'); 
  }
}

// ─── 설정 변경 ────────────────────────────────────────────────────────────────
function changeAdminSettings() {
  var cfg = getAdminConfig();
  var el;
  el = document.getElementById('setCurId');  if (el) el.value = '';
  el = document.getElementById('setCurPw');  if (el) el.value = '';
  el = document.getElementById('setNewPw');  if (el) el.value = '';
  el = document.getElementById('setNewUrl'); if (el) el.value = cfg.mainUrl;
  el = document.getElementById('setNewPhone'); if (el) el.value = cfg.phone || '';
  var sm = document.getElementById('settingsModal');
  if (sm) sm.style.display = 'flex';
}

function closeSettingsModal() {
  var sm = document.getElementById('settingsModal');
  if (sm) sm.style.display = 'none';
}

function saveSettingsFromModal() {
  var cfg = getAdminConfig();
  var el;
  var curId = (el = document.getElementById('setCurId'))  ? el.value.trim() : '';
  var curPw = (el = document.getElementById('setCurPw'))  ? el.value.trim() : '';
  var newPw = (el = document.getElementById('setNewPw'))  ? el.value.trim() : '';
  var newUrl= (el = document.getElementById('setNewUrl')) ? el.value.trim() : '';
  var phone = (el = document.getElementById('setNewPhone'))? el.value.trim() : '';

  if (curId !== cfg.id || curPw !== cfg.pw) {
    _adminShowModal('현재 아이디/비밀번호가 일치하지 않습니다.', '\uD83D\uDEAB');
    return;
  }
  if (phone && !/^010-\d{4}-\d{4}$/.test(phone)) {
    _adminShowModal('연락처 형식이 올바르지 않습니다.<br>예: 010-1234-5678', '\u26A0\uFE0F');
    return;
  }

  var newCfg = {
    id:      cfg.id,
    pw:      newPw   || cfg.pw,
    mainUrl: newUrl  || cfg.mainUrl,
    phone:   phone   || cfg.phone || ''
  };
  saveAdminConfig(newCfg);
  localStorage.removeItem('kb_admin_session');

  var al = _adminGetAuto();
  if (al) _adminSaveAuto(newCfg.id, newCfg.pw);

  localStorage.setItem(_ADMIN_IK, JSON.stringify({
    id: newCfg.id, pw: newCfg.pw, autoCheck: true, autoLogin: true
  }));

  closeSettingsModal();
  _adminShowModal('설정이 변경되었습니다.', '\u2705', function() {
    window.location.href = window.location.href.split('?')[0].split('#')[0];
  });
}

// ─── 초기화 함수 ──────────────────────────────────────────────────────────────
// 파일 맨 끝에서 직접 호출 (IIFE 없음, DOMContentLoaded 없음)
// body 맨 끝 <script src> 로 로드되므로 실행 시 DOM 완전 준비 완료 보장
function _adminInit() {
  // 고객 낙인 해제
  localStorage.removeItem('kb_guest_mode');

  // 모달 확인 버튼 onclick 등록
  var confirmBtn = document.getElementById('modalConfirm');
  if (confirmBtn) {
    confirmBtn.onclick = _adminCloseModal;
  }

  // 엔터키 로그인
  document.onkeypress = function(ev) {
    var k = ev.key || ev.keyIdentifier;
    if (k !== 'Enter') return;
    var cm = document.getElementById('customModal');
    var sm = document.getElementById('settingsModal');
    if ((cm && cm.style.display === 'flex') ||
        (sm && sm.style.display === 'flex')) return;
    attemptLogin();
  };

  // 1회용 초기 상태 복원 (로그아웃/설정 변경 직후)
  var savedInit = _adminGetInit();
  if (savedInit) {
    _adminClearInit();
    _adminFill(savedInit.id, savedInit.pw, savedInit.autoCheck !== false);
    if (savedInit.autoLogin) {
      _adminAutoRun(savedInit.id, savedInit.pw);
    }
    return;
  }

  // 자동 로그인
  var savedAuto = _adminGetAuto();
  if (savedAuto) {
    _adminFill(savedAuto.id, savedAuto.pw, true);
    _adminAutoRun(savedAuto.id, savedAuto.pw);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 파일 실행 즉시 초기화 (이 시점 = body 파싱 완료 = DOM 준비 완료)
_adminInit();
