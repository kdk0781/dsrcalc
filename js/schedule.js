/* =============================================================================
   js/schedule.js — 상환 스케줄 렌더링
   · 토글, 탭 전환, 스케줄 생성, 회차별 렌더링 (DocumentFragment 최적화)
   · 의존: config.js, utils.js, modal.js
   ============================================================================= */

// ─── [5] 상환 스케줄 ─────────────────────────────────────────────────────────
function toggleSchedule() {
  const sec = document.getElementById('scheduleSection');
  const btn = document.getElementById('btnShowSchedule');
  if (!sec) return;
  if (sec.classList.contains('schedule-section-hidden')) {
    const v = validateSchedule();
    if (!v.ok) { showAlert(v.msg, null, "⚠️"); return; }
    sec.classList.remove('schedule-section-hidden'); sec.classList.add('schedule-visible');
    btn.innerText = "🔼 스케줄 접기"; generateSchedule();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const header = document.querySelector('.header');
      const hh = header ? header.getBoundingClientRect().height : 0;
      window.scrollTo({ top: window.pageYOffset + sec.getBoundingClientRect().top - hh - 8, behavior: 'smooth' });
    }));
  } else {
    sec.classList.add('schedule-section-hidden'); sec.classList.remove('schedule-visible');
    btn.innerText = "📊 전체 상환 스케줄 상세 보기";
  }
}

function validateSchedule() {
  const items = document.querySelectorAll('[id^="loan_"]');
  if (!items.length) return { ok: false, msg: "부채 항목이 없습니다." };
  const first = items[0];
  const fCat  = first.querySelector('.l-category').value;
  const fN    = getNum(first.querySelector('.l-m').value);
  if (!isPurchaseLoan(fCat, fN)) {
    if (fN < _C.SCH_MIN_MONTHS || fN > _C.SCH_MAX_MONTHS) {
      const minY = _C.SCH_MIN_MONTHS / 12, maxY = _C.SCH_MAX_MONTHS / 12;
      return { ok: false, msg: `첫 번째 부채가 구입자금(주택담보·오피스텔)이 아니며,\n대출 기간(${fN}개월)이 스케줄 산출 범위(${minY}년~${maxY}년)를 벗어났습니다.\n\n구입자금 항목을 첫 번째로 이동하거나\n기간을 ${minY}년 이상으로 조정해 주세요.` };
    }
  }
  return { ok: true };
}

function switchSchedule(type) {
  currentScheduleType = type;
  document.getElementById('tabPrin').classList.toggle('active', type === 'P');
  document.getElementById('tabLevel').classList.toggle('active', type === 'L');
  generateSchedule();
}

function generateSchedule() {
  const items  = document.querySelectorAll('[id^="loan_"]');
  if (!items.length) return;
  const listEl = document.getElementById('scheduleList');
  if (!listEl) return;
  listEl.innerHTML = "";

  const allLoans = [];
  items.forEach(item => {
    const cat = item.querySelector('.l-category').value;
    const P   = getNum(item.querySelector('.l-p').value);
    const R   = Number(item.querySelector('.l-r').value) || getDefaultRate(cat);
    const n   = getNum(item.querySelector('.l-m').value) || 360;
    if (P > 0) allLoans.push({ cat, P, R, n, rt: item.querySelector('.l-rate-type')?.value || '직접입력' });
  });

  if (allLoans.length > 0) {
    const card = document.createElement('div');
    card.className = 'sch-summary-card';
    const rows = allLoans.map(l => `
      <div class="sch-summary-row">
        <div class="sch-summary-top"><span class="sch-summary-emoji">${_EMOJI[l.cat]||'📌'}</span><span class="sch-summary-label">${_LABEL[l.cat]||l.cat}</span></div>
        <div class="sch-summary-bottom">
          <span class="sch-summary-amount">${Math.round(l.P).toLocaleString()}원</span>
          <span class="sch-summary-divider">|</span>
          <span class="sch-summary-rate">${l.R.toFixed(2)}%</span>
          <span class="sch-summary-divider">|</span>
          <span class="sch-summary-term">${l.n}개월</span>
        </div>
      </div>`).join('');
    card.innerHTML = `<div class="sch-summary-title">📋 대출 항목 현황</div>${rows}`;
    listEl.appendChild(card);
  }

  const purchaseLoans = allLoans.filter(l => isPurchaseLoan(l.cat, l.n));
  let schedLoans;
  if (purchaseLoans.length >= 2) {
    const totalP    = purchaseLoans.reduce((s, l) => s + l.P, 0);
    const weightedR = purchaseLoans.reduce((s, l) => s + l.R * l.P, 0) / totalP;
    const maxN      = Math.max(...purchaseLoans.map(l => l.n));
    schedLoans = [{ P: totalP, R: weightedR, n: maxN, label: '통합 구입자금', merged: true, parts: purchaseLoans }];
  } else if (purchaseLoans.length === 1) {
    schedLoans = [{ ...purchaseLoans[0], label: _LABEL[purchaseLoans[0].cat], merged: false }];
  } else {
    const first = allLoans[0]; if (!first) return;
    schedLoans = [{ ...first, label: _LABEL[first.cat] || first.cat, merged: false }];
  }
  schedLoans.forEach(loan => renderLoanSchedule(listEl, loan));
}

