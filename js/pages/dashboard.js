// ============================================================
// PropOS — Dashboard Page
// Live KPIs, charts, and financial overview
// ============================================================

import { AppState, ksh, getCurMonth, monthLabel } from '../store.js';
import { can } from '../auth.js';
import {
  getDashboardStats, getSixMonthTrend, getTenantBalance,
  getDaysOverdue, initBillingMonth, calculateHealthScore
} from '../engine/ledger.js';

let revenueChart = null;
let collectionChart = null;
let occupancyChart = null;
let incomeExpenseChart = null;

export function render() {
  const el = document.getElementById('page-dashboard');
  if (!el) return;

  initBillingMonth();
  const month = getCurMonth();
  const stats = getDashboardStats(month);
  const collectionRate = Number(stats.collectionRate) || 0;
  const occupancyRate = Number(stats.occupancyRate) || 0;
  const hasPortfolioData = AppState.buildings.length || AppState.units.length || AppState.tenants.length;

  el.innerHTML = `
    ${!hasPortfolioData ? `
      <div class="dashboard-empty-state">
        <div>
          <div class="dashboard-empty-title">No portfolio data yet</div>
          <div class="dashboard-empty-copy">Add buildings, units, and tenants to activate live dashboard metrics.</div>
        </div>
        ${can('canManageBuildings') ? `<button class="btn btn-primary btn-sm" onclick="router.nav('buildings')">Add Building</button>` : ''}
      </div>
    ` : ''}

    <div class="dashboard-grid">
      <div class="kpi-card highlight">
        <div class="kpi-label">Expected Rent</div>
        <div class="kpi-value">${ksh(stats.expectedRent)}</div>
        <div class="kpi-trend neutral">${monthLabel(month)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Collected</div>
        <div class="kpi-value">${ksh(stats.collected)}</div>
        <div class="kpi-trend ${collectionRate >= 80 ? 'positive' : collectionRate >= 50 ? 'neutral' : 'negative'}">
          ${collectionRate.toFixed(1)}% collection rate
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Arrears</div>
        <div class="kpi-value" style="color:var(--red)">${ksh(stats.arrears)}</div>
        <div class="kpi-trend negative">${stats.arrearsCount} tenants overdue</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Occupancy</div>
        <div class="kpi-value">${occupancyRate.toFixed(1)}%</div>
        <div class="kpi-trend neutral">${stats.occupiedUnits}/${stats.totalUnits} units</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Profit</div>
        <div class="kpi-value" style="color:${stats.netProfit >= 0 ? 'var(--green)' : 'var(--red)'}">${ksh(stats.netProfit)}</div>
        <div class="kpi-trend ${stats.netProfit >= 0 ? 'positive' : 'negative'}">
          ${stats.netProfit >= 0 ? 'Profitable' : 'Loss'}
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Revenue Trend (6 Months)</div>
        </div>
        <div class="chart-container">
          <canvas id="revenue-chart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Collection Rate</div>
        </div>
        <div class="chart-container">
          <canvas id="collection-chart"></canvas>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Occupancy by Building</div>
        </div>
        <div class="chart-container">
          <canvas id="occupancy-chart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Income vs Expenses</div>
        </div>
        <div class="chart-container">
          <canvas id="income-expense-chart"></canvas>
        </div>
      </div>
    </div>

    <div class="lists-row">
      <div class="list-card">
        <div class="list-header">
          <div class="list-title">Top Arrears</div>
          <div class="list-link" onclick="router.nav('status')">View All →</div>
        </div>
        <div id="arrears-list"></div>
      </div>
      <div class="list-card">
        <div class="list-header">
          <div class="list-title">Recent Payments</div>
          <div class="list-link" onclick="router.nav('payments')">View All →</div>
        </div>
        <div id="payments-list"></div>
      </div>
    </div>

    <!-- Insights Panel -->
    <div class="card" style="margin-top:16px;">
      <div class="section-header">
        <div class="section-title">💡 Owner Intelligence</div>
        <div class="section-sub">Key insights for portfolio management</div>
      </div>
      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-title">🔴 Top Defaulters</div>
          <div id="insights-defaulters"></div>
        </div>
        <div class="insight-card">
          <div class="insight-title">⭐ Best Tenants</div>
          <div id="insights-best"></div>
        </div>
        <div class="insight-card">
          <div class="insight-title">🏠 Vacancy Status</div>
          <div id="insights-vacancy"></div>
        </div>
        <div class="insight-card">
          <div class="insight-title">📈 Revenue Forecast</div>
          <div id="insights-forecast"></div>
        </div>
      </div>
    </div>
  `;

  renderCharts();
  renderArrearsList();
  renderPaymentsList();
  renderInsights();
}

function renderCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js is not loaded; dashboard charts skipped.');
    return;
  }

  const trend = getSixMonthTrend();

  // Revenue Trend Chart
  const revenueCtx = document.getElementById('revenue-chart');
  if (revenueCtx) {
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(revenueCtx, {
      type: 'line',
      data: {
        labels: trend.map(t => monthLabel(t.month)),
        datasets: [{
          label: 'Expected',
          data: trend.map(t => t.expected),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4
        }, {
          label: 'Collected',
          data: trend.map(t => t.collected || t.income || 0),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => 'KSh ' + v.toLocaleString() } }
        }
      }
    });
  }

  // Collection Rate Donut Chart
  const stats = getDashboardStats(getCurMonth());
  const collectionCtx = document.getElementById('collection-chart');
  if (collectionCtx) {
    if (collectionChart) collectionChart.destroy();
    collectionChart = new Chart(collectionCtx, {
      type: 'doughnut',
      data: {
        labels: ['Collected', 'Arrears'],
        datasets: [{
          data: [stats.collected, stats.arrears],
          backgroundColor: ['#10b981', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: ctx => ctx.label + ': ' + ksh(ctx.raw)
            }
          }
        }
      }
    });
  }

  // Occupancy by Building Chart
  const occupancyCtx = document.getElementById('occupancy-chart');
  if (occupancyCtx) {
    if (occupancyChart) occupancyChart.destroy();
    const buildingData = AppState.buildings.filter(b => !b.deletedAt).map(b => {
      const units    = AppState.units.filter(u => u.buildingId === b.id && !u.deletedAt);
      const occupied = units.filter(u => u.status === 'occupied').length;
      return {
        name: b.name,
        occupied: occupied,
        total: units.length,
        rate: units.length > 0 ? (occupied / units.length * 100).toFixed(1) : 0
      };
    });

    occupancyChart = new Chart(occupancyCtx, {
      type: 'bar',
      data: {
        labels: buildingData.map(b => b.name),
        datasets: [{
          label: 'Occupancy Rate %',
          data: buildingData.map(b => b.rate),
          backgroundColor: '#6366f1',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
        }
      }
    });
  }

  // Income vs Expenses Chart
  const incomeExpenseCtx = document.getElementById('income-expense-chart');
  if (incomeExpenseCtx) {
    if (incomeExpenseChart) incomeExpenseChart.destroy();
    const expenseData = trend.map(t => {
      const monthExpenses = AppState.expenses.filter(e => e.date?.startsWith(t.month));
      return monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    });

    incomeExpenseChart = new Chart(incomeExpenseCtx, {
      type: 'bar',
      data: {
        labels: trend.map(t => monthLabel(t.month)),
        datasets: [{
          label: 'Income',
          data: trend.map(t => t.collected || t.income || 0),
          backgroundColor: '#10b981',
          borderRadius: 4
        }, {
          label: 'Expenses',
          data: expenseData,
          backgroundColor: '#ef4444',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => 'KSh ' + v.toLocaleString() } }
        }
      }
    });
  }
}

