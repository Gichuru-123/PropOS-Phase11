import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc,
  getDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { AppState, getToday } from '../store.js';
import { logActivity } from './activityService.js';
import { occupyUnit, vacateUnit } from './unitService.js';
import { currentProfile } from '../auth.js';

const COL = 'tenants';

export function listenTenants(onUpdate) {
  const q = query(collection(db, COL), where('deletedAt', '==', null));
  return onSnapshot(q, snap => {
    AppState.tenants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate(AppState.tenants);
  }, err => console.error('Tenants listener error:', err));
}

export async function getTenant(id) {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addTenant(data) {
  const moveIn = data.moveIn || getToday();
  // Use explicit openBalDate from the form (Billing Start Month field).
  // This is chosen by the user — never auto-calculated.
  // Default to current month only if not provided.
  const curMonth    = new Date().toISOString().substr(0, 7);
  const openBalDate = data.openBalDate || curMonth;
  const payload = {
    name: data.name.trim(), idNumber: data.idNumber || '',
    phone: normalisePhone(data.phone), email: data.email || '',
    photoURL: '', buildingId: data.buildingId || '', unitId: data.unitId || '',
    moveIn, leaseEnd: data.leaseEnd || '', payMethod: data.payMethod || 'M-PESA',
    deposit: Number(data.deposit) || 0, emergency: data.emergency || '',
    openingBalance: Number(data.openingBalance) || 0,
    openBalDate,     // explicitly chosen by user — billing start month
    status: 'active', vacatedAt: null, notes: '', healthScore: 100,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    deletedAt: null, createdBy: currentProfile?.uid || ''
  };
  const ref = await addDoc(collection(db, COL), payload);
  if (data.unitId) await occupyUnit(data.unitId, ref.id);
  await logActivity('ADD_TENANT', 'tenant', ref.id, `Added tenant: ${payload.name}`, null, payload);
  return ref.id;
}

export async function updateTenant(id, data) {
  const old = AppState.tenants.find(t => t.id === id);
  if (old?.unitId && old.unitId !== data.unitId) await vacateUnit(old.unitId);
  if (data.unitId && data.unitId !== old?.unitId) await occupyUnit(data.unitId, id);
  const payload = {
    name: data.name.trim(), idNumber: data.idNumber || '',
    phone: normalisePhone(data.phone), email: data.email || '',
    buildingId: data.buildingId || '', unitId: data.unitId || '',
    moveIn: data.moveIn || '', leaseEnd: data.leaseEnd || '',
    payMethod: data.payMethod || 'M-PESA', deposit: Number(data.deposit) || 0,
    emergency: data.emergency || '', openingBalance: Number(data.openingBalance) || 0,
    // openBalDate is never changed on edit — preserves original billing start
    updatedAt: serverTimestamp()
  };
  await updateDoc(doc(db, COL, id), payload);
  await logActivity('EDIT_TENANT', 'tenant', id, `Updated tenant: ${payload.name}`, old, payload);
}

export async function deleteTenant(id) {
  const t = AppState.tenants.find(t => t.id === id);
  if (t?.unitId) await vacateUnit(t.unitId);
  await updateDoc(doc(db, COL, id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await logActivity('DELETE_TENANT', 'tenant', id, `Deleted tenant: ${t?.name}`, t, null);
}

export function normalisePhone(raw = '') {
  let p = raw.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (p.startsWith('+'))   return p;
  if (p.startsWith('254')) return '+' + p;
  if (p.startsWith('0'))   return '+254' + p.slice(1);
  if (p.length === 9)      return '+254' + p;
  return p;
}
