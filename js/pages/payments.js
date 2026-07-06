// ============================================================
// PropOS — Payments Page
// ============================================================
import { AppState, ksh, getToday, getCurMonth, monthLabel } from '../store.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { recordPayment, deletePayment } from '../services/paymentService.js';
import { getTenantBalance } from '../engine/ledger.js';

export function render() {
  const el = document.getElementById('page-payments');
  if (!el) return;

  // Build month options from existing payments
  const months = [...new Set(AppState.payments.map(p => p.date?.substr(0,7)))]
    .filter(Boolean).sort().reverse();
  if (!months.includes(getCurMonth())) months.unshift(getCurMonth());

  el.innerHTML = `
    <div class="search-row">
      <input type="text" class="search-input" id="p-search"
        placeholder="Search tenant or reference..." oninput="renderPaymentRows()"/>
      <select class="form-select" style="width:auto" id="p-month" onchange="renderPaymentRows()">
        <option value="">All Time</option>
        ${months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('')}
      </select>
      <select class="form-select" style="width:auto" id="p-bldg" onchange="renderPaymentRows()">
        <option value="">All Buildings</option>
        ${AppState.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
      </select>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Tenant</th><th>Building / Unit</th>
            <th>Amount</th><th>Method</th><th>Reference</th>
            <th>Balance After</th><th>Actions</th>
          </tr></thead>
          <tbody id="p-tbody"></tbody>
        </table>
      </div>
    </div>`;

  renderPaymentRows();
}

