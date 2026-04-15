/* =============================================================================
   js/report.js — 리포트 링크 빌드 + HMAC OTL + 공유 로직
   ─────────────────────────────────────────────────────────────────────────────
   ★ _OTL_SIGN_KEY 는 js/share.js / js/report-page.js 와 동일해야 합니다
   ─────────────────────────────────────────────────────────────────────────────
   버그 수정 (v2):
   · 부채 추가 후 공유 버튼 클릭 시 분석 미반영 문제 → 자동 재분석 로직 추가
   · btnCopyReport 상태 초기화 로직 개선
   ============================================================================= */

// ─── HMAC 서명 키 ─────────────────────────────────────────────────────────────
// ★ share.js / report-page.js 와 동기화 — 변경 시 세 파일 동시 수정
const _OTL_SIGN_KEY = 'KB_DSR_OTL_SIGN_2026';

// ─── HMAC-SHA256 서명 유틸 ────────────────────────────────────────────────────
async function _otlSign(payload) {
  const keyBuf    = new TextEncoder().encode(_OTL_SIGN_KEY);
  const dataBuf   = new TextEncoder().encode(JSON.stringify(payload));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sigBuf    = await crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function _otlIssue(targetUrl, ttlMs) {
  const payload = { url: targetUrl, exp: Date.now() + ttlMs, nonce: crypto.randomUUID().slice(0, 12) };
  const sig     = await _otlSign(payload);
  // URL-safe base64 ('+','/' → '-','_')
  return btoa(unescape(encodeURIComponent(JSON.stringify({ ...payload, sig }))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function _generateReportShareToken(reportNonce, exp) {
  const payload = { nonce: reportNonce, exp };
  const sig     = await _otlSign(payload);
  // URL-safe base64
  return btoa(unescape(encodeURIComponent(JSON.stringify({ ...payload, sig }))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── 일일 발급 카운터 ─────────────────────────────────────────────────────────
const _COPY_KEY = 'dsr_copy_count';
function _getTodayKey()  { return new Date().toISOString().slice(0, 10); }
function _getCopyCount() {
  try { return JSON.parse(localStorage.getItem(_COPY_KEY) || '{}')[_getTodayKey()] || 0; }
  catch { return 0; }
}
function _incCopyCount() {
  try {
    const today = _getTodayKey(), raw = JSON.parse(localStorage.getItem(_COPY_KEY) || '{}');
    raw[today] = (raw[today] || 0) + 1;
    Object.keys(raw).forEach(k => {
      if (k < new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10)) delete raw[k];
    });
    localStorage.setItem(_COPY_KEY, JSON.stringify(raw)); return raw[today];
  } catch { return 1; }
}

function initCopyBtn() {
  const btn = document.getElementById('btnCopyReport');
  const count = _getCopyCount(), limit = _C.REPORT_COPY_DAILY_LIMIT;
  if (!btn) return;
  if (count >= limit) {
    btn.disabled = true;
    btn.innerHTML = `📋 DSR 진단 리포트 복사 <span class="copy-count-badge">${count}/${limit} 사용 완료</span>`;
    btn.classList.add('btn-copy--exhausted');
  } else if (count > 0) {
    btn.innerHTML = `📋 DSR 진단 리포트 복사 <span class="copy-count-badge">${count}/${limit} 사용중</span>`;
  }
}

// ─── 분석 동기화 확인 ─────────────────────────────────────────────────────────
// 마지막 분석 시점의 부채 항목 수를 추적해 재분석 필요 여부 판별
let _lastAnalyzedLoanCount = 0;

/** 부채 항목 추가 시 호출 — calc.js 의 calculateLogic() 완료 후 app.js 에서 갱신 */
function _syncLoanCount() {
  _lastAnalyzedLoanCount = document.querySelectorAll('[id^="loan_"]').length;
}

/** 공유 전 분석 동기화: 부채 항목 변경 시 자동 재분석 실행 */
async function _ensureAnalysisUpToDate() {
  const currentCount = document.querySelectorAll('[id^="loan_"]').length;
  if (currentCount === _lastAnalyzedLoanCount &&
      document.getElementById('resultArea')?.style.display !== 'none') {
    return true; // 분석 최신 상태
  }
  // 부채 항목 변경됨 → 자동 재분석
  return new Promise(resolve => {
    showAlert(
      '부채 항목이 변경되었습니다.<br>최신 데이터로 분석 후 공유합니다.',
      null, 'ℹ️'
    );
    // 모달 확인 후 자동 재분석
    const origConfirm = window._pendingReanalysis;
    window._pendingReanalysis = () => {
      calculateTotalDSR();
      setTimeout(() => { resolve(true); }, 300);
    };
    // 모달 확인 버튼에 일회성 콜백 연결
    const btn = document.getElementById('modalConfirm');
    if (btn) {
      const orig = btn.onclick;
      btn.onclick = () => {
        if (orig) orig();
        calculateTotalDSR();
        _lastAnalyzedLoanCount = document.querySelectorAll('[id^="loan_"]').length;
        setTimeout(() => resolve(true), 400);
        btn.onclick = orig; // 원상 복구
      };
    } else {
      calculateTotalDSR();
      _lastAnalyzedLoanCount = document.querySelectorAll('[id^="loan_"]').length;
      setTimeout(() => resolve(true), 400);
    }
  });
}

// ─── 리포트 데이터 빌드 ───────────────────────────────────────────────────────
function _buildReportData(phone = null) {
  const items  = document.querySelectorAll('[id^="loan_"]');
  const loans  = [];
  const income = getNum(document.getElementById('income').value);
  let totalAnnPayment = 0, totalPrin = 0;

  items.forEach(item => {
    const cat    = item.querySelector('.l-category').value;
    const P      = getNum(item.querySelector('.l-p').value);
    const R      = Number(item.querySelector('.l-r').value) || getDefaultRate(cat);
    const SR_key = item.querySelector('.l-sr-select')?.value || '0';
    const SR     = getStressRate(SR_key);
    const n      = getNum(item.querySelector('.l-m').value) || 360;
    const rt     = item.querySelector('.l-rate-type')?.value || '직접입력';
    if (P <= 0) return;

    const r_dsr = (R + SR) / 1200;
    let loanAnnPmt = 0;
    if (cat === 'jeonse') {
      loanAnnPmt = P * (R / 1200) * 12;
    } else if (isPurchaseLoan(cat, n)) {
      loanAnnPmt = cat === 'mortgage_prin'
        ? (P / n) * 12 + (P * r_dsr * (n + 1) / 2) / (n / 12)
        : calcPMT(P, r_dsr, n) * 12;
    } else {
      loanAnnPmt = calcPMT(P, r_dsr, _C.DSR_VIRTUAL_MONTHS[cat] ?? n) * 12;
    }

    totalAnnPayment += loanAnnPmt;
    totalPrin       += P;

    // 원리금균등 / 원금균등 월 납입액 모두 저장 (리포트 섹션3용)
    const r_base  = R / 1200;
    const lvlPmt  = calcPMT(P, r_dsr, cat === 'jeonse' ? n : (isPurchaseLoan(cat,n) ? n : (_C.DSR_VIRTUAL_MONTHS[cat] ?? n)));
    const prinPmt1= (P / n) + P * r_dsr; // 원금균등 1회차

    loans.push({
      cat, P, R, SR: SR_key, n, rt,
      annPmt:   Math.round(loanAnnPmt),
      dsrCont:  income > 0 ? (loanAnnPmt / income) * 100 : 0,
      // 상세 상환 정보
      monthlyLevel: Math.round(lvlPmt),
      monthlyPrin1: Math.round(prinPmt1),
    });
  });

  const dsr           = income > 0 ? (totalAnnPayment / income) * 100 : 0;
  const isOver        = dsr > _C.DSR_LIMIT_PCT;
  const targetDSR     = 35;
  const reqIncome     = totalAnnPayment > 0 ? totalAnnPayment / (targetDSR / 100) : 0;
  const excessPmt     = Math.max(0, totalAnnPayment - income * (targetDSR / 100));
  const avgPmtRatio   = totalPrin > 0 ? totalAnnPayment / totalPrin : 0;
  const estReducePrin = avgPmtRatio > 0 ? excessPmt / avgPmtRatio : 0;

  const consultant = (() => {
    const p = phone || (() => {
      try { return JSON.parse(localStorage.getItem('kb_admin_config') || '{}').phone || ''; } catch { return ''; }
    })();
    return p ? { phone: p } : null;
  })();

  return {
    v: _C.APP_VERSION, income, loans,
    dsrText:   document.getElementById('dsrVal')?.innerText         || '-',
    remainTxt: document.getElementById('remainingLimit')?.innerText || '-',
    maxPTxt:   document.getElementById('absMaxPrin')?.innerText     || '-',
    maxLTxt:   document.getElementById('absMaxLevel')?.innerText    || '-',
    dsr: Math.round(dsr * 100) / 100, isOver,
    totalAnnPayment: Math.round(totalAnnPayment),
    reqIncome:       Math.ceil(reqIncome / 10000) * 10000,
    excessPmt:       Math.round(excessPmt),
    estReducePrin:   Math.ceil(estReducePrin / 10000) * 10000,
    targetDSR, consultant,
    reportNonce: crypto.randomUUID().slice(0, 12),
    // ── 리포트 유효기간 ────────────────────────────────────────────────────
    // ★ 변경 방법: _C.REPORT_LINK_EXPIRY_DAYS 를 js/config.js 에서 수정하세요
    //   3일  → REPORT_LINK_EXPIRY_DAYS: 3
    //   7일  → REPORT_LINK_EXPIRY_DAYS: 7  ← 현재값
    //  14일  → REPORT_LINK_EXPIRY_DAYS: 14
    expiry:    Date.now() + _C.REPORT_LINK_EXPIRY_DAYS * 86400000,
    createdAt: new Date().toISOString()
  };
}

// ─── URL 단축 (TinyURL) ──────────────────────────────────────────────────────
// ★ SMS 문자 전송 시 TinyURL 중간 페이지가 표시됩니다
//   고객에게 공지문구를 함께 안내해 주세요 (공유 메시지에 자동 포함)
async function _shortenUrl(longUrl) {
  if (longUrl.includes('#')) return longUrl;
  try {
    const r = await fetch(
      'https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl),
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) throw new Error();
    const s = (await r.text()).trim();
    if (s.startsWith('http')) return s;
    throw new Error();
  } catch {
    return longUrl; // 단축 실패 시 원본 URL (URL-safe b64 덕에 정상 작동)
  }
}

// ─── JSON → URL-safe Base64 압축 (v3) ────────────────────────────────────────
// 핵심 버그 수정: btoa() 의 '+','/' → URL에서 오작동
//   URLSearchParams.get('d') 가 '+' 를 공백으로 자동 변환 → atob 실패
//   → URL-safe base64: '+' → '-', '/' → '_', '=' 패딩 제거
// v3 추가 최적화:
//   · rt (한글 금리유형 레이블) 제거 — cat 에서 렌더링 시 복원
//   · dt (dsrText) 제거 — ds 값으로 재생성
//   · rt_, mp_, ml_ 를 숫자로 저장 (한글 "원" 제거)
//   · dc 소수점 2자리 반올림
//   · ca 날짜만 저장, ex 초 단위
function _compressReportData(d) {
  // 숫자 추출 헬퍼 (한글 포함 문자열 → 숫자)
  const _n = s => typeof s === 'number' ? s : parseInt(String(s).replace(/[^0-9]/g, '')) || 0;

  const compact = {
    v:   d.v,
    ic:  d.income,
    ls:  (d.loans || []).map(l => ({
      c:  l.cat, p: l.P, r: l.R, sk: l.SR, n: l.n,
      ap: l.annPmt,
      dc: Math.round((l.dsrCont || 0) * 100) / 100,  // 소수점 2자리
      ml: l.monthlyLevel,
      mp: l.monthlyPrin1
      // rt(한글 레이블) 제거 — 렌더링 시 cat 으로 복원
    })),
    // dt(dsrText) 제거 — ds.toFixed(2)+'%' 로 복원
    rt_: _n(d.remainTxt),   // 숫자만 저장
    mp_: _n(d.maxPTxt),
    ml_: _n(d.maxLTxt),
    ds:  d.dsr,
    io:  d.isOver,
    tp:  d.totalAnnPayment,
    ri:  d.reqIncome,
    ep:  d.excessPmt,
    erp: d.estReducePrin,
    td:  d.targetDSR,
    ct:  d.consultant ? { ph: d.consultant.phone } : null,
    rn:  d.reportNonce,
    ex:  Math.floor(d.expiry / 1000),         // ms → 초 (3자리 절감)
    ca:  d.createdAt.slice(0, 10),             // "2026-03-31" 날짜만
    _v:  3
  };

  // ★ URL-safe base64: '+' → '-', '/' → '_', '=' 패딩 제거
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── 클립보드 복사 ────────────────────────────────────────────────────────────
function _forceCopy(text, successMsg) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => { if (successMsg) showAlert(successMsg, null, '✅'); })
      .catch(() => _fcFallback(text, successMsg));
  } else {
    _fcFallback(text, successMsg);
  }
}
function _fcFallback(text, successMsg) {
  const t = document.createElement('textarea');
  t.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
  document.body.appendChild(t); t.value = text; t.focus(); t.select();
  try {
    document.execCommand('copy');
    if (successMsg) showAlert(successMsg, null, '✅');
  } catch {
    if (successMsg) showAlert('복사에 실패했습니다. 모바일 공유하기 버튼을 이용해주세요.', null, '⚠️');
  }
  document.body.removeChild(t);
}

// ─── 리포트 공유 메인 함수 ───────────────────────────────────────────────────
async function copyResultText() {
  const limit = _C.REPORT_COPY_DAILY_LIMIT, count = _getCopyCount();
  if (count >= limit) {
    showAlert(`금일 리포트 발급을 모두 사용하셨습니다.<br><span style="font-size:12px;">(${count}/${limit}회 완료 — 내일 초기화됩니다)</span>`, null, '🚫');
    return;
  }

  // ── 분석 동기화 확인 (부채 추가 시 자동 재분석) ──────────────────────────
  const currentLoanCount = document.querySelectorAll('[id^="loan_"]').length;
  if (currentLoanCount === 0) {
    showAlert('부채 항목을 먼저 입력해주세요.', null, 'ℹ️'); return;
  }
  if (currentLoanCount !== _lastAnalyzedLoanCount ||
      document.getElementById('resultArea')?.style.display === 'none') {
    // 재분석 필요
    showAlert('부채 항목이 변경되었습니다.<br><b>자동으로 재분석 후 공유합니다.</b>', null, 'ℹ️');
    // 모달 확인 후 자동 처리
    const origOnClick = document.getElementById('modalConfirm').onclick;
    document.getElementById('modalConfirm').onclick = async () => {
      document.getElementById('customModal').style.display = 'none';
      document.getElementById('modalConfirm').onclick = origOnClick;
      calculateTotalDSR();
      await new Promise(r => setTimeout(r, 600));
      _lastAnalyzedLoanCount = document.querySelectorAll('[id^="loan_"]').length;
      await _doShare(limit, count);
    };
    return;
  }

  await _doShare(limit, count);
}

/** 실제 공유 실행 (분석 완료 후 호출) */
async function _doShare(limit, count) {
  const phone = await _showPhoneModal();
  if (phone === false) return;

  const btn = document.getElementById('btnCopyReport'), origHtml = btn?.innerHTML;
  if (btn) { btn.innerHTML = '🔗 리포트 생성 중...'; btn.disabled = true; }

  try {
    const data    = _buildReportData(phone);
    const stToken = await _generateReportShareToken(data.reportNonce, data.expiry);
    // ★ 핵심 변경: #fragment → ?d= 쿼리스트링
    //   · iOS SMS / Android MMS 에서 # 이후 URL 이 잘리는 문제 해결
    //   · is.gd 등 단축 서비스가 fragment 를 서버에 전송하지 않는 HTTP 스펙 문제 해결
    //   · JSON 키 단축으로 URL 길이 ~30% 절감 (5개 대출도 SMS 안전 1500자 이내)
    const encoded = _compressReportData(data);
    const base    = window.location.href.replace(/[^/]*(\?.*)?$/, '');
    const longUrl = `${base}${_C.REPORT_PAGE_PATH}?st=${stToken}&d=${encoded}`;
    const shortUrl = await _shortenUrl(longUrl);

    const newCount  = _incCopyCount(), remaining = limit + 1 - newCount;
    const expDate   = new Date(data.expiry).toLocaleDateString('ko-KR', { month:'long', day:'numeric' });

    if (btn) {
      if (remaining <= 0) {
        btn.disabled = true;
        btn.innerHTML = `📋 진단 리포트 공유 <span class="copy-count-badge">${newCount}/${limit} 완료</span>`;
        btn.classList.add('btn-copy--exhausted');
      } else {
        btn.innerHTML = `📋 진단 리포트 공유 <span class="copy-count-badge">${newCount}/${limit}회 남음</span>`;
        btn.disabled = false;
      }
    }

    const msg = `📊 <b>진단 리포트 링크가 복사되었습니다!</b><br><span style="font-size:12px;line-height:1.8;display:block;margin-top:8px;">• <b>${expDate}</b>까지만 유효합니다.<br>• 오늘 남은 발급 횟수: <b>${remaining}회</b><br><br>📌 <b>고객 안내 문구가 함께 복사됩니다.</b></span>`;
    // ★ 고객에게 전달할 메시지 (URL + 안내 문구 함께 복사)
    const customerMsg = shortUrl + '\n\n' +
      '[DSR 진단 리포트]\n' +
      'Preview 를 클릭하거나 10초 뒤 페이지가 자동 이동됩니다.\n' +
      `유효기간: ${expDate}까지`;

    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      // 모바일: URL + 안내 문구를 네이티브 공유 시트로 전송
      navigator.share({
        title: 'DSR 진단 리포트',
        text:  '[DSR 진단 리포트]\nPreview 를 클릭하거나 10초 뒤 페이지가 자동 이동됩니다.',
        url:   shortUrl
      }).catch(err => { if (err.name !== 'AbortError') _forceCopy(customerMsg, msg); });
    } else {
      // PC: URL + 안내 문구를 함께 클립보드에 복사
      _forceCopy(customerMsg, msg);
    }
  } catch {
    showAlert('링크 생성 중 오류가 발생했습니다.', null, '⚠️');
    if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
  }
}
