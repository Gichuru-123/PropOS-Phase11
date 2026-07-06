// ============================================================
// PropOS — Notifications Page (Phase 9)
// SMS & WhatsApp messaging to tenants
// ============================================================

import { AppState, ksh, getCurMonth, monthLabel, getToday } from '../store.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import {
  sendBulkSMS, sendBulkWhatsApp, openWhatsAppLink,
  applyMergeTags, normalizePhone,
  getNotificationTemplates, saveNotificationTemplates, getDefaultTemplates,
  logNotification
} from '../services/notificationService.js';
import { getTenantBalance } from '../engine/ledger.js';

// ── Module state ───────────────────────────────────────────
let _templates    = null; // Loaded once, cached
let _activeTab    = 'compose';
let _activeChip   = 'rentReminder';
let _recipientType = 'all';
let _selectedBldg = '';
let _selectedTenant = '';

// ── Render entry point ─────────────────────────────────────
export async function render() {
  const el = document.getElementById('page-notifications');
  if (!el) return;

  // Load templates if not cached
  if (!_templates) {
    _templates = await getNotificationTemplates();
  }

  el.innerHTML = buildPageHTML();
  bindEvents();

  // Set initial state
  selectChip(_activeChip, false);
  updateRecipientUI();
  renderSendLog();
  renderKPIs();
}

