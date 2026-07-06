// ============================================================
// PropOS — Dashboard Page (Phase 7)
// ============================================================
import { AppState, ksh, getCurMonth, monthLabel } from '../store.js';
import { can } from '../auth.js';
import {
  getTenantBalance, getDashboardStats,
  getSixMonthTrend, getStatusThisMonth
} from '../engine/ledger.js';

let charts = {};

export function render() {
  const el = document.getElementById('page-dashboard');
  if (!el) return;

  const month = getCurMonth();
  const stats = getDashboardStats(month);
  const trend = getSixMonthTrend();

  el.innerHTML = `
    <!-- Export buttons -->
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px;">
      <button class="btn btn-ghost btn-sm" onclick="exportDashboardCSV()">⬇ CSV</button>
      <button class="btn btn-primary btn-sm" onclick="exportDashboardPDF()">⬇ PDF Report</button>
    </div>

    <!-- KPI Strip -->
    <div class="kpi-row" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:24px;">
      <div class="kpi-card blue loaded" style="--bar-width:100%">
        <div class="kpi-label">Total Units</div>
        <div class="kpi-value">${stats.totalUnits}</div>
        <div class="kpi-sub">${stats.occupiedUnits} occupied · ${stats.vacantUnits} vacant</div>
      </div>
      <div class="kpi-card accent loaded" style="--bar-width:80%">
        <div class="kpi-label">Expected Rent</div>
        <div class="kpi-value" style="font-size:1.3rem">${ksh(stats.expectedRent)}</div>
        <div class="kpi-sub">${monthLabel(month)}</div>
      </div>
      <div class="kpi-card green loaded" style="--bar-width:${stats.collectionRate}%">
        <div class="kpi-label">Collected</div>
        <div class="kpi-value" style="font-size:1.3rem">${ksh(stats.collected)}</div>
        <div class="kpi-sub">${stats.collectionRate}% of expected</div>
      </div>
      <div class="kpi-card red loaded" style="--bar-width:60%">
        <div class="kpi-label">Total Arrears</div>
        <div class="kpi-value" style="font-size:1.3rem">${ksh(stats.totalArrears)}</div>
        <div class="kpi-sub">all outstanding</div>
      </div>
      <div class="kpi-card red loaded" style="--bar-width:40%">
        <div class="kpi-label">Expenses</div>
        <div class="kpi-value" style="font-size:1.3rem">${ksh(stats.expenses)}</div>
        <div class="kpi-sub">${monthLabel(month)}</div>
      </div>
      <div class="kpi-card ${stats.netProfit >= 0 ? 'green' : 'red'} loaded"
        style="--bar-width:70%">
        <div class="kpi-label">Net Profit</div>
        <div class="kpi-value" style="font-size:1.3rem">${ksh(stats.netProfit)}</div>
        <div class="kpi-sub">income minus expenses</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="charts-grid" style="margin-bottom:24px;">
      <div class="chart-card">
        <div class="chart-title">💰 Revenue Trend — 6 Months</div>
        <div class="chart-wrap"><canvas id="ch-trend"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">🍩 Collection Rate — ${monthLabel(month)}</div>
        <div class="chart-wrap"><canvas id="ch-collection"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">🏢 Occupancy by Building</div>
        <div class="chart-wrap"><canvas id="ch-occupancy"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">📊 Income vs Expenses</div>
        <div class="chart-wrap"><canvas id="ch-pnl"></canvas></div>
      </div>
    </div>

    <!-- Bottom panels -->
    <div class="two-col">
      <!-- Top Arrears -->
      <div class="card">
        <div class="section-header" style="margin-bottom:14px">
          <div class="section-title">⚠️ Top Arrears</div>
          <span class="badge badge-red">${stats.unpaidCount + stats.partialCount} tenants</span>
        </div>
        <div id="dash-arrears">${renderTopArrears()}</div>
      </div>

      <!-- Right panels stacked -->
      <div style="display:flex;flex-direction:column;gap:18px;">
        <!-- Recent Payments -->
        <div class="card">
          <div class="section-header" style="margin-bottom:14px">
            <div class="section-title">✅ Recent Payments</div>
          </div>
          <div id="dash-recent">${renderRecentPayments()}</div>
        </div>

        <!-- Lease Expiries -->
        <div class="card">
          <div class="section-header" style="margin-bottom:14px">
            <div class="section-title">📋 Upcoming Lease Expiries</div>
            <span style="font-size:0.75rem;color:var(--text-muted)">Next 30 days</span>
          </div>
          <div id="dash-leases">${renderLeaseExpiries()}</div>
        </div>
      </div>
    </div>
  `;

  // Render charts after DOM is ready
  setTimeout(() => renderCharts(stats, trend), 50);
}