window.renderPaymentRows = function() {
  const tbody  = document.getElementById('p-tbody');
  if (!tbody) return;
  const search = (document.getElementById('p-search')?.value || '').toLowerCase();
  const month  = document.getElementById('p-month')?.value  || '';
  const bldg   = document.getElementById('p-bldg')?.value   || '';

  let payments = [...AppState.payments].sort((a,b) => b.date?.localeCompare(a.date));
  if (search) payments = payments.filter(p => {
    const t = AppState.tenants.find(t => t.id === p.tenantId);
    return t?.name.toLowerCase().includes(search) ||
           p.reference?.toLowerCase().includes(search);
  });
  if (month) payments = payments.filter(p => p.date?.startsWith(month));
  if (bldg)  payments = payments.filter(p => {
    const t = AppState.tenants.find(t => t.id === p.tenantId);
    return t?.buildingId === bldg;
  });

  if (!payments.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">
      <div class="empty-icon">💳</div><p>No payments found</p></td></tr>`;
    return;
  }

  tbody.innerHTML = payments.map(p => {
    const t   = AppState.tenants.find(t => t.id === p.tenantId);
    const u   = AppState.units.find(u => u.id === t?.unitId);
    const b   = AppState.buildings.find(b => b.id === t?.buildingId);
    const bal = getTenantBalance(p.tenantId);
    const methodCls = (p.method||'').toLowerCase().replace(/[\s-]/g,'');

    return `<tr>
      <td style="color:var(--text-muted);font-size:0.82rem">${p.date}</td>
      <td><strong>${esc(t?.name||'Unknown')}</strong></td>
      <td style="color:var(--text-muted);font-size:0.82rem">
        ${esc(b?.name||'—')} ${u ? '· ' + esc(u.number) : ''}
      </td>
      <td style="color:var(--green);font-weight:700;font-size:0.95rem">${ksh(p.amount)}</td>
      <td><span class="pay-chip pay-${methodCls}">${esc(p.method)}</span></td>
      <td style="color:var(--text-muted);font-size:0.8rem;font-family:var(--font-mono)">${p.reference||'—'}</td>
      <td>${bal > 0
        ? `<span style="color:var(--red);font-weight:600">${ksh(bal)} owed</span>`
        : bal < 0
          ? `<span style="color:var(--blue);font-weight:600">Credit ${ksh(Math.abs(bal))}</span>`
          : `<span style="color:var(--green);font-weight:600">Clear ✓</span>`
      }</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-xs" onclick="showReceiptModal('${p.id}')">🧾 Receipt</button>
        ${can('canDeletePayments') ? `
          <button class="btn btn-ghost btn-xs" onclick="deletePaymentAction('${p.id}')">🗑</button>
        ` : ''}
      </td>
    </tr>`;
  }).join('');
};

// ── LOG PAYMENT ────────────────────────────────────────────
export function initPaymentModal() {
  const tenSel = document.getElementById('pm-tenant');
  if (!tenSel) return;

  // Always rebuild from current AppState
  const activeTenants = AppState.tenants
    .filter(t => t.unitId && t.status !== 'vacated')
    .sort((a, b) => {
      const uA = AppState.units.find(u => u.id === a.unitId)?.number || '';
      const uB = AppState.units.find(u => u.id === b.unitId)?.number || '';
      return uA.localeCompare(uB, undefined, { numeric: true });
    });

  tenSel.innerHTML = '<option value="">-- Select Tenant --</option>' +
    activeTenants.map(t => {
      const b = AppState.buildings.find(b => b.id === t.buildingId);
      const u = AppState.units.find(u => u.id === t.unitId);
      return `<option value="${t.id}">${esc(t.name)} — ${b ? esc(b.name) : ''} ${u ? esc(u.number) : ''}</option>`;
    }).join('');

  // Reset fields
  const dateEl = document.getElementById('pm-date');
  if (dateEl) dateEl.value = getToday();
  const balRow = document.getElementById('pm-bal-row');
  if (balRow) balRow.style.display = 'none';
  const amtEl = document.getElementById('pm-amount');
  if (amtEl) amtEl.value = '';
  const refEl = document.getElementById('pm-ref');
  if (refEl) refEl.value = '';
  const notesEl = document.getElementById('pm-notes');
  if (notesEl) notesEl.value = '';
}

window.fillPayDetail = function() {
  const tId  = document.getElementById('pm-tenant')?.value;
  const row  = document.getElementById('pm-bal-row');
  if (!tId || !row) return;
  row.style.display = 'block';
  const bal  = getTenantBalance(tId);
  const el   = document.getElementById('pm-bal');
  const amtEl= document.getElementById('pm-amount');
  if (bal > 0) {
    el.textContent  = ksh(bal) + ' owed';
    el.style.color  = 'var(--red)';
    if (amtEl && !amtEl.value) amtEl.value = bal;
  } else if (bal < 0) {
    el.textContent = 'Credit: ' + ksh(Math.abs(bal));
    el.style.color = 'var(--blue)';
  } else {
    el.textContent = 'Account is clear';
    el.style.color = 'var(--green)';
  }
};

window.savePaymentForm = async function() {
  const tId    = document.getElementById('pm-tenant')?.value;
  const amount = parseFloat(document.getElementById('pm-amount')?.value) || 0;
  if (!tId)    return toast.error('Please select a tenant');
  if (!amount) return toast.error('Please enter an amount');

  const btn = document.getElementById('btn-save-payment');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const p = await recordPayment({
      tenantId: tId,
      amount,
      date:   document.getElementById('pm-date')?.value   || getToday(),
      method: document.getElementById('pm-method')?.value || 'M-PESA',
      ref:    document.getElementById('pm-ref')?.value    || '',
      notes:  document.getElementById('pm-notes')?.value  || ''
    });
    AppState.lastPayment = p;
    toast.success(`${ksh(amount)} recorded successfully!`);
    closeModal('m-payment');
    clearPaymentForm();
    render();
    // Show receipt
    setTimeout(() => showReceiptModal(p.id, p), 400);
  } catch(e) { toast.error(e.message); }
  finally    { btn.classList.remove('loading'); btn.disabled = false; }
};

function clearPaymentForm() {
  ['pm-amount','pm-ref','pm-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const row = document.getElementById('pm-bal-row');
  if (row) row.style.display = 'none';
}

window.deletePaymentAction = async function(id) {
  const ok = await confirmDialog('Delete this payment record? This cannot be undone.', 'Delete Payment');
  if (!ok) return;
  try { await deletePayment(id); toast.success('Payment deleted'); render(); }
  catch(e) { toast.error(e.message); }
};

// ── RECEIPT ────────────────────────────────────────────────
window.showReceiptModal = function(paymentId, payObj) {
  const p = payObj || AppState.payments.find(p => p.id === paymentId);
  if (!p) return;
  AppState.lastPayment = p;
  const t   = AppState.tenants.find(t => t.id === p.tenantId);
  const u   = AppState.units.find(u => u.id === t?.unitId);
  const b   = AppState.buildings.find(b => b.id === t?.buildingId);
  const bal = getTenantBalance(p.tenantId);
  const s   = AppState.settings;

  document.getElementById('receipt-content').innerHTML = `
    <div class="receipt-area" id="receipt-area">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px">
        <div>
          <div class="inv-company">${esc(s.company||'PropOS')}</div>
          <div class="inv-owner">${esc(s.ownerName||'')}${s.ownerPhone?' · '+esc(s.ownerPhone):''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:0.68rem;letter-spacing:1.5px;text-transform:uppercase;color:#8a837a">Receipt</div>
          <div style="font-size:0.85rem;font-weight:700">#${(p.id||'').toUpperCase().substr(0,8)}</div>
        </div>
      </div>
      ${[
        ['Tenant',    t?.name || '—'],
        ['Unit',      `${b?b.name+' · ':''}${u?u.number:'—'}`],
        ['Date',      p.date],
        ['Method',    p.method],
        p.reference ? ['Reference', p.reference] : null
      ].filter(Boolean).map(([k,v]) => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;
          border-bottom:1px solid #dcd8cf;font-size:0.85rem">
          <span style="color:#8a837a">${k}</span>
          <span style="font-weight:500">${esc(String(v))}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:14px 0;
        font-weight:700;font-size:1.05rem;border-top:2px solid #1a1714;margin-top:8px">
        <span>Amount Paid</span>
        <span style="color:#0f7a60">${ksh(p.amount)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;
        color:${bal>0?'#c0392b':bal<0?'#2563eb':'#0f7a60'}">
        <span>Current Balance</span>
        <span>${bal>0?ksh(bal)+' owed':bal<0?'Credit '+ksh(Math.abs(bal)):'Clear ✓'}</span>
      </div>
      <div style="margin-top:18px;font-size:0.7rem;color:#8a837a;text-align:center">
        Thank you for your payment. Please keep this receipt.
      </div>
    </div>`;
  openModal('m-receipt');
};

window.downloadReceiptPDF = function() {
  const p = AppState.lastPayment;
  if (!p) return;
  const { jsPDF } = window.jspdf;
  const t   = AppState.tenants.find(t => t.id === p.tenantId);
  const u   = AppState.units.find(u => u.id === t?.unitId);
  const b   = AppState.buildings.find(b => b.id === t?.buildingId);
  const bal = getTenantBalance(p.tenantId);
  const s   = AppState.settings;

  const doc = new jsPDF({ unit:'mm', format:'a6' });
  doc.setFillColor(247,246,242); doc.rect(0,0,105,148,'F');
  doc.setTextColor(200,98,42); doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text(s.company||'PropOS', 8, 14);
  doc.setTextColor(138,131,122); doc.setFontSize(7); doc.setFont('helvetica','normal');
  doc.text(`${s.ownerName||''} · ${s.ownerPhone||''}`, 8, 20);
  doc.setTextColor(26,23,20); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('PAYMENT RECEIPT', 8, 30);
  doc.text('#' + (p.id||'').toUpperCase().substr(0,8), 97, 30, 'right');
  const rows = [
    ['Tenant', t?.name||'—'],
    ['Unit', `${b?b.name+' · ':''}${u?u.number:'—'}`],
    ['Date', p.date], ['Method', p.method],
    ...(p.reference ? [['Reference', p.reference]] : [])
  ];
  let y = 38;
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  rows.forEach(([k,v]) => {
    doc.setTextColor(138,131,122); doc.text(k, 8, y);
    doc.setTextColor(26,23,20); doc.text(String(v), 97, y, 'right');
    doc.setDrawColor(220,216,207); doc.line(8, y+2, 97, y+2);
    y += 9;
  });
  y += 3;
  doc.setTextColor(42,125,79); doc.setFontSize(11); doc.setFont('helvetica','bold');
  doc.text('Amount Paid: ' + ksh(p.amount), 8, y); y += 8;
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  const bc = bal>0?[192,57,43]:bal<0?[37,99,168]:[42,125,79];
  doc.setTextColor(...bc);
  doc.text('Balance: '+(bal>0?ksh(bal)+' owed':bal<0?'Credit '+ksh(Math.abs(bal)):'Clear ✓'), 8, y);
  doc.setTextColor(138,131,122); doc.setFontSize(7);
  doc.text('Thank you for your payment. Keep this receipt for your records.', 8, 138);
  doc.save(`Receipt_${(t?.name||'tenant').replace(/ /g,'_')}_${p.date}.pdf`);
  toast.success('Receipt downloaded!');
};

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