// ── Page HTML shell ────────────────────────────────────────
function buildPageHTML() {
  const canSend = can('canSendNotifications');

  return `
    <!-- KPIs -->
    <div class="notif-kpi-row" id="notif-kpis"></div>

    <!-- Quick Actions -->
    ${canSend ? buildQuickActions() : ''}

    <!-- Two-column layout -->
    <div class="notif-layout">

      <!-- LEFT: Compose -->
      <div class="notif-compose fade-in">
        <div class="notif-compose-head">
          <div class="notif-compose-title">✍️ Compose Message</div>
          ${canSend ? '' : '<span class="badge badge-amber">View Only</span>'}
        </div>
        <div class="notif-compose-body">

          <!-- Template chips -->
          <div>
            <div class="notif-recipient-label" style="margin-bottom:8px">Template</div>
            <div class="notif-template-chips" id="notif-chips">
              <div class="notif-chip" data-key="rentReminder"     onclick="notifSelectChip('rentReminder')">📅 Rent Reminder</div>
              <div class="notif-chip" data-key="paymentReceipt"   onclick="notifSelectChip('paymentReceipt')">✅ Receipt</div>
              <div class="notif-chip" data-key="arrearsWarning"   onclick="notifSelectChip('arrearsWarning')">⚠️ Arrears</div>
              <div class="notif-chip" data-key="leaseRenewal"     onclick="notifSelectChip('leaseRenewal')">📋 Lease Renewal</div>
              <div class="notif-chip" data-key="custom"           onclick="notifSelectChip('custom')">✏️ Custom</div>
            </div>
          </div>

          <!-- Message -->
          <div class="notif-message-wrap">
            <div class="notif-recipient-label" style="margin-bottom:6px">Message</div>
            <textarea
              class="notif-message-area"
              id="notif-message"
              placeholder="Type your message or select a template above…"
              oninput="notifCharCount()"
              ${canSend ? '' : 'readonly'}
            ></textarea>
            <div class="notif-char-count" id="notif-charcount">0 / 160</div>
          </div>

          <!-- Merge tag hints -->
          <div>
            <div class="notif-recipient-label" style="margin-bottom:6px">Merge Tags <span style="font-weight:400;text-transform:none;letter-spacing:0"> — click to insert</span></div>
            <div class="notif-tags">
              ${['{name}','{amount}','{balance}','{month}','{building}','{unit}','{company}','{date}','{dueday}','{leaseend}']
                .map(t => `<span class="notif-tag-hint" onclick="notifInsertTag('${t}')">${t}</span>`).join('')}
            </div>
          </div>

          <!-- Recipients -->
          <div class="notif-recipient-wrap">
            <div class="notif-recipient-label">Recipients</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <select class="form-select" id="notif-rtype" onchange="notifUpdateRecipients()">
                <option value="all">All Active Tenants</option>
                <option value="building">By Building</option>
                <option value="arrears">Arrears Only</option>
                <option value="paid">Paid This Month</option>
                <option value="single">Single Tenant</option>
              </select>
              <div id="notif-rtype-extra"></div>
            </div>
            <div id="notif-recipient-badge"></div>
            <div class="notif-recipient-preview" id="notif-recipient-preview"></div>
          </div>

          <!-- Message preview -->
          <div>
            <div class="notif-recipient-label" style="margin-bottom:6px">Preview <span style="font-weight:400;text-transform:none;letter-spacing:0"> — first recipient</span></div>
            <div class="notif-preview-box" id="notif-preview">Select a template and recipient to preview…</div>
          </div>

          <!-- Result banner -->
          <div id="notif-result" style="display:none"></div>

          <!-- Send buttons -->
          ${canSend ? `
          <div class="notif-send-row">
            <button class="btn btn-primary" id="btn-send-sms" onclick="notifSendSMS()">
              📱 Send SMS
            </button>
            <button class="btn btn-success" id="btn-send-wa" onclick="notifSendWhatsApp()">
              💬 WhatsApp
            </button>
          </div>
          ` : ''}

        </div>
      </div>

      <!-- RIGHT: Send Log -->
      <div class="notif-log-wrap fade-in">
        <div class="notif-log-head">
          <div class="notif-log-title">📋 Send Log</div>
          <div style="font-size:0.75rem;color:var(--text-muted)" id="notif-log-count">—</div>
        </div>
        <div class="notif-log-filters">
          <input type="text" class="search-input" id="notif-log-search"
            placeholder="Search tenant or phone…" oninput="notifFilterLog()"
            style="width:200px"/>
          <select class="form-select" id="notif-log-type" onchange="notifFilterLog()" style="width:auto">
            <option value="">All Types</option>
            <option value="RENT_REMINDER">Rent Reminder</option>
            <option value="RECEIPT">Receipt</option>
            <option value="ARREARS">Arrears</option>
            <option value="LEASE_RENEWAL">Lease Renewal</option>
            <option value="CUSTOM">Custom</option>
          </select>
          <select class="form-select" id="notif-log-channel" onchange="notifFilterLog()" style="width:auto">
            <option value="">All Channels</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <select class="form-select" id="notif-log-status" onchange="notifFilterLog()" style="width:auto">
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div class="table-wrap">
          <table class="notif-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Tenant</th>
                <th>Type</th>
                <th>Ch</th>
                <th>Message</th>
                <th>Status</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody id="notif-log-tbody"></tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

// ── Quick actions ──────────────────────────────────────────
function buildQuickActions() {
  const { unpaidCount, paidTodayCount, arrearsCount } = computeQuickCounts();

  return `
    <div class="notif-quick-row">
      <div class="notif-quick-card amber" onclick="notifQuickRentReminders()">
        <div class="notif-quick-icon">📅</div>
        <div>
          <div class="notif-quick-label">Rent Reminders</div>
          <div class="notif-quick-desc">Send to all tenants who haven't fully paid this month</div>
          <div class="notif-quick-count">${unpaidCount} tenants</div>
        </div>
      </div>
      <div class="notif-quick-card green" onclick="notifQuickReceipts()">
        <div class="notif-quick-icon">✅</div>
        <div>
          <div class="notif-quick-label">Payment Receipts</div>
          <div class="notif-quick-desc">Confirm payments received today</div>
          <div class="notif-quick-count">${paidTodayCount} payments today</div>
        </div>
      </div>
      <div class="notif-quick-card blue" onclick="notifQuickArrears()">
        <div class="notif-quick-icon">⚠️</div>
        <div>
          <div class="notif-quick-label">Arrears Notices</div>
          <div class="notif-quick-desc">Warn tenants with outstanding balances</div>
          <div class="notif-quick-count">${arrearsCount} in arrears</div>
        </div>
      </div>
    </div>
  `;
}

function computeQuickCounts() {
  const active = AppState.tenants.filter(t => t.status !== 'vacated' && t.unitId);
  const today  = getToday();

  let unpaidCount  = 0;
  let arrearsCount = 0;
  active.forEach(t => {
    const bal = getTenantBalance(t.id);
    if (bal > 0) {
      arrearsCount++;
      unpaidCount++; // Unpaid includes any arrears
    }
  });

  const paidTodayIds  = new Set(
    AppState.payments
      .filter(p => p.date === today)
      .map(p => p.tenantId)
  );
  const paidTodayCount = paidTodayIds.size;

  return { unpaidCount, paidTodayCount, arrearsCount };
}

// ── KPI cards ──────────────────────────────────────────────
function renderKPIs() {
  const el = document.getElementById('notif-kpis');
  if (!el) return;

  const today     = getToday();
  const curMonth  = getCurMonth();
  const notifs    = AppState.notifications || [];

  const sentToday = notifs.filter(n => {
    if (!n.sentAt) return false;
    const d = n.sentAt.toDate ? n.sentAt.toDate() : new Date(n.sentAt);
    return d.toISOString().startsWith(today);
  }).length;

  const sentMonth = notifs.filter(n => {
    if (!n.sentAt) return false;
    const d = n.sentAt.toDate ? n.sentAt.toDate() : new Date(n.sentAt);
    return d.toISOString().startsWith(curMonth);
  }).length;

  const totalSent   = notifs.filter(n => n.status === 'sent').length;
  const totalAll    = notifs.length;
  const successRate = totalAll ? Math.round((totalSent / totalAll) * 100) : 100;

  const smsSent  = notifs.filter(n => n.channel === 'sms').length;
  const waSent   = notifs.filter(n => n.channel === 'whatsapp').length;

  el.innerHTML = `
    <div class="kpi-card accent">
      <div class="kpi-label">Sent Today</div>
      <div class="kpi-value">${sentToday}</div>
      <div class="kpi-sub">messages dispatched</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">This Month</div>
      <div class="kpi-value">${sentMonth}</div>
      <div class="kpi-sub">${monthLabel(curMonth)}</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Success Rate</div>
      <div class="kpi-value">${successRate}%</div>
      <div class="kpi-sub">${totalSent} of ${totalAll} delivered</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">SMS / WhatsApp</div>
      <div class="kpi-value">${smsSent}</div>
      <div class="kpi-sub">${waSent} via WhatsApp</div>
    </div>
  `;
}

// ── Chip selection ─────────────────────────────────────────
function selectChip(key, updateMessage = true) {
  _activeChip = key;
  document.querySelectorAll('.notif-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.key === key);
  });
  if (updateMessage && _templates) {
    const msg = document.getElementById('notif-message');
    if (msg && _templates[key] !== undefined) {
      msg.value = _templates[key];
      notifCharCount();
      updatePreview();
    }
  }
}

window.notifSelectChip = function(key) {
  selectChip(key, true);
};

// ── Char count ─────────────────────────────────────────────
window.notifCharCount = function() {
  const msg = document.getElementById('notif-message');
  const cc  = document.getElementById('notif-charcount');
  if (!msg || !cc) return;
  const len = msg.value.length;
  cc.textContent = `${len} / 160`;
  cc.className = 'notif-char-count' + (len > 320 ? ' over' : len > 160 ? ' warn' : '');
  updatePreview();
};

// ── Insert merge tag at cursor ─────────────────────────────
window.notifInsertTag = function(tag) {
  const ta = document.getElementById('notif-message');
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  ta.value    = ta.value.slice(0, start) + tag + ta.value.slice(end);
  ta.setSelectionRange(start + tag.length, start + tag.length);
  ta.focus();
  notifCharCount();
};

// ── Recipient filter ───────────────────────────────────────
window.notifUpdateRecipients = function() {
  _recipientType  = document.getElementById('notif-rtype')?.value || 'all';
  _selectedBldg   = '';
  _selectedTenant = '';

  const extraEl = document.getElementById('notif-rtype-extra');
  if (!extraEl) return;

  if (_recipientType === 'building') {
    extraEl.innerHTML = `<select class="form-select" id="notif-bldg-sel" onchange="notifBldgChange()">
      <option value="">All Buildings</option>
      ${AppState.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
    </select>`;
  } else if (_recipientType === 'single') {
    const active = AppState.tenants.filter(t => t.status !== 'vacated' && t.unitId);
    extraEl.innerHTML = `<select class="form-select" id="notif-tenant-sel" onchange="notifTenantChange()">
      <option value="">Select Tenant</option>
      ${active.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
    </select>`;
  } else {
    extraEl.innerHTML = '';
  }

  updateRecipientUI();
};

window.notifBldgChange = function() {
  _selectedBldg = document.getElementById('notif-bldg-sel')?.value || '';
  updateRecipientUI();
};

window.notifTenantChange = function() {
  _selectedTenant = document.getElementById('notif-tenant-sel')?.value || '';
  updateRecipientUI();
};

function updateRecipientUI() {
  const recipients = buildRecipients();
  const badgeEl    = document.getElementById('notif-recipient-badge');
  const previewEl  = document.getElementById('notif-recipient-preview');

  if (badgeEl) {
    badgeEl.innerHTML = `
      <span class="notif-recipient-count-badge">
        👥 ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}
      </span>`;
  }

  if (previewEl) {
    if (!recipients.length) {
      previewEl.textContent = 'No recipients match this filter.';
    } else {
      const names  = recipients.slice(0, 5).map(r => esc(r.tenantName)).join(', ');
      const more   = recipients.length > 5 ? ` +${recipients.length - 5} more` : '';
      previewEl.textContent = names + more;
    }
  }

  updatePreview();
}

// ── Build recipient list ───────────────────────────────────
function buildRecipients() {
  const active = AppState.tenants.filter(t =>
    t.status !== 'vacated' && t.unitId && t.phone
  );

  let filtered = active;

  switch (_recipientType) {
    case 'building':
      if (_selectedBldg) {
        filtered = active.filter(t => t.buildingId === _selectedBldg);
      }
      break;
    case 'arrears':
      filtered = active.filter(t => getTenantBalance(t.id) > 0);
      break;
    case 'paid': {
      // Tenants who have made at least one payment in the current billing month
      const curMonth       = getCurMonth();
      const paidThisMonth  = new Set(
        AppState.payments
          .filter(p => (p.month === curMonth) || (p.date?.startsWith(curMonth)))
          .map(p => p.tenantId)
      );
      filtered = active.filter(t => paidThisMonth.has(t.id));
      break;
    }
    case 'single':
      filtered = _selectedTenant
        ? active.filter(t => t.id === _selectedTenant)
        : [];
      break;
    case '_today_payers': {
      // Set by notifQuickReceipts — only tenants who paid today
      const todayIds = AppState._notifTodayPayers || [];
      filtered = active.filter(t => todayIds.includes(t.id));
      break;
    }
    default: // 'all'
      filtered = active;
  }

  return filtered.map(t => {
    const bal = getTenantBalance(t.id);
    const balStr = bal > 0
      ? `KSh ${bal.toLocaleString('en-KE')} arrears`
      : bal < 0
        ? `KSh ${Math.abs(bal).toLocaleString('en-KE')} credit`
        : 'Clear';
    return {
      tenantId:   t.id,
      tenantName: t.name,
      phone:      t.phone,
      buildingId: t.buildingId || '',
      balance:    balStr
    };
  });
}

// ── Message preview ────────────────────────────────────────
function updatePreview() {
  const el  = document.getElementById('notif-preview');
  const msg = document.getElementById('notif-message')?.value || '';
  if (!el || !msg.trim()) {
    if (el) el.textContent = 'Type a message or select a template…';
    return;
  }
  const recipients = buildRecipients();
  if (!recipients.length) {
    el.textContent = 'No recipients selected.';
    return;
  }
  const first  = recipients[0];
  const tenant = AppState.tenants.find(t => t.id === first.tenantId);
  el.textContent = applyMergeTags(msg, tenant, { balance: first.balance });
}

// ── Send SMS ───────────────────────────────────────────────
window.notifSendSMS = async function() {
  if (!can('canSendNotifications')) return toast.error("You don't have permission to send messages.");

  const msg        = document.getElementById('notif-message')?.value?.trim();
  const recipients = buildRecipients();

  if (!msg)              return toast.error('Please write a message first.');
  if (!recipients.length) return toast.error('No recipients selected.');

  const btn = document.getElementById('btn-send-sms');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  const resultEl = document.getElementById('notif-result');

  try {
    const notifType = chipToNotifType(_activeChip);
    const result    = await sendBulkSMS(recipients, msg, notifType);

    showResultBanner(resultEl, result);
    toast.success(`SMS: ${result.sent} sent${result.failed ? `, ${result.failed} failed` : ''}`);
    renderSendLog();
    renderKPIs();
  } catch (err) {
    toast.error(err.message);
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<div class="notif-result-banner error">❌ ${esc(err.message)}</div>`;
    }
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }
};

