// ============================================================
// PropOS — Expenses Page
// ============================================================

import { AppState, ksh, getToday, getCurMonth, monthLabel } from '../store.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import { closeModal, confirmDialog } from '../components/modal.js';
import { addExpense, deleteExpense } from '../services/expenseService.js';

export function render() {
  const el = document.getElementById('page-expenses');
  if (!el) return;

  // Build month options from existing expenses
  const months = [...new Set(AppState.expenses.map(e => e.date?.substr(0,7)))]
    .filter(Boolean).sort().reverse();
  if (!months.includes(getCurMonth())) months.unshift(getCurMonth());

  // Build category options
  const categories = [...new Set(AppState.expenses.map(e => e.category))]
    .filter(Boolean).sort();

  el.innerHTML = `
    <div class="expense-filters">
      <input type="text" class="search-input" id="e-search"
        placeholder="Search expense, payee, or receipt..." oninput="renderExpenseRows()"/>
      <select class="form-select" id="e-month" onchange="renderExpenseRows()">
        <option value="">All Time</option>
        ${months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('')}
      </select>
      <select class="form-select" id="e-category" onchange="renderExpenseRows()">
        <option value="">All Categories</option>
        ${categories.map(c => `<option value="${c}">${esc(c)}</option>`).join('')}
      </select>
      <select class="form-select" id="e-bldg" onchange="renderExpenseRows()">
        <option value="">All Buildings</option>
        ${AppState.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
      </select>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table class="expense-table">
          <thead><tr>
            <th>Date</th><th>Category</th><th>Description</th>
            <th>Building</th><th>Payee</th><th>Receipt #</th>
            <th>Amount</th><th>Actions</th>
          </tr></thead>
          <tbody id="e-tbody"></tbody>
        </table>
      </div>
    </div>`;

  renderExpenseRows();
}

window.renderExpenseRows = function() {
  const tbody = document.getElementById('e-tbody');
  if (!tbody) return;
  const search = (document.getElementById('e-search')?.value || '').toLowerCase();
  const month = document.getElementById('e-month')?.value || '';
  const category = document.getElementById('e-category')?.value || '';
  const bldg = document.getElementById('e-bldg')?.value || '';

  let expenses = [...AppState.expenses].sort((a,b) => b.date?.localeCompare(a.date));
  if (search) expenses = expenses.filter(e => {
    return e.description?.toLowerCase().includes(search) ||
           e.payee?.toLowerCase().includes(search) ||
           e.receiptNo?.toLowerCase().includes(search);
  });
  if (month) expenses = expenses.filter(e => e.date?.startsWith(month));
  if (category) expenses = expenses.filter(e => e.category === category);
  if (bldg) expenses = expenses.filter(e => e.buildingId === bldg);

  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="expense-empty">
      <div class="empty-icon">💸</div><p>No expenses found</p></td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map(e => {
    const b = AppState.buildings.find(b => b.id === e.buildingId);
    return `<tr>
      <td style="color:var(--text-muted);font-size:0.82rem">${e.date}</td>
      <td><span class="expense-category">${esc(e.category)}</span></td>
      <td>${esc(e.description)}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${b ? esc(b.name) : '—'}</td>
      <td>${esc(e.payee)}</td>
      <td style="color:var(--text-muted);font-size:0.8rem;font-family:var(--font-mono)">${e.receiptNo || '—'}</td>
      <td class="expense-amount">${ksh(e.amount)}</td>
      <td class="expense-actions">
        ${can('canManageExpenses') ? `
          <button class="btn btn-ghost btn-xs" onclick="deleteExpenseAction('${e.id}')">🗑</button>
        ` : ''}
      </td>
    </tr>`;
  }).join('');
};

export function initExpenseModal() {
  const bldgSel = document.getElementById('ex-building');
  if (bldgSel) {
    bldgSel.innerHTML = '<option value="">Select Building</option>' +
      AppState.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  }

  const dateEl = document.getElementById('ex-date');
  if (dateEl) dateEl.value = getToday();

  const amtEl = document.getElementById('ex-amount');
  if (amtEl) amtEl.value = '';

  const descEl = document.getElementById('ex-desc');
  if (descEl) descEl.value = '';

  const payeeEl = document.getElementById('ex-payee');
  if (payeeEl) payeeEl.value = '';

  const receiptEl = document.getElementById('ex-receipt');
  if (receiptEl) receiptEl.value = '';

  const saveBtn = document.getElementById('btn-save-expense');
  if (saveBtn) saveBtn.onclick = saveExpenseForm;
}

window.saveExpenseForm = async function() {
  const buildingId = document.getElementById('ex-building')?.value;
  const category = document.getElementById('ex-category')?.value;
  const amount = parseFloat(document.getElementById('ex-amount')?.value) || 0;
  const description = document.getElementById('ex-desc')?.value;

  if (!category) return toast.error('Please select a category');
  if (!amount) return toast.error('Please enter an amount');
  if (!description) return toast.error('Please enter a description');

  const btn = document.getElementById('btn-save-expense');
  btn.classList.add('loading'); btn.disabled = true;

  try {
    await addExpense({
      buildingId,
      category,
      amount,
      date: document.getElementById('ex-date')?.value || getToday(),
      description,
      payee: document.getElementById('ex-payee')?.value || '',
      receiptNo: document.getElementById('ex-receipt')?.value || ''
    });
    toast.success(`${ksh(amount)} expense recorded successfully!`);
    closeModal('m-expense');
    clearExpenseForm();
    render();
  } catch(e) { toast.error(e.message); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
};

function clearExpenseForm() {
  ['ex-amount','ex-desc','ex-payee','ex-receipt'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const bldgSel = document.getElementById('ex-building');
  if (bldgSel) bldgSel.value = '';
  const catSel = document.getElementById('ex-category');
  if (catSel) catSel.value = '';
}

window.deleteExpenseAction = async function(id) {
  const ok = await confirmDialog('Delete this expense record? This cannot be undone.', 'Delete Expense');
  if (!ok) return;
  try { await deleteExpense(id); toast.success('Expense deleted'); render(); }
  catch(e) { toast.error(e.message); }
};

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
