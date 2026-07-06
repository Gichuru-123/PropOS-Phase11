import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { AppState, getToday } from '../store.js';
import { logActivity } from './activityService.js';
import { currentProfile } from '../auth.js';

const COL = 'expenses';

export function listenExpenses(onUpdate) {
  const q = query(collection(db, COL), where('deletedAt', '==', null));
  return onSnapshot(q, snap => {
    AppState.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate(AppState.expenses);
  }, err => console.error('Expenses listener error:', err));
}

export async function addExpense(data) {
  const payload = {
    buildingId: data.buildingId || '', category: data.category || 'Other',
    amount: Number(data.amount) || 0, date: data.date || getToday(),
    description: data.description || '', receiptNo: data.receiptNo || '',
    payee: data.payee || '', receiptURL: '',
    createdAt: serverTimestamp(), createdBy: currentProfile?.uid || '', deletedAt: null
  };
  const ref = await addDoc(collection(db, COL), payload);
  await logActivity('ADD_EXPENSE', 'expense', ref.id, `Added expense: ${payload.category} KSh ${payload.amount}`, null, payload);
  return ref.id;
}

export async function deleteExpense(id) {
  const e = AppState.expenses.find(e => e.id === id);
  await updateDoc(doc(db, COL, id), { deletedAt: serverTimestamp() });
  await logActivity('DELETE_EXPENSE', 'expense', id, `Deleted expense: ${e?.category} KSh ${e?.amount}`, e, null);
}

export function getExpensesForMonth(month) {
  return AppState.expenses.filter(e => e.date?.startsWith(month));
}

export function getExpensesForBuilding(buildingId) {
  return AppState.expenses.filter(e => e.buildingId === buildingId);
}