// ── Send WhatsApp ──────────────────────────────────────────
window.notifSendWhatsApp = async function() {
  if (!can('canSendNotifications')) return toast.error("You don't have permission to send messages.");

  const msg        = document.getElementById('notif-message')?.value?.trim();
  const recipients = buildRecipients();

  if (!msg)               return toast.error('Please write a message first.');
  if (!recipients.length)  return toast.error('No recipients selected.');

  if (recipients.length > 10) {
    const ok = window.confirm(
      `You are about to open ${recipients.length} WhatsApp tabs. ` +
      `Your browser may block tabs after the first few.\n\n` +
      `Consider sending ≤10 at a time, or use SMS for bulk sends.\n\n` +
      `Continue?`
    );
    if (!ok) return;
  }

  const btn = document.getElementById('btn-send-wa');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  const resultEl = document.getElementById('notif-result');

  try {
    const notifType = chipToNotifType(_activeChip);
    const result    = await sendBulkWhatsApp(recipients, msg, notifType);

    showResultBanner(resultEl, result);
    toast.success(`WhatsApp: ${result.sent} tab${result.sent !== 1 ? 's' : ''} opened`);
    renderSendLog();
    renderKPIs();
  } catch (err) {
    toast.error(err.message);
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }
};

// ── Quick actions ──────────────────────────────────────────
window.notifQuickRentReminders = function() {
  // Pre-fill with rent reminder template, set filter to unpaid
  document.getElementById('notif-rtype').value = 'arrears';
  _recipientType = 'arrears';
  selectChip('rentReminder', true);
  notifUpdateRecipients();
  toast.info('Ready to send rent reminders to tenants with arrears.');
};

