// ============================================================
// PropOS — Financial Engine (Ledger)
// The single source of truth for all financial calculations
//
// CORE PRINCIPLE: Balances are NEVER stored.
// They are ALWAYS calculated from transactions.
// ============================================================

import { AppState, getCurMonth } from '../store.js';

// ── MONTH HELPERS ──────────────────────────────────────────

// Returns array of "YYYY-MM" strings between two dates (inclusive)
export function getMonthsBetween(startDate, endDate) {
  const months = [];
  const start  = new Date(startDate.substr(0, 7) + '-01');
  const end    = new Date(endDate.substr(0, 7)   + '-01');
  let cur = new Date(start);
  while (cur <= end) {
    months.push(cur.toISOString().substr(0, 7));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months;
}

// Format "YYYY-MM" → "Jun 2026"
export function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1).toLocaleString('default', {
    month: 'short', year: 'numeric'
  });
}

// ── RENT SCHEDULE ──────────────────────────────────────────
// Generates the list of monthly charges for a tenant
// from their move-in month to the current billing period

export function getRentSchedule(tenantId) {
  const tenant = AppState.tenants.find(t => t.id === tenantId);
  if (!tenant || !tenant.unitId) return [];

  const unit = AppState.units.find(u => u.id === tenant.unitId);
  if (!unit) return [];

  // openBalDate = the month FROM WHICH we start charging rent
  // Opening balance captures everything BEFORE this month
  //
  // Example:
  // Tenant onboarded July 2026, openingBalance=5500 (June arrears)
  // openBalDate = 2026-07
  // Engine charges: July, August, September... onwards
  // The 5500 opening balance represents June — no separate June charge
  //
  // If openBalDate is missing, default to current month (safe fallback)
  const startMonth = tenant.openBalDate || getCurMonth();
  const endMonth   = getCurMonth();

  // Never charge for future months
  if (startMonth > endMonth) return [];

  return getMonthsBetween(startMonth + '-01', endMonth + '-01').map(month => ({
    month,
    type:        'CHARGE',
    direction:   'debit',
    amount:      unit.rent || 0,
    description: `Rent — ${monthLabel(month)}`,
    date:        month + '-01',
    tenantId,
    unitId:      unit.id
  }));
}

// ── FULL TENANT LEDGER ─────────────────────────────────────
// Builds a complete chronological list of all financial events
// for a tenant, with running balance after each entry

export function getTenantLedger(tenantId) {
  const tenant = AppState.tenants.find(t => t.id === tenantId);
  if (!tenant) return [];

  const entries = [];

  // 1. Opening balance (if any)
  if (tenant.openingBalance && tenant.openingBalance !== 0) {
    const obDate  = (tenant.openBalDate || tenant.moveIn?.substr(0,7) || getCurMonth()) + '-01';
    const isDebit = tenant.openingBalance > 0;
    entries.push({
      date:        obDate,
      month:       obDate.substr(0, 7),
      type:        isDebit ? 'openbal-debit' : 'openbal-credit',
      direction:   isDebit ? 'debit' : 'credit',
      description: isDebit
        ? 'Opening Balance (arrears brought forward)'
        : 'Opening Balance (credit brought forward)',
      debit:       isDebit ? Math.abs(tenant.openingBalance) : 0,
      credit:      isDebit ? 0 : Math.abs(tenant.openingBalance),
      transactionId: null
    });
  }

  // 2. Monthly rent charges (generated from schedule)
  const schedule = getRentSchedule(tenantId);
  schedule.forEach(s => {
    entries.push({
      date:        s.date,
      month:       s.month,
      type:        'CHARGE',
      direction:   'debit',
      description: s.description,
      debit:       s.amount,
      credit:      0,
      transactionId: null
    });
  });

  // 3. Payments and other transactions from Firestore
  // Only include transactions up to and including the billing period end
  const billingEnd = getCurMonth() + '-31';

  AppState.transactions
    .filter(tx =>
      tx.tenantId === tenantId &&
      tx.deletedAt === null &&
      tx.date <= billingEnd
    )
    .forEach(tx => {
      entries.push({
        date:          tx.date,
        month:         tx.month || tx.date?.substr(0, 7),
        type:          tx.type,
        direction:     tx.direction,
        description:   tx.description,
        debit:         tx.direction === 'debit'  ? tx.amount : 0,
        credit:        tx.direction === 'credit' ? tx.amount : 0,
        reference:     tx.reference || '',
        method:        tx.method    || '',
        transactionId: tx.id
      });
    });

  // 4. Sort all entries by date, then by type (charges before payments on same day)
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    // On same date: opening balance first, then charges, then payments
    const order = { 'openbal-debit': 0, 'openbal-credit': 0, 'CHARGE': 1, 'PAYMENT': 2 };
    return (order[a.type] || 1) - (order[b.type] || 1);
  });

  // 5. Calculate running balance after each entry
  let runningBalance = 0;
  entries.forEach(e => {
    runningBalance += (e.debit || 0) - (e.credit || 0);
    e.balance = runningBalance;
  });

  return entries;
}

