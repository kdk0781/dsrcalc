/* =============================================================================
   금리 로더 — kb_rates.js  VER 2026.07 (최적화 / 고도화)
   ─────────────────────────────────────────────────────────────────────────────
   📋 동작 방식
   ・ https://kdk0781.github.io/kb/interest/script.js 에서 base/stress/mort 추출
   ・ 브레이스 카운팅 파서로 중첩 {} 구조 변경에도 견고
   ・ 합리성 검증 (0.1% ~ 20%) 통과 시에만 캐시 저장
   ・ 검증 실패 시 자동 폴백 + window._kbRatesMeta 에 사유 기록
   ・ 캐시 TTL 5분 (이전 30분 → 단축으로 즉시성 확보)

   ★ 캐시 무효화 트리거
   ・ 자동: 5분 TTL 만료 / 검증 실패 시 즉시
   ・ 수동: index.html 의 kb_rates.js?v= 변경 → 캐시 키 변경 → 신규 fetch
   ・ 수동2: FAB 새로고침 (clearKBRatesCache)

   ★ 디버깅: 콘솔에 window._kbRatesMeta 입력 시 마지막 적용 결과 확인 가능
     {source: 'live'|'cache'|'fallback', parsedAt, lastModified, error, cacheKey}

   ★ 폴백값 수정: FALLBACK_RATES 블록의 숫자만 변경
   ============================================================================= */

// ── 폴백값 (script.js 파싱 실패 시 사용) ─────────────────────────────────────
const FALLBACK_RATES = {
  '5년변동':  4.88,
  '5년혼합':  4.88,
  '6_12변동': 4.25,
  stress_m5_cycle: 1.15,
  stress_m5_mix:   1.50,
  stress_v_6_12:   2.87,
};

// ── 소스 설정 ─────────────────────────────────────────────────────────────────
const _KB_SCRIPT_URL = 'https://kdk0781.github.io/kb/interest/script.js';
const _KB_PROXY_URL  = 'https://api.allorigins.win/raw?url=';
const _KB_CACHE_MS   = 5 * 60 * 1000;   // 5분 (이전 30분 → 단축)
const _KB_RATE_MIN   = 0.1;             // 합리성 검증 하한
const _KB_RATE_MAX   = 20.0;            // 합리성 검증 상한

// ── 외부 노출 메타데이터 (디버깅 / UI 배지용) ────────────────────────────────
window._kbRatesMeta = {
  source:       null,  // 'live' | 'cache' | 'fallback'
  parsedAt:     null,  // ISO timestamp
  lastModified: null,  // script.js Last-Modified 헤더
  cacheKey:     null,
  error:        null,  // 'fetch_failed' | 'parse_failed' | null
  appliedAt:    null,  // 마지막 APP_CONFIG 적용 시각
};

let _ratesMem    = null;
let _cacheTimeMs = 0;
let _fetchProm   = null;

// ─────────────────────────────────────────────────────────────────────────────
//  ★ 버전 인식 캐시 키
//  <script src="kb_rates.js?v=2606121221"> → 캐시 키 = "kb_rates_2606121221"
// ─────────────────────────────────────────────────────────────────────────────
function _getCacheKey() {
  try {
    const el  = document.querySelector('script[src*="kb_rates.js"]');
    const src = el?.src || '';
    const m   = src.match(/[?&]v=([^&]+)/);
    return 'kb_rates_' + (m ? m[1] : 'default');
  } catch {
    return 'kb_rates_default';
  }
}

function _cleanOldCacheKeys(currentKey) {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('kb_rates_') && k !== currentKey) {
        localStorage.removeItem(k);
      }
    });
  } catch {}
}

// ── 합리성 검증 ──────────────────────────────────────────────────────────────
function _isValidRate(v) {
  return typeof v === 'number' && isFinite(v) && v >= _KB_RATE_MIN && v <= _KB_RATE_MAX;
}

function _validateRates(r) {
  if (!r) return false;
  return _isValidRate(r['5년변동'])
      && _isValidRate(r['5년혼합'])
      && _isValidRate(r['6_12변동'])
      && _isValidRate(r.stress_m5_cycle)
      && _isValidRate(r.stress_m5_mix)
      && _isValidRate(r.stress_v_6_12);
}

