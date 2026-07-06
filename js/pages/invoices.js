// ============================================================
// PropOS — Invoices Page
// ============================================================
import { AppState, ksh, getCurMonth, monthLabel, getToday } from '../store.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import { closeModal } from '../components/modal.js';
import { getTenantBalance, getMonthlyInvoice } from '../engine/ledger.js';
import { appSettings } from '../services/settingsService.js';

export function render() {
  const el = document.getElementById('page-invoices');
  if (!el) return;

  // Build month list
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().substr(0,7));
  }

  el.innerHTML = `
    <div class="search-row">
      <select class="form-select" style="width:auto" id="inv-month" onchange="renderInvoiceRows()">
        ${months.map(m => `<option value="${m}" ${m===getCurMonth()?'selected':''}>${monthLabel(m)}</option>`).join('')}
      </select>
      <select class="form-select" style="width:auto" id="inv-bldg" onchange="renderInvoiceRows()">
        <option value="">All Buildings</option>
        ${AppState.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
      </select>
      <select class="form-select" style="width:auto" id="inv-status" onchange="renderInvoiceRows()">
        <option value="">All Statuses</option>
        <option value="unpaid">Unpaid</option>
        <option value="partial">Partial</option>
        <option value="paid">Paid</option>
      </select>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Month</th><th>Tenant</th><th>Unit</th>
            <th>Rent Due</th><th>Opening Bal</th><th>Total Due</th>
            <th>Paid</th><th>Outstanding</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>`;

  renderInvoiceRows();
}

window.renderInvoiceRows = function() {
  const tbody    = document.getElementById('inv-tbody');
  if (!tbody) return;
  const month    = document.getElementById('inv-month')?.value  || getCurMonth();
  const bldgF    = document.getElementById('inv-bldg')?.value   || '';
  const statusF  = document.getElementById('inv-status')?.value || '';

  let tenants = AppState.tenants.filter(t => t.unitId && t.status !== 'vacated');
  if (bldgF) tenants = tenants.filter(t => t.buildingId === bldgF);

  const invoices = tenants
    .map(t => getMonthlyInvoice(t.id, month))
    .filter(Boolean);

  const filtered = statusF ? invoices.filter(i => i.status === statusF) : invoices;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">
      <div class="empty-icon">🧾</div><p>No invoices found</p></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(i => {
    const sc = i.status==='paid' ? 'badge-green' : i.status==='partial' ? 'badge-amber' : 'badge-red';
    return `<tr>
      <td style="color:var(--text-muted);font-size:0.82rem">${monthLabel(i.month)}</td>
      <td><strong>${esc(i.tenant?.name||'')}</strong></td>
      <td style="color:var(--text-muted)">${esc(i.unit?.number||'')} · ${esc(i.unit?.type||'')}</td>
      <td>${ksh(i.rentDue)}</td>
      <td style="color:${i.arrearsBroughtForward>0?'var(--red)':'var(--text-muted)'}">
        ${i.arrearsBroughtForward>0?ksh(i.arrearsBroughtForward):'—'}
      </td>
      <td style="font-weight:700">${ksh(i.totalDue)}</td>
      <td style="color:var(--green);font-weight:600">${i.paid>0?ksh(i.paid):'—'}</td>
      <td style="color:${i.outstanding>0?'var(--red)':'var(--green)'};font-weight:600">
        ${i.outstanding>0?ksh(i.outstanding):'Clear ✓'}
      </td>
      <td><span class="badge ${sc}">${i.status.toUpperCase()}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-xs" onclick="viewInvoiceModal('${i.tenantId}','${i.month}')">View</button>
        <button class="btn btn-ghost btn-xs" onclick="quickPayFromInvoice('${i.tenantId}')">Pay</button>
      </td>
    </tr>`;
  }).join('');
};

