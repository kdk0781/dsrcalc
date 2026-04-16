/* =============================================================================
   js/report-page.js — DSR 진단 리포트 렌더러 v5 (VER 2026.07-NOTICE-FIX)
   ─────────────────────────────────────────────────────────────────────────────
   ★ v2026.07-NOTICE-FIX 변경사항
     · "오늘 하루 보지 않기" 저장 로직 견고화
       - 단일 키(rpt_notice_last_hidden) + 저장일 비교 방식으로 전환
       - KST 기준 날짜 사용 (UTC 자정 이슈 회피)
       - sessionStorage 폴백 추가 (프라이빗 모드 대응)
       - 팝업 HTML 자체를 조건부 생성 (타이밍 이슈 완전 제거)
     · 월 납입액 표시는 모두 명목금리(R) 기준 — 스케줄 표와 정확히 일치
     · 스트레스 금리(SR)는 DSR 연산 전용 (종합 DSR 지수 카드에서만 사용)
     · 전세 단일 그리드 100% 너비 + 가독성 향상
   ─────────────────────────────────────────────────────────────────────────────
   ① 관리자 기기 (kb_admin_session 유효) → 무제한 접속
   ② 최초 수신 기기 → 기기 바인딩 후 유효기간 다회 접속 허용
   ③ 다른 기기에서 복사된 링크 → 재공유 차단 메시지
   ─────────────────────────────────────────────────────────────────────────────
   ★ 리포트 유효기간 변경: js/config.js 의 REPORT_LINK_EXPIRY_DAYS 수정
      3일  → 3   /  7일 → 7 (현재)  /  14일 → 14
   ★ _RPT_SIGN_KEY 는 js/report.js 의 _OTL_SIGN_KEY 와 동일해야 합니다
   ============================================================================= */

console.log('[report-page.js] v2026.07-NOTICE-FIX 로드됨');

const _RPT_SIGN_KEY  = 'KB_DSR_OTL_SIGN_2026';
const _RPT_GRANT_PFX = 'rpt_grant_';
const _RPT_ACTIVE    = 'rpt_active_nonce';

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
const won = v => Math.round(v).toLocaleString() + '원';
const pct = v => v.toFixed(2) + '%';
const CAT_LABELS = {
  mortgage_level:'주택담보 (원리금)', mortgage_prin:'주택담보 (원금)',
  jeonse:'전세대출 (만기)', officetel:'오피스텔 (원리금)',
  credit:'신용대출 (원리금)', cardloan:'카드론 (원리금)',
};
const CAT_EMOJI = {
  mortgage_level:'🏠', mortgage_prin:'🏠', jeonse:'🔑',
  officetel:'🏢', credit:'💳', cardloan:'💰',
};

function dsrColor(v) {
  if (v > 40) return 'var(--rp-danger)';
  if (v > 36) return 'var(--rp-warn)';
  if (v > 25) return 'var(--rp-yellow-deep)';
  return 'var(--rp-safe)';
}
function rankClass(i) { return ['rank-1','rank-2','rank-3'][i] ?? 'rank-n'; }

/** 남은 시간에 따른 카운트다운 색상 */
function countdownColor(msLeft) {
  if (msLeft < 86400000)      return '#dc2626'; // 1일 미만: 빨간색
  if (msLeft < 3 * 86400000) return '#d97706'; // 3일 미만: 노란색
  return '#16a34a';                              // 3일 이상: 초록색
}

// ─── 관리자 기기 판별 ─────────────────────────────────────────────────────────
function _isAdminDevice() {
  try {
    const s = JSON.parse(localStorage.getItem('kb_admin_session') || 'null');
    return s?.isAuth && Date.now() < s.expires;
  } catch { return false; }
}

// ─── HMAC 검증 ────────────────────────────────────────────────────────────────
async function _rptVerifySign(payload, sigToCheck) {
  const keyBuf  = new TextEncoder().encode(_RPT_SIGN_KEY);
  const dataBuf = new TextEncoder().encode(JSON.stringify(payload));
  const ck = await crypto.subtle.importKey('raw', keyBuf, { name:'HMAC', hash:'SHA-256' }, false, ['verify']);
  const b64 = sigToCheck.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return crypto.subtle.verify('HMAC', ck, buf, dataBuf);
}

// ─── 기기 바인딩 유틸 ─────────────────────────────────────────────────────────
function _rptIsGranted(nonce) {
  try {
    const raw = localStorage.getItem(_RPT_GRANT_PFX + nonce);
    if (!raw) return false;
    return Date.now() < JSON.parse(raw).expiry;
  } catch { return false; }
}
function _rptGrant(nonce, expiry) {
  try {
    localStorage.setItem(_RPT_GRANT_PFX + nonce, JSON.stringify({ expiry, grantedAt: Date.now() }));
    localStorage.setItem(_RPT_ACTIVE, nonce);
    // 만료된 기록 청소
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(_RPT_GRANT_PFX)) continue;
      try { if (Date.now() > JSON.parse(localStorage.getItem(k)).expiry) localStorage.removeItem(k); }
      catch { localStorage.removeItem(k); }
    }
  } catch {}
}