function renderArrearsList() {
  const container = document.getElementById('arrears-list');
  if (!container) return;

  const month = getCurMonth();
  const arrears = AppState.tenants
    .filter(t => t.unitId && t.status !== 'vacated' && !t.deletedAt)
    .map(t => ({
      ...t,
      balance: getTenantBalance(t.id),
      daysOverdue: getDaysOverdue(t.id, month)
    }))
    .filter(t => t.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  if (!arrears.length) {
    container.innerHTML = '<div class="empty-list">No arrears this month 🎉</div>';
    return;
  }

  container.innerHTML = arrears.map(t => {
    const u = AppState.units.find(u => u.id === t.unitId);
    const b = AppState.buildings.find(b => b.id === t.buildingId);
    return `<div class="arrears-item">
      <div class="arrears-info">
        <div class="arrears-name">${esc(t.name)}</div>
        <div class="arrears-details">${b ? esc(b.name) : ''} ${u ? esc(u.number) : ''} · ${t.daysOverdue} days overdue</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="arrears-amount">${ksh(t.balance)}</div>
        ${can('canRecordPayments') ? `
          <button class="btn btn-primary btn-xs" onclick="quickPayDashboard('${t.id}')">Pay</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderPaymentsList() {
  const container = document.getElementById('payments-list');
  if (!container) return;

  const recentPayments = [...AppState.transactions]
    .filter(t => t.type === 'PAYMENT' && t.direction === 'credit')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (!recentPayments.length) {
    container.innerHTML = '<div class="empty-list">No recent payments</div>';
    return;
  }

  container.innerHTML = recentPayments.map(p => {
    const t = AppState.tenants.find(t => t.id === p.tenantId);
    return `<div class="payment-item">
      <div class="payment-info">
        <div class="payment-tenant">${t ? esc(t.name) : 'Unknown'}</div>
        <div class="payment-details">${p.date} · ${p.method || 'Unknown'}</div>
      </div>
      <div class="payment-amount">${ksh(p.amount)}</div>
    </div>`;
  }).join('');
}

window.quickPayDashboard = function(tenantId) {
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

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderInsights() {
  // Top 3 defaulters (highest balance owed)
  const defaulters = AppState.tenants
    .filter(t => t.unitId && t.status !== 'vacated' && !t.deletedAt)
    .map(t => ({
      ...t,
      balance: getTenantBalance(t.id),
      healthScore: calculateHealthScore(t.id)
    }))
    .filter(t => t.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 3);

  const defaultersEl = document.getElementById('insights-defaulters');
  if (defaultersEl) {
    if (!defaulters.length) {
      defaultersEl.innerHTML = '<div class="insight-empty">No defaulters 🎉</div>';
    } else {
      defaultersEl.innerHTML = defaulters.map(t => {
        const u = AppState.units.find(u => u.id === t.unitId);
        const b = AppState.buildings.find(b => b.id === t.buildingId);
        return `<div class="insight-item">
          <div class="insight-name">${esc(t.name)}</div>
          <div class="insight-detail">${b ? esc(b.name) : ''} ${u ? esc(u.number) : ''}</div>
          <div class="insight-value red">${ksh(t.balance)}</div>
        </div>`;
      }).join('');
    }
  }

  // Top 3 best tenants (lowest or negative balance, high health score)
  const bestTenants = AppState.tenants
    .filter(t => t.unitId && t.status !== 'vacated' && !t.deletedAt)
    .map(t => ({
      ...t,
      balance: getTenantBalance(t.id),
      healthScore: calculateHealthScore(t.id)
    }))
    .sort((a, b) => {
      // Sort by balance (negative/low first), then by health score
      if (a.balance !== b.balance) return a.balance - b.balance;
      return b.healthScore - a.healthScore;
    })
    .slice(0, 3);

  const bestEl = document.getElementById('insights-best');
  if (bestEl) {
    if (!bestTenants.length) {
      bestEl.innerHTML = '<div class="insight-empty">No tenants yet</div>';
    } else {
      bestEl.innerHTML = bestTenants.map(t => {
        const u = AppState.units.find(u => u.id === t.unitId);
        const b = AppState.buildings.find(b => b.id === t.buildingId);
        return `<div class="insight-item">
          <div class="insight-name">${esc(t.name)}</div>
          <div class="insight-detail">${b ? esc(b.name) : ''} ${u ? esc(u.number) : ''}</div>
          <div class="insight-value ${t.balance < 0 ? 'blue' : 'green'}">${t.balance < 0 ? 'Credit ' + ksh(Math.abs(t.balance)) : ksh(t.balance)}</div>
        </div>`;
      }).join('');
    }
  }

  // Vacancy status
  const totalUnits = AppState.units.filter(u => !u.deletedAt && (u.status === 'vacant' || u.status === 'occupied')).length;
  const occupiedUnits = AppState.units.filter(u => u.status === 'occupied' && !u.deletedAt).length;
  const vacantUnits = AppState.units.filter(u => u.status === 'vacant' && !u.deletedAt).length;
  
  const vacancyEl = document.getElementById('insights-vacancy');
  if (vacancyEl) {
    vacancyEl.innerHTML = `<div class="insight-item">
      <div class="insight-name">${vacantUnits.length} of ${totalUnits} units vacant</div>
      <div class="insight-detail">${occupiedUnits.length} occupied across ${AppState.buildings.filter(b => !b.deletedAt).length} buildings</div>
      <div class="insight-value ${vacantUnits.length > 0 ? 'amber' : 'green'}">${vacantUnits.length > 0 ? Math.round((vacantUnits.length / totalUnits) * 100) + '%' : '0%'}</div>
    </div>`;
  }

  // Revenue forecast next month
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().substr(0, 7);
  const forecastRent = AppState.units
    .filter(u => u.status === 'occupied' && !u.deletedAt)
    .reduce((sum, u) => sum + (Number(u.rent) || 0), 0);
  const forecastEl = document.getElementById('insights-forecast');
  if (forecastEl) {
    forecastEl.innerHTML = `<div class="insight-item">
      <div class="insight-name">${monthLabel(nextMonthStr)}</div>
      <div class="insight-detail">Based on ${occupiedUnits.length} occupied units @ ${occupiedUnits.length ? ksh(forecastRent / occupiedUnits.length) : ksh(0)}/unit avg</div>
      <div class="insight-value green">${ksh(forecastRent)}</div>
    </div>`;
  }
}