// ─────────────────────────────────────────────────────────────────────────────
//  공개 API
// ─────────────────────────────────────────────────────────────────────────────
async function applyKBRatesToConfig() {
  const cacheKey = _getCacheKey();
  window._kbRatesMeta.cacheKey = cacheKey;

  const rates = await _loadRates();
  const r     = rates || FALLBACK_RATES;
  const cfg   = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG : null;
  if (!cfg?.KB_MORTGAGE_RATES) return;

  // 폴백 사용 시 메타 갱신
  if (!rates) {
    window._kbRatesMeta.source   = 'fallback';
    window._kbRatesMeta.parsedAt = null;
  }

  ['mortgage_level', 'mortgage_prin'].forEach(cat => {
    cfg.KB_MORTGAGE_RATES[cat]['5년변동']  = r['5년변동'];
    cfg.KB_MORTGAGE_RATES[cat]['5년혼합']  = r['5년혼합'];
    cfg.KB_MORTGAGE_RATES[cat]['6_12변동'] = r['6_12변동'];
  });

  cfg.STRESS_RATES = {
    m5_cycle: r.stress_m5_cycle,
    m5_mix:   r.stress_m5_mix,
    v_6_12:   r.stress_v_6_12,
  };

  window._kbRatesMeta.appliedAt = new Date().toISOString();

  // 색상 구분 콘솔 로그 (디버깅 용이성)
  const tag = window._kbRatesMeta.source === 'live'     ? '%c[금리:LIVE]%c'
            : window._kbRatesMeta.source === 'cache'    ? '%c[금리:CACHE]%c'
            : '%c[금리:FALLBACK]%c';
  const style = window._kbRatesMeta.source === 'live'     ? 'background:#16A34A;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700'
              : window._kbRatesMeta.source === 'cache'    ? 'background:#2563EB;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700'
              : 'background:#D97706;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700';

  console.log(tag + ` 적용 완료 (키: ${cacheKey})`, style, '', {
    '5년변동':  r['5년변동'],
    '5년혼합':  r['5년혼합'],
    '6,12개월': r['6_12변동'],
    'ST주기형': r.stress_m5_cycle,
    'ST혼합형': r.stress_m5_mix,
    'ST변동형': r.stress_v_6_12,
    '파싱시각': window._kbRatesMeta.parsedAt || '없음(폴백)',
  });

  // UI 배지 갱신 (ui.js 의 _renderRateBadge 가 있으면 호출)
  if (typeof _renderRateBadge === 'function') {
    try { _renderRateBadge(); } catch {}
  }
}

/** 강제 캐시 삭제 (FAB 새로고침 버튼용) */
async function clearKBRatesCache() {
  const key = _getCacheKey();
  localStorage.removeItem(key);
  _cleanOldCacheKeys(key);
  _ratesMem    = null;
  _cacheTimeMs = 0;
  _fetchProm   = null;
  console.log(`[금리] 캐시 삭제 완료 (키: ${key})`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  내부: 캐시 우선 로드
// ─────────────────────────────────────────────────────────────────────────────
async function _loadRates() {
  const cacheKey = _getCacheKey();

  // 메모리 캐시 (5분, 검증 통과한 것만)
  if (_ratesMem && Date.now() - _cacheTimeMs < _KB_CACHE_MS && _validateRates(_ratesMem)) {
    window._kbRatesMeta.source   = 'cache';
    window._kbRatesMeta.parsedAt = _ratesMem._parsed_at || null;
    return _ratesMem;
  }

  // localStorage 캐시 (5분, 검증 통과한 것만)
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (c && Date.now() - c.t < _KB_CACHE_MS && _validateRates(c.d)) {
      _ratesMem    = c.d;
      _cacheTimeMs = c.t;
      window._kbRatesMeta.source       = 'cache';
      window._kbRatesMeta.parsedAt     = c.d._parsed_at || null;
      window._kbRatesMeta.lastModified = c.lm || null;
      console.log(`[금리] localStorage 캐시 사용 (키: ${cacheKey})`);
      return _ratesMem;
    }
    // 검증 실패한 캐시는 즉시 삭제
    if (c && !_validateRates(c.d)) {
      console.warn(`[금리] 캐시 검증 실패 → 삭제 (키: ${cacheKey})`);
      localStorage.removeItem(cacheKey);
    }
  } catch {}

  // 중복 fetch 방지 (in-flight 공유)
  if (_fetchProm) return _fetchProm;
  _fetchProm = _fetchAndParse(cacheKey).finally(() => { _fetchProm = null; });
  return _fetchProm;
}

// ─────────────────────────────────────────────────────────────────────────────
//  내부: 실제 fetch + 파싱
// ─────────────────────────────────────────────────────────────────────────────
async function _fetchAndParse(cacheKey) {
  // 캐시 버스터: 타임스탬프 + 랜덤문자 (브라우저/CDN 캐시 우회 강화)
  const bustUrl = _KB_SCRIPT_URL + '?_cb=' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  let text = null;
  let lastModified = null;

  // ── 1차: 직접 fetch (same-origin: kdk0781.github.io 내부) ──────────────────
  try {
    const res = await fetch(bustUrl, {
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (res.ok) {
      text = await res.text();
      lastModified = res.headers.get('last-modified') || res.headers.get('etag') || null;
      console.log(`[금리] 직접 fetch OK (Last-Modified: ${lastModified || 'N/A'})`);
    } else {
      console.warn('[금리] 직접 fetch HTTP', res.status);
    }
  } catch (e) {
    console.warn('[금리] 직접 fetch 실패 → 프록시 시도:', e?.message || e);
  }

  // ── 2차: CORS 프록시 fallback ─────────────────────────────────────────────
  if (!text) {
    try {
      const res = await fetch(_KB_PROXY_URL + encodeURIComponent(bustUrl), { cache: 'no-store' });
      if (res.ok) {
        text = await res.text();
        console.log('[금리] 프록시 fetch OK');
      }
    } catch (e) {
      console.warn('[금리] 프록시 fetch 실패:', e?.message || e);
    }
  }

  if (!text) {
    console.warn('[금리] 모든 fetch 실패 → 폴백값 사용');
    window._kbRatesMeta.error = 'fetch_failed';
    return null;
  }

  const rates = _parseScript(text);
  if (!rates) {
    console.warn('[금리] 파싱 실패 → 폴백값 사용');
    window._kbRatesMeta.error = 'parse_failed';
    return null;
  }
  if (!_validateRates(rates)) {
    console.warn('[금리] 합리성 검증 실패 → 폴백값 사용', rates);
    window._kbRatesMeta.error = 'parse_failed';
    return null;
  }

  // 성공 → 캐시 저장
  _ratesMem    = rates;
  _cacheTimeMs = Date.now();
  window._kbRatesMeta.source       = 'live';
  window._kbRatesMeta.parsedAt     = rates._parsed_at;
  window._kbRatesMeta.lastModified = lastModified;
  window._kbRatesMeta.error        = null;

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ d: rates, t: _cacheTimeMs, lm: lastModified }));
    _cleanOldCacheKeys(cacheKey);
  } catch {}

  console.log(`[금리] 파싱 성공 → 캐시 저장 (키: ${cacheKey})`);
  return rates;
}