// ─── countUp 애니메이션 ────────────────────────────────────────────────────────
function countUp(el, target, suffix, dur = 800) {
  const start = performance.now();
  const isInt = Number.isInteger(target);
  const step  = ts => {
    const p = Math.min((ts - start) / dur, 1);
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = (isInt ? Math.round(target * e).toLocaleString() : (target * e).toFixed(2)) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ─── 실시간 카운트다운 ────────────────────────────────────────────────────────
function startCountdown(expiry) {
  const update = () => {
    const diff  = Math.max(0, expiry - Date.now());
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const color = countdownColor(diff);
    const dEl = document.getElementById('cdDays');
    const hEl = document.getElementById('cdHours');
    if (dEl) { dEl.textContent = days; dEl.style.color = color; }
    if (hEl) { hEl.textContent = String(hours).padStart(2, '0'); hEl.style.color = color; }
    if (diff <= 0) clearInterval(window._cdTimer);
  };
  update();
  window._cdTimer = setInterval(update, 60_000);
}

// ─── 개인정보 보호 공지 팝업 ─────────────────────────────────────────────────
// ★ v2026.07-NOTICE-FIX: localStorage 키 구조 변경 + 견고한 상태 복원
//   이전 버그: rpt_notice_hide_{YYYY-MM-DD} 키가 날짜가 변경될 때 유실되거나
//              여러 탭/세션에서 일관되지 않게 저장되는 현상
//   해결: 단일 키(rpt_notice_last_hidden)에 마지막 숨김 날짜 저장
//         다음 방문 시 저장된 날짜 === 오늘이면 팝업 스킵
const _RPT_NOTICE_KEY = 'rpt_notice_last_hidden';

function _todayStr() {
  // KST 기준 YYYY-MM-DD (UTC 자정 문제 회피)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _isNoticeHiddenToday() {
  const today = _todayStr();
  try {
    // localStorage 우선 체크
    if (localStorage.getItem(_RPT_NOTICE_KEY) === today) {
      console.log('[rpt-notice] localStorage 일치 — 숨김');
      return true;
    }
    // sessionStorage 폴백 체크 (프라이빗 모드 등)
    if (sessionStorage.getItem(_RPT_NOTICE_KEY) === today) {
      console.log('[rpt-notice] sessionStorage 일치 — 숨김');
      return true;
    }
    console.log('[rpt-notice] 저장값 없음/불일치 — 표시');
    return false;
  } catch (e) {
    console.warn('[rpt-notice] storage 접근 실패:', e);
    return false;
  }
}

function initReportNotice(expiryDays) {
  if (_isNoticeHiddenToday()) {
    console.log('[rpt-notice] 오늘 숨김 처리됨 — 팝업 생략');
    return;
  }
  const popup = document.getElementById('rptNoticePopup');
  if (popup) {
    popup.style.display = 'flex';
    console.log('[rpt-notice] 팝업 표시');
  }
}

function closeReportNotice() {
  const popup = document.getElementById('rptNoticePopup');
  if (popup) popup.remove();
}

function hideReportNoticeToday() {
  const today = _todayStr();
  try {
    localStorage.setItem(_RPT_NOTICE_KEY, today);
    // 저장 검증 — setItem 직후 getItem 실패 시 sessionStorage 폴백
    if (localStorage.getItem(_RPT_NOTICE_KEY) !== today) {
      console.warn('[rpt-notice] localStorage 저장 검증 실패 → sessionStorage 폴백');
      sessionStorage.setItem(_RPT_NOTICE_KEY, today);
    } else {
      console.log('[rpt-notice] ✅ 저장 완료:', today);
    }
  } catch (e) {
    console.error('[rpt-notice] 저장 실패:', e);
    try { sessionStorage.setItem(_RPT_NOTICE_KEY, today); } catch (e2) {}
  }
  closeReportNotice();
}

// ─── 에러 렌더러 ──────────────────────────────────────────────────────────────
function renderError(icon, title, desc) {
  document.getElementById('rpWrap').innerHTML = `
    <div class="rp-error">
      <div class="rp-error-icon">${icon}</div>
      <p class="rp-error-title">${title}</p>
      <p class="rp-error-desc">${desc}</p>
    </div>`;
}

// ─── 간이 PMT 계산 (schedule용) ───────────────────────────────────────────────
function _pmt(P, r, n) {
  if (r === 0) return P / n;
  return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ─── 부채별 12회차 상환 스케줄 생성 ─────────────────────────────────────────
// ─── 전회차 상환 스케줄 생성 ─────────────────────────────────────────────────
// type: 'level' = 원리금균등 / 'prin' = 원금균등
function buildFullSchedule(P, R, n, type = 'level') {
  const r = R / 1200;
  const rows = [];
  let balance = P;
  const monthlyLevel = _pmt(P, r, n);
  const monthlyPrin  = P / n;

  for (let i = 1; i <= n; i++) {
    const interest  = balance * r;
    const principal = type === 'level' ? monthlyLevel - interest : monthlyPrin;
    const payment   = type === 'level' ? monthlyLevel : principal + interest;
    balance -= (type === 'level' ? principal : monthlyPrin);
    rows.push({
      i,
      principal: Math.round(principal),
      interest:  Math.round(interest),
      payment:   Math.round(payment),
      balance:   Math.max(0, Math.round(balance))
    });
  }
  return rows;
}

// 스케줄 데이터를 전역 캐시에 저장 (DOM 템플릿 문자열에서 함수 호출 불가 → 분리)
window._rptSchCache = {};

// ─── 리포트 렌더러 ────────────────────────────────────────────────────────────
function renderReport(d) {
  const wrap = document.getElementById('rpWrap');
  if (Date.now() > d.expiry) {
    renderError('⏰', '리포트 유효기간 만료', '이 리포트는 7일간 유효합니다.<br>담당자에게 새로운 리포트를 요청해 주세요.');
    return;
  }

  const createdFmt = new Date(d.createdAt).toLocaleString('ko-KR', {
    year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'
  });
  const expiryFmt = new Date(d.expiry).toLocaleDateString('ko-KR', { month:'long', day:'numeric' });
  const msLeft    = d.expiry - Date.now();
  const cdColor   = countdownColor(msLeft);

  const sortedLoans = d.loans
    ? [...d.loans].sort((a, b) => (b.dsrCont ?? 0) - (a.dsrCont ?? 0))
    : [];

  const totalDSR = d.dsr ?? parseFloat(d.dsrText) ?? 0;
  const isOver   = d.isOver ?? (totalDSR > 40);
  const color    = dsrColor(totalDSR);
  const barPct   = Math.min(totalDSR, 100).toFixed(1);

  // ━━━ [1] 헤더 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const headerHtml = `
    <div class="rp-header">
      <div class="rp-header-glow"></div>
      <div class="rp-logo">DSR 진단 리포트</div>
      <div class="rp-title">📊 DSR 종합 진단 결과</div>
      <div class="rp-meta">발급일: ${createdFmt}</div>
      <div class="rp-countdown-wrap">
        <div class="rp-countdown-segments">
          <div class="cd-block">
            <div class="cd-num" id="cdDays" style="color:${cdColor};">--</div>
            <div class="cd-unit">DAYS</div>
          </div>
          <div class="cd-sep" style="color:${cdColor}">:</div>
          <div class="cd-block">
            <div class="cd-num" id="cdHours" style="color:${cdColor};">--</div>
            <div class="cd-unit">HOURS</div>
          </div>
        </div>
        <div class="rp-countdown-right">
          <span class="cd-tag">EXPIRY</span>
          <span class="cd-date">${expiryFmt}까지 유효</span>
        </div>
      </div>
    </div>`;

  // ━━━ [1-1] 상담사 워터마크 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let consultantHtml = '';
  if (d.consultant?.phone) {
    consultantHtml = `
      <div class="consultant-banner">
        <div class="consultant-inner">
          <div class="consultant-avatar">👤</div>
          <div class="consultant-body">
            <div class="consultant-tag">CONSULTANT CONTACT</div>
            <div class="consultant-phone">${d.consultant.phone}</div>
            <div class="consultant-msg">담당 상담사에게 DSR 관련 궁금한 내용이 있으시면<br>상담 받아보시길 권장합니다.</div>
          </div>
        </div>
      </div>`;
  }

  // ━━━ [2] DSR 종합 카드 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const dsrCardHtml = `
    <div class="rp-card">
      <div class="rp-card-title">종합 DSR 지수 (스트레스 금리 반영)</div>
      <div class="dsr-big" id="dsrBig" style="color:${color};">0.00%</div>
      <div class="dsr-label">연소득 대비 연간 원리금 상환 비율</div>
      <div class="dsr-bar-track"><div class="dsr-bar-fill" id="dsrBar" style="background:${color};"></div></div>
      <div class="dsr-legend">
        <span>0%</span>
        <span style="color:${color};font-weight:700;">현재 ${pct(totalDSR)}</span>
        <span>규제선 40%</span>
      </div>
    </div>`;

  // ━━━ [3] 요약 그리드 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const summaryHtml = `
    <div class="rp-card">
      <div class="rp-card-title">한도 분석 요약</div>
      <div class="summary-grid">
        <div class="summary-item"><div class="summary-item-label">연간 세전 소득</div><div class="summary-item-value">${won(d.income)}</div></div>
        <div class="summary-item"><div class="summary-item-label">연간 총 원리금</div><div class="summary-item-value">${won(d.totalAnnPayment ?? 0)}</div></div>
        <div class="summary-item">
          <div class="summary-item-label">원금균등 최대 한도</div>
          <div class="summary-item-value" style="color:${isOver?'var(--rp-danger)':'var(--rp-safe)'};">${d.maxPTxt||'-'}</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-label">원리금균등 최대 한도</div>
          <div class="summary-item-value" style="color:${isOver?'var(--rp-danger)':''};">${isOver?'한도 초과':(d.maxLTxt||'-')}</div>
        </div>
        <div class="summary-item full">
          <div class="summary-item-label">현재 추가 가능 대출액</div>
          <div class="summary-item-value" style="color:${isOver?'var(--rp-danger)':'var(--rp-safe)'};">
            ${isOver?'신규 대출 불가 (규제선 초과)':(d.remainTxt||'-')}
          </div>
        </div>
      </div>
    </div>`;

  // ━━━ [4] 부채 상세 내역 (원리금균등 + 원금균등 둘 다 표시) ━━━━━━━━━━━━━━
  // ★ 정책: 월 납입액 표시는 실제 상환 금액 = 명목금리(R) 기준
  //         스트레스 금리(SR)는 DSR 연산 전용 (종합 DSR 지수 카드에서만 사용)
  let loanDetailHtml = '';
  if (d.loans && d.loans.length > 0) {
    const rows = d.loans.map((l, idx) => {
      const label   = CAT_LABELS[l.cat] || l.cat;
      const emoji   = CAT_EMOJI[l.cat]  || '📌';
      // ★ 폴백 계산: report.js 에서 monthlyLevel/monthlyPrin1 미전달 시에만 사용
      //   둘 다 명목금리(l.R / 1200)만 사용 — 스트레스 제외
      const lvlMon  = l.monthlyLevel ?? Math.round(_pmt(l.P, l.R / 1200, l.n));
      const prinMon = l.monthlyPrin1 ?? Math.round((l.P / l.n) + l.P * (l.R / 1200));
      const isJeonse= l.cat === 'jeonse';
      const schId   = `sch_${idx}`;

      // 전회차 스케줄 — 전역 캐시에 저장 후 탭 전환으로 렌더링
      window._rptSchCache[schId] = {
        P: l.P, R: l.R, n: l.n, label, emoji,
        level: null, prin: null  // lazy: 토글 시 생성
      };

      return `
        <div class="ld-item">
          <div class="ld-header">
            <div class="ld-name">${emoji} ${label}</div>
            <div class="ld-term-badge">${l.n}개월</div>
          </div>
          <div class="ld-meta-row">
            <span class="ld-chip">대출 잔액 ${won(l.P)}</span>
            <span class="ld-chip">금리 ${l.R.toFixed(2)}%</span>
          </div>
          ${isJeonse ? `
          <div class="ld-payment-grid" style="grid-template-columns:1fr;">
            <div class="ld-payment-item" style="width:100%;text-align:center;padding:18px 16px;">
              <div class="ld-payment-label" style="font-size:13px;margin-bottom:6px;">
                월 이자 납입액
                <span class="ld-payment-sub" style="opacity:.75;font-weight:600;">(만기일시상환)</span>
              </div>
              <div class="ld-payment-value" style="font-size:22px;font-weight:900;letter-spacing:-.01em;">${Math.round(l.P * l.R / 1200).toLocaleString()}원</div>
            </div>
          </div>` : `
          <div class="ld-payment-grid">
            <div class="ld-payment-item">
              <div class="ld-payment-label">월 납입액<br><span class="ld-payment-sub">원리금균등</span></div>
              <div class="ld-payment-value">${lvlMon.toLocaleString()}원</div>
            </div>
            <div class="ld-payment-item ld-payment-item--alt">
              <div class="ld-payment-label">월 납입액 (1회차)<br><span class="ld-payment-sub">원금균등</span></div>
              <div class="ld-payment-value">${prinMon.toLocaleString()}원</div>
            </div>
          </div>`}
          ${isJeonse ? '' : `
          <button class="ld-sch-btn" id="btn_${schId}" onclick="_rptToggleSch('${schId}', this)">
            ▼ 회차별 상환 스케줄 보기
          </button>
          <div id="${schId}" class="ld-sch-wrap" style="display:none;"></div>`}
        </div>`;
    }).join('');

    loanDetailHtml = `
      <div class="rp-card">
        <div class="rp-card-title">📋 부채 상세 내역</div>
        ${rows}
      </div>`;
  }

  // ━━━ [5] 개별 DSR 기여도 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let contribHtml = '';
  if (sortedLoans.length > 0) {
    const maxCont = Math.max(...sortedLoans.map(l => l.dsrCont ?? 0), 1);
    const rows = sortedLoans.map((l, i) => {
      const cont = l.dsrCont ?? 0;
      const barW = ((cont / Math.max(maxCont, totalDSR)) * 100).toFixed(1);
      const fill = i === 0 ? 'var(--rp-danger)' : i === 1 ? 'var(--rp-warn)' : 'var(--rp-yellow)';
      return `
        <div class="loan-item">
          <div class="loan-item-header">
            <div class="loan-item-name">
              <span class="rank-badge ${rankClass(i)}">${i+1}</span>
              <span>${CAT_EMOJI[l.cat]||'📌'} ${CAT_LABELS[l.cat]||l.cat}</span>
            </div>
            <div class="loan-item-pct" style="color:${fill};">${pct(cont)}</div>
          </div>
          <div class="loan-bar-track"><div class="loan-bar-fill" data-width="${barW}" style="background:${fill};"></div></div>
          <div class="loan-item-meta">
            <div class="loan-meta-row">
              <span class="loan-meta-chip">원금 ${won(l.P)}</span>
              <span class="loan-meta-chip">금리 ${l.R?l.R.toFixed(2)+'%':'-'}</span>
              <span class="loan-meta-chip">연 상환 ${won(l.annPmt??0)}</span>
            </div>
            <div class="loan-meta-row">
              <span class="loan-meta-drop" style="color:${fill};">▼ 정리 시 DSR ${cont.toFixed(2)}%p 감소</span>
            </div>
          </div>
        </div>`;
    }).join('');
    contribHtml = `
      <div class="rp-card">
        <div class="rp-card-title">📊 개별 부채별 DSR 기여도 (기여도 높은 순)</div>
        ${rows}
      </div>`;
  }

  // ━━━ [6] 역행 산출 / 건전성 진단 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let reverseHtml = '';
  if (isOver && d.reqIncome) {
    const top1     = sortedLoans[0];
    const t1Label  = top1 ? `${CAT_EMOJI[top1.cat]||'📌'} ${CAT_LABELS[top1.cat]||top1.cat}` : '-';
    const t1Pct    = top1 ? top1.dsrCont.toFixed(2) : '-';
    reverseHtml = `
      <div class="rp-card reverse-card">
        <div class="rp-card-title">⚠️ 역행 산출 — 규제선 통과 조건 (DSR ${d.targetDSR??35}% 목표)</div>
        <div class="scenario-tabs">
          <div class="scenario-tab tab-income">💰 소득 증빙 시나리오</div>
          <div class="scenario-tab tab-repay">📉 부채 상환 시나리오</div>
        </div>
        <div class="rs-grid">
          <div class="rs-item hl">
            <div class="rs-label">필요 연소득<br>(증빙 목표)</div>
            <div class="rs-value c-income">${won(d.reqIncome)}</div>
          </div>
          <div class="rs-item">
            <div class="rs-label">줄여야 할<br>연간 상환액</div>
            <div class="rs-value c-danger">${won(d.excessPmt??0)}</div>
          </div>
          <div class="rs-item full">
            <div class="rs-label">추정 상환 목표 원금</div>
            <div class="rs-value c-danger" style="font-size:20px;">${won(d.estReducePrin??0)}</div>
          </div>
        </div>
        <div class="rs-tip">
          💡 <b>우선 정리 추천:</b><br>
          DSR 기여도 1순위인 <b>${t1Label}</b>(기여도 <b>${t1Pct}%p</b>)를 먼저 상환하면 DSR 감소 효율이 가장 높습니다.<br><br>
          <span style="opacity:.7;">※ 역행 산출값은 현재 부채 구조 기준 추정치이며, 실제 심사 결과와 다를 수 있습니다.</span>
        </div>
      </div>`;
  } else if (!isOver) {
    const dv = totalDSR.toFixed(1), rw = d.remainTxt||'-';
    const msg = totalDSR>=36
      ? `<b style="color:var(--rp-warn);">⚠️ DSR 경계 구간 — 현재 ${dv}%</b><br><span style="font-size:12.5px;">규제선까지 여유 <b>${(40-totalDSR).toFixed(1)}%p</b>. 추가 대출 여력: <b>${rw}</b></span>`
      : totalDSR>=25
      ? `<b style="color:var(--rp-yellow-deep);">✅ 안정 구간 — 현재 ${dv}%</b><br><span style="font-size:12.5px;">부채 구조 양호. 추가 대출 여력 <b>${rw}</b></span>`
      : `<b style="color:var(--rp-safe);">💚 우량 구간 — 현재 ${dv}%</b><br><span style="font-size:12.5px;">부채 건전성 매우 양호. 추가 여력 <b>${rw}</b></span>`;
    reverseHtml = `<div class="rp-card stable-card"><div class="rp-card-title">✅ 부채 건전성 진단</div><div class="rec-box">${msg}</div></div>`;
  }

  // ━━━ [7] 종합 진단 의견 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let recHtml = '';
  if (isOver && d.reqIncome) {
    const dv = totalDSR.toFixed(1), op = (totalDSR-40).toFixed(1);
    recHtml = `
      <div class="rp-card">
        <div class="rp-card-title">📋 종합 진단 의견</div>
        <div class="rec-box">
          <span class="rec-head" style="color:var(--rp-danger);">⛔ DSR 규제선(40%) 초과 — 현재 ${dv}% (초과 ${op}%p)</span>
          신규 대출 실행이 제한됩니다.<br>안정권(${d.targetDSR??35}%) 진입을 위해 아래 조건 중 하나를 충족해야 합니다.
          <div class="rec-row" style="margin-top:10px;">
            <span class="rec-dot">·</span><span class="rec-label"><b>연소득</b>이</span>
            <span class="rec-amount">${won(d.reqIncome)}</span>
            <span class="rec-label">이상 증빙되거나,</span>
          </div>
          <div class="rec-row">
            <span class="rec-dot">·</span><span class="rec-label">연간 원리금을</span>
            <span class="rec-amount" style="background:rgba(220,38,38,.1);color:var(--rp-danger);">${won(d.excessPmt??0)}</span>
            <span class="rec-label">이상 줄여야 합니다.</span>
          </div>
        </div>
      </div>`;
  }

  // ━━━ [8] 개인정보 보호 팝업 HTML ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ★ v2026.07-NOTICE-FIX: "오늘 하루 보지 않기" 저장 시 아예 HTML 생성 안 함
  //   이전 방식은 DOM 삽입 → JS 로 display:none 처리 → 타이밍 이슈로 잠깐 보임
  //   신 방식은 HTML 생성 자체를 스킵 → 완전한 숨김 보장
  const noticeHtml = _isNoticeHiddenToday() ? '' : `
    <div id="rptNoticePopup" style="
      position:fixed;inset:0;background:rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;
      z-index:9999;padding:20px;backdrop-filter:blur(4px);">
      <div style="
        background:var(--rp-surface);border-radius:18px;
        max-width:340px;width:100%;padding:28px 22px;text-align:center;
        box-shadow:0 8px 40px rgba(0,0,0,.4);position:relative;">
        <div style="font-size:40px;margin-bottom:12px;">🔒</div>
        <div style="font-size:15px;font-weight:800;color:var(--rp-text);margin-bottom:10px;">금융 정보 보호 안내</div>
        <div style="font-size:13px;color:var(--rp-text-sub);line-height:1.75;margin-bottom:20px;">
          고객님의 소중한 금융 정보 보호를 위해<br>
          본 리포트는 발급일로부터 <b style="color:var(--rp-yellow);">7일 뒤</b><br>
          안전하게 자동 파기됩니다.
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="hideReportNoticeToday()" style="
            flex:1;padding:11px;border-radius:10px;font-size:12.5px;font-weight:700;
            background:var(--rp-surface-2);color:var(--rp-text-muted);border:1.5px solid var(--rp-border);">
            오늘 하루 보지 않기
          </button>
          <button onclick="closeReportNotice()" style="
            flex:1;padding:11px;border-radius:10px;font-size:13px;font-weight:800;
            background:linear-gradient(135deg,#FFB800,#e5a200);color:#111;border:none;">
            확인
          </button>
        </div>
      </div>
    </div>`;

  // ━━━ [9] 푸터 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const footerHtml = `
    <div class="rp-footer">
      본 리포트는 입력값 기준 예상 수치로, 실제 금융기관 심사 결과와 다를 수 있습니다.<br>
      대출 실행 전 반드시 담당 금융기관에 확인하시기 바랍니다.<br><br>
      <b>DSR 계산기</b> · 리포트 유효기간 ${expiryFmt}까지
    </div>`;

  // ━━━ 조합 + 렌더 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  wrap.innerHTML = noticeHtml + headerHtml + consultantHtml +
                   dsrCardHtml + summaryHtml + loanDetailHtml +
                   contribHtml + reverseHtml + recHtml + footerHtml;

  // ── 애니메이션 ───────────────────────────────────────────────────────────
  requestAnimationFrame(() => {
    startCountdown(d.expiry);
    const dsrEl = document.getElementById('dsrBig');
    if (dsrEl) countUp(dsrEl, totalDSR, '%', 900);
    const barEl = document.getElementById('dsrBar');
    if (barEl) setTimeout(() => { barEl.style.width = barPct + '%'; }, 100);
    document.querySelectorAll('.loan-bar-fill').forEach((el, i) => {
      setTimeout(() => { el.style.width = (el.dataset.width || '0') + '%'; }, 200 + i * 80);
    });
    // 개인정보 공지 팝업
    initReportNotice(7);
  });
}

// ─── 접근 게이트 ──────────────────────────────────────────────────────────────
async function checkAccess(d) {
  const reportNonce = d.reportNonce;
  if (!reportNonce) return { ok: true }; // 구형 리포트 하위 호환

  // 관리자 기기 → 무제한
  if (_isAdminDevice()) return { ok: true };

  const params = new URLSearchParams(location.search);
  const st     = params.get('st');
  const active = localStorage.getItem(_RPT_ACTIVE);

  // ── Case A: st 토큰 없음 → 기기 바인딩 확인 ──────────────────────────────
  if (!st) {
    if (active === reportNonce && _rptIsGranted(reportNonce)) return { ok: true };
    return { ok: false, reason: 'reshared' };
  }

  // ── Case B: st 토큰 있음 ─────────────────────────────────────────────────
  let token;
  try {
    // URL-safe base64 복원 후 파싱
    const stB64 = st.replace(/-/g, '+').replace(/_/g, '/');
    const stPad = stB64.length % 4 ? stB64 + '='.repeat(4 - stB64.length % 4) : stB64;
    token = JSON.parse(decodeURIComponent(escape(atob(stPad))));
  }
  catch { return { ok: false, reason: 'invalid' }; }

  const { nonce, exp, sig } = token;
  if (!nonce || !exp || !sig) return { ok: false, reason: 'invalid' };
  if (Date.now() > exp)       return { ok: false, reason: 'expired' };

  let sigOk = false;
  try { sigOk = await _rptVerifySign({ nonce, exp }, sig); } catch {}
  if (!sigOk) return { ok: false, reason: 'invalid' };

  // 이미 이 기기에 바인딩되어 있으면 다회 접속 허용
  if (_rptIsGranted(nonce)) {
    // st= 파라미터 제거 (보안), d= 는 유지 (데이터)
    const cleanSearch = location.search.replace(/[?&]st=[^&]*/g, '').replace(/^&/, '?').replace(/^$/, '');
    history.replaceState(null, '', location.pathname + cleanSearch);
    return { ok: true };
  }

  // 최초 접속 → 바인딩
  _rptGrant(nonce, d.expiry);
  history.replaceState(null, '', location.pathname + location.hash);
  return { ok: true };
}


// ─── 스케줄 토글 + 탭 전환 함수 (전역) ──────────────────────────────────────
// id: sch_0, sch_1 ... / btn: 토글 버튼 DOM
function _rptToggleSch(id, btn) {
  const wrap = document.getElementById(id);
  if (!wrap) return;

  // 이미 열려있으면 닫기
  if (wrap.style.display !== 'none') {
    wrap.style.display = 'none';
    btn.textContent = '▼ 회차별 상환 스케줄 보기';
    btn.classList.remove('ld-sch-btn--open');
    return;
  }

  // 처음 열릴 때 — 원리금균등(level) 탭 기본 렌더링
  _rptRenderSchTab(id, 'level');
  wrap.style.display = 'block';
  btn.textContent = '▲ 스케줄 닫기';
  btn.classList.add('ld-sch-btn--open');
}

/** 탭 전환 함수 */
function _rptSwitchTab(id, type) {
  // 탭 버튼 active 전환
  const wrap = document.getElementById(id);
  if (!wrap) return;
  wrap.querySelectorAll('.ld-tab-btn').forEach(b => {
    b.classList.toggle('ld-tab-btn--active', b.dataset.type === type);
  });
  // 테이블만 교체
  _rptRenderSchTable(id, type);
}

/** 스케줄 전체 구조 최초 렌더링 (탭 UI + 테이블) */
function _rptRenderSchTab(id, defaultType = 'level') {
  const wrap = document.getElementById(id);
  const data = window._rptSchCache?.[id];
  if (!wrap || !data) return;

  const w = won => Math.round(won).toLocaleString();
  // 로드 표시 후 비동기 렌더
  wrap.innerHTML = `
    <div class="ld-sch-header">
      <span class="ld-sch-loan-info">
        ${data.emoji} ${data.label}
        &nbsp;|&nbsp; ${w(data.P)}원
        &nbsp;|&nbsp; ${data.R.toFixed(2)}%
        &nbsp;|&nbsp; ${data.n}개월
      </span>
    </div>
    <div class="ld-tab-row">
      <button class="ld-tab-btn ld-tab-btn--active" data-type="level"
              onclick="_rptSwitchTab('${id}','level')">원리금균등 방식</button>
      <button class="ld-tab-btn" data-type="prin"
              onclick="_rptSwitchTab('${id}','prin')">원금균등 방식</button>
    </div>
    <div id="${id}_tbl" class="ld-sch-scroll">
      <div class="ld-sch-loading">⏳ 스케줄 생성 중...</div>
    </div>`;

  // 탭 초기값 active 반영
  wrap.querySelectorAll('.ld-tab-btn').forEach(b => {
    b.classList.toggle('ld-tab-btn--active', b.dataset.type === defaultType);
  });

  // 비동기로 테이블 렌더 (UI 블로킹 방지)
  requestAnimationFrame(() => _rptRenderSchTable(id, defaultType));
}

/** 테이블 rows만 교체 */
function _rptRenderSchTable(id, type) {
  const tblWrap = document.getElementById(id + '_tbl');
  const data    = window._rptSchCache?.[id];
  if (!tblWrap || !data) return;

  // 캐시가 없으면 계산
  if (!data[type]) {
    data[type] = buildFullSchedule(data.P, data.R, data.n, type);
  }
  const rows = data[type];
  const w = v => Math.round(v).toLocaleString();

  const trs = rows.map(rv => `
    <tr>
      <td class="ld-td-center">${rv.i}</td>
      <td>${w(rv.principal)}</td>
      <td>${w(rv.interest)}</td>
      <td class="ld-td-total"><b>${w(rv.payment)}</b></td>
      <td>${w(rv.balance)}</td>
    </tr>`).join('');

  tblWrap.innerHTML = `
    <table class="ld-sch-table">
      <thead>
        <tr>
          <th class="ld-td-center">회차</th>
          <th>원금</th>
          <th>이자</th>
          <th class="ld-td-total">합계</th>
          <th>잔액</th>
        </tr>
      </thead>
      <tbody>${trs}</tbody>
    </table>`;
}

// ─── 압축 데이터 복원 — URL-safe base64 + v2/v3/legacy 완전 호환 ─────────────
// ★ 핵심 버그 수정: URLSearchParams 는 '+' 를 공백으로 자동 변환
//   → v3: URL-safe base64 ('+' → '-', '/' → '_') → 복원 후 atob
//   → v2: 공백이 포함된 채로 들어올 수 있음 → 공백 → '+' 복원 후 atob
//   → legacy: #hash 방식의 구형 포맷 → 그대로 atob
function _expandData(raw) {
  // 파싱 시도 헬퍼
  const _try = str => {
    try { return JSON.parse(decodeURIComponent(escape(atob(str)))); }
    catch { return null; }
  };

  // ① v3 URL-safe base64: '-' → '+', '_' → '/', 패딩 복원
  const b64safe = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64safe.length % 4 ? b64safe + '='.repeat(4 - b64safe.length % 4) : b64safe;
  let d = _try(pad);

  // ② v2 fallback: URLSearchParams 가 '+' → ' ' 로 변환한 경우
  if (!d) {
    const b64fixed = raw.replace(/ /g, '+');
    d = _try(b64fixed);
  }

  // ③ legacy fallback: 원본 그대로
  if (!d) d = _try(raw);

  if (!d) return null;

  // ─── v3 포맷 복원 ─────────────────────────────────────────────────────
  if (d._v === 3) {
    const f = v => v ? Math.round(v).toLocaleString() + '원' : '-';
    return {
      v:             d.v,
      income:        d.ic,
      loans:         (d.ls || []).map(l => ({
        cat:         l.c,  P: l.p,  R: l.r,  SR: l.sk, n: l.n,
        annPmt:      l.ap, dsrCont: l.dc,
        monthlyLevel: l.ml, monthlyPrin1: l.mp
      })),
      dsrText:       d.ds.toFixed(2) + '%',   // dt 제거 → ds 로 재생성
      remainTxt:     f(d.rt_),                // 숫자 → 포맷 문자열
      maxPTxt:       f(d.mp_),
      maxLTxt:       f(d.ml_),
      dsr:           d.ds,  isOver: d.io,  totalAnnPayment: d.tp,
      reqIncome:     d.ri,  excessPmt: d.ep, estReducePrin: d.erp, targetDSR: d.td,
      consultant:    d.ct ? { phone: d.ct.ph } : null,
      reportNonce:   d.rn,
      expiry:        d.ex * 1000,             // 초 → ms
      createdAt:     d.ca + 'T00:00:00.000Z'  // 날짜 → ISO
    };
  }

  // ─── v2 포맷 복원 (하위 호환) ─────────────────────────────────────────
  if (d._v === 2) {
    return {
      v:             d.v,
      income:        d.ic,
      loans:         (d.ls || []).map(l => ({
        cat:         l.c,  P: l.p,  R: l.r,  SR: l.sk, n: l.n, rt: l.rt,
        annPmt:      l.ap, dsrCont: l.dc,
        monthlyLevel: l.ml, monthlyPrin1: l.mp
      })),
      dsrText:       d.dt,  remainTxt: d.rt_, maxPTxt: d.mp_, maxLTxt: d.ml_,
      dsr:           d.ds,  isOver: d.io,  totalAnnPayment: d.tp,
      reqIncome:     d.ri,  excessPmt: d.ep, estReducePrin: d.erp, targetDSR: d.td,
      consultant:    d.ct,
      reportNonce:   d.rn,
      expiry:        d.ex,  createdAt: d.ca
    };
  }

  // ─── legacy 비압축 포맷 ────────────────────────────────────────────────
  return d;
}

// ─── 진입점 ───────────────────────────────────────────────────────────────────
(async function () {
  const applyTheme = isDark => {
    document.body.classList.toggle('dark', isDark);
    document.body.classList.toggle('white', !isDark);
  };
  applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => applyTheme(e.matches));

  // ★ 핵심: ?d= 쿼리스트링 우선 파싱 (신규) → #hash 하위 호환 (구형)
  //   · iOS/Android SMS 에서 # 이후가 잘리는 문제 해결
  //   · is.gd 단축 서비스가 fragment 를 버리는 HTTP 스펙 문제 해결
  const params  = new URLSearchParams(location.search);
  const rawData = params.get('d') || location.hash.slice(1);
  if (!rawData) { renderError('⚠️', '리포트 데이터 없음', '올바른 링크로 접속해 주세요.'); return; }

  let d;
  try { d = _expandData(rawData); }
  catch { d = null; }
  if (!d) { renderError('🚫', '리포트를 읽을 수 없습니다', '링크가 손상되었거나 형식이 올바르지 않습니다.'); return; }

  if (Date.now() > d.expiry) {
    renderError('⏰', '리포트 유효기간 만료', '이 리포트는 7일간 유효합니다.<br>담당자에게 새로운 리포트를 요청해 주세요.');
    return;
  }

  const access = await checkAccess(d);
  if (!access.ok) {
    if (access.reason === 'reshared') {
      renderError('🔒', '공유 불가 링크입니다',
        '이 리포트는 최초 수신자만 열람할 수 있습니다.<br><br>' +
        '링크를 직접 전달받으신 경우, 담당자에게<br>새로운 리포트 발급을 요청해 주세요.');
    } else if (access.reason === 'expired') {
      renderError('⏰', '링크가 만료되었습니다', '담당자에게 새로운 리포트를 요청해 주세요.');
    } else {
      renderError('🚫', '유효하지 않은 링크입니다', '담당자에게 문의해 주세요.');
    }
    return;
  }

  renderReport(d);
})();
