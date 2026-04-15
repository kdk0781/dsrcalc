/* =============================================================================
   js/modal.js — 모달 & 알림 로직 전체
   · 커스텀 알림 모달 (showAlert, handleModalConfirm)
   · 금리 미입력 순차 모달 큐
   · 전화번호 워터마크 모달 (_showPhoneModal)
   · 의존: config.js, utils.js
   ============================================================================= */

// ─── [1] 기본 알림 모달 ───────────────────────────────────────────────────────
function showAlert(msg, focusId = null, icon = '⚠️', allowProceed = false) {
  const modal = document.getElementById('customModal');
  if (!modal) return;
  document.getElementById('modalMsg').innerHTML  = msg.replace(/\n/g, '<br>');
  document.getElementById('modalIcon').innerText = icon;
  lastFocusId = focusId; proceedOnConfirm = allowProceed;
  modal.style.display = 'flex';
}

function handleModalConfirm() {
  const modal = document.getElementById('customModal');
  if (modal) modal.style.display = 'none';
  if (_inQueueMode) { _dequeueModal(); return; }
  if (proceedOnConfirm) { proceedOnConfirm = false; calculateLogic(); }
  else if (lastFocusId) {
    const el = document.getElementById(lastFocusId);
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
}

// ─── [2] 금리 미입력 순차 모달 큐 ────────────────────────────────────────────
function showRateMissingQueue(missingItems, onAllConfirmed) {
  const total = missingItems.length;
  _modalQueue = missingItems.map((item, i) => {
    const rate = getDefaultRate(item.cat);
    const lbl  = _LABEL[item.cat] || '해당 대출';
    const em   = _EMOJI[item.cat] || '📌';
    const ctr  = total > 1 ? `<span class="modal-queue-counter">${i + 1} / ${total}개 항목</span>` : '';
    return {
      icon: '⚠️',
      msg:  `${ctr}<b class="modal-rate-title">${em} ${item.loanIdx}번째 대출 — ${lbl}</b>` +
            `<span class="modal-rate-body">금리가 입력되지 않았습니다.<br>` +
            `<span class="modal-rate-default">기본 금리 <b>${rate}%</b> 자동 적용됩니다.</span></span>`
    };
  });
  _onQueueDone = onAllConfirmed;
  _inQueueMode = true;
  _dequeueModal();
}

function _dequeueModal() {
  if (!_modalQueue.length) {
    _inQueueMode = false;
    if (_onQueueDone) { _onQueueDone(); _onQueueDone = null; }
    return;
  }
  const { msg, icon } = _modalQueue.shift();
  document.getElementById('modalMsg').innerHTML  = msg.replace(/\n/g, '<br>');
  document.getElementById('modalIcon').innerText = icon;
  document.getElementById('customModal').style.display = 'flex';
}

// ─── [3] 전화번호 워터마크 모달 ──────────────────────────────────────────────
/**
 * 리포트 공유 시 전화번호 입력 모달을 띄우고 결과를 Promise 로 반환합니다.
 * · phone === false  → X 클릭 / ESC / 배경 클릭 → 공유 완전 취소
 * · phone === null   → "닫기(일반 공유)" 클릭 → 워터마크 없이 공유
 * · phone === string → 전화번호 입력 완료 → 워터마크 포함 공유
 */
function _showPhoneModal() {
  return new Promise(resolve => {
    const modal = document.getElementById('phoneModal');
    if (!modal) { resolve(null); return; }

    // 입력 초기화
    const input = document.getElementById('phoneModalInput');
    const errEl = document.getElementById('phoneModalErr');
    if (input) input.value = '';
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
    modal.style.display = 'flex';

    const close = result => {
      modal.style.display = 'none';
      document.removeEventListener('keydown', onEsc);
      resolve(result);
    };

    const onEsc = e => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onEsc);

    document.getElementById('phoneModalSkip').onclick   = () => close(null);   // 닫기 → 일반 공유
    document.getElementById('phoneModalClose').onclick  = () => close(false);  // X   → 취소
    modal.onclick = e => { if (e.target === modal) close(false); };            // 배경 → 취소

    document.getElementById('phoneModalConfirm').onclick = () => {
      const val = input?.value.trim() ?? '';
      if (!val) { close(null); return; }
      if (!/^010-\d{4}-\d{4}$/.test(val)) {
        if (errEl) { errEl.textContent = '010-0000-0000 형식으로 입력해주세요.'; errEl.classList.add('visible'); }
        return;
      }
      close(val);
    };
  });
}
