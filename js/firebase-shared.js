/* =============================================================================
   js/firebase-shared.js — Firebase 일회성 토큰 시스템  VER 2026.07-B
   ─────────────────────────────────────────────────────────────────────────────
   ★ Firebase 프로젝트: dsrcalc (asia-southeast1)
     DB URL: https://dsrcalc-default-rtdb.asia-southeast1.firebasedatabase.app

   ★ 의존: Firebase compat SDK
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js">
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-database-compat.js">

   ★ 사용처
     · admin.js    → kbFirebase.registerToken(nonce, exp)  토큰 등록
     · share.js    → kbFirebase.claimToken(nonce, exp)     검증 + 클레임

   ★ 동작 흐름
     1. 관리자가 링크 발급 → registerToken: tokens/{nonce} = {used:false, exp}
     2. 사용자(A)가 클릭   → claimToken:    DB 조회
        · 토큰 없음/만료 → 거부
        · used = false   → 자기 fingerprint 기록 + used=true → 통과
        · used = true & 같은 fp → 통과 (A의 재방문)
        · used = true & 다른 fp → 거부 (B가 받은 링크 시도)

   ★ 장애 내성 (Graceful Degradation)
     · Firebase SDK 미로드: 만료 체크만으로 통과 (앱 깨짐 방지)
     · DB 네트워크 오류  : 만료 체크만으로 통과 (UX 우선)
     · DB 등록 실패 토큰 : claimToken 첫 호출 시 graceful pass

   ★ DB 구조 (dsrcalc 프로젝트 루트)
     /tokens/{nonce}
       ├─ used:      false | true
       ├─ exp:       1745234567890
       ├─ claimedFp: "a3f8c2d1"    (첫 클레임 시 기록)
       ├─ claimedAt: 1745148123456 (첫 클레임 시 기록)
       └─ createdAt: 1745148000000
   ============================================================================= */

