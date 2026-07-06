// ============================================================
// PropOS — Buildings Page
// Renders building cards list and building detail with units
// ============================================================

import { AppState, ksh } from '../store.js';
import { router } from '../router.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import {
  addBuilding, updateBuilding, deleteBuilding
} from '../services/buildingService.js';
import {
  addUnit, updateUnit, deleteUnit,
  getUnitsForBuilding
} from '../services/unitService.js';

// ── BUILDINGS LIST ─────────────────────────────────────────
export function render() {
  const el = document.getElementById('page-buildings');
  if (!el) return;

  if (!AppState.buildings.length) {
    el.innerHTML = `
      <div class="bldg-grid">
        <div class="bldg-empty">
          <div class="bldg-empty-icon">🏢</div>
          <h3>No buildings yet</h3>
          <p>Add your first building or load sample data to explore.</p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
            ${can('canManageBuildings')
              ? `<button class="btn btn-primary" onclick="openAddBuildingModal()">+ Add Building</button>`
              : ''}
            <button class="btn btn-ghost" onclick="triggerSeed()">🌱 Load Sample Data</button>
          </div>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="bldg-grid">${
    AppState.buildings.map(b => buildingCard(b)).join('')
  }</div>`;
}

function buildingCard(b) {
  const units    = AppState.units.filter(u => u.buildingId === b.id);
  const occupied = units.filter(u => u.status === 'occupied').length;
  const vacant   = units.length - occupied;
  const monthly  = units.filter(u => u.status === 'occupied').reduce((s,u) => s+(u.rent||0), 0);
  const occPct   = units.length ? Math.round(occupied/units.length*100) : 0;

  return `
    <div class="bldg-card" onclick="navToBuilding('${b.id}')">
      <div class="bldg-card-header">
        <div>
          <div class="bldg-name">${esc(b.name)}</div>
          <div class="bldg-location">📍 ${esc(b.location)}</div>
        </div>
        <div class="bldg-actions" onclick="event.stopPropagation()">
          ${can('canManageBuildings') ? `
            <button class="btn btn-ghost btn-xs" onclick="editBuildingModal('${b.id}')">✏️</button>
            <button class="btn btn-ghost btn-xs" onclick="deleteBuildingAction('${b.id}')">🗑</button>
          ` : ''}
        </div>
      </div>
      <div class="bldg-stats">
        <div class="bstat"><strong style="color:var(--blue)">${units.length}</strong><span>Units</span></div>
        <div class="bstat"><strong style="color:var(--green)">${occupied}</strong><span>Occupied</span></div>
        <div class="bstat"><strong style="color:var(--text-muted)">${vacant}</strong><span>Vacant</span></div>
        <div class="bstat"><strong style="color:var(--accent-light);font-size:0.9rem">${ksh(monthly)}</strong><span>Monthly</span></div>
      </div>
      <div class="bldg-occupancy-bar">
        <div class="bldg-occupancy-fill" style="width:${occPct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span style="font-size:0.7rem;color:var(--text-muted)">${b.floors||1} floor${b.floors!=1?'s':''}</span>
        <span style="font-size:0.7rem;color:var(--text-muted)">${occPct}% occupied</span>
      </div>
    </div>`;
}

// ── BUILDING DETAIL ────────────────────────────────────────
export function renderDetail() {
  const el = document.getElementById('page-bdetail');
  if (!el) return;

  const b = AppState.buildings.find(b => b.id === AppState.selectedBuildingId);
  if (!b) { el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Building not found.</div>'; return; }

  const units = AppState.units.filter(u => u.buildingId === b.id).sort((a,b) => a.number.localeCompare(b.number, undefined, {numeric:true, sensitivity:"base"}));
  const occupied = units.filter(u => u.status === 'occupied').length;
  const monthly  = units.filter(u => u.status === 'occupied').reduce((s,u) => s+u.rent, 0);

  // Update topbar
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = b.name;
  const subEl = document.getElementById('topbar-sub');
  if (subEl) subEl.textContent = '📍 ' + b.location;

  el.innerHTML = `
    <div class="back-btn" onclick="router.nav('buildings')">← Back to Buildings</div>

    <div class="bdetail-header">
      <div>
        <div class="bdetail-title">${esc(b.name)}</div>
        <div class="bdetail-location">📍 ${esc(b.location)}${b.notes ? ' · ' + esc(b.notes) : ''} · ${b.floors||1} floor${b.floors!=1?'s':''}</div>
      </div>
      <div style="display:flex;gap:8px;">
        ${can('canManageBuildings') ? `<button class="btn btn-ghost btn-sm" onclick="editBuildingModal('${b.id}')">✏️ Edit</button>` : ''}
        ${can('canManageUnits') ? `<button class="btn btn-primary btn-sm" onclick="openAddUnitModal()">+ Add Unit</button>` : ''}
      </div>
    </div>

    <div class="kpi-row" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:24px;">
      <div class="kpi-card blue loaded" style="--bar-width:100%">
        <div class="kpi-label">Total Units</div>
        <div class="kpi-value">${units.length}</div>
      </div>
      <div class="kpi-card green loaded" style="--bar-width:${units.length?occupied/units.length*100:0}%">
        <div class="kpi-label">Occupied</div>
        <div class="kpi-value">${occupied}</div>
      </div>
      <div class="kpi-card loaded" style="--bar-width:${units.length?(units.length-occupied)/units.length*100:0}%">
        <div class="kpi-label">Vacant</div>
        <div class="kpi-value">${units.length-occupied}</div>
      </div>
      <div class="kpi-card accent loaded" style="--bar-width:80%">
        <div class="kpi-label">Monthly Rent</div>
        <div class="kpi-value" style="font-size:1.1rem">${ksh(monthly)}</div>
      </div>
    </div>

    <div class="section-header">
      <div class="section-title">Units (${units.length})</div>
    </div>

    ${units.length ? `
      <div class="units-grid">${units.map(u => unitTile(u)).join('')}</div>
    ` : `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
        <div style="font-size:2.5rem;margin-bottom:12px">🚪</div>
        <p style="margin-bottom:16px">No units yet. Add your first unit.</p>
        ${can('canManageUnits') ? `<button class="btn btn-primary" onclick="openAddUnitModal()">+ Add Unit</button>` : ''}
      </div>
    `}
  `;

  // Animate KPI bars
  setTimeout(() => {
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.add('loaded'));
  }, 100);
}

function unitTile(u) {
  const tenant = AppState.tenants.find(t => t.unitId === u.id);
  let cls = u.status || 'vacant';
  let balHtml = '';
  let tenantName = 'Vacant';

  if (tenant) {
    tenantName = tenant.name;
    const bal = tenant.openingBalance || 0;
    if (bal > 0) {
      cls = 'arrears';
      balHtml = `<div class="unit-balance" style="color:var(--red)">${ksh(bal)} owed</div>`;
    } else if (bal < 0) {
      cls = 'credit';
      balHtml = `<div class="unit-balance" style="color:var(--blue)">Credit ${ksh(Math.abs(bal))}</div>`;
    } else {
      cls = 'occupied';
      balHtml = `<div class="unit-balance" style="color:var(--green)">Clear ✓</div>`;
    }
  }

  return `
    <div class="unit-tile ${cls}">
      <div class="unit-number">${esc(u.number)}</div>
      <div class="unit-type">${esc(u.type)}</div>
      <div class="unit-tenant">${esc(tenantName)}</div>
      <div class="unit-rent">${ksh(u.rent)}/mo</div>
      ${balHtml}
      <div class="unit-tile-actions" onclick="event.stopPropagation()">
        ${can('canManageUnits') ? `
          <button class="btn btn-ghost btn-xs" onclick="editUnitModal('${u.id}')">✏️</button>
          <button class="btn btn-ghost btn-xs" onclick="deleteUnitAction('${u.id}')">🗑</button>
        ` : ''}
      </div>
    </div>`;
}

// ── GLOBALS FOR HTML ONCLICK ───────────────────────────────
window.navToBuilding = id => router.nav('bdetail', { buildingId: id });

window.openAddBuildingModal = function() {
  clearBuildingForm();
  document.getElementById('m-building-title').textContent = 'Add Building';
  document.getElementById('m-building-id').value = '';
  openModal('m-building');
};

window.saveBuildingForm = async function() {
  const id   = document.getElementById('m-building-id').value;
  const name = document.getElementById('b-name').value.trim();
  const loc  = document.getElementById('b-loc').value.trim();
  if (!name || !loc) return toast.error('Name and location required');

  const btn = document.getElementById('btn-save-building');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = {
      name, location: loc,
      floors: document.getElementById('b-floors').value || 1,
      notes:  document.getElementById('b-notes').value
    };
    if (id) { await updateBuilding(id, data); toast.success('Building updated!'); }
    else     { await addBuilding(data);        toast.success('Building added!'); }
    closeModal('m-building');
    clearBuildingForm();
    if (id) renderDetail(); else render();
  } catch(e) { toast.error(e.message); }
  finally    { btn.classList.remove('loading'); btn.disabled = false; }
};