// ── CURRENT BALANCE ────────────────────────────────────────
// The final balance of a tenant's ledger
// Positive = tenant owes money (arrears)
// Zero     = tenant is clear
// Negative = tenant has paid ahead (credit)

export function getTenantBalance(tenantId) {
  const tenant = AppState.tenants.find(t => t.id === tenantId);
  if (!tenant || !tenant.unitId) return 0;

  const unit = AppState.units.find(u => u.id === tenant.unitId);
  if (!unit) return 0;

  // Step 1: Start with opening balance
  // Positive = tenant owes from before system, Negative = credit
  let balance = Number(tenant.openingBalance) || 0;

  // Step 2: Add rent charges from billing start month to current month
  const startMonth = tenant.openBalDate || getCurMonth();
  const endMonth   = getCurMonth();

  if (startMonth <= endMonth) {
    const months = getMonthsBetween(startMonth + '-01', endMonth + '-01');
    balance += months.length * (unit.rent || 0);
  }

  // Step 3: Subtract all payments ever made by this tenant
  const totalPaid = AppState.transactions
    .filter(tx =>
      tx.tenantId  === tenantId &&
      tx.direction === 'credit' &&
      (tx.deletedAt === null || tx.deletedAt === undefined)
    )
    .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

  balance -= totalPaid;

  return balance;
}

// ── MONTHLY INVOICE ────────────────────────────────────────
// Calculates the invoice for a specific tenant in a specific month

export function getMonthlyInvoice(tenantId, month) {
  const tenant = AppState.tenants.find(t => t.id === tenantId);
  if (!tenant || !tenant.unitId) return null;

  const unit     = AppState.units.find(u => u.id === tenant.unitId);
  const building = AppState.buildings.find(b => b.id === tenant.buildingId);
  if (!unit) return null;

  // Get the full ledger up to end of the PREVIOUS month
  // This gives us the correct balance before this month started
  const fullLedger = getTenantLedger(tenantId);

  // Find the last entry BEFORE this month started
  const monthStart   = month + '-01';
  const prevEntries  = fullLedger.filter(e => e.date < monthStart);
  const bfBalance    = prevEntries.length
    ? prevEntries[prevEntries.length - 1].balance
    : 0;

  // This month's rent charge
  const rentDue = unit.rent || 0;

  // Arrears brought forward = only POSITIVE balance from before
  // (negative = credit, which reduces what they owe)
  const arrearsBF = bfBalance > 0 ? bfBalance : 0;
  const creditBF  = bfBalance < 0 ? Math.abs(bfBalance) : 0;

  // Total due this month
  const totalDue = arrearsBF + rentDue - creditBF;

  // Total paid IN this specific month only
  const paid = AppState.transactions
    .filter(tx =>
      tx.tenantId  === tenantId &&
      tx.direction === 'credit' &&
      tx.deletedAt === null &&
      tx.date?.startsWith(month)
    )
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  // Outstanding after this month's payments
  const outstanding = Math.max(0, totalDue - paid);

  // Status
  let status = 'unpaid';
  if (paid >= totalDue && totalDue > 0) status = 'paid';
  else if (paid > 0)                    status = 'partial';

  // Overall balance (from full ledger)
  const currentBalance = fullLedger.length
    ? fullLedger[fullLedger.length - 1].balance
    : 0;

  return {
    tenantId,
    month,
    tenant,
    unit,
    building,
    rentDue,
    arrearsBroughtForward: arrearsBF,
    creditBroughtForward:  creditBF,
    totalDue:   Math.max(0, totalDue),
    paid,
    outstanding,
    status,
    currentBalance,
    isCredit: currentBalance < 0
  };
}

// ── PAYMENT STATUS THIS MONTH ──────────────────────────────
// Quick status check for the current billing period