// ── TOP ARREARS ────────────────────────────────────────────
function renderTopArrears() {
  const withBal = AppState.tenants
    .filter(t => t.unitId && t.status !== 'vacated')
    .map(t => ({ t, bal: getTenantBalance(t.id) }))
    .filter(x => x.bal > 0)
    .sort((a, b) => b.bal - a.bal)
    .slice(0, 8);

  if (!withBal.length) {
    return `<div style="text-align:center;padding:20px;color:var(--green);font-size:0.85rem">
      🎉 No arrears! All accounts are clear.</div>`;
  }

  return withBal.map(({ t, bal }) => {
    const u = AppState.units.find(u => u.id === t.unitId);
    const b = AppState.buildings.find(b => b.id === t.buildingId);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600;font-size:0.88rem">${esc(t.name)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">
            ${b ? esc(b.name) : ''} · ${u ? esc(u.number) : ''} · ${esc(t.phone)}
          </div>
        </div>
        <div style="text-align:right;display:flex;align-items:center;gap:8px;">
          <div style="color:var(--red);font-weight:700;font-size:0.9rem">${ksh(bal)}</div>
          ${can('canRecordPayments') ? `
            <button class="btn btn-ghost btn-xs"
              onclick="quickPayDash('${t.id}')">Pay</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── RECENT PAYMENTS ────────────────────────────────────────
function renderRecentPayments() {
  const recent = [...AppState.payments]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 6);

  if (!recent.length) {
    return `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.85rem">
      No payments recorded yet.</div>`;
  }

  return recent.map(p => {
    const t = AppState.tenants.find(t => t.id === p.tenantId);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:9px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600;font-size:0.85rem">${esc(t?.name || 'Unknown')}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${p.date} · ${esc(p.method)}</div>
        </div>
        <div style="color:var(--green);font-weight:700;font-size:0.88rem">${ksh(p.amount)}</div>
      </div>`;
  }).join('');
}

// ── LEASE EXPIRIES ─────────────────────────────────────────
function renderLeaseExpiries() {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const expiring = AppState.tenants
    .filter(t => {
      if (!t.leaseEnd || t.status === 'vacated') return false;
      const d = new Date(t.leaseEnd);
      return d >= now && d <= in30;
    })
    .sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd));

  if (!expiring.length) {
    return `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.82rem">
      No leases expiring in the next 30 days.</div>`;
  }

  return expiring.map(t => {
    const u = AppState.units.find(u => u.id === t.unitId);
    const daysLeft = Math.ceil((new Date(t.leaseEnd) - now) / 86400000);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:9px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600;font-size:0.85rem">${esc(t.name)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">
            ${u ? esc(u.number) : ''} · Expires ${t.leaseEnd}
          </div>
        </div>
        <span class="badge ${daysLeft <= 7 ? 'badge-red' : 'badge-amber'}">
          ${daysLeft}d left
        </span>
      </div>`;
  }).join('');
}

// ── CHARTS ─────────────────────────────────────────────────
function renderCharts(stats, trend) {
  const defaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#b8bcd4', font: { size: 11 }, boxWidth: 12 }
      }
    }
  };

  // Destroy existing charts
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(_) {} });
  charts = {};

  // 1. Revenue Trend — line chart
  const c1 = document.getElementById('ch-trend');
  if (c1) {
    charts.trend = new Chart(c1.getContext('2d'), {
      type: 'line',
      data: {
        labels: trend.map(d => d.label),
        datasets: [
          {
            label: 'Income',
            data: trend.map(d => d.income),
            borderColor: '#22d3a5',
            backgroundColor: 'rgba(34,211,165,0.08)',
            fill: true, tension: 0.4, borderWidth: 2,
            pointRadius: 4, pointBackgroundColor: '#22d3a5'
          },
          {
            label: 'Expenses',
            data: trend.map(d => d.expenses),
            borderColor: '#ff5577',
            backgroundColor: 'rgba(255,85,119,0.06)',
            fill: true, tension: 0.4, borderWidth: 2,
            pointRadius: 4, pointBackgroundColor: '#ff5577'
          }
        ]
      },
      options: {
        ...defaults,
        scales: {
          x: { ticks: { color: '#6b7094', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#6b7094', font: { size: 10 }, callback: v => v >= 1000 ? 'K' + Math.round(v/1000) : v }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  // 2. Collection Rate — donut
  const c2 = document.getElementById('ch-collection');
  if (c2) {
    charts.collection = new Chart(c2.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Unpaid', 'Partial', 'Credit'],
        datasets: [{
          data: [stats.paidCount, stats.unpaidCount, stats.partialCount, stats.creditCount],
          backgroundColor: ['#22d3a5', '#ff5577', '#fbbf24', '#38bdf8'],
          borderWidth: 2, borderColor: '#161820', hoverOffset: 6
        }]
      },
      options: { ...defaults, cutout: '68%' }
    });
  }

  // 3. Occupancy by building — stacked bar
  const c3 = document.getElementById('ch-occupancy');
  if (c3) {
    const bNames = AppState.buildings.map(b => b.name);
    charts.occupancy = new Chart(c3.getContext('2d'), {
      type: 'bar',
      data: {
        labels: bNames.length ? bNames : ['No Buildings'],
        datasets: [
          {
            label: 'Occupied',
            data: AppState.buildings.map(b =>
              AppState.units.filter(u => u.buildingId === b.id && u.status === 'occupied').length),
            backgroundColor: '#22d3a5', borderRadius: 4
          },
          {
            label: 'Vacant',
            data: AppState.buildings.map(b =>
              AppState.units.filter(u => u.buildingId === b.id && u.status === 'vacant').length),
            backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4
          }
        ]
      },
      options: {
        ...defaults,
        scales: {
          x: { stacked: true, ticks: { color: '#6b7094' }, grid: { display: false } },
          y: { stacked: true, ticks: { color: '#6b7094', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  // 4. Income vs Expenses — grouped bar
  const c4 = document.getElementById('ch-pnl');
  if (c4) {
    charts.pnl = new Chart(c4.getContext('2d'), {
      type: 'bar',
      data: {
        labels: trend.map(d => d.label),
        datasets: [
          {
            label: 'Income',
            data: trend.map(d => d.income),
            backgroundColor: 'rgba(34,211,165,0.65)', borderRadius: 4
          },
          {
            label: 'Expenses',
            data: trend.map(d => d.expenses),
            backgroundColor: 'rgba(255,85,119,0.65)', borderRadius: 4
          }
        ]
      },
      options: {
        ...defaults,
        scales: {
          x: { ticks: { color: '#6b7094', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#6b7094', font: { size: 10 }, callback: v => v >= 1000 ? 'K' + Math.round(v/1000) : v }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }
}

// ── EXPORTS ────────────────────────────────────────────────
window.quickPayDash = function(tenantId) {
  window.openModal('m-payment');
  setTimeout(() => {
    const sel = document.getElementById('pm-tenant');
    if (sel) { sel.value = tenantId; window.fillPayDetail && window.fillPayDetail(); }
  }, 300);
};

window.exportDashboardCSV = function() {
  const month = getCurMonth();
  let csv = `PropOS Dashboard Export — ${monthLabel(month)}\n\n`;
  const stats = getDashboardStats(month);
  csv += `Expected Rent,${stats.expectedRent}\nCollected,${stats.collected}\n`;
  csv += `Total Arrears,${stats.totalArrears}\nExpenses,${stats.expenses}\nNet,${stats.netProfit}\n\n`;
  csv += 'Tenant,Building,Unit,Rent,Balance,Status,Phone\n';
  AppState.tenants.filter(t => t.unitId).forEach(t => {
    const u = AppState.units.find(u => u.id === t.unitId);
    const b = AppState.buildings.find(b => b.id === t.buildingId);
    const bal = getTenantBalance(t.id);
    const st  = bal > 0 ? 'Arrears' : bal < 0 ? 'Credit' : 'Clear';
    csv += `"${t.name}","${b?.name||''}","${u?.number||''}","${u?.rent||0}","${bal}","${st}","${t.phone}"\n`;
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `Dashboard_${month}.csv`;
  a.click();
  const { toast } = require('../components/toast.js');
  import('../components/toast.js').then(m => m.toast.success('CSV exported!'));
};

window.exportDashboardPDF = function() {
  const { jsPDF } = window.jspdf;
  const month = getCurMonth();
  const stats = getDashboardStats(month);
  const s = AppState.settings;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFillColor(247,246,242); doc.rect(0,0,210,297,'F');
  doc.setTextColor(200,98,42); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text(s.company||'PropOS', 14, 18);
  doc.setTextColor(138,131,122); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`${s.ownerName||''} · ${s.ownerPhone||''}`, 14, 24);
  doc.setTextColor(26,23,20); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('DASHBOARD — ' + monthLabel(month).toUpperCase(), 196, 18, 'right');
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(138,131,122);
  doc.text('Generated: ' + new Date().toISOString().split('T')[0], 196, 24, 'right');

  // Summary box
  let y = 36;
  doc.setFillColor(240,237,230); doc.rect(14,y,182,32,'F');
  const sumRows = [
    ['Expected Rent', ksh(stats.expectedRent), 'normal'],
    ['Collected',     ksh(stats.collected),    'green'],
    ['Expenses',      ksh(stats.expenses),     'red'],
    ['Net Profit',    ksh(stats.netProfit),    stats.netProfit>=0?'green':'red'],
    ['Total Arrears', ksh(stats.totalArrears), 'red']
  ];
  let sx = 20;
  sumRows.forEach(([k, v, c]) => {
    doc.setTextColor(138,131,122); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text(k, sx, y+8);
    const rgb = c==='green'?[42,125,79]:c==='red'?[192,57,43]:[26,23,20];
    doc.setTextColor(...rgb); doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(v, sx, y+18); sx += 37;
  });
  y += 42;

  // Tenant table
  doc.setTextColor(26,23,20); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text('Tenant Status', 14, y); y += 6;
  doc.setFillColor(224,220,210); doc.rect(14,y,182,7,'F');
  doc.setTextColor(74,69,64); doc.setFontSize(7); doc.setFont('helvetica','bold');
  const cols = [14,70,100,125,155,180];
  ['Tenant','Building · Unit','Rent/mo','Balance','Status','Phone'].forEach((h,i) => doc.text(h,cols[i],y+5));
  y += 9;
  doc.setFont('helvetica','normal'); doc.setFontSize(7);
  AppState.tenants.filter(t => t.unitId).forEach((t, idx) => {
    const u = AppState.units.find(u => u.id === t.unitId);
    const b = AppState.buildings.find(b => b.id === t.buildingId);
    const bal = getTenantBalance(t.id);
    const st  = bal > 0 ? 'Arrears' : bal < 0 ? 'Credit' : 'Clear';
    if (idx%2===0) { doc.setFillColor(247,246,242); doc.rect(14,y-1,182,7,'F'); }
    doc.setTextColor(26,23,20); doc.text((t.name||'').substr(0,22),cols[0],y+4);
    doc.text(((b?.name||'')+(u?' · '+u.number:'')).substr(0,18),cols[1],y+4);
    doc.text(u?ksh(u.rent):'—',cols[2],y+4);
    const bc = bal>0?[192,57,43]:bal<0?[37,99,168]:[42,125,79];
    doc.setTextColor(...bc); doc.text(ksh(Math.abs(bal)),cols[3],y+4);
    doc.text(st,cols[4],y+4);
    doc.setTextColor(138,131,122); doc.text(t.phone||'',cols[5],y+4);
    y += 8;
    if (y > 270) { doc.addPage(); doc.setFillColor(247,246,242); doc.rect(0,0,210,297,'F'); y = 20; }
  });
  doc.save(`Dashboard_${month}.pdf`);
  import('../components/toast.js').then(m => m.toast.success('PDF exported!'));
};

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