(function(global) {
  'use strict';

  // ═════════════════════════════════════════════════════════════════════════
  //  ★★★ Firebase Config — dsrcalc 전용 프로젝트 (asia-southeast1 리전) ★★★
  //
  //  📋 가져오는 방법
  //     Firebase Console → 프로젝트 설정(⚙️) → 일반 → 내 앱
  //     → "SDK 설정 및 구성" → "구성" 라디오 선택 → 표시된 객체 전체 복사
  //
  //  📋 databaseURL 주의사항
  //     · 리전이 asia-southeast1 이므로 URL 에 '-asia-southeast1' 포함되어야 함
  //     · 형식: https://{PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app
  //     · 실수로 .firebaseio.com (us-central1) 형식 사용 시 permission_denied 발생
  //
  //  📋 이 프로젝트 전용 — 아파트 시세와 완전 분리됨
  // ═════════════════════════════════════════════════════════════════════════
  var FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAfulM63NxbpPPbBYaS0uj74kQM5MDvKxA",           // ← Console 에서 복사 (AIzaSy... 로 시작)
    authDomain:        "dsrcalc.firebaseapp.com",      // ✅ projectId 기준 자동 완성
    databaseURL:       "https://dsrcalc-default-rtdb.asia-southeast1.firebasedatabase.app",  // ✅ asia-southeast1 리전
    projectId:         "dsrcalc",                      // ✅ 고정
    storageBucket:     "dsrcalc.firebasestorage.app",  // ⚠ Console 값 확인 필요 (신규: .firebasestorage.app / 구형: .appspot.com)
    messagingSenderId: "115659256405",         // ← Console 에서 복사 (12자리 숫자)
    appId:             "1:115659256405:web:d28374464a918084e61adc"             // ← Console 에서 복사 (1:xxx:web:xxx 형식)
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  내부 상태
  // ═════════════════════════════════════════════════════════════════════════
  var _kbApp = null;
  var _kbDb  = null;
  var _APP_NAME = 'dsr-otl';    // Firebase 앱 인스턴스명 (같은 페이지에 다른 firebase 앱이 있을 경우 대비)
  var _DB_PATH  = 'tokens';     // dsrcalc 전용 프로젝트 → 루트에 바로 tokens 노드 사용

  // ═════════════════════════════════════════════════════════════════════════
  //  Firebase 초기화 (한 번만)
  // ═════════════════════════════════════════════════════════════════════════
  function _init() {
    if (_kbApp) return true;
    if (typeof firebase === 'undefined') {
      console.warn('[kbFirebase] SDK 미로드 — graceful fallback 모드');
      return false;
    }
    if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
      console.warn('[kbFirebase] config 미설정 — firebase-shared.js 의 FIREBASE_CONFIG 를 입력하세요');
      return false;
    }
    try {
      // 동일 이름의 앱 재사용 (페이지 간 중복 init 방지)
      var existing = firebase.apps.filter(function(a) { return a.name === _APP_NAME; });
      _kbApp = existing.length ? existing[0] : firebase.initializeApp(FIREBASE_CONFIG, _APP_NAME);
      _kbDb  = firebase.database(_kbApp);
      console.log('[kbFirebase] 초기화 OK (앱:', _APP_NAME, ', 경로:/' + _DB_PATH + ')');
      return true;
    } catch (e) {
      console.warn('[kbFirebase] 초기화 실패 — graceful fallback:', e && e.message);
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  디바이스 fingerprint (간단 해시 — FNV-1a 32bit)
  //  완벽하지 않지만 같은 디바이스/브라우저 식별에는 충분
  // ═════════════════════════════════════════════════════════════════════════
  function _fingerprint() {
    try {
      var s = '';
      s += (navigator.userAgent || '');
      s += '|' + (screen.width + 'x' + screen.height);
      s += '|' + (screen.colorDepth || '');
      s += '|' + (new Date().getTimezoneOffset());
      s += '|' + (navigator.language || '');
      s += '|' + (navigator.platform || '');
      s += '|' + (navigator.hardwareConcurrency || '');

      var h = 2166136261;
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return ('00000000' + (h >>> 0).toString(16)).slice(-8);
    } catch (e) {
      return 'fb_' + Date.now().toString(36);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  토큰 등록 (admin.js 에서 호출)
  //  반환: Promise<{ok: boolean, reason?: string}>
  // ═════════════════════════════════════════════════════════════════════════
  function registerToken(nonce, exp) {
    if (!nonce || typeof exp !== 'number') {
      return Promise.resolve({ ok: false, reason: 'invalid_args' });
    }
    if (!_init()) {
      return Promise.resolve({ ok: false, reason: 'no_firebase' });
    }
    return _kbDb.ref(_DB_PATH + '/' + nonce).set({
      used:      false,
      exp:       exp,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function() {
      console.log('[kbFirebase] 토큰 등록 완료:', nonce.slice(0, 6) + '…');
      return { ok: true };
    }).catch(function(err) {
      console.warn('[kbFirebase] registerToken 실패:', err && err.message);
      return { ok: false, reason: 'write_error', err: err && err.message };
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  토큰 클레임 (share.js 에서 호출)
  //  반환:
  //    { ok: true,  firstClaim: bool, fallback?: bool }   → 통과
  //    { ok: false, reason: 'expired' }                   → 만료
  //    { ok: false, reason: 'not_found' }                 → 토큰 미등록 (가짜)
  //    { ok: false, reason: 'used_other' }                → 다른 디바이스가 선점
  // ═════════════════════════════════════════════════════════════════════════
  function claimToken(nonce, exp) {
    // 즉시 만료 체크 (네트워크 호출 전)
    if (typeof exp === 'number' && Date.now() > exp) {
      return Promise.resolve({ ok: false, reason: 'expired' });
    }

    // SDK/config 미준비 → graceful fallback (만료 체크만)
    if (!_init()) {
      console.warn('[kbFirebase] graceful fallback (Firebase 미연동)');
      return Promise.resolve({ ok: true, firstClaim: true, fallback: true });
    }

    var fp  = _fingerprint();
    var ref = _kbDb.ref(_DB_PATH + '/' + nonce);

    return ref.once('value').then(function(snap) {
      var data = snap.val();

      // ── (1) DB에 토큰 없음 ──────────────────────────────────────────────
      // 케이스: registerToken 실패한 토큰 / 누군가의 위조 토큰
      // 처리: graceful pass (만료 안되었으면 통과 + fallback 플래그)
      //       엄격하게 차단하려면 아래 코드 활성화:
      //       return { ok: false, reason: 'not_found' };
      if (!data) {
        console.warn('[kbFirebase] 토큰 미등록 — graceful pass');
        return { ok: true, firstClaim: true, fallback: true };
      }

      // ── (2) DB exp 체크 (이중 검증) ────────────────────────────────────
      if (data.exp && Date.now() > data.exp) {
        return { ok: false, reason: 'expired' };
      }

      // ── (3) 첫 클레임 → 사용 처리 + fingerprint 기록 ───────────────────
      if (!data.used) {
        return ref.update({
          used:      true,
          claimedFp: fp,
          claimedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(function() {
          console.log('[kbFirebase] 첫 클레임 OK (fp:' + fp + ')');
          return { ok: true, firstClaim: true };
        }).catch(function(err) {
          // update 실패 → 일단 통과 (UX 우선)
          console.warn('[kbFirebase] update 실패 (graceful):', err && err.message);
          return { ok: true, firstClaim: true, fallback: true };
        });
      }

      // ── (4) 이미 사용됨 → 같은 디바이스인지 확인 ───────────────────────
      if (data.claimedFp === fp) {
        console.log('[kbFirebase] 같은 디바이스 재방문 OK (fp:' + fp + ')');
        return { ok: true, firstClaim: false };
      }

      // ── (5) 다른 디바이스 → 차단 ───────────────────────────────────────
      console.warn('[kbFirebase] 다른 디바이스 차단 (등록fp:' + data.claimedFp + ', 현재fp:' + fp + ')');
      return { ok: false, reason: 'used_other' };

    }).catch(function(err) {
      // 네트워크 오류 등 → graceful fallback
      console.warn('[kbFirebase] claimToken 오류 (graceful):', err && err.message);
      return { ok: true, firstClaim: true, fallback: true };
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  외부 노출
  // ═════════════════════════════════════════════════════════════════════════
  global.kbFirebase = {
    init:          _init,
    fp:            _fingerprint,
    registerToken: registerToken,
    claimToken:    claimToken,
    // 디버깅용
    _config:       FIREBASE_CONFIG,
    _path:         _DB_PATH
  };

})(window);
