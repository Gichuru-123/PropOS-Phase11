// ============================================================
// PropOS — Router
// Manages page navigation, sidebar state, topbar content
// ============================================================

import { AppState } from './store.js';
import { can } from './auth.js';
import { getCurMonth, monthLabel } from './store.js';

// Page configuration: title, subtitle, topbar actions, required permission
const PAGE_CONFIG = {
  dashboard: {
    title: 'Dashboard',
    sub: () => monthLabel(getCurMonth()),
    actions: () => `
      <button class="btn btn-ghost btn-sm" onclick="router.nav('status')">Status Board →</button>
    `,
    permission: null  // everyone sees dashboard
  },
  status: {
    title: 'Payment Status Board',
    sub: () => `${getCurMonth()} — ${monthLabel(getCurMonth())}`,
    actions: () => can('canRecordPayments')
      ? `<button class="btn btn-primary btn-sm" onclick="openModal('m-payment')">+ Log Payment</button>`
      : '',
    permission: null
  },
  buildings: {
    title: 'Buildings',
    sub: () => `${AppState.buildings.length} buildings · ${AppState.units.length} units`,
    actions: () => can('canManageBuildings')
      ? `<button class="btn btn-primary btn-sm" onclick="openAddBuildingModal()">+ Add Building</button>`
      : '',
    permission: null
  },
  bdetail: {
    title: 'Building',
    sub: () => '',
    actions: () => can('canManageUnits')
      ? `<button class="btn btn-primary btn-sm" onclick="openModal('m-unit')">+ Add Unit</button>`
      : '',
    permission: null
  },
  tenants: {
    title: 'Tenants',
    sub: () => `${AppState.tenants.filter(t=>t.status!=='vacated').length} active tenants`,
    actions: () => can('canManageTenants')
      ? `<button class="btn btn-primary btn-sm" onclick="openAddTenantModal()">+ Add Tenant</button>`
      : '',
    permission: null
  },
  tenant_profile: {
    title: 'Tenant Profile',
    sub: () => '',
    actions: () => '',
    permission: null
  },
  payments: {
    title: 'Payments',
    sub: () => `${AppState.payments.length} total records`,
    actions: () => can('canRecordPayments')
      ? `<button class="btn btn-primary btn-sm" onclick="openModal('m-payment')">+ Log Payment</button>`
      : '',
    permission: 'canViewFinancials'
  },
  invoices: {
    title: 'Invoices',
    sub: () => 'Auto-generated monthly',
    actions: () => can('canRecordPayments')
      ? `<button class="btn btn-ghost btn-sm" onclick="generateAllInvoices()">⚡ Generate All</button>`
      : '',
    permission: 'canViewFinancials'
  },
  statements: {
    title: 'Tenant Statements',
    sub: () => 'Full ledger per tenant',
    actions: () => '',
    permission: 'canViewFinancials'
  },
  expenses: {
    title: 'Expenses',
    sub: () => 'Per building tracker',
    actions: () => can('canManageExpenses')
      ? `<button class="btn btn-primary btn-sm" onclick="openModal('m-expense')">+ Add Expense</button>`
      : '',
    permission: 'canViewFinancials'
  },
  smsparser: {
    title: 'SMS / M-PESA Import',
    sub: () => 'Parse payment confirmations automatically',
    actions: () => '',
    permission: 'canUseSMSParser'
  },
  notifications: {
    title: 'Notifications',
    sub: () => 'SMS & WhatsApp messaging',
    actions: () => '',
    permission: 'canSendNotifications'
  },
  reports: {
    title: 'Reports & P&L',
    sub: () => '',
    actions: () => can('canExportReports') ? `
      <button class="btn btn-ghost btn-sm" onclick="exportCSV()">⬇ CSV</button>
      <button class="btn btn-primary btn-sm" onclick="downloadPnL()">⬇ P&L PDF</button>
    ` : '',
    permission: 'canViewReports'
  },
  maintenance: {
    title: 'Maintenance',
    sub: () => 'Requests & repairs',
    actions: () => `<button class="btn btn-primary btn-sm" onclick="openModal('m-maintenance')">+ New Request</button>`,
    permission: null
  },
  documents: {
    title: 'Documents',
    sub: () => 'Files & uploads',
    actions: () => `<button class="btn btn-primary btn-sm" onclick="openModal('m-document')">⬆ Upload</button>`,
    permission: null
  },
  activity: {
    title: 'Activity Log',
    sub: () => 'Full audit trail',
    actions: () => '',
    permission: 'canViewAuditLog'
  },
  settings: {
    title: 'Settings',
    sub: () => '',
    actions: () => '',
    permission: 'canChangeSettings'
  }
};

