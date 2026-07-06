// ============================================================
// PropOS - Reports & P&L Page
// Owner/accountant reporting built from the ledger source data.
// ============================================================

import { AppState, ksh, getCurMonth, monthLabel } from '../store.js';
import { getDashboardStats, getTenantBalance } from '../engine/ledger.js';
import { toast } from '../components/toast.js';

const ReportState = {
  month: null,
  buildingId: ''
};

export function render() {
  const el = document.getElementById('page-reports');
  if (!el) return;

  if (!ReportState.month) ReportState.month = getCurMonth();
  const months = getReportMonths();

  el.innerHTML = `
    <div class="reports-toolbar">
      <div class="reports-toolbar-left">
        <div class="form-group">
          <label class="form-label">Report Month</label>
          <select class="form-select" id="r-month" onchange="renderReportsView()">
            ${months.map(m => `<option value="${m}" ${m === ReportState.month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Building</label>
          <select class="form-select" id="r-building" onchange="renderReportsView()">
            <option value="">All Buildings</option>
            ${AppState.buildings.map(b => `
              <option value="${b.id}" ${b.id === ReportState.buildingId ? 'selected' : ''}>${esc(b.name)}</option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="reports-toolbar-actions">
        <button class="btn btn-ghost btn-sm" onclick="exportCSV()">CSV</button>
        <button class="btn btn-primary btn-sm" onclick="downloadPnL()">P&L PDF</button>
      </div>
    </div>

    <div id="reports-view"></div>
  `;

  renderReportsView();
}

window.renderReportsView = function() {
  const monthEl = document.getElementById('r-month');
  const buildingEl = document.getElementById('r-building');
  if (monthEl) ReportState.month = monthEl.value || getCurMonth();
  if (buildingEl) ReportState.buildingId = buildingEl.value || '';

  const container = document.getElementById('reports-view');
  if (!container) return;

  const report = buildReport(ReportState.month, ReportState.buildingId);

  container.innerHTML = `
    <div class="report-summary-grid">
      ${summaryCard('Income', ksh(report.income), `${report.paymentCount} payment records`, 'green')}
      ${summaryCard('Expenses', ksh(report.expenses), `${report.expenseCount} expense records`, 'red')}
      ${summaryCard('Net Profit', ksh(report.netProfit), report.netProfit >= 0 ? 'Profitable month' : 'Loss month', report.netProfit >= 0 ? 'green' : 'red')}
      ${summaryCard('Collection Rate', `${report.collectionRate.toFixed(1)}%`, `${ksh(report.expectedRent)} expected`, report.collectionRate >= 80 ? 'green' : report.collectionRate >= 50 ? 'amber' : 'red')}
      ${summaryCard('Arrears', ksh(report.arrears), `${report.arrearsRows.length} tenants owing`, 'amber')}
      ${summaryCard('Occupancy', `${report.occupancyRate.toFixed(1)}%`, `${report.occupiedUnits}/${report.totalUnits} units`, 'blue')}
    </div>

    <div class="report-layout">
      <section class="report-panel report-pnl-panel">
        <div class="section-header">
          <div>
            <div class="section-title">Profit & Loss</div>
            <div class="section-sub">${esc(report.scopeLabel)} - ${monthLabel(report.month)}</div>
          </div>
        </div>
        <table class="data-table report-table">
          <tbody>
            <tr><td>Rental income collected</td><td class="amount green">${ksh(report.income)}</td></tr>
            <tr><td>Operating expenses</td><td class="amount red">${ksh(report.expenses)}</td></tr>
            <tr class="report-total-row"><td>Net operating profit</td><td class="amount ${report.netProfit >= 0 ? 'green' : 'red'}">${ksh(report.netProfit)}</td></tr>
            <tr><td>Expected monthly rent</td><td class="amount">${ksh(report.expectedRent)}</td></tr>
            <tr><td>Outstanding arrears</td><td class="amount amber">${ksh(report.arrears)}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="report-panel">
        <div class="section-header">
          <div>
            <div class="section-title">Expense Breakdown</div>
            <div class="section-sub">By category for selected month</div>
          </div>
        </div>
        ${renderCategoryRows(report.expenseCategories)}
      </section>
    </div>

    <section class="report-panel">
      <div class="section-header">
        <div>
          <div class="section-title">Building Performance</div>
          <div class="section-sub">Income, expenses, arrears, occupancy, and net result</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Building</th><th>Units</th><th>Expected</th><th>Collected</th>
              <th>Expenses</th><th>Net</th><th>Arrears</th><th>Collection</th>
            </tr>
          </thead>
          <tbody>
            ${report.buildingRows.length ? report.buildingRows.map(row => `
              <tr>
                <td><strong>${esc(row.name)}</strong></td>
                <td>${row.occupiedUnits}/${row.totalUnits}</td>
                <td>${ksh(row.expectedRent)}</td>
                <td class="amount green">${ksh(row.income)}</td>
                <td class="amount red">${ksh(row.expenses)}</td>
                <td class="amount ${row.netProfit >= 0 ? 'green' : 'red'}">${ksh(row.netProfit)}</td>
                <td class="amount amber">${ksh(row.arrears)}</td>
                <td>${row.collectionRate.toFixed(1)}%</td>
              </tr>
            `).join('') : emptyRow(8, 'No buildings found')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="report-panel">
      <div class="section-header">
        <div>
          <div class="section-title">Arrears Report</div>
          <div class="section-sub">Active tenants with outstanding balances</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Tenant</th><th>Building</th><th>Unit</th><th>Phone</th><th>Balance</th></tr>
          </thead>
          <tbody>
            ${report.arrearsRows.length ? report.arrearsRows.map(row => `
              <tr>
                <td><strong>${esc(row.tenantName)}</strong></td>
                <td>${esc(row.buildingName)}</td>
                <td>${esc(row.unitNumber)}</td>
                <td>${esc(row.phone)}</td>
                <td class="amount red">${ksh(row.balance)}</td>
              </tr>
            `).join('') : emptyRow(5, 'No arrears for this scope')}
          </tbody>
        </table>
      </div>
    </section>
  `;
};

function buildReport(month, buildingId = '') {
  const allStats = getDashboardStats(month);
  const selectedBuilding = AppState.buildings.find(b => b.id === buildingId);
  const buildings = buildingId
    ? AppState.buildings.filter(b => b.id === buildingId)
    : [...AppState.buildings];

  const buildingRows = buildings.map(b => buildBuildingReport(b, month))
    .sort((a, b) => b.collectionRate - a.collectionRate); // Rank by collection rate

  const income = buildingId
    ? sum(buildingRows.map(r => r.income))
    : allStats.collected;
  const expenses = buildingId
    ? sum(buildingRows.map(r => r.expenses))
    : allStats.expenses;
  const expectedRent = buildingId
    ? sum(buildingRows.map(r => r.expectedRent))
    : allStats.expectedRent;
  const arrears = buildingId
    ? sum(buildingRows.map(r => r.arrears))
    : allStats.arrears;
  const totalUnits = buildingId
    ? sum(buildingRows.map(r => r.totalUnits))
    : allStats.totalUnits;
  const occupiedUnits = buildingId
    ? sum(buildingRows.map(r => r.occupiedUnits))
    : allStats.occupiedUnits;

  const scopedPayments = getScopedTransactions(month, buildingId);
  const scopedExpenses = getScopedExpenses(month, buildingId);
  const expenseCategories = groupExpensesByCategory(scopedExpenses);
  const arrearsRows = getArrearsRows(buildingId);

  return {
    month,
    scopeLabel: selectedBuilding?.name || 'All Buildings',
    income,
    expenses,
    netProfit: income - expenses,
    expectedRent,
    arrears,
    totalUnits,
    occupiedUnits,
    occupancyRate: totalUnits ? occupiedUnits / totalUnits * 100 : 0,
    collectionRate: expectedRent ? Math.min(100, income / expectedRent * 100) : 0,
    paymentCount: scopedPayments.length,
    expenseCount: scopedExpenses.length,
    expenseCategories,
    buildingRows,
    arrearsRows
  };
}

function buildBuildingReport(building, month) {
  const units = AppState.units.filter(u => u.buildingId === building.id && !u.deletedAt);
  const tenants = AppState.tenants.filter(t =>
    t.buildingId === building.id && t.unitId && t.status !== 'vacated' && !t.deletedAt
  );
  const expectedRent = units
    .filter(u => u.status === 'occupied')
    .reduce((total, u) => total + (Number(u.rent) || 0), 0);
  const income = getScopedTransactions(month, building.id)
    .reduce((total, tx) => total + (Number(tx.amount) || 0), 0);
  const expenses = getScopedExpenses(month, building.id)
    .reduce((total, e) => total + (Number(e.amount) || 0), 0);
  const arrears = tenants
    .reduce((total, t) => total + Math.max(0, getTenantBalance(t.id)), 0);
  const occupiedUnits = units.filter(u => u.status === 'occupied').length;

  return {
    id: building.id,
    name: building.name || 'Unnamed Building',
    totalUnits: units.length,
    occupiedUnits,
    expectedRent,
    income,
    expenses,
    netProfit: income - expenses,
    arrears,
    collectionRate: expectedRent ? Math.min(100, income / expectedRent * 100) : 0
  };
}

function getScopedTransactions(month, buildingId = '') {
  return AppState.transactions.filter(tx =>
    tx.direction === 'credit' &&
    (tx.deletedAt === null || tx.deletedAt === undefined) &&
    tx.date?.startsWith(month) &&
    (!buildingId || tx.buildingId === buildingId)
  );
}

function getScopedExpenses(month, buildingId = '') {
  return AppState.expenses.filter(e =>
    (e.deletedAt === null || e.deletedAt === undefined) &&
    e.date?.startsWith(month) &&
    (!buildingId || e.buildingId === buildingId)
  );
}

function groupExpensesByCategory(expenses) {
  const grouped = new Map();
  expenses.forEach(e => {
    const category = e.category || 'Other';
    grouped.set(category, (grouped.get(category) || 0) + (Number(e.amount) || 0));
  });
  return [...grouped.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getArrearsRows(buildingId = '') {
  return AppState.tenants
    .filter(t =>
      t.unitId &&
      t.status !== 'vacated' &&
      !t.deletedAt &&
      (!buildingId || t.buildingId === buildingId)
    )
    .map(t => {
      const unit = AppState.units.find(u => u.id === t.unitId);
      const building = AppState.buildings.find(b => b.id === t.buildingId);
      return {
        tenantName: t.name || 'Unknown',
        buildingName: building?.name || '',
        unitNumber: unit?.number || '',
        phone: t.phone || '',
        balance: Math.max(0, getTenantBalance(t.id))
      };
    })
    .filter(row => row.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

function getReportMonths() {
  const months = new Set([getCurMonth()]);
  AppState.transactions.forEach(tx => {
    if (tx.date) months.add(tx.date.substr(0, 7));
  });
  AppState.expenses.forEach(e => {
    if (e.date) months.add(e.date.substr(0, 7));
  });
  AppState.tenants.forEach(t => {
    if (t.openBalDate) months.add(t.openBalDate);
    else if (t.moveIn) months.add(t.moveIn.substr(0, 7));
  });
  return [...months].filter(Boolean).sort().reverse();
}

function summaryCard(label, value, sub, tone) {
  return `
    <div class="kpi-card ${tone}">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${esc(value)}</div>
      <div class="kpi-sub">${esc(sub)}</div>
    </div>
  `;
}

function renderCategoryRows(rows) {
  if (!rows.length) {
    return `<div class="report-empty">No expenses recorded for this month.</div>`;
  }
  const total = sum(rows.map(r => r.amount));
  return `
    <div class="report-category-list">
      ${rows.map(row => {
        const pct = total ? row.amount / total * 100 : 0;
        return `
          <div class="report-category-row">
            <div>
              <div class="report-category-name">${esc(row.category)}</div>
              <div class="report-category-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
            </div>
            <div class="report-category-amount">${ksh(row.amount)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="table-empty">${esc(message)}</td></tr>`;
}

window.exportCSV = function() {
  const report = buildReport(ReportState.month || getCurMonth(), ReportState.buildingId || '');
  const rows = [
    ['PropOS Reports & P&L'],
    ['Scope', report.scopeLabel],
    ['Month', monthLabel(report.month)],
    [],
    ['Profit & Loss'],
    ['Metric', 'Amount'],
    ['Income Collected', report.income],
    ['Expenses', report.expenses],
    ['Net Profit', report.netProfit],
    ['Expected Rent', report.expectedRent],
    ['Arrears', report.arrears],
    ['Collection Rate', `${report.collectionRate.toFixed(1)}%`],
    ['Occupancy Rate', `${report.occupancyRate.toFixed(1)}%`],
    [],
    ['Building Performance'],
    ['Building', 'Units', 'Expected', 'Collected', 'Expenses', 'Net', 'Arrears', 'Collection Rate']
  ];

  report.buildingRows.forEach(row => {
    rows.push([
      row.name,
      `${row.occupiedUnits}/${row.totalUnits}`,
      row.expectedRent,
      row.income,
      row.expenses,
      row.netProfit,
      row.arrears,
      `${row.collectionRate.toFixed(1)}%`
    ]);
  });

  rows.push([], ['Arrears'], ['Tenant', 'Building', 'Unit', 'Phone', 'Balance']);
  report.arrearsRows.forEach(row => {
    rows.push([row.tenantName, row.buildingName, row.unitNumber, row.phone, row.balance]);
  });

  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PropOS_Report_${report.scopeLabel.replace(/[^a-z0-9]+/gi, '_')}_${report.month}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success('CSV report downloaded');
};

window.downloadPnL = function() {
  if (!window.jspdf?.jsPDF) {
    toast.error('PDF library is not loaded yet.');
    return;
  }

  const report = buildReport(ReportState.month || getCurMonth(), ReportState.buildingId || '');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const company = AppState.settings.company || 'PropOS';

  doc.setFillColor(13, 15, 22);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(company, 14, 18);
  doc.setFontSize(12);
  doc.text('Profit & Loss Report', 14, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(143, 150, 190);
  doc.text(`${report.scopeLabel} - ${monthLabel(report.month)}`, 14, 38);

  let y = 52;
  y = pdfMetric(doc, y, 'Income Collected', ksh(report.income), [16, 185, 129]);
  y = pdfMetric(doc, y, 'Operating Expenses', ksh(report.expenses), [239, 68, 68]);
  y = pdfMetric(doc, y, 'Net Profit', ksh(report.netProfit), report.netProfit >= 0 ? [16, 185, 129] : [239, 68, 68]);
  y = pdfMetric(doc, y, 'Expected Rent', ksh(report.expectedRent), [255, 255, 255]);
  y = pdfMetric(doc, y, 'Outstanding Arrears', ksh(report.arrears), [245, 158, 11]);
  y = pdfMetric(doc, y, 'Collection Rate', `${report.collectionRate.toFixed(1)}%`, [255, 255, 255]);
  y = pdfMetric(doc, y, 'Occupancy', `${report.occupancyRate.toFixed(1)}%`, [255, 255, 255]);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('Building Performance', 14, y);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(143, 150, 190);
  doc.text('Building', 14, y);
  doc.text('Collected', 78, y);
  doc.text('Expenses', 112, y);
  doc.text('Net', 146, y);
  doc.text('Arrears', 176, y);
  y += 5;

  report.buildingRows.slice(0, 18).forEach(row => {
    if (y > 275) return;
    doc.setDrawColor(39, 43, 58);
    doc.line(14, y - 3, 196, y - 3);
    doc.setTextColor(255, 255, 255);
    doc.text(String(row.name).slice(0, 28), 14, y);
    doc.text(ksh(row.income), 78, y);
    doc.text(ksh(row.expenses), 112, y);
    doc.text(ksh(row.netProfit), 146, y);
    doc.text(ksh(row.arrears), 176, y);
    y += 7;
  });

  doc.save(`PropOS_PnL_${report.scopeLabel.replace(/[^a-z0-9]+/gi, '_')}_${report.month}.pdf`);
  toast.success('P&L PDF downloaded');
};

function pdfMetric(doc, y, label, value, valueColor) {
  doc.setDrawColor(39, 43, 58);
  doc.line(14, y + 3, 196, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(143, 150, 190);
  doc.setFontSize(9);
  doc.text(label, 14, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...valueColor);
  doc.text(value, 196, y, { align: 'right' });
  return y + 10;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
