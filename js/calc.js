/* =============================================================================
   js/calc.js — DSR 핵심 연산 엔진 + 역행 계산기 + 추천 문구
   · calculateTotalDSR : 입력값 검증 → 연산 → 결과 렌더링 진입
   · calculateLogic    : 실제 DSR / 한도 / 역행 계산 & 화면 반영
   · renderReverseCalc : 역행 계산기 UI 렌더링
   · buildRecommendText: 구간별 DSR 진단 문구 생성
   · 의존: config.js, utils.js, modal.js, ui.js
   ============================================================================= */

// ─── [1] 메인 검증 → 연산 진입 ───────────────────────────────────────────────
function calculateTotalDSR() {
  document.querySelectorAll('.input-warning').forEach(el => el.classList.remove('input-warning'));
  clearRateWarnings();

  const income = getNum(document.getElementById('income').value);
  if (income < _C.MIN_INCOME) {
    setWarning('income', true);
    showAlert('연간 세전 소득을 100만원 이상 입력해주세요.', 'income');
    return;
  }

  const items = document.querySelectorAll('[id^="loan_"]');
  if (!items.length) { showAlert('부채 항목을 최소 하나 이상 추가해주세요.'); return; }

  for (const item of items) {
    const pEl   = item.querySelector('.l-p');
    const mEl   = item.querySelector('.l-m');
    const cat   = item.querySelector('.l-category').value;
    const rType = item.querySelector('.l-rate-type')?.value;
    if (getNum(pEl.value) <= 0) { setWarning(pEl.id, true); showAlert('대출 금액을 입력해주세요.', pEl.id); return; }
    if (getNum(mEl.value) < 1)  { setWarning(mEl.id, true); showAlert('대출 기간을 입력해주세요.', mEl.id); return; }
    if (cat === 'officetel' && rType && rType !== '직접입력') {
      showAlert('오피스텔 구입자금은 주택담보로 설정 후 다시 입력해주세요.', null, '⚠️'); return;
    }
  }

  const missingRates = [];
  items.forEach((item, idx) => {
    const rInput = item.querySelector('.l-r'), cat = item.querySelector('.l-category').value;
    if (!rInput.value.trim()) { markRateWarning(rInput); missingRates.push({ loanIdx: idx + 1, cat }); }
  });

  if (missingRates.length > 0) showRateMissingQueue(missingRates, calculateLogic);
  else calculateLogic();
}

