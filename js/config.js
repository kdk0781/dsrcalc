/* =============================================================================
   js/config.js — 앱 전역 설정
   ─────────────────────────────────────────────────────────────────────────────
   ★ 이 블록의 값만 수정하면 앱 전체에 즉시 반영됩니다
   · 캐시 갱신: index.html 의 ?v= 쿼리 값을 올려주세요 (항목 8 참조)
   ============================================================================= */

const APP_CONFIG = {

  APP_VERSION:    '2026.05-C',
  NOTICE_VERSION: '0781_0',   // ← 공지 강제 노출 시 올림 (예: '0781_1')

  // ── DSR 규제선 구간 (%) ─────────────────────────────────────────────────
  DSR_LIMIT_PCT:   40,        // 규제선 (초과 시 신규 대출 제한)
  DSR_WARN_PCT:    36,        // 경계 구간
  DSR_CAUTION_PCT: 25,        // 주의 구간

  // ── 연소득 최소 입력값 (원) ─────────────────────────────────────────────
  MIN_INCOME: 1_000_000,

  // ── 상환 스케줄 허용 기간 (개월) ────────────────────────────────────────
  SCH_MIN_MONTHS: 180,
  SCH_MAX_MONTHS: 600,

  // ── 대출 종류별 기본 금리 % (금리 미입력 시 자동 적용) ─────────────────
  DEFAULT_RATES: {
    mortgage_level: 4.5,
    mortgage_prin:  4.5,
    jeonse:         4.2,
    officetel:      5.5,
    credit:         6.0,
    cardloan:       14.0,
  },

  // ── DSR 산정 가상 만기 (개월) ───────────────────────────────────────────
  DSR_VIRTUAL_MONTHS: { credit: 60, cardloan: 36 },

  // ── 레이블 / 이모티콘 ───────────────────────────────────────────────────
  CAT_LABELS: {
    mortgage_level: '주택담보 (원리금)', mortgage_prin: '주택담보 (원금)',
    jeonse: '전세대출 (만기)', officetel: '오피스텔 (원리금)',
    credit: '신용대출 (원리금)', cardloan: '카드론 (원리금)',
  },
  CAT_EMOJIS: {
    mortgage_level:'🏠', mortgage_prin:'🏠', jeonse:'🔑',
    officetel:'🏢', credit:'💳', cardloan:'💰',
  },

  OFFICETEL_PURCHASE_MIN_MONTHS: 180,
  DEFAULT_STRESS_RATE_MORTGAGE:  1.15,
  SCHEDULE_MAX_HEIGHT_PX:        480,

  // ── 리포트 링크 설정 ────────────────────────────────────────────────────
  REPORT_LINK_EXPIRY_DAYS: 7,   // 리포트 링크 유효일 수
  REPORT_COPY_DAILY_LIMIT: 100,  // 하루 발급 한도 ← 숫자만 변경
  REPORT_PAGE_PATH: 'report.html',
  SHORTENER_API: 'https://is.gd/create.php?format=simple&url=',

  // ── 담보대출 유형별 금리 % (폴백값 — kb_rates.js 에서 자동 갱신) ────
  KB_MORTGAGE_RATES: {
    mortgage_level: { '5년변동': 5.14, '5년혼합': 5.14, '6_12변동': 4.41, '직접입력': null },
    mortgage_prin:  { '5년변동': 5.14, '5년혼합': 5.14, '6_12변동': 4.41, '직접입력': null },
  },

  // ── 스트레스 금리 기준값 (kb_rates.js 에서 자동 갱신) ──────────────────
  STRESS_RATES: { m5_cycle: 1.15, m5_mix: 1.50, v_6_12: 2.87 },
};

/* ── 단축 참조 (읽기 전용) ─────────────────────────────────────────────────── */
const _C     = APP_CONFIG;
const _RATE  = _C.DEFAULT_RATES;
const _LABEL = _C.CAT_LABELS;
const _EMOJI = _C.CAT_EMOJIS;

/* ── 전역 상태 변수 ─────────────────────────────────────────────────────────── */
let loanCount           = 0;
let currentScheduleType = 'P';
let lastFocusId         = null;
let proceedOnConfirm    = false;
let _modalQueue         = [];
let _onQueueDone        = null;
let _inQueueMode        = false;
