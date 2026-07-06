// ============================================================
// PropOS — Maintenance Page (Phase 11)
// Board (Kanban) + List views, full CRUD, photo upload
// ============================================================

import { AppState, ksh, getToday } from '../store.js';
import { can, currentProfile }      from '../auth.js';
import { toast }                    from '../components/toast.js';
import { confirmDialog }            from '../components/modal.js';
import {
  addMaintenanceJob,
  updateMaintenanceJob,
  deleteMaintenanceJob,
  uploadJobPhoto
} from '../services/maintenanceService.js';

// ── Module state ──────────────────────────────────────────
let _view        = 'board';   // 'board' | 'list'
let _editingId   = null;      // null = new job
let _listFilters = { status: '', priority: '', building: '', category: '' };

// ── Constants ─────────────────────────────────────────────
const STATUSES = [
  { key: 'open',        label: 'Open',        icon: '🔓', next: 'in_progress', nextLabel: 'Start' },
  { key: 'in_progress', label: 'In Progress',  icon: '🔨', next: 'done',        nextLabel: 'Mark Done' },
  { key: 'done',        label: 'Done',         icon: '✅', next: 'closed',      nextLabel: 'Close' },
  { key: 'closed',      label: 'Closed',       icon: '🗃️', next: null,          nextLabel: null }
];

const CATEGORIES = {
  general:     { label: 'General',      icon: '🔧' },
  plumbing:    { label: 'Plumbing',     icon: '🚿' },
  electrical:  { label: 'Electrical',   icon: '⚡' },
  structural:  { label: 'Structural',   icon: '🏗️' },
  carpentry:   { label: 'Carpentry',    icon: '🪚' },
  pest:        { label: 'Pest Control', icon: '🐛' },
  cleaning:    { label: 'Cleaning',     icon: '🧹' }
};

const PRIORITY_COLOR = {
  low:    'muted',
  medium: 'blue',
  high:   'amber',
  urgent: 'red'
};

// ── Helpers ───────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return new Date(+y, +m - 1, +day).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done' || status === 'closed') return false;
  return dueDate < getToday();
}

function priorityBadge(p) {
  const c = PRIORITY_COLOR[p] || 'muted';
  return `<span class="mj-priority mj-p-${c}">${(p || 'medium').toUpperCase()}</span>`;
}

function statusBadge(s) {
  const info = STATUSES.find(x => x.key === s) || STATUSES[0];
  return `<span class="mj-status-badge mj-s-${s}">${info.icon} ${info.label}</span>`;
}

function catIcon(c) {
  return CATEGORIES[c]?.icon || '🔧';
}