window.notifQuickReceipts = function() {
  // Find tenants who paid today
  const today     = getToday();
  const paidIds   = [...new Set(AppState.payments.filter(p => p.date === today).map(p => p.tenantId))];
  if (!paidIds.length) {
    return toast.info('No payments recorded today.');
  }
  // Switch to single-recipient mode and show count
  document.getElementById('notif-rtype').value = 'all';
  _recipientType = 'all';
  selectChip('paymentReceipt', true);
  // Override recipients to today's payers
  _recipientType = '_today_payers';
  updateRecipientUI_todayPayers(paidIds);
  toast.info(`Loaded ${paidIds.length} tenant${paidIds.length > 1 ? 's' : ''} who paid today.`);
};

function updateRecipientUI_todayPayers(paidIds) {
  const badgeEl   = document.getElementById('notif-recipient-badge');
  const previewEl = document.getElementById('notif-recipient-preview');
  const today     = getToday();

  const tenants = paidIds
    .map(id => AppState.tenants.find(t => t.id === id))
    .filter(Boolean);

  if (badgeEl) {
    badgeEl.innerHTML = `<span class="notif-recipient-count-badge">👥 ${tenants.length} recipient${tenants.length !== 1 ? 's' : ''} (today)</span>`;
  }
  if (previewEl) {
    previewEl.textContent = tenants.slice(0, 5).map(t => t.name).join(', ')
      + (tenants.length > 5 ? ` +${tenants.length - 5} more` : '');
  }
  // Store paid IDs for use when sending
  AppState._notifTodayPayers = paidIds;
}

