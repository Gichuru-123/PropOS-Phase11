// ============================================================
// PropOS — Activity Log Page (Phase 10)
// Full audit trail with search, filters, diff view, CSV export
// ============================================================

import { AppState, getToday } from '../store.js';
import { can }                from '../auth.js';
import { toast }              from '../components/toast.js';

// ── Module state ──────────────────────────────────────────
let _search   = '';
let _action   = '';
let _entity   = '';
let _user     = '';
let _dateFrom = '';
let _dateTo   = '';
let _page     = 1;

const PAGE_SIZE = 50;
const EXPANDED  = new Set();   // set of entry IDs currently expanded

// ── Action colour map ─────────────────────────────────────
const ACTION_COLOR = {
  CREATED:   'green',
  UPDATED:   'blue',
  DELETED:   'red',
  VACATED:   'amber',
  RESTORED:  'green',
  SENT:      'blue',
  IMPORTED:  'purple',
  GENERATED: 'teal',
  CLEARED:   'amber',
  LOGIN:     'muted',
};

// ── Helpers ───────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function fmtTs(ts) {
  const d = tsToDate(ts);
  if (!d) return '—';
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-KE', { day:'2-digit', month:'short', year:'numeric' });
}

function fmtTsFull(ts) {
  const d = tsToDate(ts);
  if (!d) return '—';
  return d.toLocaleString('en-KE', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}

function tsDateStr(ts) {
  const d = tsToDate(ts);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

// ── Badges ────────────────────────────────────────────────
function actionBadge(action) {
  const c = ACTION_COLOR[action] || 'muted';
  return `<span class="al-action-badge al-ab-${c}">${esc(action || '?')}</span>`;
}

function entityBadge(type) {
  return `<span class="al-entity-badge">${esc(type || '—')}</span>`;
}

// ── Filter ────────────────────────────────────────────────
function applyFilters(entries) {
  const q = _search.toLowerCase();
  return entries.filter(e => {
    if (_action   && e.action     !== _action) return false;
    if (_entity   && e.entityType !== _entity) return false;
    if (_user     && e.userId     !== _user)   return false;
    if (_dateFrom && tsDateStr(e.timestamp)  < _dateFrom) return false;
    if (_dateTo   && tsDateStr(e.timestamp)  > _dateTo)   return false;
    if (q) {
      const hay = [
        e.description, e.entityType, e.entityId,
        e.userName, e.userEmail, e.action
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ── KPIs ─────────────────────────────────────────────────
function buildKPIs(entries) {
  const today     = getToday();
  const weekAgo   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthPfx  = today.slice(0, 7);

  const todayN = entries.filter(e => tsDateStr(e.timestamp) === today).length;
  const weekN  = entries.filter(e => tsDateStr(e.timestamp) >= weekAgo).length;
  const monN   = entries.filter(e => tsDateStr(e.timestamp).startsWith(monthPfx)).length;

  const freq = {};
  entries
    .filter(e => tsDateStr(e.timestamp).startsWith(monthPfx))
    .forEach(e => { const n = e.userName || e.userEmail || 'Unknown'; freq[n] = (freq[n]||0) + 1; });
  const top = Object.entries(freq).sort((a,b) => b[1] - a[1])[0];

  return `
  <div class="al-kpis">
    <div class="al-kpi-card">
      <div class="al-kpi-val">${todayN}</div>
      <div class="al-kpi-lbl">Actions Today</div>
    </div>
    <div class="al-kpi-card">
      <div class="al-kpi-val">${weekN}</div>
      <div class="al-kpi-lbl">Last 7 Days</div>
    </div>
    <div class="al-kpi-card">
      <div class="al-kpi-val">${monN}</div>
      <div class="al-kpi-lbl">This Month</div>
    </div>
    <div class="al-kpi-card al-kpi-wide">
      <div class="al-kpi-val" style="font-size:1rem">${top ? esc(top[0]) : '—'}</div>
      <div class="al-kpi-lbl">Top User${top ? ` · ${top[1]} actions this month` : ''}</div>
    </div>
  </div>`;
}

// ── Unique values for dropdowns ───────────────────────────
function uniqueActions(entries) {
  return [...new Set(entries.map(e => e.action).filter(Boolean))].sort();
}
function uniqueEntities(entries) {
  return [...new Set(entries.map(e => e.entityType).filter(Boolean))].sort();
}
function uniqueUsers(entries) {
  const m = new Map();
  entries.forEach(e => { if (e.userId && !m.has(e.userId)) m.set(e.userId, e.userName || e.userEmail || e.userId); });
  return [...m.entries()].sort((a,b) => a[1].localeCompare(b[1]));
}

// ── Diff display ──────────────────────────────────────────
function fmtVal(v) {
  if (v == null) return '<em style="color:var(--text-muted)">—</em>';
  if (typeof v === 'object') {
    return `<pre class="al-diff-pre">${esc(JSON.stringify(v, null, 2))}</pre>`;
  }
  return `<span style="font-size:0.82rem">${esc(String(v))}</span>`;
}

function diffHtml(oldVal, newVal) {
  const hasOld = oldVal != null;
  const hasNew = newVal != null;
  if (!hasOld && !hasNew) {
    return `<span style="color:var(--text-muted);font-size:0.78rem">No change details recorded.</span>`;
  }
  if (hasOld && hasNew) {
    return `
    <div class="al-diff-grid">
      <div>
        <div class="al-diff-label al-diff-label-old">Before</div>
        <div class="al-diff-box al-diff-box-old">${fmtVal(oldVal)}</div>
      </div>
      <div>
        <div class="al-diff-label al-diff-label-new">After</div>
        <div class="al-diff-box al-diff-box-new">${fmtVal(newVal)}</div>
      </div>
    </div>`;
  }
  if (hasNew) {
    return `
    <div>
      <div class="al-diff-label al-diff-label-new">Created with</div>
      <div class="al-diff-box al-diff-box-new">${fmtVal(newVal)}</div>
    </div>`;
  }
  return `
  <div>
    <div class="al-diff-label al-diff-label-old">Removed</div>
    <div class="al-diff-box al-diff-box-old">${fmtVal(oldVal)}</div>
  </div>`;
}

// ── Table row ─────────────────────────────────────────────
function rowHtml(e, expanded) {
  const hasDiff = e.oldValue != null || e.newValue != null;

  const expandBtn = hasDiff
    ? `<button class="al-expand-btn" onclick="event.stopPropagation();alToggle('${e.id}')"
         title="${expanded ? 'Collapse' : 'Expand details'}">${expanded ? '▲' : '▼'}</button>`
    : `<span style="color:var(--border)">—</span>`;

  const diffRow = expanded ? `
  <tr class="al-diff-row">
    <td colspan="6">
      <div class="al-diff-inner">
        <div class="al-diff-meta">
          <span>Full timestamp: <strong>${fmtTsFull(e.timestamp)}</strong></span>
          <span>Entity ID: <code class="al-mono">${esc(e.entityId || '—')}</code></span>
        </div>
        ${diffHtml(e.oldValue, e.newValue)}
      </div>
    </td>
  </tr>` : '';

  return `
  <tr class="al-row${expanded ? ' al-row-open' : ''}" onclick="alToggle('${e.id}')">
    <td class="al-cell-time" title="${fmtTsFull(e.timestamp)}">${fmtTs(e.timestamp)}</td>
    <td>
      <div class="al-user-name">${esc(e.userName || e.userEmail || '—')}</div>
      <div class="al-user-role">${esc(e.userRole || '')}</div>
    </td>
    <td>${actionBadge(e.action)}</td>
    <td>${entityBadge(e.entityType)}</td>
    <td class="al-cell-desc">${esc(e.description || '—')}</td>
    <td class="al-cell-expand">${expandBtn}</td>
  </tr>
  ${diffRow}`;
}

// ── Pagination bar ────────────────────────────────────────
function pagerHtml(total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return '';
  const start = (_page - 1) * PAGE_SIZE + 1;
  const end   = Math.min(_page * PAGE_SIZE, total);
  return `
  <div class="al-pager">
    <button class="btn btn-ghost btn-sm" onclick="alPrev()" ${_page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span class="al-pager-info">${start}–${end} of ${total} entries &nbsp;·&nbsp; Page ${_page} of ${pages}</span>
    <button class="btn btn-ghost btn-sm" onclick="alNext()" ${_page >= pages ? 'disabled' : ''}>Next →</button>
  </div>`;
}

// ── Main render ───────────────────────────────────────────
export function render() {
  const el = document.getElementById('page-activity');
  if (!el) return;

  // Permission guard
  if (!can('canViewAuditLog')) {
    el.innerHTML = `
    <div style="text-align:center;padding:100px 20px;color:var(--text-muted)">
      <div style="font-size:3rem;margin-bottom:14px">🔒</div>
      <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:6px">Access Restricted</div>
      <div style="font-size:0.85rem">The activity log is visible to Admins and Owners only.</div>
    </div>`;
    return;
  }

  const entries  = AppState.activityLog || [];
  const actions  = uniqueActions(entries);
  const entities = uniqueEntities(entries);
  const users    = uniqueUsers(entries);
  const filtered = applyFilters(entries);
  const paged    = filtered.slice((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE);

  const hasFilters = _search || _action || _entity || _user || _dateFrom || _dateTo;

  el.innerHTML = `
  <!-- Header -->
  <div class="al-header">
    <div>
      <div class="al-title">Activity Log</div>
      <div class="al-subtitle">Full audit trail — every action, who did it, and when</div>
    </div>
    <button class="btn btn-ghost" onclick="alExportCSV()">↓ Export CSV</button>
  </div>

  <!-- KPIs -->
  ${buildKPIs(entries)}

  <!-- Filters -->
  <div class="al-filters">
    <input class="search-input" id="al-search" placeholder="Search description, entity, user…"
      value="${esc(_search)}" oninput="alFilter()"/>

    <select class="form-select al-filter-select" id="al-action" onchange="alFilter()">
      <option value="">All Actions</option>
      ${actions.map(a => `<option value="${a}" ${a === _action ? 'selected' : ''}>${a}</option>`).join('')}
    </select>

    <select class="form-select al-filter-select" id="al-entity" onchange="alFilter()">
      <option value="">All Entities</option>
      ${entities.map(e => `<option value="${e}" ${e === _entity ? 'selected' : ''}>${e}</option>`).join('')}
    </select>

    <select class="form-select al-filter-select" id="al-user" onchange="alFilter()">
      <option value="">All Users</option>
      ${users.map(([uid, name]) => `<option value="${uid}" ${uid === _user ? 'selected' : ''}>${esc(name)}</option>`).join('')}
    </select>

    <input type="date" class="form-input al-date-input" id="al-datefrom"
      value="${_dateFrom}" onchange="alFilter()" title="From date"/>
    <input type="date" class="form-input al-date-input" id="al-dateto"
      value="${_dateTo}" onchange="alFilter()" title="To date"/>

    ${hasFilters ? `<button class="btn btn-ghost" onclick="alClearFilters()" style="white-space:nowrap">✕ Clear</button>` : ''}
  </div>

  <!-- Result count -->
  <div class="al-count">
    ${filtered.length === entries.length
      ? `${entries.length} entries`
      : `<strong>${filtered.length}</strong> of ${entries.length} entries match`}
    ${entries.length >= 500
      ? `&nbsp;<span class="al-limit-warn">· showing latest 500 — export for full history</span>`
      : ''}
  </div>

  <!-- Table -->
  <div class="card" style="padding:0;overflow:hidden">
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:110px">Time</th>
            <th style="width:160px">User</th>
            <th style="width:110px">Action</th>
            <th style="width:110px">Entity</th>
            <th>Description</th>
            <th style="width:52px;text-align:center">Detail</th>
          </tr>
        </thead>
        <tbody id="al-tbody">
          ${paged.length
            ? paged.map(e => rowHtml(e, EXPANDED.has(e.id))).join('')
            : `<tr><td colspan="6" class="al-empty">
                 ${entries.length === 0
                   ? 'No activity recorded yet. Actions you take will appear here.'
                   : 'No entries match the current filters.'}
               </td></tr>`}
        </tbody>
      </table>
    </div>
  </div>

  ${pagerHtml(filtered.length)}`;
}

// ── Partial re-render (tbody only) ────────────────────────
function rerenderBody() {
  const entries  = AppState.activityLog || [];
  const filtered = applyFilters(entries);
  const paged    = filtered.slice((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE);
  const tbody    = document.getElementById('al-tbody');
  if (!tbody) return;
  tbody.innerHTML = paged.length
    ? paged.map(e => rowHtml(e, EXPANDED.has(e.id))).join('')
    : `<tr><td colspan="6" class="al-empty">No entries match the current filters.</td></tr>`;
}

// ── Window globals ────────────────────────────────────────

window.alFilter = function() {
  _search   = document.getElementById('al-search')?.value   || '';
  _action   = document.getElementById('al-action')?.value   || '';
  _entity   = document.getElementById('al-entity')?.value   || '';
  _user     = document.getElementById('al-user')?.value     || '';
  _dateFrom = document.getElementById('al-datefrom')?.value || '';
  _dateTo   = document.getElementById('al-dateto')?.value   || '';
  _page = 1;
  EXPANDED.clear();
  render();
};

window.alClearFilters = function() {
  _search = _action = _entity = _user = _dateFrom = _dateTo = '';
  _page = 1;
  EXPANDED.clear();
  render();
};

window.alToggle = function(id) {
  if (EXPANDED.has(id)) EXPANDED.delete(id);
  else EXPANDED.add(id);
  rerenderBody();
};

window.alPrev = function() {
  if (_page > 1) { _page--; EXPANDED.clear(); render(); }
};

window.alNext = function() {
  const total = applyFilters(AppState.activityLog || []).length;
  if (_page < Math.ceil(total / PAGE_SIZE)) { _page++; EXPANDED.clear(); render(); }
};

window.alExportCSV = function() {
  const filtered = applyFilters(AppState.activityLog || []);
  if (!filtered.length) { toast.warning('No entries to export.'); return; }

  const headers = ['Timestamp','User','Role','Email','Action','Entity Type','Entity ID','Description','Old Value','New Value'];
  const rows = filtered.map(e => [
    tsToDate(e.timestamp)?.toISOString() || '',
    e.userName  || '',
    e.userRole  || '',
    e.userEmail || '',
    e.action    || '',
    e.entityType || '',
    e.entityId  || '',
    e.description || '',
    e.oldValue != null ? JSON.stringify(e.oldValue) : '',
    e.newValue != null ? JSON.stringify(e.newValue) : ''
  ]);

  const csv  = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `propos-activity-${getToday()}.csv` });
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${filtered.length} entries to CSV`);
};