// ─────────────────────────────────────────────────────────────────────────────
//  내부: 파서 (브레이스 카운팅 — 중첩 {} 구조 변경에 견고)
// ─────────────────────────────────────────────────────────────────────────────
function _parseScript(text) {
  try {
    const base   = _extractBlock(text, 'base');
    const stress = _extractBlock(text, 'stress');
    const mort   = _extractBlock(text, 'mort');
    if (!base || !stress || !mort) {
      console.warn('[금리] 파서: 블록 누락', { base: !!base, stress: !!stress, mort: !!mort });
      return null;
    }

    const mor5     = _kv(base, 'mor5');
    const ncofix   = _kv(base, 'ncofix');
    const scofix   = _kv(base, 'scofix');
    const primeOn  = _kv(base, 'primeOn');
    const m5_cycle = _kv(stress, 'm5_cycle');
    const m5_mix   = _kv(stress, 'm5_mix');
    const v_6_12   = _kv(stress, 'v_6_12');
    const m5       = _kv(mort, 'm5');
    const n6       = _kv(mort, 'n6');
    const n12      = _kv(mort, 'n12');
    const s6       = _kv(mort, 's6');
    const s12      = _kv(mort, 's12');

    if (mor5 == null || ncofix == null || scofix == null || primeOn == null
     || m5_cycle == null || m5_mix == null || v_6_12 == null || m5 == null) {
      console.warn('[금리] 파서: 필수값 누락', {
        mor5, ncofix, scofix, primeOn, m5_cycle, m5_mix, v_6_12, m5
      });
      return null;
    }

    const rate5 = _r2(mor5 + m5 - primeOn);
    const cands = [
      n6  != null ? _r2(ncofix + n6  - primeOn) : Infinity,
      n12 != null ? _r2(ncofix + n12 - primeOn) : Infinity,
      s6  != null ? _r2(scofix + s6  - primeOn) : Infinity,
      s12 != null ? _r2(scofix + s12 - primeOn) : Infinity,
    ].filter(v => v < Infinity && v > 0);
    const rate612 = cands.length ? Math.min(...cands) : FALLBACK_RATES['6_12변동'];

    return {
      '5년변동':       rate5,
      '5년혼합':       rate5,
      '6_12변동':      rate612,
      stress_m5_cycle: m5_cycle,
      stress_m5_mix:   m5_mix,
      stress_v_6_12:   v_6_12,
      _parsed_at:      new Date().toISOString(),
      _raw: { mor5, ncofix, scofix, primeOn, m5, m5_cycle, m5_mix, v_6_12 }
    };
  } catch (e) {
    console.warn('[금리] 파서 예외:', e);
    return null;
  }
}

/** 블록 추출 — 중첩 {} 카운팅으로 정확한 블록 경계 검출 */
function _extractBlock(text, key) {
  const re = new RegExp('\\b' + key + '\\s*:\\s*\\{');
  const m  = text.match(re);
  if (!m) return null;
  const start = m.index + m[0].length - 1;  // '{' 위치
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
}

function _kv(text, key) {
  const re = new RegExp('\\b' + key + '\\s*:\\s*([\\d]+(?:\\.[\\d]+)?)');
  const m  = text.match(re);
  return m ? parseFloat(m[1]) : null;
}

function _r2(v) { return Math.round(v * 100) / 100; }