window.notifQuickArrears = function() {
  document.getElementById('notif-rtype').value = 'arrears';
  _recipientType = 'arrears';
  selectChip('arrearsWarning', true);
  notifUpdateRecipients();
  toast.info('Ready to send arrears notices.');
};

// ── Send Log ───────────────────────────────────────────────
function renderSendLog() {
  const tbody   = document.getElementById('notif-log-tbody');
  const countEl = document.getElementById('notif-log-count');
  if (!tbody) return;

  const search  = (document.getElementById('notif-log-search')?.value  || '').toLowerCase();
  const type    = document.getElementById('notif-log-type')?.value     || '';
  const channel = document.getElementById('notif-log-channel')?.value  || '';
  const status  = document.getElementById('notif-log-status')?.value   || '';

  let rows = [...(AppState.notifications || [])];
  if (search)  rows = rows.filter(n => n.tenantName?.toLowerCase().includes(search) || n.phone?.includes(search));
  if (type)    rows = rows.filter(n => n.type    === type);
  if (channel) rows = rows.filter(n => n.channel === channel);
  if (status)  rows = rows.filter(n => n.status  === status);

  if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="notif-empty">
        <div class="empty-icon">📭</div>
        <p>No notifications sent yet${search || type || channel || status ? ' matching this filter' : ''}.</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(n => {
    const time   = formatSentAt(n.sentAt);
    const typeLbl = notifTypeLabel(n.type);
    const chBadge = n.channel === 'whatsapp'
      ? '<span class="ch-whatsapp">WA</span>'
      : '<span class="ch-sms">SMS</span>';
    const stBadge = n.status === 'sent'
      ? '<span class="badge badge-green">Sent</span>'
      : '<span class="badge badge-red" title="' + esc(n.errorMsg || '') + '">Failed</span>';

    return `<tr>
      <td style="color:var(--text-muted);font-size:0.78rem;white-space:nowrap">${time}</td>
      <td>
        <div style="font-weight:500;font-size:0.83rem">${esc(n.tenantName || '—')}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono,monospace)">${esc(n.phone || '')}</div>
      </td>
      <td style="font-size:0.78rem;color:var(--text-muted)">${typeLbl}</td>
      <td>${chBadge}</td>
      <td><div class="notif-msg-preview" title="${esc(n.message)}">${esc(n.message)}</div></td>
      <td>${stBadge}</td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${esc(n.sentBy || '—')}</td>
    </tr>`;
  }).join('');
}

