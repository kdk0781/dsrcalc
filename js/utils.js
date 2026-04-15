/* =============================================================================
   js/utils.js — 순수 유틸리티 함수 모음
   · DOM 에 의존하지 않는 순수 함수만 포함합니다
   · 의존: config.js (APP_CONFIG, _C)
   ============================================================================= */

// ─── 숫자 / 포맷 유틸 ────────────────────────────────────────────────────────
/** 콤마 문자열 → 숫자 */
function getNum(val)  { return Number(String(val).replace(/,/g, '')) || 0; }

/** 인풋에 콤마 포맷 적용 */
function formatComma(obj) {
  const v = obj.value.replace(/[^0-9]/g, '');
  obj.value = v.length > 0 ? Number(v).toLocaleString() : '';
  obj.classList.remove('input-warning');
}

/** 전화번호 자동 하이픈 포맷 (숫자만 입력해도 010-0000-0000 형식으로 변환) */
function formatPhone(el) {
  const digits = el.value.replace(/\D/g, '').slice(0, 11);
  if      (digits.length <= 3) el.value = digits;
  else if (digits.length <= 7) el.value = digits.slice(0, 3) + '-' + digits.slice(3);
  else                          el.value = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
}

// ─── 금리 유틸 ───────────────────────────────────────────────────────────────
/** 대출 종류별 기본 금리 반환 */
function getDefaultRate(cat) { return _RATE[cat] ?? 4.5; }

/** 스트레스 금리 식별자 → 수치 변환 */
function getStressRate(key) {
  if (!key || key === '0') return 0;
  return _C.STRESS_RATES[key] ?? 1.15;
}

/** 구입자금 여부 판별 */
function isPurchaseLoan(cat, n) {
  return cat === 'mortgage_level' || cat === 'mortgage_prin' ||
         (cat === 'officetel' && n >= _C.OFFICETEL_PURCHASE_MIN_MONTHS);
}

// ─── 수학 유틸 ───────────────────────────────────────────────────────────────
/** 원리금균등 월 납입액 계산 */
function calcPMT(P, r, n) {
  if (r === 0) return P / n;
  return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** 원금균등 방식 최대 대출 원금 계산 */
function calcMaxPrincipal(tAnn, r, n) {
  const d = (12 / n) + (r * 6 * (n + 1) / n);
  return d > 0 ? tAnn / d : 0;
}

/** 원리금균등 방식 최대 대출 원금 계산 */
function calcMaxLevel(tAnn, r, n) {
  if (r === 0) return (tAnn / 12) * n;
  return (tAnn / 12) * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
}

// ─── DOM 유틸 ────────────────────────────────────────────────────────────────
/** 인풋 경고 스타일 토글 */
function setWarning(id, isError) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('input-warning', isError);
}

/** 부채 항목 DOM 제거 */
function removeLoan(id) { document.getElementById(`loan_${id}`)?.remove(); }
