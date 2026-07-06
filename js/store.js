// ============================================================
// PropOS — App State Store
// ============================================================

export const AppState = {
  currentPage:        'dashboard',
  selectedBuildingId: null,
  selectedTenantId:   null,
  selectedUnitId:     null,
  billingMonth:       null,   // null = current real month

  // Cached Firestore data
  buildings:     [],
  units:         [],
  tenants:       [],
  payments:      [],
  expenses:      [],
  transactions:  [],
  notifications: [],
  activityLog:      [],
  maintenanceJobs:  [],
  documents:        [],

  // App settings (from Firestore settings/main)
  settings: {
    ownerName:   '',
    ownerPhone:  '',
    ownerEmail:  '',
    company:     'PropOS',
    dueDay:      1,
    graceDays:   5,
    currency:    'KSh',
    atApiKey:    '',
    atUsername:  'sandbox',
    atSenderId:  ''
  },

  // UI state
  sidebarOpen:    false,
  lastPayment:    null,
  lastInvoice:    null,
  bulkSMSResults: null,
  pendingReminders: [],

  // Firestore listener unsubscribe functions
  _listeners: [],
  addListener(fn) { if (fn) this._listeners.push(fn); },
  clearListeners() { this._listeners.forEach(fn => fn()); this._listeners = []; },
  reset() {
    this.buildings = []; this.units = []; this.tenants = [];
    this.payments  = []; this.expenses = []; this.transactions = [];
    this.clearListeners();
  }
};

// ── Billing month helpers ──────────────────────────────────
export function getCurMonth() {
  if (AppState.billingMonth) return AppState.billingMonth;
  return new Date().toISOString().substr(0, 7);
}

export function getRealToday() {
  return new Date().toISOString().split('T')[0];
}

export function getToday() { return getRealToday(); }

export function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1).toLocaleString('default', {
    month: 'short', year: 'numeric'
  });
}

export function ksh(n) {
  return 'KSh ' + (+n || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