// ─── [2] DSR 연산 엔진 ───────────────────────────────────────────────────────
function calculateLogic() {
  const income = getNum(document.getElementById('income').value);
  if (income <= 0) { showAlert('연소득을 입력해주세요.', 'income'); return; }

  const items = document.querySelectorAll('[id^="loan_"]');
  let totalAnnPayment = 0, combinedP = 0;
  let bR = _RATE.mortgage_level, bSR = _C.DEFAULT_STRESS_RATE_MORTGAGE, bM = 360;
  const reverseDataList = [];
  let totalPrincipalForReverse = 0;

  items.forEach((item, idx) => {
    const cat = item.querySelector('.l-category').value;
    const P   = getNum(item.querySelector('.l-p').value);
    const R   = Number(item.querySelector('.l-r').value) || getDefaultRate(cat);
    const SR  = getStressRate(item.querySelector('.l-sr-select')?.value);
    const n   = getNum(item.querySelector('.l-m').value) || 360;
    if (idx === 0) { bR = R; bSR = SR; bM = n; }
    if (P <= 0) return;

    const r_dsr = (R + SR) / 1200;
    let loanAnnPmt = 0;
    if (cat === 'jeonse') {
      loanAnnPmt = P * (R / 1200) * 12;
    } else if (isPurchaseLoan(cat, n)) {
      combinedP += P;
      loanAnnPmt = cat === 'mortgage_prin'
        ? (P / n) * 12 + (P * r_dsr * (n + 1) / 2) / (n / 12)
        : calcPMT(P, r_dsr, n) * 12;
    } else {
      loanAnnPmt = calcPMT(P, r_dsr, _C.DSR_VIRTUAL_MONTHS[cat] ?? n) * 12;
    }

    totalAnnPayment += loanAnnPmt;
    totalPrincipalForReverse += P;
    reverseDataList.push({ cat, P, R, SR, n, dsrCont: (loanAnnPmt / income) * 100 });
  });

  const dsr    = (totalAnnPayment / income) * 100;
  const isOver = dsr > _C.DSR_LIMIT_PCT;
  const resultArea = document.getElementById('resultArea');
  resultArea.style.display = 'block';

  const dsrView = document.getElementById('dsrVal');
  dsrView.innerText   = dsr.toFixed(2) + '%';
  dsrView.style.color = isOver ? 'var(--danger)' : dsr > _C.DSR_WARN_PCT ? 'var(--warn)' : 'var(--safe)';

  const barView = document.getElementById('dsrBar');
  if (barView) { barView.style.width = Math.min(dsr, 100) + '%'; barView.style.backgroundColor = dsrView.style.color; }

  const tAnn    = income * (_C.DSR_LIMIT_PCT / 100);
  const r_lim   = (bR + bSR) / 1200;
  const maxPrin = calcMaxPrincipal(tAnn, r_lim, bM);
  const maxLevel= calcMaxLevel(tAnn, r_lim, bM);
  const f = v => (Math.floor(Math.max(0, v) / 10000) * 10000).toLocaleString() + ' 원';

  const prinView = document.getElementById('absMaxPrin');
  const levelView= document.getElementById('absMaxLevel');
  const prinCard = document.getElementById('prinCard');
  const levelCard= document.getElementById('levelCard');

  if (isOver) {
    prinView.innerHTML  = `<span style="font-size:11px;color:var(--text-muted);display:block;">권장 신청액</span><span style="color:var(--danger);font-size:16px;font-weight:800;">${f(maxPrin)} 이하</span>`;
    levelView.innerHTML = `<span style="color:var(--danger);font-weight:800;">한도 초과</span>`;
    prinCard.classList.add('recommended'); levelCard.classList.remove('recommended');
  } else {
    prinView.innerText = f(maxPrin); levelView.innerText = f(maxLevel);
    prinView.style.color = ''; levelView.style.color = '';
    const pb = maxPrin >= maxLevel;
    prinCard.classList.toggle('recommended', pb); levelCard.classList.toggle('recommended', !pb);
  }

  const remainLimit = isOver ? 0 : Math.max(0, maxPrin - combinedP);
  const remainView  = document.getElementById('remainingLimit');
  if (remainView) {
    remainView.innerText   = f(remainLimit);
    remainView.style.color = isOver ? 'var(--danger)' : dsr > _C.DSR_WARN_PCT ? 'var(--warn)' : 'var(--safe)';
  }

  const recDesc = document.getElementById('recDesc');
  if (recDesc) recDesc.innerHTML = buildRecommendText(dsr, isOver, remainLimit, maxPrin, maxLevel, f, totalAnnPayment, income);

  document.getElementById('scheduleSection').classList.remove('schedule-visible');
  document.getElementById('scheduleSection').classList.add('schedule-section-hidden');
  document.getElementById('btnShowSchedule').innerText = '📊 전체 상환 스케줄 상세 보기';

  renderReverseCalc(dsr, income, reverseDataList, totalAnnPayment, totalPrincipalForReverse);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const header  = document.querySelector('.header');
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const rect    = resultArea.getBoundingClientRect();
    window.scrollTo({ top: window.pageYOffset + rect.top - headerH - 4, behavior: 'smooth' });
  }));
}

// ─── [3] 역행 계산기 렌더링 ───────────────────────────────────────────────────
function renderReverseCalc(dsr, income, list, totalPmt, totalPrin) {
  const btn = document.getElementById('btnReverseCalc');
  const sec = document.getElementById('reverseCalcSection');
  if (!btn || !sec) return;

  if (dsr <= _C.DSR_LIMIT_PCT) {
    btn.style.display = 'none';
    sec.classList.add('schedule-section-hidden');
    sec.classList.remove('schedule-visible');
    return;
  }

  btn.style.display = 'flex';
  sec.classList.add('schedule-section-hidden');
  sec.classList.remove('schedule-visible');
  btn.innerHTML = '💡 한도 초과 원인 및 해결책 보기 (역행 계산기)';

  const listEl = document.getElementById('reverseLoanList');
  listEl.innerHTML = '';

  const sorted = [...list].sort((a, b) => b.dsrCont - a.dsrCont);
  sorted.forEach(l => {
    listEl.insertAdjacentHTML('beforeend', `
      <div class="reverse-loan-item">
        <div class="reverse-loan-info">
          <span class="reverse-loan-name">${_EMOJI[l.cat]||'📌'} ${_LABEL[l.cat]||l.cat}</span>
          <span class="reverse-loan-meta">원금 ${Math.round(l.P).toLocaleString()}원 | 적용금리 ${(l.R + l.SR).toFixed(2)}% (스트레스 포함)</span>
        </div>
        <div class="reverse-loan-dsr">${l.dsrCont.toFixed(2)}%</div>
      </div>`);
  });

  const targetDSR   = 35;
  const reqIncome   = totalPmt / (targetDSR / 100);
  const fReqIncome  = (Math.ceil(reqIncome / 10000) * 10000).toLocaleString();
  const targetPmt   = income * (targetDSR / 100);
  const excessPmt   = totalPmt - targetPmt;
  const avgPmtRatio = totalPrin > 0 ? (totalPmt / totalPrin) : 0;
  const estPrin     = avgPmtRatio > 0 ? (excessPmt / avgPmtRatio) : 0;
  const fEstPrin    = (Math.ceil(estPrin / 10000) * 10000).toLocaleString();

  document.getElementById('reverseSolutionText').innerHTML = `
    현재 DSR이 규제선(${_C.DSR_LIMIT_PCT}%)을 초과했습니다. 안전 마진을 둔 <b>DSR ${targetDSR}%</b> 수준을 맞추려면 아래 조건 중 하나를 충족해야 합니다.<br><br>
    📉 <b>역행 산출 결과:</b><br>
    · <b>연소득</b>이 <b class="solution-highlight" style="color:var(--kb-navy); background:var(--kb-yellow-light); padding:2px 6px; border-radius:4px;">${fReqIncome}원</b> 이상 증빙되거나,<br>
    · 기존 대출 원금을 대략 <b class="solution-highlight">${fEstPrin}원</b> 정도 상환하여 연간 원리금을 <b>${Math.round(excessPmt).toLocaleString()}원</b> 이상 줄여야 합니다.<br>
    <span style="display:block; margin-top:8px; font-size:12.5px; color:var(--text-muted);">💡 DSR 기여도(%)가 가장 높은 대출을 우선 정리하는 것이 유리합니다.</span>`;
}