export function getStatusThisMonth(tenantId) {
  const bal = getTenantBalance(tenantId);

  // Get payments made this month
  const paidThisMonth = AppState.transactions
    .filter(tx =>
      tx.tenantId  === tenantId &&
      tx.direction === 'credit' &&
      tx.deletedAt === null &&
      tx.date?.startsWith(getCurMonth())
    )
    .reduce((s, tx) => s + (tx.amount || 0), 0);

  // Simple logic — same as tenants page
  // Negative balance = credit (overpaid)
  if (bal < 0) return { status: 'credit',  balance: bal, paid: paidThisMonth };
  // Zero balance = paid
  if (bal === 0) return { status: 'paid',   balance: bal, paid: paidThisMonth };
  // Has paid something this month but still owes = partial
  if (paidThisMonth > 0) return { status: 'partial', balance: bal, paid: paidThisMonth };
  // Owes and no payment this month = unpaid
  return { status: 'unpaid', balance: bal, paid: 0 };
}

// ── BALANCE BEFORE A MONTH ─────────────────────────────────
// What did this tenant owe at the start of a given month?

export function getBalanceBefore(tenantId, month) {
  const prevEnd  = getPrevMonthEnd(month);
  const ledger   = getTenantLedger(tenantId);
  const prev     = ledger.filter(e => e.date <= prevEnd);
  return prev.length ? prev[prev.length - 1].balance : 0;
}

// ── TENANT HEALTH SCORE ────────────────────────────────────
// Calculates a 0-100 score based on payment behaviour
// Higher = more reliable tenant