// ── Router object ──────────────────────────────────────────
export const router = {

  // Navigate to a page
  nav(page, opts = {}) {
    const cfg = PAGE_CONFIG[page];
    if (!cfg) { console.warn('Unknown page:', page); return; }

    // Permission check
    if (cfg.permission && !can(cfg.permission)) {
      import('./components/toast.js').then(({ toast }) => {
        toast.error("You don't have permission to view this page.");
      });
      return;
    }

    // Store supplementary context
    if (opts.buildingId) AppState.selectedBuildingId = opts.buildingId;
    if (opts.tenantId)   AppState.selectedTenantId   = opts.tenantId;
    if (opts.unitId)     AppState.selectedUnitId      = opts.unitId;

    // Deactivate all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Activate target page
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');

    // Highlight nav item
    const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');

    // Update topbar
    document.getElementById('topbar-title').textContent = cfg.title;
    document.getElementById('topbar-sub').textContent   = cfg.sub();
    document.getElementById('topbar-actions').innerHTML = cfg.actions();

    // Close sidebar on mobile
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
    document.body.style.overflow = '';

    // Store current page
    AppState.currentPage = page;

    // Render the page
    this.renderPage(page);
    this.updateBadges();
  },

  // Dispatch page render to the right module
  async renderPage(page) {
    // Each page module exports a render() function
    // They are loaded lazily here
    try {
      switch (page) {
        case 'dashboard':
          (await import('./pages/dashboard.js')).render(); break;
        case 'status':
          (await import('./pages/status.js')).render(); break;
        case 'buildings':
          (await import('./pages/buildings.js')).render(); break;
        case 'bdetail':
          (await import('./pages/buildings.js')).renderDetail(); break;
        case 'tenants':
          (await import('./pages/tenants.js')).render(); break;
        case 'tenant_profile':
          (await import('./pages/tenants.js')).renderProfile(); break;
        case 'payments':
          (await import('./pages/payments.js')).render(); break;
        case 'invoices':
          (await import('./pages/invoices.js')).render(); break;
        case 'statements':
          (await import('./pages/statements.js')).render(); break;
        case 'expenses':
          (await import('./pages/expenses.js')).render(); break;
        case 'smsparser':
          (await import('./pages/smsparser.js')).render(); break;
        case 'notifications':
          (await import('./pages/notifications.js')).render(); break;
        case 'reports':
          (await import('./pages/reports.js')).render(); break;
        case 'maintenance':
          (await import('./pages/maintenance.js')).render(); break;
        case 'documents':
          (await import('./pages/documents.js')).render(); break;
        case 'activity':
          (await import('./pages/activity.js')).render(); break;
        case 'settings':
          (await import('./pages/settings.js')).render(); break;
      }
    } catch (err) {
      console.error(`Error rendering page "${page}":`, err);
    }
  },

  // Update nav badges (unpaid count etc.)
  updateBadges() {
    try {
      const unpaid = AppState.tenants.filter(t => {
        if (!t.unitId) return false;
        // Basic check — will be replaced by full engine in Phase 5
        return true;
      }).length;
      // Will be filled in properly in Phase 5
    } catch (_) {}
  },

  // Update topbar subtitle (e.g. when billing month changes)
  refreshTopbar() {
    const cfg = PAGE_CONFIG[AppState.currentPage];
    if (!cfg) return;
    const subEl = document.getElementById('topbar-sub');
    if (subEl) subEl.textContent = cfg.sub();
  }
};

// Make router globally available for onclick handlers
window.router = router;
