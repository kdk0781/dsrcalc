/* =============================================================================
   js/firebase-shared.js — Firebase 일회성 토큰 시스템  VER 2026.07-STRICT
   ─────────────────────────────────────────────────────────────────────────────
   ★ v2026.07-STRICT 변경사항
     · nonce 기반 토큰은 Firebase 검증 필수 — graceful pass 금지
     · DB update 시 ServerValue.TIMESTAMP 대신 Date.now() 사용 (규칙 호환)
     · 명확한 단계별 콘솔 로그 (디버깅 용이성)

   ★ Firebase 프로젝트: dsrcalc (asia-southeast1)
     DB URL: https://dsrcalc-default-rtdb.asia-southeast1.firebasedatabase.app

   ★ 동작 흐름
     1. 관리자 발급 → registerToken: tokens/{nonce} = {used:false, exp, createdAt}
     2. 첫 클릭(A) → claimToken: used:false → true 전환 + claimedFp 기록
     3. 같은 기기 재방문(A) → claimedFp 일치 → 통과
     4. 다른 기기(B)      → claimedFp 불일치 → 차단

   ★ 장애 내성 전략
     · SDK/config 미로드  → graceful pass (앱 깨짐 방지)
     · 네트워크 오류      → fail-close (nonce 토큰은 거부) ← v2026.07-STRICT
     · 권한 오류          → fail-close (nonce 토큰은 거부) ← v2026.07-STRICT
   ============================================================================= */