function toggleReverseCalc() {
  const sec = document.getElementById('reverseCalcSection');
  const btn = document.getElementById('btnReverseCalc');
  if (sec.classList.contains('schedule-section-hidden')) {
    sec.classList.remove('schedule-section-hidden');
    sec.classList.add('schedule-visible');
    btn.innerHTML = '🔼 해결책 닫기';
  } else {
    sec.classList.add('schedule-section-hidden');
    sec.classList.remove('schedule-visible');
    btn.innerHTML = '💡 한도 초과 원인 및 해결책 보기';
  }
}

// ─── [4] 구간별 DSR 추천 문구 ─────────────────────────────────────────────────
// ★ totalAnnPayment: 연간 총 원리금(원) / income: 연간 세전 소득(원) — 순서 주의
function buildRecommendText(dsr, isOver, remainLimit, maxPrin, maxLevel, f, totalAnnPayment, income) {
  const d = dsr.toFixed(1), targetDSR = 35;
  if (isOver) {
    const reqIncome = totalAnnPayment / (targetDSR / 100);
    const fReqIncome= (Math.ceil(reqIncome / 10000) * 10000).toLocaleString() + '원';
    const excessPmt = totalAnnPayment - income * (targetDSR / 100);
    const fExcess   = Math.round(Math.max(0, excessPmt)).toLocaleString() + '원';
    return `<b style="color:var(--danger)">⛔ DSR 규제선(${_C.DSR_LIMIT_PCT}%) 초과 — 현재 ${d}% (초과 ${(dsr-_C.DSR_LIMIT_PCT).toFixed(1)}%p)</b><br>` +
      `<span style="font-size:12px;line-height:1.8;">신규 대출 실행이 제한됩니다. 안정권(${targetDSR}%) 진입을 위해<br>` +
      `· <b>연소득</b>이 <span style="color:var(--kb-yellow-deep)">${fReqIncome}</span> 이상 증빙되거나,<br>` +
      `· 연간 원리금을 <span style="color:var(--kb-yellow-deep)">${fExcess}</span> 이상 줄여야 합니다.</span>`;
  }
  if (dsr >= _C.DSR_WARN_PCT)
    return `<b style="color:var(--warn)">⚠️ DSR 경계 구간 — 현재 ${d}%</b><br><span style="font-size:12px;line-height:1.8;">규제선까지 여유 <b>${(_C.DSR_LIMIT_PCT - dsr).toFixed(1)}%p</b>. 변동금리 상승 시 초과 위험이 있습니다.<br>추가 여력: <b style="color:var(--warn)">${f(remainLimit)}</b></span>`;
  if (dsr >= _C.DSR_CAUTION_PCT)
    return `<b style="color:var(--kb-yellow-deep)">✅ 안정 구간 — 현재 ${d}%</b><br><span style="font-size:12px;line-height:1.8;">부채 구조 양호. 추가 대출 여력 <b style="color:var(--safe)">${f(remainLimit)}</b>.</span>`;
  return `<b style="color:var(--safe)">💚 우량 구간 — 현재 ${d}%</b><br><span style="font-size:12px;line-height:1.8;">부채 건전성 매우 양호. 추가 여력 <b style="color:var(--safe)">${f(remainLimit)}</b>.</span>`;
}