window.notifFilterLog = function() { renderSendLog(); };

// ── Single-tenant compose modal ────────────────────────────
// Called from Tenant Profile page
window.openNotifModal = async function(tenantId) {
  if (!tenantId) return;
  const tenant = AppState.tenants.find(t => t.id === tenantId);
  if (!tenant) return;

  if (!_templates) _templates = await getNotificationTemplates();

  const bal    = getTenantBalance(tenantId);
  const balStr = bal > 0
    ? `KSh ${bal.toLocaleString('en-KE')} arrears`
    : bal < 0
      ? `KSh ${Math.abs(bal).toLocaleString('en-KE')} credit`
      : 'Clear';

  const overlay = document.getElementById('m-notif');
  if (!overlay) return;

  // Populate modal
  document.getElementById('mn-tenant-name').textContent  = tenant.name;
  document.getElementById('mn-tenant-phone').textContent = normalizePhone(tenant.phone);
  document.getElementById('mn-tenant-bal').textContent   = `Balance: ${balStr}`;
  document.getElementById('mn-message').value            = _templates.rentReminder || '';
  document.getElementById('mn-channel').value            = 'sms';
  document.getElementById('mn-preview').textContent      =
    applyMergeTags(_templates.rentReminder || '', tenant, { balance: balStr });

  // Store context for mnSend
  overlay.dataset.tenantId = tenantId;
  overlay.dataset.balance  = balStr;

  // Use the app's global modal wrapper (defined in app.html bootstrap)
  window.openModal('m-notif');
};

window.mnUpdatePreview = function() {
  const overlay = document.getElementById('m-notif');
  if (!overlay) return;
  const tenantId = overlay.dataset.tenantId;
  const balance  = overlay.dataset.balance;
  const tenant   = AppState.tenants.find(t => t.id === tenantId);
  const msg      = document.getElementById('mn-message')?.value || '';
  const preEl    = document.getElementById('mn-preview');
  if (preEl) preEl.textContent = applyMergeTags(msg, tenant, { balance });
};

