// ============================================================
// PropOS — Statements Page (Full Ledger per Tenant)
// ============================================================
import { AppState, ksh, getCurMonth, monthLabel, getToday } from '../store.js';
import { toast } from '../components/toast.js';
import { getTenantBalance, getTenantLedger } from '../engine/ledger.js';

export function render() {
  const el = document.getElementById('page-statements');
  if (!el) return;

  el.innerHTML = `
    <div class="search-row">
      <select class="form-select" style="width:280px" id="stmt-tenant" onchange="renderStatement()">
        <option value="">-- Select Tenant --</option>
        ${AppState.tenants
          .sort((a,b) => {
            const uA = AppState.units.find(u=>u.id===a.unitId)?.number||'';
            const uB = AppState.units.find(u=>u.id===b.unitId)?.number||'';
            return uA.localeCompare(uB, undefined, {numeric:true});
          })
          .map(t => {
            const b = AppState.buildings.find(b=>b.id===t.buildingId);
            const u = AppState.units.find(u=>u.id===t.unitId);
            return `<option value="${t.id}">${esc(t.name)} — ${b?esc(b.name):''} ${u?esc(u.number):''}</option>`;
          }).join('')}
      </select>
      <select class="form-select" style="width:auto" id="stmt-period">
        <option value="6">Last 6 months</option>
        <option value="12">Last 12 months</option>
        <option value="all">All Time</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="renderStatement()">View</button>
      <button class="btn btn-primary btn-sm" onclick="downloadStatementPDF()">⬇ Download PDF</button>
    </div>
    <div id="stmt-content">
      <div style="text-align:center;padding:80px 20px;color:var(--text-muted)">
        <div style="font-size:2.5rem;margin-bottom:12px">📋</div>
        <p>Select a tenant to view their full statement.</p>
      </div>
    </div>`;
}

