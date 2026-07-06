// ============================================================
// PropOS — Documents Page
// Document management with Firebase Storage
// ============================================================

import { AppState } from '../store.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import { closeModal, confirmDialog } from '../components/modal.js';
import { uploadDocument, deleteDocument, filterDocuments, formatFileSize, getDocumentTypeLabel } from '../services/documentService.js';

let entityTypeFilter = '';
let entityIdFilter = '';

export function render() {
  const el = document.getElementById('page-documents');
  if (!el) return;

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Documents</div>
      <div class="page-sub">Manage leases, IDs, receipts, and other files</div>
    </div>

    <!-- Filters -->
    <div class="search-row">
      <select class="form-select" style="width:auto" id="doc-entity-type" onchange="docEntityTypeFilter(this.value)">
        <option value="">All Types</option>
        <option value="tenant" ${entityTypeFilter === 'tenant' ? 'selected' : ''}>Tenant Documents</option>
        <option value="building" ${entityTypeFilter === 'building' ? 'selected' : ''}>Building Documents</option>
        <option value="general" ${entityTypeFilter === 'general' ? 'selected' : ''}>General Documents</option>
      </select>
      ${entityTypeFilter === 'tenant' ? `
        <select class="form-select" style="width:auto" id="doc-entity-id" onchange="docEntityIdFilter(this.value)">
          <option value="">All Tenants</option>
          ${AppState.tenants.map(t =>
            `<option value="${t.id}" ${entityIdFilter === t.id ? 'selected' : ''}>${esc(t.name)}</option>`
          ).join('')}
        </select>
      ` : ''}
      ${entityTypeFilter === 'building' ? `
        <select class="form-select" style="width:auto" id="doc-entity-id" onchange="docEntityIdFilter(this.value)">
          <option value="">All Buildings</option>
          ${AppState.buildings.map(b =>
            `<option value="${b.id}" ${entityIdFilter === b.id ? 'selected' : ''}>${esc(b.name)}</option>`
          ).join('')}
        </select>
      ` : ''}
      ${can('canManageDocuments') ? `
        <button class="btn btn-primary btn-sm" onclick="openUploadModal()">+ Upload Document</button>
      ` : ''}
    </div>

    <!-- Documents List -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th>Entity</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="docs-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  renderDocumentRows();
}

function renderDocumentRows() {
  const tbody = document.getElementById('docs-tbody');
  if (!tbody) return;

  const documents = filterDocuments(entityTypeFilter, entityIdFilter);

  if (!documents.length) {
    tbody.innerHTML = `
      <tr><td colspan="6" class="table-empty">
        <div class="empty-icon">📄</div>
        <p>No documents found</p>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = documents.map(doc => {
    let entityName = 'General';
    if (doc.entityType === 'tenant') {
      const tenant = AppState.tenants.find(t => t.id === doc.entityId);
      entityName = tenant ? tenant.name : 'Unknown Tenant';
    } else if (doc.entityType === 'building') {
      const building = AppState.buildings.find(b => b.id === doc.entityId);
      entityName = building ? building.name : 'Unknown Building';
    }

    const uploadedDate = doc.uploadedAt ? 
      (doc.uploadedAt.toDate ? doc.uploadedAt.toDate().toLocaleDateString() : doc.uploadedAt) : 
      'Unknown';

    return `<tr>
      <td>
        <div class="doc-name-cell">
          <div class="doc-icon">📄</div>
          <div>
            <div class="doc-name">${esc(doc.name)}</div>
            <div class="doc-filename">${esc(doc.fileName)}</div>
          </div>
        </div>
      </td>
      <td><span class="badge badge-gray">${getDocumentTypeLabel(doc.documentType)}</span></td>
      <td style="color:var(--text-secondary)">${esc(entityName)}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${formatFileSize(doc.fileSize)}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${uploadedDate}</td>
      <td style="white-space:nowrap">
        <a href="${doc.downloadURL}" target="_blank" class="btn btn-ghost btn-xs">👁️ View</a>
        <a href="${doc.downloadURL}" download="${doc.fileName}" class="btn btn-ghost btn-xs">⬇️ Download</a>
        ${can('canManageDocuments') ? `
          <button class="btn btn-ghost btn-xs" onclick="deleteDocAction('${doc.id}')">🗑</button>
        ` : ''}
      </td>
    </tr>`;
  }).join('');
}

window.docEntityTypeFilter = function(value) {
  entityTypeFilter = value;
  entityIdFilter = '';
  render();
};

window.docEntityIdFilter = function(value) {
  entityIdFilter = value;
  renderDocumentRows();
};

window.openUploadModal = function() {
  clearUploadForm();
  document.getElementById('m-doc-title').textContent = 'Upload Document';
  openModal('m-document');
};

window.saveDocumentForm = async function() {
  const fileInput = document.getElementById('doc-file');
  const file = fileInput.files[0];
  
  if (!file) return toast.error('Please select a file to upload');
  
  const name = document.getElementById('doc-name').value.trim();
  const entityType = document.getElementById('doc-entity-type-upload').value;
  const entityId = document.getElementById('doc-entity-id-upload').value;
  const documentType = document.getElementById('doc-type').value;
  
  if (!entityType) return toast.error('Please select entity type');
  if (entityType !== 'general' && !entityId) return toast.error('Please select entity');
  
  const btn = document.getElementById('btn-save-doc');
  btn.classList.add('loading');
  btn.disabled = true;
  
  try {
    await uploadDocument(file, {
      name: name || file.name,
      entityType,
      entityId,
      documentType
    });
    toast.success('Document uploaded successfully!');
    closeModal('m-document');
    clearUploadForm();
    render();
  } catch(e) {
    toast.error(e.message);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
};

window.deleteDocAction = async function(id) {
  const doc = AppState.documents.find(d => d.id === id);
  if (!doc) return;
  
  const ok = await confirmDialog(
    `Delete document "${doc.name}"? This action cannot be undone.`,
    'Delete Document'
  );
  if (!ok) return;
  
  try {
    await deleteDocument(id);
    toast.success('Document deleted');
    render();
  } catch(e) {
    toast.error(e.message);
  }
};

window.docEntityTypeChange = function(value) {
  const entityIdSelect = document.getElementById('doc-entity-id-upload');
  if (!entityIdSelect) return;
  
  if (value === 'tenant') {
    entityIdSelect.innerHTML = '<option value="">Select Tenant</option>' +
      AppState.tenants.map(t =>
        `<option value="${t.id}">${esc(t.name)}</option>`
      ).join('');
  } else if (value === 'building') {
    entityIdSelect.innerHTML = '<option value="">Select Building</option>' +
      AppState.buildings.map(b =>
        `<option value="${b.id}">${esc(b.name)}</option>`
      ).join('');
  } else {
    entityIdSelect.innerHTML = '<option value="">General (no entity)</option>';
    entityIdSelect.disabled = true;
  }
  
  if (value !== 'general') {
    entityIdSelect.disabled = false;
  }
};

function clearUploadForm() {
  const fileInput = document.getElementById('doc-file');
  if (fileInput) fileInput.value = '';
  
  ['doc-name', 'doc-entity-type-upload', 'doc-entity-id-upload', 'doc-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const entityTypeSelect = document.getElementById('doc-entity-type-upload');
  if (entityTypeSelect) entityTypeSelect.value = '';
  
  const entityIdSelect = document.getElementById('doc-entity-id-upload');
  if (entityIdSelect) {
    entityIdSelect.innerHTML = '<option value="">Select Entity Type First</option>';
    entityIdSelect.disabled = true;
  }
}

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
