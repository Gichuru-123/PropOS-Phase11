// ============================================================
// PropOS — Tenants Page
// Full tenant list, add/edit forms, tenant profile
// ============================================================

import { AppState, ksh, getToday, monthLabel } from '../store.js';
import { router } from '../router.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { addTenant, updateTenant, deleteTenant, normalisePhone } from '../services/tenantService.js';
import { getVacantUnits } from '../services/unitService.js';
import { getTenantBalance, getStatusThisMonth, calculateHealthScore } from '../engine/ledger.js';

// ── TENANTS LIST ───────────────────────────────────────────
let searchVal = '', bldgFilter = '', statusFilter = '';

export function render() {
  const el = document.getElementById('page-tenants');
  if (!el) return;

  el.innerHTML = `
    <!-- Search & Filters -->
    <div class="search-row">
      <input type="text" class="search-input" placeholder="Search name, phone, ID..."
        id="t-search" value="${searchVal}"
        oninput="tenantSearch(this.value)"/>
      <select class="form-select" style="width:auto" id="t-bldg" onchange="tenantBldgFilter(this.value)">
        <option value="">All Buildings</option>
        ${AppState.buildings.map(b =>
          `<option value="${b.id}" ${b.id===bldgFilter?'selected':''}>${esc(b.name)}</option>`
        ).join('')}
      </select>
      <select class="form-select" style="width:auto" id="t-status" onchange="tenantStatusFilter(this.value)">
        <option value="">All Statuses</option>
        <option value="arrears"  ${statusFilter==='arrears' ?'selected':''}>Arrears</option>
        <option value="clear"    ${statusFilter==='clear'   ?'selected':''}>Clear</option>
        <option value="credit"   ${statusFilter==='credit'  ?'selected':''}>Credit</option>
        <option value="vacated"  ${statusFilter==='vacated' ?'selected':''}>Vacated</option>
      </select>
    </div>

    <!-- Table -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table class="data-table" id="t-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Phone</th>
              <th>Building / Unit</th>
              <th>Method</th>
              <th>Rent/mo</th>
              <th>Balance</th>
              <th>Lease End</th>
              <th>Health</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="t-tbody"></tbody>
        </table>
      </div>
    </div>`;

  renderTenantRows();
}