window.editBuildingModal = function(id) {
  const b = AppState.buildings.find(b => b.id === id);
  if (!b) return;
  document.getElementById('m-building-title').textContent = 'Edit Building';
  document.getElementById('m-building-id').value = b.id;
  document.getElementById('b-name').value        = b.name     || '';
  document.getElementById('b-loc').value         = b.location || '';
  document.getElementById('b-floors').value      = b.floors   || 1;
  document.getElementById('b-notes').value       = b.notes    || '';
  openModal('m-building');
};

window.deleteBuildingAction = async function(id) {
  const b  = AppState.buildings.find(b => b.id === id);
  const ok = await confirmDialog(`Delete "${b?.name}"? All units will be removed.`, 'Delete Building');
  if (!ok) return;
  try { await deleteBuilding(id); toast.success('Building deleted'); render(); }
  catch(e) { toast.error(e.message); }
};

function clearBuildingForm() {
  ['b-name','b-loc','b-floors','b-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

window.openAddUnitModal = function() {
  clearUnitForm();
  document.getElementById('m-unit-title').textContent = 'Add Unit';
  document.getElementById('m-unit-id').value = '';
  openModal('m-unit');
};

window.saveUnitForm = async function() {
  const id  = document.getElementById('m-unit-id').value;
  const num = document.getElementById('u-num').value.trim();
  const rnt = document.getElementById('u-rent').value;
  if (!num || !rnt) return toast.error('Unit number and rent required');

  const btn = document.getElementById('btn-save-unit');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = {
      number: num,
      type:   document.getElementById('u-type').value,
      rent:   rnt,
      floor:  document.getElementById('u-floor').value || 0,
      notes:  document.getElementById('u-notes').value
    };
    if (id) { await updateUnit(id, data); toast.success('Unit updated!'); }
    else     { await addUnit(AppState.selectedBuildingId, data); toast.success('Unit added!'); }
    closeModal('m-unit');
    clearUnitForm();
    renderDetail();
  } catch(e) { toast.error(e.message); }
  finally    { btn.classList.remove('loading'); btn.disabled = false; }
};

window.editUnitModal = function(id) {
  const u = AppState.units.find(u => u.id === id);
  if (!u) return;
  document.getElementById('m-unit-title').textContent = 'Edit Unit';
  document.getElementById('m-unit-id').value  = u.id;
  document.getElementById('u-num').value       = u.number || '';
  document.getElementById('u-type').value      = u.type   || '1 Bedroom';
  document.getElementById('u-rent').value      = u.rent   || '';
  document.getElementById('u-floor').value     = u.floor  || 0;
  document.getElementById('u-notes').value     = u.notes  || '';
  openModal('m-unit');
};

window.deleteUnitAction = async function(id) {
  const u = AppState.units.find(u => u.id === id);
  const t = AppState.tenants.find(t => t.unitId === id);
  if (t) return toast.error(`Cannot delete — ${t.name} is in this unit. Vacate tenant first.`);
  const ok = await confirmDialog(`Delete unit "${u?.number}"?`, 'Delete Unit');
  if (!ok) return;
  try { await deleteUnit(id); toast.success('Unit deleted'); renderDetail(); }
  catch(e) { toast.error(e.message); }
};

function clearUnitForm() {
  ['u-num','u-rent','u-floor','u-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const t = document.getElementById('u-type'); if (t) t.value = '1 Bedroom';
}

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── SEED TRIGGER ───────────────────────────────────────────
window.triggerSeed = async function() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ Loading...';
  try {
    const { seedDatabase, isSeeded } = await import('../services/seedService.js');
    const already = await isSeeded();
    if (already) {
      const { toast } = await import('../components/toast.js');
      toast.warning('Sample data already exists in your database.');
      btn.disabled = false;
      btn.textContent = '🌱 Load Sample Data';
      return;
    }
    await seedDatabase(msg => console.log(msg));
    const { toast } = await import('../components/toast.js');
    toast.success('Sample data loaded! Refreshing...');
    setTimeout(() => location.reload(), 1000);
  } catch(e) {
    const { toast } = await import('../components/toast.js');
    toast.error('Seed failed: ' + e.message);
    btn.disabled = false;
    btn.textContent = '🌱 Load Sample Data';
  }
};