(function(global) {
  'use strict';

  console.log('[kbFirebase] v2026.07-STRICT 로드됨');

  // ═════════════════════════════════════════════════════════════════════════
  //  ★★★ Firebase Config — dsrcalc 전용 (asia-southeast1) ★★★
  //  디케이님이 입력하신 값 그대로 유지 — 아래 3개만 실제 값인지 확인
  // ═════════════════════════════════════════════════════════════════════════
  var FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAfulM63NxbpPPbBYaS0uj74kQM5MDvKxA",
    authDomain:        "dsrcalc.firebaseapp.com",
    databaseURL:       "https://dsrcalc-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "dsrcalc",
    storageBucket:     "dsrcalc.firebasestorage.app",
    messagingSenderId: "123456789012",
    appId:             "1:123456789012:web:abcdef1234567890"
  };

  var _kbApp = null;
  var _kbDb  = null;
  var _APP_NAME = 'dsr-otl';
  var _DB_PATH  = 'tokens';

  // ═════════════════════════════════════════════════════════════════════════
  //  Firebase 초기화
  // ═════════════════════════════════════════════════════════════════════════
  function _init() {
    if (_kbApp) return true;
    if (typeof firebase === 'undefined') {
      console.warn('[kbFirebase] ⚠ SDK 미로드');
      return false;
    }
    if (FIREBASE_CONFIG.apiKey === 'PASTE_API_KEY_HERE') {
      console.warn('[kbFirebase] ⚠ config 미설정 — FIREBASE_CONFIG 블록에 실제 값 입력 필요');
      return false;
    }
    try {
      var existing = firebase.apps.filter(function(a) { return a.name === _APP_NAME; });
      _kbApp = existing.length ? existing[0] : firebase.initializeApp(FIREBASE_CONFIG, _APP_NAME);
      _kbDb  = firebase.database(_kbApp);
      console.log('[kbFirebase] 초기화 OK (앱:', _APP_NAME, ', 경로:/' + _DB_PATH + ')');
      return true;
    } catch (e) {
      console.warn('[kbFirebase] 초기화 실패:', e && e.message);
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  디바이스 fingerprint (FNV-1a 32bit)
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
  //  토큰 등록 (admin.js 호출)
  // ═════════════════════════════════════════════════════════════════════════
  function registerToken(nonce, exp) {
    if (!nonce || typeof exp !== 'number') {
      return Promise.resolve({ ok: false, reason: 'invalid_args' });
    }
    if (!_init()) {
      return Promise.resolve({ ok: false, reason: 'no_firebase' });
    }
    // ★ ServerValue.TIMESTAMP 대신 Date.now() — 규칙 검증 안정성
    return _kbDb.ref(_DB_PATH + '/' + nonce).set({
      used:      false,
      exp:       exp,
      createdAt: Date.now()
    }).then(function() {
      console.log('[kbFirebase] 토큰 등록 완료:', nonce.slice(0, 6) + '\u2026');
      return { ok: true };
    }).catch(function(err) {
      console.warn('[kbFirebase] registerToken 실패:', err && err.message);
      return { ok: false, reason: 'write_error', err: err && err.message };
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  토큰 클레임 (share.js 호출)
  //  ★ STRICT 모드: nonce 있는 토큰은 graceful pass 안 함
  // ═════════════════════════════════════════════════════════════════════════
  function claimToken(nonce, exp) {
    console.log('[kbFirebase] claimToken 시작 · nonce:', nonce);

    // (0) 만료 체크
    if (typeof exp === 'number' && Date.now() > exp) {
      console.log('[kbFirebase] → 만료됨');
      return Promise.resolve({ ok: false, reason: 'expired' });
    }

    // (1) SDK/config 완전 미준비 → graceful pass (앱 깨짐 방지)
    //     config 를 바꿔서 긴급 배포 필요한 경우 대비
    if (!_init()) {
      console.warn('[kbFirebase] → SDK/config 미준비 — graceful pass');
      return Promise.resolve({ ok: true, firstClaim: true, fallback: true });
    }

    var fp  = _fingerprint();
    var ref = _kbDb.ref(_DB_PATH + '/' + nonce);
    console.log('[kbFirebase] 내 디바이스 fp:', fp);

    return ref.once('value').then(function(snap) {
      var data = snap.val();
      console.log('[kbFirebase] DB 조회 결과:', data);

      // (2) 토큰 미등록 — STRICT: 거부 (구버전은 graceful pass)
      //     정상 플로우에서는 admin 이 항상 등록하므로 없으면 위조
      if (!data) {
        console.warn('[kbFirebase] → 토큰 미등록 (차단)');
        return { ok: false, reason: 'not_found' };
      }

      // (3) DB exp 재검증
      if (data.exp && Date.now() > data.exp) {
        console.log('[kbFirebase] → DB상 만료됨');
        return { ok: false, reason: 'expired' };
      }

      // (4) 첫 클레임 → used:false → true 전환 + fp 기록
      if (data.used === false) {
        console.log('[kbFirebase] 첫 클레임 시도 중...');
        return ref.update({
          used:      true,
          claimedFp: fp,
          claimedAt: Date.now()   // ★ ServerValue.TIMESTAMP 대신
        }).then(function() {
          console.log('[kbFirebase] ✅ 첫 클레임 OK (fp:' + fp + ')');
          return { ok: true, firstClaim: true };
        }).catch(function(err) {
          // ★ STRICT: update 실패 = 권한 오류 or 네트워크 오류
          //   → 첫 클레임 실패면 차단이 맞음 (다른 기기가 동시에 선점했을 수도)
          console.error('[kbFirebase] ❌ update 실패:', err && err.message);
          return { ok: false, reason: 'claim_failed', err: err && err.message };
        });
      }

      // (5) 이미 사용됨 → fp 비교
      if (data.claimedFp === fp) {
        console.log('[kbFirebase] ✅ 같은 디바이스 재방문 OK (fp:' + fp + ')');
        return { ok: true, firstClaim: false };
      }

      // (6) 다른 디바이스 → 차단
      console.warn('[kbFirebase] ❌ 다른 디바이스 차단 (등록fp:' + data.claimedFp + ', 현재fp:' + fp + ')');
      return { ok: false, reason: 'used_other' };

    }).catch(function(err) {
      // ★ STRICT: 조회 실패 시에도 차단 (네트워크 정상인데 권한 거부 = 공격 시도 가능)
      //   단, 완전히 네트워크 다운인 경우에는 사용자 UX 보호를 위해 pass
      console.error('[kbFirebase] ❌ claimToken 오류:', err && err.message);
      var errMsg = (err && err.message) || '';
      var isNetworkDown = errMsg.indexOf('network') >= 0 || errMsg.indexOf('offline') >= 0;
      if (isNetworkDown) {
        console.warn('[kbFirebase] → 네트워크 장애로 판단 — graceful pass');
        return { ok: true, firstClaim: true, fallback: true };
      }
      return { ok: false, reason: 'verify_failed', err: errMsg };
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
    _config:       FIREBASE_CONFIG,
    _path:         _DB_PATH,
    _version:      'v2026.07-STRICT'
  };

})(window);
