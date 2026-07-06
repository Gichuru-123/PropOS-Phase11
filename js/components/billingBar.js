// ============================================================
// PropOS — Billing Period Controller
// Renders the billing month selector bar used on Status Board
// ============================================================

import { AppState, getCurMonth, monthLabel } from '../store.js';
import { setBillingMonth, isCustomBillingMonth, initBillingMonth } from '../engine/ledger.js';

// ── Render the billing bar HTML ────────────────────────────
export function renderBillingBar(onChangeCallback) {
  initBillingMonth();
  const cur    = getCurMonth();
  const real   = new Date().toISOString().substr(0, 7);
  const active = AppState.billingMonth || real;
  const [y, m] = active.split('-');

  // Year options
  const curYear = new Date().getFullYear();
  const years   = [];
  for (let yr = 2020; yr <= curYear + 2; yr++) years.push(yr);

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  const isCustom = isCustomBillingMonth();

  return `
    <div class="billing-bar">
      <div class="billing-bar-label">📅 Billing Period</div>
      <select class="form-select" id="billing-year" style="width:auto"
        onchange="billingPeriodChanged()">
        ${years.map(yr => `<option value="${yr}" ${yr==+y?'selected':''}>${yr}</option>`).join('')}
      </select>
      <select class="form-select" id="billing-month" style="width:auto"
        onchange="billingPeriodChanged()">
        ${months.map((name, idx) => {
          const val = String(idx + 1).padStart(2, '0');
          return `<option value="${val}" ${val===m?'selected':''}>${name}</option>`;
        }).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" onclick="advanceBillingMonth()">→ Next</button>
      <button class="btn btn-ghost btn-sm" onclick="resetBillingMonth()">↺ Today</button>
      <span class="billing-status ${isCustom ? 'past' : 'current'}">
        ${isCustom
          ? `⚠ Viewing ${monthLabel(active)} — not current month`
          : `✓ Current month (${monthLabel(real)})`}
      </span>
    </div>`;
}

// ── Global handlers for the billing bar ───────────────────
export function initBillingBarHandlers(onChangeCallback) {
  window.billingPeriodChanged = function() {
    const y = document.getElementById('billing-year')?.value;
    const m = document.getElementById('billing-month')?.value;
    if (!y || !m) return;
    setBillingMonth(y + '-' + m);
    updateBillingStatus();
    if (onChangeCallback) onChangeCallback();
  };

  window.advanceBillingMonth = function() {
    const cur  = getCurMonth();
    const [y, m] = cur.split('-').map(Number);
    const next = new Date(y, m, 1);
    const nm   = next.toISOString().substr(0, 7);
    setBillingMonth(nm);
    syncBillingSelectors(nm);
    updateBillingStatus();
    if (onChangeCallback) onChangeCallback();
  };

  window.resetBillingMonth = function() {
    setBillingMonth(null);
    const real = new Date().toISOString().substr(0, 7);
    syncBillingSelectors(real);
    updateBillingStatus();
    if (onChangeCallback) onChangeCallback();
  };
}

function syncBillingSelectors(month) {
  const [y, m] = month.split('-');
  const yearSel  = document.getElementById('billing-year');
  const monthSel = document.getElementById('billing-month');
  if (yearSel)  yearSel.value  = y;
  if (monthSel) monthSel.value = m;
}

function updateBillingStatus() {
  const real    = new Date().toISOString().substr(0, 7);
  const active  = getCurMonth();
  const isCustom= active !== real;
  const el      = document.querySelector('.billing-status');
  if (!el) return;
  el.className  = 'billing-status ' + (isCustom ? 'past' : 'current');
  el.textContent = isCustom
    ? `⚠ Viewing ${monthLabel(active)} — not current month`
    : `✓ Current month (${monthLabel(real)})`;
}
