// ============================================================
// PropOS — Payment Status Board
// Uses the full financial engine from Phase 5
// ============================================================

import { AppState, ksh, getCurMonth, monthLabel } from '../store.js';
import { router } from '../router.js';
import { can } from '../auth.js';
import { renderBillingBar, initBillingBarHandlers } from '../components/billingBar.js';
import {
  getStatusThisMonth, getTenantBalance,
  getMonthlyInvoice, getDashboardStats,
  getDaysOverdue, initBillingMonth
} from '../engine/ledger.js';

let statusFilter = 'all';

export function render() {
  const el = document.getElementById('page-status');
  if (!el) return;

  initBillingMonth();
  initBillingBarHandlers(() => render());

  // Update topbar subtitle
  const subEl = document.getElementById('topbar-sub');
  if (subEl) subEl.textContent = `${getCurMonth()} — ${monthLabel(getCurMonth())}`;

  const stats = getDashboardStats(getCurMonth());

  el.innerHTML = `
    ${renderBillingBar()}

    <!-- KPIs -->
    <div class="kpi-row" id="status-kpis">
      <div class="kpi-card green loaded" style="--bar-width:${stats.activeTenants?stats.paidCount/stats.activeTenants*100:0}%">
        <div class="kpi-label">Paid</div>
        <div class="kpi-value">${stats.paidCount}</div>
        <div class="kpi-sub">tenants cleared this month</div>
      </div>
      <div class="kpi-card red loaded" style="--bar-width:${stats.activeTenants?stats.unpaidCount/stats.activeTenants*100:0}%">
        <div class="kpi-label">Unpaid</div>
        <div class="kpi-value">${stats.unpaidCount}</div>
        <div class="kpi-sub">no payment this month</div>
      </div>
      <div class="kpi-card amber loaded" style="--bar-width:${stats.activeTenants?stats.partialCount/stats.activeTenants*100:0}%">
        <div class="kpi-label">Partial</div>
        <div class="kpi-value">${stats.partialCount}</div>
        <div class="kpi-sub">balance remaining</div>
      </div>
      <div class="kpi-card blue loaded" style="--bar-width:${stats.activeTenants?stats.creditCount/stats.activeTenants*100:0}%">
        <div class="kpi-label">In Credit</div>
        <div class="kpi-value">${stats.creditCount}</div>
        <div class="kpi-sub">paid in advance</div>
      </div>
      <div class="kpi-card accent loaded" style="--bar-width:${stats.collectionRate}%">
        <div class="kpi-label">Collected</div>
        <div class="kpi-value" style="font-size:1.2rem">${ksh(stats.collected)}</div>
        <div class="kpi-sub">${stats.collectionRate}% of expected</div>
      </div>
      <div class="kpi-card red loaded" style="--bar-width:60%">
        <div class="kpi-label">Total Arrears</div>
        <div class="kpi-value" style="font-size:1.2rem">${ksh(stats.totalArrears)}</div>
        <div class="kpi-sub">all outstanding</div>
      </div>
    </div>

    <!-- Filter Pills -->
    <div class="filter-pills">
      <div class="pill ${statusFilter==='all'    ?'active':''}"    onclick="setStatusFilter('all',this)">All Tenants</div>
      <div class="pill red ${statusFilter==='unpaid' ?'active':''}"  onclick="setStatusFilter('unpaid',this)">Unpaid</div>
      <div class="pill amber ${statusFilter==='partial'?'active':''}" onclick="setStatusFilter('partial',this)">Partial</div>
      <div class="pill green ${statusFilter==='paid'  ?'active':''}"  onclick="setStatusFilter('paid',this)">Paid</div>
      <div class="pill blue ${statusFilter==='credit' ?'active':''}"  onclick="setStatusFilter('credit',this)">Credit</div>
    </div>

    <!-- Search -->
    <div class="search-row">
      <input type="text" class="search-input" id="status-search"
        placeholder="Search tenant..." oninput="renderStatusCards()"/>
      <select class="form-select" style="width:auto" id="status-bldg"
        onchange="renderStatusCards()">
        <option value="">All Buildings</option>
        ${AppState.buildings.map(b =>
          `<option value="${b.id}">${esc(b.name)}</option>`
        ).join('')}
      </select>
    </div>

    <!-- Status Cards Grid -->
    <div class="psb-grid" id="statusBoard"></div>
  `;

  renderStatusCards();

  // Animate KPI bars
  setTimeout(() => {
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.add('loaded'));
  }, 100);
}

