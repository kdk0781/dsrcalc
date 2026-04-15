/* =============================================================================
   js/ui.js — UI 렌더링 & 인터랙션  VER 2026.07
   · 시스템 테마 적용 (applySystemTheme)
   · 금리 셀렉트 동기화 (_syncAllRateSelects)
   · 금리 경고 배너 (markRateWarning, clearRateWarnings)
   · 부채 항목 동적 추가/제거 (addLoan, removeLoan)
   · 담보 금리 자동 적용 (applyKbRate, applyPolicy)
   · 공지 팝업 (initNotice, closeNotice, closeNoticeForever)
   · 사용자/관리자 가이드 모달 (openGuide, closeGuide)
   · ★ 추가: _renderRateBadge — 금리 데이터 신선도 배지 (헤더 표시)
   · 의존: config.js, utils.js, kb_rates.js (_kbRatesMeta)
   ============================================================================= */

// ─── [1] 시스템 테마 ──────────────────────────────────────────────────────────
function applySystemTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark',  isDark);
  document.body.classList.toggle('white', !isDark);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySystemTheme);

// ─── [2] 금리 셀렉트 동기화 ───────────────────────────────────────────────
function _syncAllRateSelects() {
  const rm = _C.KB_MORTGAGE_RATES.mortgage_level;
  const sm = _C.STRESS_RATES;
  const rMap = {
    '5년변동':  `5년변동 (${rm['5년변동']}%)`,
    '5년혼합':  `5년혼합 (${rm['5년혼합']}%)`,
    '6_12변동': `6,12개월변동 (${rm['6_12변동']}%)`,
  };
  document.querySelectorAll('.l-rate-type').forEach(sel => {
    [...sel.options].forEach(opt => { if (rMap[opt.value]) opt.textContent = rMap[opt.value]; });
  });
  const sMap = {
    'm5_cycle': `60개월변동-주기형 (${sm.m5_cycle}%)`,
    'm5_mix':   `60개월혼합 (${sm.m5_mix}%)`,
    'v_6_12':   `6,12개월변동 (${sm.v_6_12}%)`,
  };
  document.querySelectorAll('.l-sr-select').forEach(sel => {
    [...sel.options].forEach(opt => { if (sMap[opt.value]) opt.textContent = sMap[opt.value]; });
  });
}

// ─── [2-B] ★ 금리 신선도 배지 (고도화) ──────────────────────────────────────
/**
 * 헤더에 작은 배지로 금리 데이터 출처를 표시합니다.
 *   🟢 LIVE     — interest/script.js 실시간 fetch 성공
 *   🔵 CACHE    — localStorage 캐시 사용 (5분 이내)
 *   🟡 FALLBACK — fetch/파싱 실패 → 폴백값
 *
 * 클릭 시 hardRefresh() 실행 (캐시 초기화 + 페이지 재로드)
 * window._kbRatesMeta 가 없거나 헤더가 없으면 조용히 종료
 */