window.mnSend = async function() {
  if (!can('canSendNotifications')) return toast.error("No permission to send messages.");
  const overlay  = document.getElementById('m-notif');
  if (!overlay) return;

  const tenantId = overlay.dataset.tenantId;
  const balance  = overlay.dataset.balance;
  const tenant   = AppState.tenants.find(t => t.id === tenantId);
  if (!tenant) return;

  const msg     = document.getElementById('mn-message')?.value?.trim();
  const channel = document.getElementById('mn-channel')?.value || 'sms';
  if (!msg) return toast.error('Please write a message.');

  const personalised = applyMergeTags(msg, tenant, { balance });
  const btn          = document.getElementById('btn-mn-send');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  try {
    if (channel === 'whatsapp') {
      openWhatsAppLink(tenant.phone, personalised);
      await logNotification({
        tenantId, tenantName: tenant.name, phone: tenant.phone,
        buildingId: tenant.buildingId || '',
        type: 'CUSTOM', channel: 'whatsapp',
        message: personalised, status: 'sent', gateway: 'manual'
      });
      toast.success('WhatsApp opened.');
    } else {
      await sendBulkSMS(
        [{ tenantId, tenantName: tenant.name, phone: tenant.phone, buildingId: tenant.buildingId || '', balance }],
        msg, 'CUSTOM'
      );
      toast.success(`SMS sent to ${tenant.name}`);
    }
    window.closeModal('m-notif');
    // Refresh log if on notifications page
    renderSendLog();
    renderKPIs();
  } catch (err) {
    toast.error(err.message);
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }
};

// ── Template editor ────────────────────────────────────────
window.openNotifTemplateEditor = async function() {
  if (!can('canChangeSettings')) return toast.error("Only admins can edit templates.");
  if (!_templates) _templates = await getNotificationTemplates();

  const { openModal } = await import('../components/modal.js');
  const keys = ['rentReminder','paymentReceipt','arrearsWarning','leaseRenewal','custom'];
  const labels = {
    rentReminder:   'Rent Reminder',
    paymentReceipt: 'Payment Receipt',
    arrearsWarning: 'Arrears Warning',
    leaseRenewal:   'Lease Renewal',
    custom:         'Custom'
  };

  const el = document.getElementById('m-notif-templates-body');
  if (!el) return;
  el.innerHTML = keys.map(k => `
    <div class="form-group">
      <label class="form-label">${labels[k]}</label>
      <textarea class="form-textarea" id="tmpl-${k}" rows="3">${esc(_templates[k] || '')}</textarea>
    </div>
  `).join('');

  openModal('m-notif-templates');
};

window.saveNotifTemplates = async function() {
  const keys = ['rentReminder','paymentReceipt','arrearsWarning','leaseRenewal','custom'];
  const updated = {};
  keys.forEach(k => {
    updated[k] = document.getElementById(`tmpl-${k}`)?.value?.trim() || '';
  });
  const btn = document.getElementById('btn-save-templates');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  try {
    const { saveNotificationTemplates } = await import('../services/notificationService.js');
    await saveNotificationTemplates(updated);
    _templates = { ..._templates, ...updated };
    toast.success('Templates saved!');
    window.closeModal('m-notif-templates');
  } catch (err) {
    toast.error(err.message);
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }
};

// ── Bind events ────────────────────────────────────────────
function bindEvents() {
  // Nothing extra needed — all handlers are on window.*
}

// ── Helpers ────────────────────────────────────────────────
function chipToNotifType(chip) {
  const map = {
    rentReminder:   'RENT_REMINDER',
    paymentReceipt: 'RECEIPT',
    arrearsWarning: 'ARREARS',
    leaseRenewal:   'LEASE_RENEWAL',
    custom:         'CUSTOM'
  };
  return map[chip] || 'CUSTOM';
}

function notifTypeLabel(type) {
  const map = {
    RENT_REMINDER: 'Reminder',
    RECEIPT:       'Receipt',
    ARREARS:       'Arrears',
    LEASE_RENEWAL: 'Lease',
    CUSTOM:        'Custom'
  };
  return map[type] || type;
}

function formatSentAt(sentAt) {
  if (!sentAt) return '—';
  try {
    const d = sentAt.toDate ? sentAt.toDate() : new Date(sentAt);
    return d.toLocaleString('en-KE', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (_) { return '—'; }
}

function showResultBanner(el, result) {
  if (!el) return;
  el.style.display = 'block';
  const cls   = result.failed === 0 ? 'success' : result.sent > 0 ? 'partial' : 'error';
  const icon  = cls === 'success' ? '✅' : cls === 'partial' ? '⚠️' : '❌';
  el.innerHTML = `<div class="notif-result-banner ${cls}">
    ${icon}
    <div>
      <strong>${result.sent} sent${result.failed ? `, ${result.failed} failed` : ''}</strong>
      out of ${result.total} recipient${result.total !== 1 ? 's' : ''}.
      ${result.failed ? '<br>Check the Send Log for error details.' : ''}
    </div>
  </div>`;
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