function renderStatusCards() {
  const board   = document.getElementById('statusBoard');
  if (!board) return;

  const search  = (document.getElementById('status-search')?.value || '').toLowerCase();
  const bldgF   = document.getElementById('status-bldg')?.value || '';

  let tenants = AppState.tenants.filter(t =>
    t.unitId && t.status !== 'vacated' && !t.deletedAt
  );

  if (bldgF)  tenants = tenants.filter(t => t.buildingId === bldgF);
  if (search) tenants = tenants.filter(t =>
    t.name?.toLowerCase().includes(search) ||
    t.phone?.includes(search)
  );

  // Get statuses
  const withStatus = tenants.map(t => ({
    t, s: getStatusThisMonth(t.id)
  }));

  // Apply filter
  const filtered = statusFilter === 'all'
    ? withStatus
    : withStatus.filter(x => x.s.status === statusFilter);

  if (!filtered.length) {
    board.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
        <div style="font-size:2rem;margin-bottom:8px">📋</div>
        <p>No tenants match this filter.</p>
      </div>`;
    return;
  }

  // Sort: unpaid first, then partial, paid, credit — within each group sort by unit number
  const order = { unpaid:0, partial:1, paid:2, credit:3, unknown:4 };
  filtered.sort((a, b) => {
    const statusDiff = (order[a.s.status]||4) - (order[b.s.status]||4);
    if (statusDiff !== 0) return statusDiff;
    const uA = AppState.units.find(u => u.id === a.t.unitId)?.number || '';
    const uB = AppState.units.find(u => u.id === b.t.unitId)?.number || '';
    return uA.localeCompare(uB, undefined, { numeric: true, sensitivity: 'base' });
  });

  board.innerHTML = filtered.map(({ t, s }) => statusCard(t, s)).join('');
}

function statusCard(t, s) {
  const unit  = AppState.units.find(u => u.id === t.unitId);
  const bldg  = AppState.buildings.find(b => b.id === t.buildingId);
  const bal   = getTenantBalance(t.id);  // same as tenants page
  const rent  = unit?.rent || 0;
  const daysOverdue = s.status === 'unpaid' ? getDaysOverdue(t.id) : 0;

  let amountHtml = '', metaHtml = '';

  switch(s.status) {
    case 'paid':
      // Find how much they paid this month
      const paidAmt = AppState.transactions
        .filter(tx => tx.tenantId === t.id && tx.direction === 'credit'
          && tx.deletedAt === null && tx.date?.startsWith(getCurMonth()))
        .reduce((s, tx) => s + tx.amount, 0);
      amountHtml = `<div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;color:var(--green);margin-top:10px">${ksh(paidAmt)} ✓</div>`;
      metaHtml   = `Rent: ${ksh(rent)} · Account clear`;
      break;
    case 'partial':
      amountHtml = `<div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;color:var(--amber);margin-top:10px">${ksh(Math.abs(bal))} still owed</div>`;
      metaHtml   = `Partial payment received · Rent ${ksh(rent)}/mo`;
      break;
    case 'unpaid':
      amountHtml = `<div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;color:var(--red);margin-top:10px">${ksh(Math.abs(bal))} due</div>`;
      metaHtml   = daysOverdue > 0
        ? `<span style="font-size:0.7rem;font-weight:600;color:var(--red)">⚠ ${daysOverdue} days overdue</span>`
        : `Rent ${ksh(rent)}/mo`;
      break;
    case 'credit':
      amountHtml = `<div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;color:var(--blue);margin-top:10px">${ksh(Math.abs(bal))} credit</div>`;
      metaHtml   = 'Paid in advance';
      break;
  }

  const badgeColor = { paid:'green', partial:'amber', unpaid:'red', credit:'blue' }[s.status] || 'gray';

  return `
    <div class="psb-card ${s.status}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);font-family:var(--font-display)">${esc(t.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
            ${bldg ? esc(bldg.name) + ' · ' : ''}${unit ? esc(unit.number) + ' (' + esc(unit.type) + ')' : ''}
          </div>
        </div>
        <span class="badge badge-${badgeColor}">${s.status === 'credit' ? 'CREDIT' : s.status.toUpperCase()}</span>
      </div>
      ${amountHtml}
      <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px">${metaHtml}</div>
      <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;">
        ${can('canRecordPayments') ? `<button class="btn btn-ghost btn-xs" onclick="quickPayFromStatus('${t.id}')">+ Pay</button>` : ''}
        <button class="btn btn-ghost btn-xs" onclick="router.nav('tenant_profile',{tenantId:'${t.id}'})">Profile</button>
        ${(s.status==='unpaid'||s.status==='partial') && can('canSendNotifications') ? `
          <button class="btn btn-ghost btn-xs" onclick="remindTenant('${t.id}')">📱 Remind</button>
        ` : ''}
      </div>
    </div>`;
}

// ── GLOBAL HANDLERS ────────────────────────────────────────
window.setStatusFilter = function(filter, el) {
  statusFilter = filter;
  document.querySelectorAll('.filter-pills .pill').forEach(p => {
    p.classList.remove('active');
  });
  el.classList.add('active');
  renderStatusCards();
};

window.renderStatusCards = renderStatusCards;

window.quickPayFromStatus = function(tenantId) {
  router.nav('payments');
  setTimeout(() => {
    openModal('m-payment');
    const sel = document.getElementById('pm-tenant');
    if (sel) {
      sel.value = tenantId;
      sel.dispatchEvent(new Event('change'));
    }
  }, 200);
};

window.remindTenant = function(tenantId) {
  const t = AppState.tenants.find(t => t.id === tenantId);
  if (!t) return;
  const bal = getTenantBalance(tenantId);
  const msg = `Dear ${t.name}, your account shows an outstanding balance of ${ksh(bal)}. Please settle urgently. Thank you.`;
  const phone = t.phone.replace(/\D/g,'');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
