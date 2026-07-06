import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { AppState, getToday } from '../store.js';
import { logActivity } from './activityService.js';
import { currentProfile } from '../auth.js';

const COL = 'transactions';

export function listenPayments(onUpdate) {
  const q = query(collection(db, COL), where('deletedAt', '==', null), where('direction', '==', 'credit'));
  return onSnapshot(q, snap => {
    AppState.payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate(AppState.payments);
  }, err => console.error('Payments listener error:', err));
}

export function listenTransactions(onUpdate) {
  const q = query(collection(db, COL), where('deletedAt', '==', null));
  return onSnapshot(q, snap => {
    AppState.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate(AppState.transactions);
  }, err => console.error('Transactions listener error:', err));
}

export function getPaymentsForTenant(tenantId) {
  return AppState.payments.filter(p => p.tenantId === tenantId);
}

export function getTransactionsForTenant(tenantId) {
  return AppState.transactions.filter(t => t.tenantId === tenantId);
}

export async function recordPayment(data) {
  const tenant = AppState.tenants.find(t => t.id === data.tenantId);
  if (data.ref && data.ref.trim()) {
    const dup = AppState.payments.find(p => p.reference === data.ref.trim() && p.tenantId === data.tenantId);
    if (dup) throw new Error(`Reference "${data.ref}" already exists for this tenant.`);
  }
  const payload = {
    tenantId: data.tenantId, unitId: tenant?.unitId || '',
    buildingId: tenant?.buildingId || '', type: 'PAYMENT', direction: 'credit',
    amount: Number(data.amount), date: data.date || getToday(),
    month: (data.date || getToday()).substr(0, 7),
    description: `Payment (${data.method}${data.ref ? ' · ' + data.ref : ''})`,
    reference: data.ref || '', method: data.method || 'M-PESA',
    notes: data.notes || '', createdAt: serverTimestamp(),
    createdBy: currentProfile?.uid || '', deletedAt: null,
    metadata: { smsRaw: data.smsRaw || '', bank: data.bank || '', senderPhone: data.senderPhone || '', senderName: data.senderName || '' }
  };
  const ref = await addDoc(collection(db, COL), payload);
  await logActivity('RECORD_PAYMENT', 'payment', ref.id, `Recorded payment of KSh ${data.amount} for ${tenant?.name}`, null, payload);
  return { id: ref.id, ...payload };
}

export async function deletePayment(id) {
  const p = AppState.payments.find(p => p.id === id);
  await updateDoc(doc(db, COL, id), { deletedAt: serverTimestamp() });
  await logActivity('DELETE_PAYMENT', 'payment', id, `Deleted payment of KSh ${p?.amount}`, p, null);
}

export function getPaymentsForMonth(month) {
  return AppState.payments.filter(p => p.date?.startsWith(month));
}