function renderTenantRows() {
  const tbody = document.getElementById('t-tbody');
  if (!tbody) return;

  let tenants = [...AppState.tenants];

  // Sort by unit number naturally (N01, N02, N03... not N1, N10, N2)
  tenants.sort((a, b) => {
    const uA = AppState.units.find(u => u.id === a.unitId)?.number || '';
    const uB = AppState.units.find(u => u.id === b.unitId)?.number || '';
    return uA.localeCompare(uB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Search filter
  if (searchVal) {
    const s = searchVal.toLowerCase();
    tenants = tenants.filter(t =>
      t.name?.toLowerCase().includes(s) ||
      t.phone?.includes(s) ||
      t.idNumber?.includes(s)
    );
  }

  // Building filter
  if (bldgFilter) tenants = tenants.filter(t => t.buildingId === bldgFilter);

  // Status filter
  if (statusFilter === 'vacated') {
    tenants = tenants.filter(t => t.status === 'vacated');
  } else if (statusFilter) {
    tenants = tenants.filter(t => {
      const bal = t.openingBalance || 0;
      if (statusFilter === 'arrears') return bal > 0;
      if (statusFilter === 'clear')   return bal === 0;
      if (statusFilter === 'credit')  return bal < 0;
      return true;
    });
  }

  if (!tenants.length) {
    tbody.innerHTML = `
      <tr><td colspan="9" class="table-empty">
        <div class="empty-icon">👥</div>
        <p>No tenants found</p>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = tenants.map(t => {
    const unit = AppState.units.find(u => u.id === t.unitId);
    const bldg = AppState.buildings.find(b => b.id === t.buildingId);
    const bal  = getTenantBalance(t.id);
    const initials = getInitials(t.name);

    // Balance badge
    let balBadge = '';
    if (bal > 0)      balBadge = `<span class="badge badge-red">${ksh(bal)} owed</span>`;
    else if (bal < 0) balBadge = `<span class="badge badge-blue">Credit ${ksh(Math.abs(bal))}</span>`;
    else              balBadge = `<span class="badge badge-green">Clear ✓</span>`;

    // Lease warning
    const leaseWarn = t.leaseEnd && isLeaseExpiringSoon(t.leaseEnd)
      ? `<div class="lease-warning">⚠ Expires soon</div>` : '';

    // Health score
    const healthHtml = healthBadge(t.healthScore || 100);

    // Status badge
    const statusHtml = t.status === 'vacated'
      ? `<span class="badge badge-gray">Vacated</span>` : '';

    return `<tr>
      <td>
        <div class="tenant-name-cell">
          <div class="tenant-avatar">${initials}</div>
          <div>
            <div class="tenant-name">${esc(t.name)} ${statusHtml}</div>
            <div class="tenant-id">${t.idNumber ? 'ID: ' + esc(t.idNumber) : ''}</div>
            ${leaseWarn}
          </div>
        </div>
      </td>
      <td style="color:var(--text-secondary)">${esc(t.phone)}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">
        ${bldg ? esc(bldg.name) : '—'}<br/>
        ${unit ? `<span style="color:var(--text-secondary)">${esc(unit.number)} · ${esc(unit.type)}</span>` : '—'}
      </td>
      <td><span class="badge badge-gray">${esc(t.payMethod||'')}</span></td>
      <td style="font-weight:600">${unit ? ksh(unit.rent) : '—'}</td>
      <td>${balBadge}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${t.leaseEnd || '—'}</td>
      <td>${healthHtml}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-xs" onclick="viewTenantProfile('${t.id}')">👤 Profile</button>
        ${can('canManageTenants') ? `
          <button class="btn btn-ghost btn-xs" onclick="editTenantModal('${t.id}')">✏️</button>
          <button class="btn btn-ghost btn-xs" onclick="deleteTenantAction('${t.id}')">🗑</button>
        ` : ''}
      </td>
    </tr>`;
  }).join('');
}

// ── TENANT PROFILE ─────────────────────────────────────────
export function renderProfile() {
  const el = document.getElementById('page-tenant_profile');
  if (!el) return;

  const t    = AppState.tenants.find(t => t.id === AppState.selectedTenantId);
  if (!t) { el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Tenant not found.</div>'; return; }

  const unit = AppState.units.find(u => u.id === t.unitId);
  const bldg = AppState.buildings.find(b => b.id === t.buildingId);
  const bal  = getTenantBalance(t.id);
  const initials = getInitials(t.name);

  // Update topbar
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = t.name;
  const subEl = document.getElementById('topbar-sub');
  if (subEl) subEl.textContent = bldg ? bldg.name + (unit ? ' · Unit ' + unit.number : '') : '';

  // Payments for this tenant
  const payments = AppState.payments
    .filter(p => p.tenantId === t.id)
    .sort((a, b) => b.date?.localeCompare(a.date));

  el.innerHTML = `
    <div class="back-btn" onclick="router.nav('tenants')">← Back to Tenants</div>

    <!-- Profile Header -->
    <div class="profile-header">
      <div class="profile-avatar-lg">${initials}</div>
      <div class="profile-info">
        <div class="profile-name">${esc(t.name)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
          ${healthBadge(t.healthScore || 100)}
          ${t.status === 'vacated'
            ? '<span class="badge badge-gray">Vacated</span>'
            : '<span class="badge badge-green">Active</span>'}
          ${bal > 0  ? `<span class="badge badge-red">${ksh(bal)} owed</span>` : ''}
          ${bal < 0  ? `<span class="badge badge-blue">Credit ${ksh(Math.abs(bal))}</span>` : ''}
          ${bal === 0 ? '<span class="badge badge-green">Clear ✓</span>' : ''}
        </div>
        <div class="profile-meta">
          <div class="profile-meta-item">📱 <strong>${esc(t.phone)}</strong></div>
          ${t.email ? `<div class="profile-meta-item">✉️ <strong>${esc(t.email)}</strong></div>` : ''}
          ${t.idNumber ? `<div class="profile-meta-item">🪪 ID: <strong>${esc(t.idNumber)}</strong></div>` : ''}
          <div class="profile-meta-item">🏢 <strong>${bldg ? esc(bldg.name) : '—'}</strong></div>
          ${unit ? `<div class="profile-meta-item">🚪 Unit <strong>${esc(unit.number)}</strong> · ${esc(unit.type)} · ${ksh(unit.rent)}/mo</div>` : ''}
          <div class="profile-meta-item">📅 Move-in: <strong>${t.moveIn || '—'}</strong></div>
          ${t.leaseEnd ? `<div class="profile-meta-item">📋 Lease end: <strong style="color:${isLeaseExpiringSoon(t.leaseEnd)?'var(--red)':'inherit'}">${t.leaseEnd}</strong></div>` : ''}
          <div class="profile-meta-item">💳 <strong>${esc(t.payMethod || '')}</strong></div>
          ${t.deposit ? `<div class="profile-meta-item">🔒 Deposit: <strong>${ksh(t.deposit)}</strong></div>` : ''}
        </div>
      </div>
      <div class="profile-actions">
        ${can('canRecordPayments') ? `
          <button class="btn btn-success btn-sm" onclick="quickPayTenant('${t.id}')">+ Log Payment</button>
        ` : ''}
        ${can('canManageTenants') ? `
          <button class="btn btn-ghost btn-sm" onclick="editTenantModal('${t.id}')">✏️ Edit</button>
        ` : ''}
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs" id="profile-tabs">
      <div class="tab active" onclick="switchProfileTab('payments', this)">💳 Payments (${payments.length})</div>
      <div class="tab" onclick="switchProfileTab('details', this)">📋 Details</div>
    </div>

    <!-- Tab Content -->
    <div class="profile-tabs-content">

      <!-- Payments Tab -->
      <div id="profile-tab-payments" class="active">
        ${payments.length ? `
          <div class="card" style="padding:0;overflow:hidden;">
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Date</th><th>Amount</th><th>Method</th>
                  <th>Reference</th><th>Notes</th>
                </tr></thead>
                <tbody>
                  ${payments.map(p => `
                    <tr>
                      <td style="color:var(--text-muted)">${p.date}</td>
                      <td style="color:var(--green);font-weight:700">${ksh(p.amount)}</td>
                      <td><span class="pay-method-chip pay-${(p.method||'').toLowerCase().replace(/\s+/g,'').replace('-','')}">${esc(p.method)}</span></td>
                      <td style="color:var(--text-muted);font-size:0.8rem;font-family:var(--font-mono)">${p.reference || '—'}</td>
                      <td style="color:var(--text-muted);font-size:0.8rem">${p.notes || '—'}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div style="text-align:center;padding:40px;color:var(--text-muted);">
            <div style="font-size:2rem;margin-bottom:8px">💳</div>
            <p>No payments recorded yet.</p>
            ${can('canRecordPayments') ? `<button class="btn btn-primary" style="margin-top:12px" onclick="quickPayTenant('${t.id}')">+ Log First Payment</button>` : ''}
          </div>`}
      </div>

      <!-- Details Tab -->
      <div id="profile-tab-details">
        <div class="two-col">
          <div class="card">
            <div class="section-title" style="margin-bottom:14px">📋 Lease Details</div>
            ${detailRow('Move-in Date', t.moveIn || '—')}
            ${detailRow('Lease End', t.leaseEnd || '—')}
            ${detailRow('Deposit Paid', ksh(t.deposit || 0))}
            ${detailRow('Payment Method', t.payMethod || '—')}
            ${detailRow('Opening Balance', t.openingBalance ? ksh(t.openingBalance) : 'KSh 0 (Clear)')}
            ${detailRow('Billing Start Month', t.openBalDate || '—')}
          </div>
          <div class="card">
            <div class="section-title" style="margin-bottom:14px">👤 Personal Details</div>
            ${detailRow('National ID', t.idNumber || '—')}
            ${detailRow('Email', t.email || '—')}
            ${detailRow('Emergency Contact', t.emergency || '—')}
            ${detailRow('Notes', t.notes || '—')}
            ${detailRow('Status', t.status === 'vacated' ? 'Vacated on ' + (t.vacatedAt || '—') : 'Active')}
          </div>
        </div>

        <!-- Billing Correction Tool -->
        <div class="card" style="margin-top:16px;border-color:var(--amber-border);">
          <div class="section-title" style="margin-bottom:6px;color:var(--amber)">
            ⚙️ Billing Correction
          </div>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:14px;line-height:1.6">
            Use this to fix a tenant's billing start month and opening balance without going to Firebase.
            The opening balance = what they owed BEFORE the billing start month.
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div class="form-group" style="margin:0">
              <label class="form-label">Opening Balance (KSh)</label>
              <input type="number" class="form-input" id="fix-openbal"
                value="${t.openingBalance || 0}"
                placeholder="0 = clear, positive = owes"/>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Billing Start Month</label>
              <input type="month" class="form-input" id="fix-openbaldate"
                value="${t.openBalDate || new Date().toISOString().substr(0,7)}"/>
            </div>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;line-height:1.5;background:var(--bg-hover);padding:10px;border-radius:var(--r)">
            💡 <strong>Example — Mrs Njuguna:</strong> Didn't pay June. Adding her in July.<br/>
            Set <strong>Opening Balance = 7,000</strong> (June arrears) and <strong>Billing Start = 2026-07</strong>.<br/>
            Engine charges: July + August... The 7,000 covers June.
          </div>
          ${can('canManageTenants') ? `
            <button class="btn btn-primary btn-sm" onclick="applyBillingCorrection('${t.id}')">
              ✅ Apply Correction
            </button>
          ` : ''}
        </div>
      </div>

    </div><!-- /profile-tabs-content -->
  `;
}

function detailRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
    <span style="color:var(--text-muted)">${label}</span>
    <span style="color:var(--text-secondary);font-weight:500;text-align:right;max-width:60%">${value}</span>
  </div>`;
}

// ── TENANT MODAL (ADD) ─────────────────────────────────────
export function openAddTenantModal() {
  clearTenantForm();
  document.getElementById('m-tenant-title').textContent = 'Add Tenant';
  document.getElementById('m-tenant-id').value = '';
  // Populate building dropdown
  populateBuildingDropdown('tn-bldg', '', () => populateTenantUnits('tn-bldg','tn-unit',''));
  document.getElementById('tn-movein').value = getToday();
  document.getElementById('tn-openbal').value = '0';
  document.getElementById('tn-openbaldate').value = new Date().toISOString().substr(0,7);
  openModal('m-tenant');
}

window.openAddTenantModal = openAddTenantModal;

window.saveTenantForm = async function() {
  const id   = document.getElementById('m-tenant-id').value;
  const name = document.getElementById('tn-name').value.trim();
  const phone= document.getElementById('tn-phone').value.trim();
  if (!name || !phone) return toast.error('Name and phone are required');

  const btn = document.getElementById('btn-save-tenant');
  btn.classList.add('loading'); btn.disabled = true;

  try {
    const data = {
      name, phone,
      idNumber:       document.getElementById('tn-id').value,
      email:          document.getElementById('tn-email').value,
      buildingId:     document.getElementById('tn-bldg').value,
      unitId:         document.getElementById('tn-unit').value,
      moveIn:         document.getElementById('tn-movein').value,
      leaseEnd:       document.getElementById('tn-lease').value,
      payMethod:      document.getElementById('tn-pay').value,
      deposit:        document.getElementById('tn-dep').value,
      emergency:      document.getElementById('tn-emg').value,
      openingBalance: document.getElementById('tn-openbal').value,
      openBalDate:    document.getElementById('tn-openbaldate')?.value || new Date().toISOString().substr(0,7)
    };
    if (id) { await updateTenant(id, data); toast.success('Tenant updated!'); }
    else    { await addTenant(data);        toast.success('Tenant added!'); }
    closeModal('m-tenant');
    clearTenantForm();
    render();
  } catch(e) { toast.error(e.message); }
  finally    { btn.classList.remove('loading'); btn.disabled = false; }
};

window.editTenantModal = function(id) {
  const t = AppState.tenants.find(t => t.id === id);
  if (!t) return;
  document.getElementById('m-tenant-title').textContent = 'Edit Tenant';
  document.getElementById('m-tenant-id').value    = t.id;
  document.getElementById('tn-name').value         = t.name        || '';
  document.getElementById('tn-id').value           = t.idNumber    || '';
  document.getElementById('tn-phone').value        = t.phone       || '';
  document.getElementById('tn-email').value        = t.email       || '';
  document.getElementById('tn-movein').value       = t.moveIn      || '';
  document.getElementById('tn-lease').value        = t.leaseEnd    || '';
  document.getElementById('tn-dep').value          = t.deposit     || 0;
  document.getElementById('tn-emg').value          = t.emergency   || '';
  document.getElementById('tn-openbal').value      = t.openingBalance || 0;
  const openBalDateEl = document.getElementById('tn-openbaldate');
  if (openBalDateEl) openBalDateEl.value = t.openBalDate || new Date().toISOString().substr(0,7);
  document.getElementById('tn-pay').value          = t.payMethod   || 'M-PESA';
  // Populate building + unit selectors
  populateBuildingDropdown('tn-bldg', t.buildingId, () => {
    populateTenantUnits('tn-bldg', 'tn-unit', t.unitId);
  });
  openModal('m-tenant');
};

window.deleteTenantAction = async function(id) {
  const t  = AppState.tenants.find(t => t.id === id);
  const ok = await confirmDialog(
    `Remove tenant "${t?.name}"? Their payment history will be preserved.`,
    'Remove Tenant'
  );
  if (!ok) return;
  try { await deleteTenant(id); toast.success('Tenant removed'); render(); }
  catch(e) { toast.error(e.message); }
};

// ── NAVIGATE TO PROFILE ────────────────────────────────────
window.viewTenantProfile = function(id) {
  router.nav('tenant_profile', { tenantId: id });
};

window.quickPayTenant = function(id) {
  router.nav('payments', {});
  setTimeout(() => {
    openModal('m-payment');
    const sel = document.getElementById('pm-tenant');
    if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); }
  }, 200);
};

// ── PROFILE TAB SWITCHER ───────────────────────────────────
window.switchProfileTab = function(tab, el) {
  document.querySelectorAll('.profile-tabs-content > div').forEach(d => d.classList.remove('active'));
  document.getElementById('profile-tab-' + tab)?.classList.add('active');
  document.querySelectorAll('#profile-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
};

// ── SEARCH / FILTER HANDLERS ───────────────────────────────
window.tenantSearch      = v => { searchVal    = v; renderTenantRows(); };
window.tenantBldgFilter  = v => { bldgFilter   = v; renderTenantRows(); };
window.tenantStatusFilter= v => { statusFilter = v; renderTenantRows(); };

// ── BUILDING DROPDOWN HELPER ───────────────────────────────
function populateBuildingDropdown(selectId, selectedId, onDone) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Building</option>' +
    AppState.buildings.map(b =>
      `<option value="${b.id}" ${b.id===selectedId?'selected':''}>${esc(b.name)} — ${esc(b.location)}</option>`
    ).join('');
  sel.onchange = () => populateTenantUnits(selectId, selectId.replace('bldg','unit'), '');
  if (onDone) onDone();
}

// ── UNIT DROPDOWN HELPER ───────────────────────────────────
function populateTenantUnits(bldgSelectId, unitSelectId, selectedUnitId) {
  const bldgId  = document.getElementById(bldgSelectId)?.value;
  const unitSel = document.getElementById(unitSelectId);
  if (!unitSel) return;
  // Show vacant units + currently assigned unit
  const units = AppState.units.filter(u =>
    u.buildingId === bldgId && (u.status === 'vacant' || u.id === selectedUnitId)
  );
  unitSel.innerHTML = '<option value="">Select Unit</option>' +
    units.map(u =>
      `<option value="${u.id}" ${u.id===selectedUnitId?'selected':''}>${esc(u.number)} — ${esc(u.type)} (${ksh(u.rent)}/mo)</option>`
    ).join('');
}

window.populateTenantUnitsFromSelect = function(bldgSelectId, unitSelectId) {
  populateTenantUnits(bldgSelectId, unitSelectId, '');
};

// ── HELPERS ────────────────────────────────────────────────
function healthBadge(score) {
  score = score || 100;
  let cls = 'excellent', label = '⭐ Excellent';
  if (score < 40)      { cls = 'high-risk'; label = '🔴 High Risk'; }
  else if (score < 60) { cls = 'at-risk';   label = '🟡 At Risk'; }
  else if (score < 80) { cls = 'good';      label = '🔵 Good'; }
  return `<span class="health-score ${cls}">${label} ${score}</span>`;
}

function isLeaseExpiringSoon(leaseEnd) {
  if (!leaseEnd) return false;
  const diff = new Date(leaseEnd) - new Date();
  return diff > 0 && diff < 30 * 86400000;
}

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
}

function clearTenantForm() {
  ['tn-name','tn-id','tn-phone','tn-email','tn-movein','tn-lease','tn-dep','tn-emg','tn-openbal','tn-openbaldate']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const pay = document.getElementById('tn-pay'); if (pay) pay.value = 'M-PESA';
  const bldg= document.getElementById('tn-bldg'); if (bldg) bldg.innerHTML = '<option value="">Select Building</option>';
  const unit= document.getElementById('tn-unit'); if (unit) unit.innerHTML = '<option value="">Select Unit</option>';
}

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── BILLING CORRECTION TOOL ────────────────────────────────
window.applyBillingCorrection = async function(tenantId) {
  const openBal     = parseFloat(document.getElementById('fix-openbal')?.value) || 0;
  const openBalDate = document.getElementById('fix-openbaldate')?.value;
  if (!openBalDate) return toast.error('Please select a billing start month');

  const t   = AppState.tenants.find(t => t.id === tenantId);
  const btn = event.target;
  btn.classList.add('loading'); btn.disabled = true;

  try {
    const { db } = await import('../firebase-config.js');
    const { doc, updateDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );
    await updateDoc(doc(db, 'tenants', tenantId), {
      openingBalance: openBal,
      openBalDate:    openBalDate
    });
    toast.success(`✅ Billing corrected for ${t?.name}. Reloading...`);
    setTimeout(() => {
      router.nav('tenant_profile', { tenantId });
    }, 800);
  } catch(e) {
    toast.error('Failed: ' + e.message);
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
};