// ── VIEW INVOICE MODAL ─────────────────────────────────────
window.viewInvoiceModal = function(tenantId, month) {
  const i = getMonthlyInvoice(tenantId, month);
  if (!i) return;
  AppState.lastInvoice = { tenantId, month };
  const s = AppState.settings;

  document.getElementById('inv-content').innerHTML = `
    <div class="invoice-preview" id="inv-area">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px">
        <div>
          <div class="inv-company">${esc(s.company||'PropOS')}</div>
          <div class="inv-owner">${esc(s.ownerName||'')}${s.ownerPhone?' · '+esc(s.ownerPhone):''}</div>
        </div>
        <div style="text-align:right">
          <div class="inv-title">INVOICE</div>
          <div style="font-size:0.8rem;color:#8a837a">${monthLabel(month)}</div>
          <div style="font-size:0.72rem;color:#aaa;margin-top:2px">Issued: ${getToday()}</div>
        </div>
      </div>
      <div style="background:#ede9df;border-radius:8px;padding:12px;margin-bottom:16px">
        <div style="font-weight:700;margin-bottom:3px">${esc(i.tenant?.name||'')}</div>
        <div style="font-size:0.8rem;color:#6b6560">
          ${i.building?esc(i.building.name)+' · ':''}Unit ${esc(i.unit?.number||'')} · ${esc(i.unit?.type||'')}
        </div>
        <div style="font-size:0.8rem;color:#6b6560">${esc(i.tenant?.phone||'')}</div>
      </div>
      <table class="inv-table">
        <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          <tr><td>Monthly Rent — ${monthLabel(month)}</td><td style="text-align:right">${ksh(i.rentDue)}</td></tr>
          ${i.arrearsBroughtForward>0?`<tr><td style="color:#c0392b">Arrears Brought Forward</td><td style="text-align:right;color:#c0392b">${ksh(i.arrearsBroughtForward)}</td></tr>`:''}
          ${i.paid>0?`<tr><td style="color:#2a7d4f">Less: Payment Received</td><td style="text-align:right;color:#2a7d4f">- ${ksh(i.paid)}</td></tr>`:''}
        </tbody>
      </table>
      <div class="inv-total">
        <span>Total Due</span>
        <span style="color:${i.outstanding>0?'#c0392b':'#2a7d4f'}">${ksh(Math.max(0,i.outstanding))}</span>
      </div>
      <div style="margin-top:14px;padding:11px;background:${i.outstanding>0?'#fde8e6':'#ddf0e7'};
        border-radius:8px;font-size:0.8rem;color:${i.outstanding>0?'#c0392b':'#2a7d4f'}">
        ${i.status==='paid'
          ? '✅ This invoice is fully paid. Thank you!'
          : i.status==='partial'
            ? `⚠️ Partial payment received. ${ksh(i.outstanding)} still outstanding.`
            : `🔔 Payment of ${ksh(i.outstanding)} is due. Please pay promptly.`}
      </div>
    </div>`;
  openModal('m-invoice');
};

window.sendInvoiceWhatsApp = function() {
  const inv = AppState.lastInvoice;
  if (!inv) return;
  const i = getMonthlyInvoice(inv.tenantId, inv.month);
  if (!i) return;
  const s   = AppState.settings;
  const msg = `*Invoice — ${monthLabel(i.month)}*\n\nDear ${i.tenant?.name},\n\nYour rent invoice for ${monthLabel(i.month)}:\n\n• Rent: ${ksh(i.rentDue)}${i.arrearsBroughtForward>0?'\n• Arrears B/F: '+ksh(i.arrearsBroughtForward):''}${i.paid>0?'\n• Paid: '+ksh(i.paid):''}\n\n*Total Due: ${ksh(Math.max(0,i.outstanding))}*\n\nThank you,\n${s.ownerName||s.company||'Management'}`;
  const phone = (i.tenant?.phone||'').replace(/\D/g,'');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  toast.success('WhatsApp opened');
};

window.downloadInvoicePDF = function() {
  const inv = AppState.lastInvoice;
  if (!inv) return;
  const i = getMonthlyInvoice(inv.tenantId, inv.month);
  if (!i) return;
  const { jsPDF } = window.jspdf;
  const s   = AppState.settings;
  const doc = new jsPDF({ unit:'mm', format:'a5' });
  doc.setFillColor(247,246,242); doc.rect(0,0,148,210,'F');
  doc.setTextColor(200,98,42); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text(s.company||'PropOS', 10, 16);
  doc.setTextColor(138,131,122); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`${s.ownerName||''} · ${s.ownerPhone||''}`, 10, 22);
  doc.setTextColor(26,23,20); doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text('INVOICE', 138, 16, 'right');
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(138,131,122);
  doc.text(monthLabel(i.month), 138, 22, 'right');
  doc.setFillColor(240,237,230); doc.rect(10,28,128,16,'F');
  doc.setTextColor(26,23,20); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(i.tenant?.name||'', 14, 36);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(74,69,64);
  doc.text(`${i.building?i.building.name+' · ':''}Unit ${i.unit?.number||''} · ${i.tenant?.phone||''}`, 14, 42);
  let y = 56;
  const rows = [
    [`Monthly Rent — ${monthLabel(i.month)}`, ksh(i.rentDue)],
    ...(i.arrearsBroughtForward>0?[['Arrears Brought Forward', ksh(i.arrearsBroughtForward)]]:[]),
    ...(i.paid>0?[['Less: Payment Received', '- '+ksh(i.paid)]]:[])
  ];
  rows.forEach(([k,v]) => {
    doc.setTextColor(74,69,64); doc.text(k,10,y); doc.text(v,138,y,'right');
    doc.setDrawColor(220,216,207); doc.line(10,y+2,138,y+2); y+=10;
  });
  y+=4; doc.setTextColor(26,23,20); doc.setFontSize(11); doc.setFont('helvetica','bold');
  doc.text('Total Due', 10, y);
  const oc = i.outstanding>0?[192,57,43]:[42,125,79];
  doc.setTextColor(...oc); doc.text(ksh(Math.max(0,i.outstanding)),138,y,'right');
  doc.save(`Invoice_${(i.tenant?.name||'').replace(/ /g,'_')}_${i.month}.pdf`);
  toast.success('Invoice downloaded!');
};

window.quickPayFromInvoice = function(tenantId) {
  closeModal('m-invoice');
  setTimeout(() => {
    openModal('m-payment');
    const sel = document.getElementById('pm-tenant');
    if (sel) {
      sel.value = tenantId;
      sel.dispatchEvent(new Event('change'));
    }
  }, 300);
};

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