window.renderStatement = function() {
  const tId    = document.getElementById('stmt-tenant')?.value;
  const period = document.getElementById('stmt-period')?.value || '6';
  const cont   = document.getElementById('stmt-content');
  if (!cont) return;

  if (!tId) {
    cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
      <div style="font-size:2rem;margin-bottom:8px">📋</div><p>Select a tenant to view their statement.</p></div>`;
    return;
  }

  const t   = AppState.tenants.find(t => t.id === tId);
  const u   = AppState.units.find(u => u.id === t?.unitId);
  const b   = AppState.buildings.find(b => b.id === t?.buildingId);
  const bal = getTenantBalance(tId);

  // Get full ledger
  let ledger = getTenantLedger(tId);

  // Filter by period
  if (period !== 'all') {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - parseInt(period));
    const cutStr = cutoff.toISOString().split('T')[0];
    ledger = ledger.filter(e => e.date >= cutStr);
  }

  cont.innerHTML = `
    <!-- Summary card -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-family:var(--font-display);font-size:1rem;font-weight:700">${esc(t?.name||'')}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
            ${b?esc(b.name)+' · ':''}${u?'Unit '+esc(u.number):'—'} · ${esc(t?.phone||'')}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Current Balance</div>
          <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;
            color:${bal>0?'var(--red)':bal<0?'var(--blue)':'var(--green)'}">
            ${bal>0?ksh(bal)+' owed':bal<0?'Credit '+ksh(Math.abs(bal)):'Clear ✓'}
          </div>
        </div>
      </div>
    </div>

    <!-- Ledger table -->
    <div class="card" style="padding:0;overflow:hidden;">
      <!-- Header -->
      <div style="display:grid;grid-template-columns:100px 1fr 110px 110px 130px;
        background:var(--bg-hover);border-bottom:1px solid var(--border);">
        ${['Date','Description','Charged','Paid','Balance'].map(h =>
          `<div style="padding:10px 14px;font-size:0.62rem;letter-spacing:2px;
            text-transform:uppercase;color:var(--text-muted);font-weight:600">${h}</div>`
        ).join('')}
      </div>

      ${ledger.length ? ledger.map(e => {
        const isOB  = e.type==='openbal-debit'||e.type==='openbal-credit';
        const isPay = e.type==='PAYMENT'||e.direction==='credit';
        const icon  = isOB?'⬡':isPay?'▼':'▲';
        const iconColor = isOB?'var(--amber)':isPay?'var(--green)':'var(--red)';
        const balCls = e.balance>0?'bal-positive':e.balance<0?'bal-negative':'bal-zero';

        return `<div style="display:grid;grid-template-columns:100px 1fr 110px 110px 130px;
          border-bottom:1px solid var(--border);transition:background var(--transition);
          ${isOB?'background:rgba(251,191,36,0.04);':''}">
          <div style="padding:11px 14px;font-size:0.8rem;color:var(--text-muted)">${e.date}</div>
          <div style="padding:11px 14px;font-size:0.83rem">
            <span style="color:${iconColor};margin-right:5px">${icon}</span>${esc(e.description||'')}
          </div>
          <div style="padding:11px 14px;font-size:0.83rem;text-align:right;
            color:${e.debit?'var(--red)':'var(--text-muted)'}">
            ${e.debit?ksh(e.debit):'—'}
          </div>
          <div style="padding:11px 14px;font-size:0.83rem;text-align:right;
            color:${e.credit?'var(--green)':'var(--text-muted)'}">
            ${e.credit?ksh(e.credit):'—'}
          </div>
          <div style="padding:11px 14px;font-size:0.83rem;text-align:right" class="${balCls}">
            ${ksh(e.balance)}
          </div>
        </div>`;
      }).join('') : `
        <div style="text-align:center;padding:40px;color:var(--text-muted)">
          No transactions in this period.
        </div>`}
    </div>`;
};

window.downloadStatementPDF = function() {
  const tId = document.getElementById('stmt-tenant')?.value;
  if (!tId) return toast.error('Select a tenant first');
  const t   = AppState.tenants.find(t => t.id === tId);
  const u   = AppState.units.find(u => u.id === t?.unitId);
  const b   = AppState.buildings.find(b => b.id === t?.buildingId);
  const ledger = getTenantLedger(tId);
  const bal = getTenantBalance(tId);
  const s   = AppState.settings;
  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({ unit:'mm', format:'a4' });
  doc.setFillColor(247,246,242); doc.rect(0,0,210,297,'F');

  // Header
  doc.setTextColor(200,98,42); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text(s.company||'PropOS', 14, 18);
  doc.setTextColor(138,131,122); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`${s.ownerName||''} · ${s.ownerPhone||''}`, 14, 24);
  doc.setTextColor(26,23,20); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('TENANT STATEMENT', 196, 18, 'right');
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(138,131,122);
  doc.text('Generated: '+getToday(), 196, 24, 'right');

  // Tenant info
  doc.setFillColor(240,237,230); doc.rect(14,30,182,16,'F');
  doc.setTextColor(26,23,20); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(`${t?.name||''} — ${b?b.name+' ':''}Unit ${u?u.number:''}`, 18, 38);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(74,69,64);
  doc.text(`Balance: ${bal>0?ksh(bal)+' owed':bal<0?'Credit '+ksh(Math.abs(bal)):'Clear'}`, 18, 44);

  // Column headers
  let y = 56;
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(138,131,122);
  const cols = [14,36,130,155,178];
  ['Date','Description','Charged','Paid','Balance'].forEach((h,i) => doc.text(h,cols[i],y));
  doc.setDrawColor(220,216,207); doc.line(14,y+2,196,y+2); y+=8;

  // Ledger rows
  doc.setFont('helvetica','normal'); doc.setTextColor(26,23,20);
  ledger.forEach(e => {
    if (y > 275) { doc.addPage(); doc.setFillColor(247,246,242); doc.rect(0,0,210,297,'F'); y=20; }
    doc.setTextColor(138,131,122); doc.text(e.date,cols[0],y);
    doc.setTextColor(26,23,20); doc.text(String(e.description||'').substr(0,38),cols[1],y);
    doc.setTextColor(e.debit?192:138, e.debit?57:131, e.debit?43:122);
    doc.text(e.debit?ksh(e.debit):'—',cols[2],y);
    doc.setTextColor(e.credit?42:138, e.credit?125:131, e.credit?79:122);
    doc.text(e.credit?ksh(e.credit):'—',cols[3],y);
    const bc = e.balance>0?[192,57,43]:e.balance<0?[37,99,168]:[42,125,79];
    doc.setTextColor(...bc); doc.text(ksh(e.balance),cols[4],y);
    doc.setDrawColor(235,232,226); doc.line(14,y+2,196,y+2); y+=8;
  });
  doc.save(`Statement_${(t?.name||'').replace(/ /g,'_')}_${getToday()}.pdf`);
  toast.success('Statement downloaded!');
};

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