export function calculateHealthScore(tenantId) {
  const tenant = AppState.tenants.find(t => t.id === tenantId);
  if (!tenant || !tenant.unitId) return 100;

  const unit = AppState.units.find(u => u.id === tenant.unitId);
  if (!unit) return 100;

  const schedule = getRentSchedule(tenantId);
  if (!schedule.length) return 100;

  let score = 100;
  const gracePeriodDays = 5; // Grace period before late penalties apply

  // Analyse each month in the schedule
  schedule.forEach(s => {
    const inv = getMonthlyInvoice(tenantId, s.month);
    if (!inv) return;

    if (inv.status === 'unpaid')   score -= 15; // missed month: -15 points
    if (inv.status === 'partial')  score -= 5;  // partial payment: -5 points

    // Check how late they paid (beyond grace period)
    const monthPayments = AppState.transactions.filter(tx =>
      tx.tenantId === tenantId &&
      tx.direction === 'credit' &&
      tx.deletedAt === null &&
      tx.date?.startsWith(s.month)
    );
    if (monthPayments.length > 0) {
      const dueDay   = AppState.settings?.dueDay || 1;
      const dueDate  = new Date(s.month + '-' + String(dueDay).padStart(2, '0'));
      const payDate  = new Date(monthPayments[0].date);
      const daysLate = Math.max(0, Math.round((payDate - dueDate) / 86400000));
      // Only penalize if beyond grace period: -2 points per day (max -20)
      if (daysLate > gracePeriodDays) {
        const penaltyDays = daysLate - gracePeriodDays;
        score -= Math.min(20, penaltyDays * 2);
      }
    }
  });

  // Bonuses
  const currentBal = getTenantBalance(tenantId);
  if (currentBal < 0) score += 5; // paid in advance bonus: +5 points

  // Count consecutive on-time months (3 consecutive = +5 points)
  let streak = 0;
  for (let i = schedule.length - 1; i >= 0; i--) {
    const inv = getMonthlyInvoice(tenantId, schedule[i].month);
    if (inv?.status === 'paid') streak++;
    else break;
  }
  if (streak >= 3) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── BILLING PERIOD CONTROL ─────────────────────────────────

export function setBillingMonth(month) {
  AppState.billingMonth = month || null;
  if (month) localStorage.setItem('propos_billing_month', month);
  else       localStorage.removeItem('propos_billing_month');
}

export function initBillingMonth() {
  const saved = localStorage.getItem('propos_billing_month');
  AppState.billingMonth = saved || null;
}

export function isCustomBillingMonth() {
  const real = new Date().toISOString().substr(0, 7);
  return AppState.billingMonth && AppState.billingMonth !== real;
}

// ── DASHBOARD AGGREGATES ───────────────────────────────────
// Pre-computed summaries used by the dashboard and status board

export function getDashboardStats(month) {
  const m = month || getCurMonth();
  const activeTenants = AppState.tenants.filter(t =>
    t.unitId && t.status !== 'vacated' && !t.deletedAt
  );

  // Expected rent = sum of all occupied unit rents
  const expectedRent = AppState.units
    .filter(u => u.status === 'occupied' && !u.deletedAt)
    .reduce((s, u) => s + (Number(u.rent) || 0), 0);

  // Collected this month
  const collected = AppState.transactions
    .filter(tx =>
      tx.direction === 'credit' &&
      tx.deletedAt === null &&
      tx.date?.startsWith(m)
    )
    .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

  // Expenses this month
  const expenses = AppState.expenses
    .filter(e => e.deletedAt === null && e.date?.startsWith(m))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Total arrears (all tenants, all time)
  const totalArrears = activeTenants.reduce((s, t) => {
    return s + Math.max(0, getTenantBalance(t.id));
  }, 0);

  // Payment statuses — use simple balance logic same as tenants page
  let paidCount = 0, unpaidCount = 0, partialCount = 0, creditCount = 0;
  activeTenants.forEach(t => {
    const bal = getTenantBalance(t.id);
    const paidThisMonth = AppState.transactions
      .filter(tx =>
        tx.tenantId === t.id && tx.direction === 'credit' &&
        tx.deletedAt === null && tx.date?.startsWith(m)
      ).reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

    if (bal < 0)           creditCount++;
    else if (bal === 0)    paidCount++;
    else if (paidThisMonth > 0) partialCount++;
    else                   unpaidCount++;
  });

  const arrearsCount = activeTenants.reduce((count, t) => {
    return getTenantBalance(t.id) > 0 ? count + 1 : count;
  }, 0);

  const collectionRate = expectedRent > 0
    ? Math.min(100, collected / expectedRent * 100)
    : 0;

  // Only count units that belong to active (non-deleted) buildings
  const activeBldgIds = new Set(AppState.buildings.filter(b => !b.deletedAt).map(b => b.id));
  const totalUnits    = AppState.units.filter(u => !u.deletedAt && activeBldgIds.has(u.buildingId)).length;
  const occupiedUnits = AppState.units.filter(u => u.status === 'occupied' && !u.deletedAt && activeBldgIds.has(u.buildingId)).length;
  const vacantUnits   = AppState.units.filter(u => u.status === 'vacant'   && !u.deletedAt && activeBldgIds.has(u.buildingId)).length;
  const occupancyRate = totalUnits > 0 ? occupiedUnits / totalUnits * 100 : 0;

  return {
    month: m,
    activeTenants: activeTenants.length,
    totalUnits,
    occupiedUnits,
    vacantUnits,
    occupancyRate,
    expectedRent,
    collected,
    expenses,
    netProfit:     collected - expenses,
    arrears:       totalArrears,
    arrearsCount,
    totalArrears,
    collectionRate,
    paidCount,
    unpaidCount,
    partialCount,
    creditCount
  };
}

// ── UTILITY ────────────────────────────────────────────────

// Returns "YYYY-MM-31" (or last day) for the month BEFORE a given month
function getPrevMonthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  const prev   = new Date(y, m - 1, 0); // last day of previous month
  return prev.toISOString().split('T')[0];
}

// Returns days overdue for unpaid tenants
export function getDaysOverdue(tenantId, month) {
  const m       = month || getCurMonth();
  const dueDay  = AppState.settings?.dueDay || 1;
  const dueDate = new Date(m + '-' + String(dueDay).padStart(2, '0'));
  const today   = new Date();
  return Math.max(0, Math.round((today - dueDate) / 86400000));
}

// Trend data: 6 months of income/expense for charts
export function getSixMonthTrend() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().substr(0, 7));
  }
  return months.map(m => ({
    month:    m,
    label:    monthLabel(m),
    expected: AppState.units
      .filter(u => u.status === 'occupied' && !u.deletedAt)
      .reduce((s, u) => s + (Number(u.rent) || 0), 0),
    income:   AppState.transactions
      .filter(tx => tx.direction === 'credit' && tx.deletedAt === null && tx.date?.startsWith(m))
      .reduce((s, tx) => s + (Number(tx.amount) || 0), 0),
    collected: AppState.transactions
      .filter(tx => tx.direction === 'credit' && tx.deletedAt === null && tx.date?.startsWith(m))
      .reduce((s, tx) => s + (Number(tx.amount) || 0), 0),
    expenses: AppState.expenses
      .filter(e => e.deletedAt === null && e.date?.startsWith(m))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
  }));
}