function fmtTs(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function activeJobs() {
  return AppState.maintenanceJobs || [];
}

// ── KPIs ─────────────────────────────────────────────────
function buildKPIs(jobs) {
  const open   = jobs.filter(j => j.status === 'open').length;
  const inProg = jobs.filter(j => j.status === 'in_progress').length;
  const urgent = jobs.filter(j => j.priority === 'urgent' && j.status !== 'closed').length;
  const mon    = getToday().slice(0, 7);
  const doneM  = jobs.filter(j => j.status === 'done' || j.status === 'closed')
    .filter(j => {
      const ts = j.resolvedAt || j.updatedAt;
      if (!ts) return false;
      const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      return d.toISOString().startsWith(mon);
    }).length;
  const overdue = jobs.filter(j => isOverdue(j.dueDate, j.status)).length;

  return `
  <div class="mj-kpis">
    <div class="mj-kpi">
      <div class="mj-kpi-val">${open}</div>
      <div class="mj-kpi-lbl">Open</div>
    </div>
    <div class="mj-kpi">
      <div class="mj-kpi-val">${inProg}</div>
      <div class="mj-kpi-lbl">In Progress</div>
    </div>
    <div class="mj-kpi">
      <div class="mj-kpi-val">${doneM}</div>
      <div class="mj-kpi-lbl">Resolved This Month</div>
    </div>
    <div class="mj-kpi ${urgent > 0 ? 'mj-kpi-urgent' : ''}">
      <div class="mj-kpi-val">${urgent}</div>
      <div class="mj-kpi-lbl">Urgent</div>
    </div>
    <div class="mj-kpi ${overdue > 0 ? 'mj-kpi-warn' : ''}">
      <div class="mj-kpi-val">${overdue}</div>
      <div class="mj-kpi-lbl">Overdue</div>
    </div>
  </div>`;
}

// ── Board (Kanban) view ───────────────────────────────────
function boardCard(job) {
  const overdue = isOverdue(job.dueDate, job.status);
  const status  = STATUSES.find(s => s.key === job.status) || STATUSES[0];
  const canEdit = can('canManageMaintenance');

  const advBtn = (canEdit && status.next)
    ? `<button class="btn btn-ghost btn-sm mj-adv-btn"
         onclick="event.stopPropagation();maintAdvance('${job.id}')"
         title="Advance status">${status.nextLabel} →</button>`
    : '';

  const actions = canEdit ? `
    <div class="mj-card-actions">
      ${advBtn}
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();maintEdit('${job.id}')" title="Edit">✏️</button>
      ${can('canDeleteRecords') ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();maintDelete('${job.id}','${esc(job.title)}')" title="Delete">🗑️</button>` : ''}
    </div>` : '';

  return `
  <div class="mj-card" onclick="maintEdit('${job.id}')">
    <div class="mj-card-top">
      ${priorityBadge(job.priority)}
      <span class="mj-cat-icon" title="${CATEGORIES[job.category]?.label || job.category}">${catIcon(job.category)}</span>
    </div>
    <div class="mj-card-title">${esc(job.title)}</div>
    <div class="mj-card-loc">📍 ${esc(job.buildingName || '—')} ${job.unitNumber ? `· Unit ${esc(job.unitNumber)}` : ''}</div>
    ${job.assignedTo ? `<div class="mj-card-assigned">👤 ${esc(job.assignedTo)}</div>` : ''}
    ${job.dueDate ? `<div class="mj-card-due ${overdue ? 'mj-overdue' : ''}">
      ${overdue ? '⚠️ Overdue · ' : '📅 '}${fmtDate(job.dueDate)}
    </div>` : ''}
    ${job.photoUrls?.length ? `<div class="mj-card-photos">📷 ${job.photoUrls.length} photo${job.photoUrls.length > 1 ? 's' : ''}</div>` : ''}
    ${actions}
  </div>`;
}

function boardView(jobs) {
  return `
  <div class="mj-board">
    ${STATUSES.map(st => {
      const cols = jobs.filter(j => j.status === st.key);
      return `
      <div class="mj-col">
        <div class="mj-col-head">
          <span class="mj-col-label">${st.icon} ${st.label}</span>
          <span class="mj-col-count">${cols.length}</span>
        </div>
        <div class="mj-col-body">
          ${cols.length
            ? cols.map(j => boardCard(j)).join('')
            : `<div class="mj-col-empty">No jobs</div>`}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── List view ─────────────────────────────────────────────
function listView(jobs) {
  const buildings = [...new Map(jobs.map(j => [j.buildingId, j.buildingName])).entries()]
    .filter(([id]) => id)
    .sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));

  const filtered = jobs.filter(j => {
    if (_listFilters.status   && j.status    !== _listFilters.status)   return false;
    if (_listFilters.priority && j.priority  !== _listFilters.priority) return false;
    if (_listFilters.building && j.buildingId !== _listFilters.building) return false;
    if (_listFilters.category && j.category  !== _listFilters.category) return false;
    return true;
  });

  const hasFilters = Object.values(_listFilters).some(Boolean);
  const canEdit    = can('canManageMaintenance');

  return `
  <div class="al-filters" style="margin-bottom:12px">
    <select class="form-select al-filter-select" id="mj-f-status" onchange="maintListFilter()">
      <option value="">All Statuses</option>
      ${STATUSES.map(s => `<option value="${s.key}" ${_listFilters.status===s.key?'selected':''}>${s.icon} ${s.label}</option>`).join('')}
    </select>
    <select class="form-select al-filter-select" id="mj-f-priority" onchange="maintListFilter()">
      <option value="">All Priorities</option>
      ${['urgent','high','medium','low'].map(p => `<option value="${p}" ${_listFilters.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
    </select>
    <select class="form-select al-filter-select" id="mj-f-building" onchange="maintListFilter()">
      <option value="">All Buildings</option>
      ${buildings.map(([id, name]) => `<option value="${id}" ${_listFilters.building===id?'selected':''}>${esc(name)}</option>`).join('')}
    </select>
    <select class="form-select al-filter-select" id="mj-f-category" onchange="maintListFilter()">
      <option value="">All Categories</option>
      ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${_listFilters.category===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
    </select>
    ${hasFilters ? `<button class="btn btn-ghost" onclick="maintClearListFilters()">✕ Clear</button>` : ''}
  </div>

  <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px">
    ${filtered.length === jobs.length ? `${jobs.length} jobs` : `<strong>${filtered.length}</strong> of ${jobs.length} jobs`}
  </div>

  <div class="card" style="padding:0;overflow:hidden">
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:80px">Priority</th>
            <th>Title</th>
            <th style="width:90px">Category</th>
            <th style="width:150px">Location</th>
            <th style="width:120px">Assigned To</th>
            <th style="width:100px">Due Date</th>
            <th style="width:120px">Status</th>
            <th style="width:64px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length ? filtered.map(job => {
            const overdue = isOverdue(job.dueDate, job.status);
            const status  = STATUSES.find(s => s.key === job.status) || STATUSES[0];
            return `
            <tr class="al-row">
              <td>${priorityBadge(job.priority)}</td>
              <td>
                <div style="font-size:0.85rem;font-weight:500">${esc(job.title)}</div>
                ${job.description ? `<div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px">${esc(job.description)}</div>` : ''}
              </td>
              <td style="font-size:0.82rem">${catIcon(job.category)} ${esc(CATEGORIES[job.category]?.label || job.category)}</td>
              <td style="font-size:0.82rem">${esc(job.buildingName || '—')}${job.unitNumber ? ` · ${esc(job.unitNumber)}` : ''}</td>
              <td style="font-size:0.82rem;color:var(--text-secondary)">${esc(job.assignedTo || '—')}</td>
              <td style="font-size:0.78rem;${overdue ? 'color:var(--red);font-weight:600' : 'color:var(--text-muted)'}">${overdue ? '⚠️ ' : ''}${fmtDate(job.dueDate)}</td>
              <td>${statusBadge(job.status)}</td>
              <td style="white-space:nowrap">
                ${canEdit ? `
                  <button class="btn btn-ghost btn-sm" onclick="maintEdit('${job.id}')" title="Edit">✏️</button>
                  ${status.next ? `<button class="btn btn-ghost btn-sm" onclick="maintAdvance('${job.id}')" title="${status.nextLabel}">→</button>` : ''}
                ` : ''}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="8" class="al-empty">No jobs match the current filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── Main render ───────────────────────────────────────────
export function render() {
  const el = document.getElementById('page-maintenance');
  if (!el) return;

  const jobs    = activeJobs();
  const canEdit = can('canManageMaintenance');

  el.innerHTML = `
  <!-- Header -->
  <div class="al-header" style="margin-bottom:16px">
    <div>
      <div class="al-title">Maintenance</div>
      <div class="al-subtitle">Track repair jobs from request to resolution</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <!-- View toggle -->
      <div class="mj-view-toggle">
        <button class="mj-vt-btn ${_view==='board'?'mj-vt-active':''}" onclick="maintSetView('board')">⬛ Board</button>
        <button class="mj-vt-btn ${_view==='list'?'mj-vt-active':''}" onclick="maintSetView('list')">☰ List</button>
      </div>
      ${canEdit ? `<button class="btn btn-primary" onclick="maintOpenNew()">+ Log Job</button>` : ''}
    </div>
  </div>

  <!-- KPIs -->
  ${buildKPIs(jobs)}

  <!-- Main content -->
  <div id="mj-content">
    ${jobs.length === 0
      ? `<div class="mj-empty-state">
           <div style="font-size:3rem;margin-bottom:12px">🔧</div>
           <div style="font-weight:600;font-size:1rem;color:var(--text-primary);margin-bottom:6px">No maintenance jobs yet</div>
           <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:20px">Log a repair request and assign it to your caretaker.</div>
           ${canEdit ? `<button class="btn btn-primary" onclick="maintOpenNew()">+ Log First Job</button>` : ''}
         </div>`
      : (_view === 'board' ? boardView(jobs) : listView(jobs))
    }
  </div>`;
}

// ── Modal helpers ─────────────────────────────────────────
function populateBuildingSelect(selectedBldg) {
  const sel = document.getElementById('mj-building');
  if (!sel) return;
  sel.innerHTML = `<option value="">— Select —</option>`
    + AppState.buildings.map(b =>
        `<option value="${b.id}" ${b.id === selectedBldg ? 'selected' : ''}>${esc(b.name)}</option>`
      ).join('');
}

function populateUnitSelect(buildingId, selectedUnit) {
  const sel = document.getElementById('mj-unit');
  if (!sel) return;
  const units = AppState.units.filter(u => u.buildingId === buildingId && !u.deletedAt);
  if (!buildingId) {
    sel.innerHTML = `<option value="">— Select building first —</option>`;
    return;
  }
  sel.innerHTML = `<option value="">— Select unit —</option>`
    + units.map(u =>
        `<option value="${u.id}" ${u.id === selectedUnit ? 'selected' : ''}>${esc(u.number || u.unitNumber || u.id)}</option>`
      ).join('');
}

function clearModal() {
  ['mj-title','mj-description','mj-assigned','mj-notes','mj-due'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const priority = document.getElementById('mj-priority');
  const category = document.getElementById('mj-category');
  if (priority) priority.value = 'medium';
  if (category) category.value = 'general';

  const tenantWrap = document.getElementById('mj-tenant-wrap');
  const statusWrap = document.getElementById('mj-status-wrap');
  const notesWrap  = document.getElementById('mj-notes-wrap');
  if (tenantWrap) tenantWrap.style.display = 'none';
  if (statusWrap) statusWrap.style.display = 'none';
  if (notesWrap)  notesWrap.style.display  = 'none';

  const photoInput = document.getElementById('mj-photo');
  if (photoInput) photoInput.value = '';

  populateBuildingSelect(null);
  populateUnitSelect(null, null);
}

// ── Window globals ────────────────────────────────────────

window.maintSetView = function(view) {
  _view = view;
  render();
};

window.maintOpenNew = function() {
  if (!can('canManageMaintenance')) return;
  _editingId = null;
  clearModal();
  const title = document.getElementById('m-maint-title');
  if (title) title.textContent = '🔧 Log Maintenance Job';
  const btn = document.getElementById('btn-maint-save');
  if (btn) btn.textContent = 'Log Job';
  window.openModal('m-maint');
};

window.maintEdit = function(id) {
  const job = activeJobs().find(j => j.id === id);
  if (!job) return;
  _editingId = id;
  clearModal();

  // Fill fields
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  set('mj-title',       job.title);
  set('mj-description', job.description);
  set('mj-assigned',    job.assignedTo);
  set('mj-due',         job.dueDate);
  set('mj-priority',    job.priority || 'medium');
  set('mj-category',    job.category || 'general');

  populateBuildingSelect(job.buildingId);
  populateUnitSelect(job.buildingId, job.unitId);

  // Show tenant if set
  if (job.tenantName) {
    const tw = document.getElementById('mj-tenant-wrap');
    const ti = document.getElementById('mj-tenant');
    if (tw) tw.style.display = '';
    if (ti) ti.value = job.tenantName;
  }

  // Show status + notes in edit mode
  const statusWrap = document.getElementById('mj-status-wrap');
  const notesWrap  = document.getElementById('mj-notes-wrap');
  if (statusWrap) { statusWrap.style.display = ''; set('mj-status', job.status || 'open'); }
  if (notesWrap)  { notesWrap.style.display  = ''; set('mj-notes',  job.notes || ''); }

  const titleEl = document.getElementById('m-maint-title');
  if (titleEl) titleEl.textContent = can('canManageMaintenance') ? '✏️ Edit Job' : '🔧 Job Details';
  const btn = document.getElementById('btn-maint-save');
  if (btn) btn.textContent = can('canManageMaintenance') ? 'Save Changes' : 'Close';

  window.openModal('m-maint');
};

window.maintOnBuildingChange = function() {
  const bldgId  = document.getElementById('mj-building')?.value || '';
  populateUnitSelect(bldgId, null);
  // Clear tenant
  const tw = document.getElementById('mj-tenant-wrap');
  const ti = document.getElementById('mj-tenant');
  if (tw) tw.style.display = 'none';
  if (ti) ti.value = '';
};

window.maintOnUnitChange = function() {
  const unitId = document.getElementById('mj-unit')?.value || '';
  const tenant = AppState.tenants.find(t => t.unitId === unitId && !t.vacatedAt && !t.deletedAt);
  const tw = document.getElementById('mj-tenant-wrap');
  const ti = document.getElementById('mj-tenant');
  if (tenant) {
    if (tw) tw.style.display = '';
    if (ti) ti.value = tenant.name;
  } else {
    if (tw) tw.style.display = 'none';
    if (ti) ti.value = '';
  }
};

window.maintSaveForm = async function() {
  if (!can('canManageMaintenance')) { window.closeModal('m-maint'); return; }

  const g = id => document.getElementById(id)?.value?.trim() || '';
  const title = g('mj-title');
  if (!title) { toast.warning('Please enter a job title.'); return; }

  const bldgId = g('mj-building');
  const bldg   = AppState.buildings.find(b => b.id === bldgId);
  const unitId = g('mj-unit');
  const unit   = AppState.units.find(u => u.id === unitId);
  const tenant = AppState.tenants.find(t => t.unitId === unitId && !t.vacatedAt && !t.deletedAt);

  const btn = document.getElementById('btn-maint-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const data = {
      title,
      description:  g('mj-description'),
      category:     g('mj-category')  || 'general',
      priority:     g('mj-priority')  || 'medium',
      buildingId:   bldgId,
      buildingName: bldg?.name || '',
      unitId:       unitId,
      unitNumber:   unit?.number || unit?.unitNumber || '',
      tenantId:     tenant?.id  || '',
      tenantName:   tenant?.name || '',
      assignedTo:   g('mj-assigned'),
      dueDate:      g('mj-due')
    };

    if (_editingId) {
      const old = activeJobs().find(j => j.id === _editingId);
      const patch = { ...data, status: g('mj-status') || 'open', notes: g('mj-notes') };
      await updateMaintenanceJob(_editingId, patch, old);
      // Upload any newly-added photos in edit mode too
      const photoInput = document.getElementById('mj-photo');
      if (photoInput?.files?.length) {
        const uploads = Array.from(photoInput.files).slice(0, 3)
          .map(f => uploadJobPhoto(_editingId, f));
        await Promise.all(uploads);
      }
    } else {
      const newId = await addMaintenanceJob(data);
      // Upload photos if selected
      const photoInput = document.getElementById('mj-photo');
      if (photoInput?.files?.length) {
        const uploads = Array.from(photoInput.files).slice(0, 3)
          .map(f => uploadJobPhoto(newId, f));
        await Promise.all(uploads);
      }
    }

    toast.success(_editingId ? 'Job updated.' : 'Job logged!');
    window.closeModal('m-maint');
  } catch (err) {
    console.error('maintSaveForm error:', err);
    toast.error(`Save failed: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _editingId ? 'Save Changes' : 'Log Job'; }
  }
};

window.maintAdvance = async function(id) {
  if (!can('canManageMaintenance')) return;
  const job    = activeJobs().find(j => j.id === id);
  if (!job) return;
  const status = STATUSES.find(s => s.key === job.status);
  if (!status?.next) return;
  try {
    await updateMaintenanceJob(id, { status: status.next }, job);
    toast.success(`Job moved to "${STATUSES.find(s => s.key === status.next)?.label}".`);
  } catch (err) {
    toast.error(`Failed: ${err.message}`);
  }
};

window.maintDelete = async function(id, title) {
  if (!can('canDeleteRecords')) return;
  const ok = await confirmDialog(
    `Permanently delete "${title}"? This cannot be undone.`,
    'Delete Maintenance Job'
  );
  if (!ok) return;
  try {
    await deleteMaintenanceJob(id, title);
    toast.success('Job deleted.');
  } catch (err) {
    toast.error(`Delete failed: ${err.message}`);
  }
};

window.maintListFilter = function() {
  _listFilters.status   = document.getElementById('mj-f-status')?.value   || '';
  _listFilters.priority = document.getElementById('mj-f-priority')?.value || '';
  _listFilters.building = document.getElementById('mj-f-building')?.value || '';
  _listFilters.category = document.getElementById('mj-f-category')?.value || '';
  render();
};

window.maintClearListFilters = function() {
  _listFilters = { status: '', priority: '', building: '', category: '' };
  render();
};