function renderLoanSchedule(listEl, loan) {
  const { P, R, n, label, merged, parts } = loan;
  const r = R / 1200;
  if (!P || !n) return;

  // 스케줄 헤더
  // ★ 선택된 탭(원금균등/원리금균등)을 헤더 타이틀에 반영
  //   label 에 이미 "(원리금)" 등 상품명이 포함되어 있어 혼동 발생
  //   → 괄호 부분을 제거하고 실제 상환 방식으로 교체
  const _schedMethod    = currentScheduleType === 'L' ? '원리금균등' : '원금균등';
  const _baseLabel      = label.replace(/\s*\([^)]+\)\s*$/, '').trim(); // "(원리금)" 등 제거
  const _displayLabel   = _baseLabel + ' (' + _schedMethod + ')';

  const schedHeader = document.createElement('div');
  schedHeader.className = 'sch-calc-header';
  schedHeader.innerHTML = merged
    ? `<span class="sch-calc-title">🏠 통합 구입자금 (${_schedMethod}) 상환 스케줄</span><span class="sch-calc-meta">합산 ${Math.round(P).toLocaleString()}원 | 가중평균 ${R.toFixed(2)}% | ${n}개월</span>`
    : `<span class="sch-calc-title">${_EMOJI[loan.cat]||'🏠'} ${_displayLabel} 상환 스케줄</span><span class="sch-calc-meta">${Math.round(P).toLocaleString()}원 | ${R.toFixed(2)}% | ${n}개월</span>`;
  listEl.appendChild(schedHeader);

  // ★ 마일스톤 맵 구성
  const milestoneMap = {};
  if (merged && parts) {
    parts.forEach(part => {
      const key = part.n;
      (milestoneMap[key] = milestoneMap[key] || []).push({ ...part, isSub: true });
    });
  } else {
    milestoneMap[n] = [{ ...loan, label, cat: loan.cat, isSub: false }];
  }

  const isLevel  = currentScheduleType === 'L';
  const mP_prin  = P / n;
  const mPMT_lvl = calcPMT(P, r, n);
  let balance = P, yearCumP = 0, yearCumI = 0, totalCumP = 0, totalInterest = 0;

  // ★ DocumentFragment — 회차 전체를 메모리에서 조립 후 1회 DOM 삽입
  const frag = document.createDocumentFragment();

  for (let i = 1; i <= n; i++) {
    let curP, curI;
    if (isLevel) { curI = balance * r; curP = mPMT_lvl - curI; }
    else         { curI = balance * r; curP = mP_prin; }
    if (i === n) { curP = balance; curI = balance * r; }
    balance -= curP; yearCumP += curP; yearCumI += curI; totalCumP += curP; totalInterest += curI;

    const row = document.createElement('div');
    row.className = 'schedule-item';
    row.innerHTML = `<div class="sch-idx">${i}회</div><div class="sch-val">${Math.round(curP).toLocaleString()}</div><div class="sch-val">${Math.round(curI).toLocaleString()}</div><div class="sch-total">${Math.round(curP+curI).toLocaleString()}</div>`;
    frag.appendChild(row);

    // N년차 요약 카드
    if (i % 12 === 0 || i === n) {
      const yr   = Math.ceil(i / 12);
      const card = document.createElement('div');
      card.className = 'year-summary-card';
      card.innerHTML =
        `<div class="card-title-row"><span class="card-title">📅 ${yr}년차 누적 요약</span><span class="year-badge">${yr}년 경과</span></div>
        <div class="card-stats">
          <div>누적원금: <b class="stat-prin">${Math.round(yearCumP).toLocaleString()}원</b></div>
          <div>누적이자: <b class="stat-int">${Math.round(yearCumI).toLocaleString()}원</b></div>
        </div>
        <div class="card-balance-row"><span class="balance-label">잔액</span><span class="balance-value">${Math.max(0, Math.round(balance)).toLocaleString()}원</span></div>`;
      frag.appendChild(card);
      yearCumP = 0; yearCumI = 0;
    }

    // ★ 마일스톤 카드
    if (milestoneMap[i]) {
      milestoneMap[i].forEach(part => {
        const mc       = document.createElement('div');
        mc.className   = 'year-summary-card loan-milestone-card';
        const pRatio   = part.isSub ? (part.P / P) : 1;
        const eCumP    = Math.round(totalCumP * pRatio);
        const eCumI    = Math.round(totalInterest * pRatio);
        const catLabel = part.isSub ? (_LABEL[part.cat] || label) : label;
        const catEmoji = part.isSub ? (_EMOJI[part.cat] || '🏠') : (_EMOJI[loan.cat] || '🏠');
        const partP    = part.isSub ? part.P : P;
        mc.innerHTML =
          `<div class="card-title-row">
            <span class="card-title">${catEmoji} ${catLabel} 잔금 상환 완료</span>
            <span class="milestone-badge">종료</span>
          </div>
          <div class="milestone-body">
            <div class="milestone-row"><span class="milestone-key">대출 원금</span><span class="milestone-val">${Math.round(partP).toLocaleString()}원</span></div>
            <div class="milestone-row"><span class="milestone-key">상환 기간</span><span class="milestone-val">${part.n}개월 (${Math.round(part.n/12)}년)</span></div>
            <div class="milestone-row"><span class="milestone-key">누적 상환원금 (추정)</span><span class="milestone-val stat-prin">${eCumP.toLocaleString()}원</span></div>
            <div class="milestone-row"><span class="milestone-key">누적 이자 (추정)</span><span class="milestone-val stat-int">${eCumI.toLocaleString()}원</span></div>
            <div class="milestone-row milestone-row--total"><span class="milestone-key">원금+이자 합계</span><span class="milestone-val">${(eCumP+eCumI).toLocaleString()}원</span></div>
          </div>
          <div class="card-balance-row">
            <span class="balance-label">${part.isSub ? '전체 잔액 (통합 기준)' : '잔액'}</span>
            <span class="balance-value">${Math.max(0, Math.round(balance)).toLocaleString()}원</span>
          </div>`;
        frag.appendChild(mc);
      });
    }
  }

  // 통합 총계 카드
  if (merged) {
    const total = document.createElement('div');
    total.className = 'year-summary-card total-card';
    total.innerHTML =
      `<div class="card-title-row"><span class="card-title">📊 ${label} 상환 총계</span></div>
      <div class="card-stats">
        <div>총 원금: <b class="stat-prin">${Math.round(P).toLocaleString()}원</b></div>
        <div>총 이자: <b class="stat-int">${Math.round(totalInterest).toLocaleString()}원</b></div>
      </div>
      <div class="card-balance-row"><span class="balance-label">총 납입액</span><span class="balance-value">${Math.round(P+totalInterest).toLocaleString()}원</span></div>`;
    frag.appendChild(total);
  }

  // ★ 단 1회 DOM 삽입 (30년 = 360 appendChild → 1 appendChild)
  listEl.appendChild(frag);
}

// ─── [6] 공지 팝업 ───────────────────────────────────────────────────────────