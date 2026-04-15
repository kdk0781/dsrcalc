# Firebase 일회성 토큰 시스템 — 설정 가이드 (2026.07)

## 🎯 무엇이 바뀌었나

**이전**: 토큰에 만료시각만 있어서 24시간 내 누구나 사용 가능 → A가 받은 링크를 B에게 전달하면 B도 정상 접속됨

**이후**: 첫 클릭한 디바이스에 토큰이 귀속됨 → B가 클릭하면 "**다른 기기에서 사용된 링크**" 메시지 표시

---

## 📦 변경된 파일 (6개)

| 파일 | 변경 |
|---|---|
| `js/firebase-shared.js` | **신규** — 토큰 등록/클레임 + fingerprint |
| `js/admin.js` | 토큰에 nonce 추가 + Firebase 등록 |
| `js/share.js` | Firebase 클레임 + 사유별 에러 메시지 |
| `index.html` | Firebase SDK 로드 추가 |
| `share.html` | Firebase SDK 로드 추가 |
| `report.js` (별건) | 월 납입액 명목금리 기준 변경 |

---

## ⚙️ 설정 단계 (3단계)

### 1️⃣ Firebase Config 입력

`js/firebase-shared.js` 파일 상단의 `FIREBASE_CONFIG` 블록을 본인 프로젝트 정보로 교체:

```js
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",                          // ← 실제 값
  authDomain:        "your-project.firebaseapp.com",
  databaseURL:       "https://your-project-default-rtdb.firebaseio.com",
  projectId:         "your-project",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abc123..."
};
```

> **Config 가져오는 위치**: Firebase Console → 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성 → "구성"

> **⚠️ 중요**: 이미 사용 중인 아파트 시세 프로젝트와 **같은 config** 를 그대로 써도 됩니다. 코드가 `firebase.initializeApp(config, 'dsr-otl')` 로 별도 인스턴스명을 부여하고 `dsr_tokens` 라는 별도 노드만 사용하므로 기존 카운팅 데이터에 일절 영향 없습니다.

### 2️⃣ Realtime Database 활성화 확인

Firebase Console → **Realtime Database** → 데이터 탭에서 데이터베이스가 활성화되어 있는지 확인.

(이미 카운팅으로 사용 중이라면 활성화된 상태일 것입니다.)

### 3️⃣ 보안 규칙 추가

Firebase Console → **Realtime Database** → 규칙 탭 → 기존 규칙에 `dsr_tokens` 노드 규칙 **추가**:

```json
{
  "rules": {
    // ... 기존 아파트 시세 노드 규칙은 그대로 유지 ...

    "dsr_tokens": {
      "$tokenId": {
        ".read": true,
        ".write": true,
        ".validate": "newData.hasChildren(['used', 'exp']) && newData.child('used').isBoolean() && newData.child('exp').isNumber()",
        "claimedFp": { ".validate": "newData.isString() && newData.val().length <= 32" },
        "claimedAt": { ".validate": "newData.val() == now || newData.isNumber()" },
        "createdAt": { ".validate": "newData.val() == now || newData.isNumber()" },
        "$other":    { ".validate": false }
      }
    }
  }
}
```

> **보안 메모**: `dsr_tokens` 는 누구나 read/write 가능하지만, tokenId는 16자 랜덤이라 추측 불가능. validate 규칙으로 스키마 외 데이터 주입 차단. 실제 토큰 정보는 만료시각/사용여부/fingerprint 해시뿐이라 노출되어도 위협 없음.

---

## 🔍 동작 검증 시나리오

### ✅ 정상 케이스 — 같은 디바이스 재방문
1. 관리자가 링크 발급
2. A가 PC에서 클릭 → "DSR 계산기 접속 안내" 화면 표시 ✅
3. A가 같은 PC에서 다시 클릭 → 정상 통과 (재방문 인식) ✅

### ✅ 차단 케이스 — 다른 디바이스 사용
1. 관리자가 링크 발급
2. A가 PC에서 클릭 → 정상 접속
3. A가 받은 카톡 메시지를 B에게 forward
4. B가 자기 폰에서 클릭 → **"다른 기기에서 사용된 링크"** 에러 카드 표시 ✅

### ✅ 만료 케이스
- 24시간 경과 후 클릭 → "유효기간 만료" ✅

### ✅ Graceful Fallback (Firebase 장애 시)
- Firebase 다운/네트워크 오류 → 만료 체크만으로 통과
- 콘솔에 경고 로그 출력
- UX 유지 (앱 깨지지 않음)

---

## 🐛 디버깅

브라우저 콘솔(F12)에서:

```js
// 1. Firebase 연결 상태 확인
window.kbFirebase.init()
// → true (정상) / false (config 미설정 또는 SDK 미로드)

// 2. 현재 디바이스 fingerprint 확인
window.kbFirebase.fp()
// → "a3f8c2d1" (8자리 hex)

// 3. 토큰 직접 확인 (Firebase Console → Realtime DB → dsr_tokens)
//    구조 예시:
//    dsr_tokens/
//      └─ a8f3k2n9p1q4r7s5/
//          ├─ used: true
//          ├─ exp: 1745234567890
//          ├─ claimedFp: "a3f8c2d1"
//          ├─ claimedAt: 1745148123456
//          └─ createdAt: 1745148000000
```

---

## 📊 데이터 사용량 (무료 한도 이내)

- 토큰 1건당 데이터: ~150 bytes
- 일 100건 발급 한도 → 일 ~15 KB (다운로드 포함 ~30 KB)
- Firebase Spark plan 무료 한도: **10 GB/월 다운로드** + **1 GB 저장**
- 사실상 무료 한도의 **0.001%** 수준

---

## 🧹 자동 정리 (선택 사항)

만료된 토큰을 자동 삭제하려면 Firebase Console에서 **수동 삭제** 또는 **Cloud Functions** 사용. 다만 데이터양이 미미해서 1년 방치해도 무료 한도 이내. **권장: 그냥 두기**.

수동 정리가 필요하면 콘솔에서:
```
Realtime Database → dsr_tokens 노드 → 삭제
```
(다음 발급 시 자동 재생성됨)

---

## 🆘 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| `[kbFirebase] config 미설정` 콘솔 경고 | FIREBASE_CONFIG 미입력 | `firebase-shared.js` 의 config 입력 |
| `[kbFirebase] 초기화 실패` | databaseURL 오타 / 프로젝트 없음 | Console에서 정확한 URL 복사 |
| 항상 "다른 기기" 에러 | 같은 사용자가 시크릿 모드에서 테스트 | 시크릿 모드는 fingerprint 다름 — 일반 모드 사용 |
| `permission_denied` 콘솔 에러 | 보안 규칙 누락 | 위 3단계 규칙 추가 |