function _renderRateBadge() {
  const meta = window._kbRatesMeta;
  if (!meta) return;

  const header = document.querySelector('.header-inner');
  if (!header) return;

  let badge = document.getElementById('rateFreshnessBadge');
  if (!badge) {
    badge = document.createElement('button');
    badge.id        = 'rateFreshnessBadge';
    badge.type      = 'button';
    badge.title     = '금리 출처 — 클릭 시 캐시 초기화 + 새로고침';
    badge.onclick   = () => { if (typeof hardRefresh === 'function') hardRefresh(); };
    badge.style.cssText = [
      'font-size:10px',
      'padding:3px 9px',
      'border-radius:10px',
      'cursor:pointer',
      'font-weight:800',
      'letter-spacing:.02em',
      'margin-left:6px',
      'border:none',
      'line-height:1.4',
      'transition:transform .12s, opacity .12s',
      'box-shadow:0 1px 2px rgba(0,0,0,.08)',
    ].join(';');
    badge.onmouseenter = () => { badge.style.opacity = '0.85'; };
    badge.onmouseleave = () => { badge.style.opacity = '1'; };
    badge.onmousedown  = () => { badge.style.transform = 'scale(.95)'; };
    badge.onmouseup    = () => { badge.style.transform = 'scale(1)'; };

    // 가이드 버튼 옆에 삽입
    const guideBtn = header.querySelector('.btn-guide');
    if (guideBtn) header.insertBefore(badge, guideBtn);
    else header.appendChild(badge);
  }

  const sourceMap = {
    live:     { txt: '🟢 LIVE',     bg: '#DCFCE7', color: '#166534' },
    cache:    { txt: '🔵 CACHE',    bg: '#DBEAFE', color: '#1E40AF' },
    fallback: { txt: '🟡 FALLBACK', bg: '#FEF3C7', color: '#92400E' },
  };
  const s = sourceMap[meta.source] || sourceMap.fallback;
  badge.textContent      = s.txt;
  badge.style.background = s.bg;
  badge.style.color      = s.color;

  // 툴팁: 파싱 시각 + 출처
  const when = meta.parsedAt
    ? new Date(meta.parsedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '없음';
  const errSuffix = meta.error ? ` · 오류: ${meta.error}` : '';
  badge.title = `금리 출처: ${meta.source || '알수없음'} · 갱신시각: ${when}${errSuffix}\n(클릭 시 캐시 초기화 + 새로고침)`;
}

// ─── [3] 금리 경고 배너 ──────────────────────────────────────────────────────
function markRateWarning(rInput) {
  rInput.classList.add('rate-missing');
  const card = rInput.closest('.input-card');
  if (!card) return;
  card.classList.add('rate-warning-card');
  if (!card.querySelector('.rate-missing-banner')) {
    const cat  = card.querySelector('.l-category').value;
    const rate = getDefaultRate(cat);
    const lbl  = _LABEL[cat] || '해당 대출';
    const b    = document.createElement('div');
    b.className = 'rate-missing-banner';
    b.innerHTML = `<span class="rmb-icon">⚠️</span><span class="rmb-text">금리 미입력 — <b>${lbl}</b> 기본금리 <b class="rmb-rate">${rate}%</b> 자동 적용</span>`;
    card.appendChild(b);
  }
}

function clearRateWarnings() {
  document.querySelectorAll('.rate-missing, .rate-warning-card, .rate-missing-banner').forEach(el => {
    if (el.classList.contains('rate-missing-banner')) el.remove();
    else el.classList.remove('rate-missing', 'rate-warning-card');
  });
}

function onRateInput(input) {
  if (input.value.trim()) {
    input.classList.remove('rate-missing');
    const card = input.closest('.input-card');
    if (card) {
      card.classList.remove('rate-warning-card');
      card.querySelector('.rate-missing-banner')?.remove();
    }
  }
}

// ─── [4] 비담보 금리유형 클릭 시 안내 팝업 ───────────────────────────────────
function onRateTypeWrapperClick(id) {
  const card = document.getElementById(`loan_${id}`);
  if (!card) return;
  const cat = card.querySelector('.l-category').value;
  const isMortgage = cat === 'mortgage_level' || cat === 'mortgage_prin';
  if (isMortgage) return;
  showAlert(
    `<b>금리 유형 선택 불가</b><br><br>` +
    `주택담보대출 이외의 부채는 금융기관별로 금리 조건이 상이하여 자동 적용이 지원되지 않습니다.<br><br>` +
    `<span style="font-size:12px;">💡 해당 금융기관의 실제 금리를 <b>금리(%) 입력란</b>에 직접 입력해주세요.</span>`,
    null, 'ℹ️'
  );
}

// ─── [5] 부채 항목 동적 추가 ─────────────────────────────────────────────────
function addLoan() {
  loanCount++;
  const loanList = document.getElementById('loanList');
  if (!loanList) return;

  const rm  = _C.KB_MORTGAGE_RATES.mortgage_level;
  const sm  = _C.STRESS_RATES;
  const r5v  = rm['5년변동']  != null ? ` (${rm['5년변동']}%)`  : '';
  const r5h  = rm['5년혼합']  != null ? ` (${rm['5년혼합']}%)`  : '';
  const r612 = rm['6_12변동'] != null ? ` (${rm['6_12변동']}%)` : '';

  loanList.insertAdjacentHTML('beforeend', `
  <div class="input-card" id="loan_${loanCount}">
    <button class="btn-remove" onclick="removeLoan(${loanCount})">×</button>
    <div class="grid-row">
      <div>
        <label>대출 종류</label>
        <select class="l-category" onchange="applyPolicy(${loanCount})">
          <option value="mortgage_level">주택담보 (원리금)</option>
          <option value="mortgage_prin">주택담보 (원금)</option>
          <option value="jeonse">전세대출 (만기)</option>
          <option value="officetel">오피스텔 (원리금)</option>
          <option value="credit">신용대출 (원리금)</option>
          <option value="cardloan">카드론 (원리금)</option>
        </select>
      </div>
      <div>
        <label>금리 유형 (담보)</label>
        <div class="rate-type-wrapper" onclick="onRateTypeWrapperClick(${loanCount})">
          <select class="l-rate-type" id="lrt_${loanCount}" onchange="applyKbRate(${loanCount})">
            <option value="직접입력">직접 입력</option>
            <option value="5년변동">5년변동${r5v}</option>
            <option value="5년혼합">5년혼합${r5h}</option>
            <option value="6_12변동">6,12개월변동${r612}</option>
          </select>
        </div>
      </div>
      <div>
        <label>금리 (%)</label>
        <input type="text" id="lr_${loanCount}" class="l-r" inputmode="decimal"
               placeholder="4.5" oninput="onRateInput(this)">
      </div>
      <div>
        <label>스트레스 금리</label>
        <select class="l-sr-select">
          <option value="m5_cycle" selected>60개월변동-주기형 (${sm.m5_cycle}%)</option>
          <option value="m5_mix">60개월혼합 (${sm.m5_mix}%)</option>
          <option value="v_6_12">6,12개월변동 (${sm.v_6_12}%)</option>
          <option value="0">해당없음 (0.0%)</option>
        </select>
      </div>
      <div>
        <label>원금/잔액 (원)</label>
        <input type="text" id="lp_${loanCount}" class="l-p" inputmode="numeric"
               onkeyup="formatComma(this)" placeholder="0">
      </div>
      <div>
        <label>기간 (개월)</label>
        <input type="text" id="lm_${loanCount}" class="l-m" inputmode="numeric" value="360">
      </div>
    </div>
    <div class="dynamic-guide" id="guide_${loanCount}" style="display:none;"></div>
  </div>`);
}

// ─── [6] 담보 금리 자동 적용 ──────────────────────────────────────────────
function applyKbRate(id) {
  const card = document.getElementById(`loan_${id}`);
  if (!card) return;
  const cat      = card.querySelector('.l-category').value;
  const typeEl   = card.querySelector('.l-rate-type');
  const rInput   = card.querySelector('.l-r');
  const srSelect = card.querySelector('.l-sr-select');
  if (!typeEl || !rInput) return;

  const rateType = typeEl.value;
  const rateMap  = _C.KB_MORTGAGE_RATES[cat];
  if (!rateMap) return;

  const rate = rateMap[rateType];
  if (rate !== null && rate !== undefined) { rInput.value = String(rate); onRateInput(rInput); }
  else { rInput.value = ''; rInput.placeholder = String(_RATE[cat] ?? '4.5'); }

  if      (rateType === '5년변동')  srSelect.value = 'm5_cycle';
  else if (rateType === '5년혼합')  srSelect.value = 'm5_mix';
  else if (rateType === '6_12변동') srSelect.value = 'v_6_12';
  else                              srSelect.value = 'm5_cycle';
}

function applyPolicy(id) {
  const card = document.getElementById(`loan_${id}`);
  if (!card) return;
  const cat      = card.querySelector('.l-category').value;
  const m        = card.querySelector('.l-m');
  const r        = card.querySelector('.l-r');
  const srSelect = card.querySelector('.l-sr-select');
  const guide    = card.querySelector('.dynamic-guide');
  const rateType = card.querySelector('.l-rate-type');

  guide.className = 'dynamic-guide'; guide.style.display = 'none'; guide.innerHTML = '';

  const isMortgage = cat === 'mortgage_level' || cat === 'mortgage_prin';
  if (rateType) {
    rateType.disabled = !isMortgage;
    rateType.classList.toggle('rate-type--disabled', !isMortgage);
    if (!isMortgage) rateType.value = '직접입력';
  }

  switch (cat) {
    case 'officetel':
      guide.classList.add('dynamic-guide--warn'); guide.style.display = 'block';
      guide.innerHTML = `🏢 <b>오피스텔 체크포인트</b><br>· 구입 자금인 경우 <b>'주택담보'</b> 선택이 정확합니다.<br>· 보유분은 <b>8년(96개월) 상환 규정</b>이 적용됩니다.`;
      m.value = '96'; r.placeholder = '5.5'; srSelect.value = '0'; break;
    case 'cardloan':
      guide.classList.add('dynamic-guide--danger'); guide.style.display = 'block';
      guide.innerHTML = `⛔ <b>카드론 DSR 주의</b><br>· DSR 산정 시 가상 만기 <b>3년(36개월)</b> 고정 적용<br>· 실제 만기와 무관, DSR에 강한 부담을 줍니다.`;
      m.value = '36'; r.placeholder = '14.0'; srSelect.value = '0'; break;
    case 'credit':
      m.value = '60'; r.placeholder = '6.0'; srSelect.value = '0'; break;
    case 'jeonse':
      m.value = '24'; r.placeholder = '4.2'; srSelect.value = '0'; break;
    default:
      m.value = '360'; r.placeholder = '4.5';
      srSelect.value = 'm5_cycle';
      if (isMortgage && rateType && rateType.value !== '직접입력') applyKbRate(id);
      break;
  }
}

// ─── [7] 공지 팝업 ───────────────────────────────────────────────────────────
function initNotice() {
  if (localStorage.getItem('hideNotice_' + _C.NOTICE_VERSION) !== 'true')
    document.getElementById('noticePopup')?.style.setProperty('display', 'flex');
}
function closeNotice() { document.getElementById('noticePopup').style.display = 'none'; }
function closeNoticeForever() {
  localStorage.setItem('hideNotice_' + _C.NOTICE_VERSION, 'true');
  closeNotice();
}

// ─── [8] 가이드 모달 ─────────────────────────────────────────────────────────
function openGuide() {
  const guideModal      = document.getElementById('guideModal');
  const userGuideContent  = document.getElementById('userGuideContent');
  const adminGuideContent = document.getElementById('adminGuideContent');

  let isAdmin = false;
  try {
    const session = JSON.parse(localStorage.getItem('kb_admin_session') || 'null');
    if (session?.isAuth && Date.now() < session.expires) isAdmin = true;
  } catch(e) {}

  if (userGuideContent && adminGuideContent) {
    userGuideContent.style.display  = isAdmin ? 'none' : 'flex';
    adminGuideContent.style.display = isAdmin ? 'flex' : 'none';
  }
  if (guideModal) {
    guideModal.style.display = 'flex';
    document.body.classList.add('body-no-scroll');
  }
}

function closeGuide() {
  const guideModal = document.getElementById('guideModal');
  if (guideModal) guideModal.style.display = 'none';
  document.body.classList.remove('body-no-scroll');
  document.body.style.overflow = '';
}

function closeGuideOnBackdrop(event) {
  if (event.target === event.currentTarget) closeGuide();
}
