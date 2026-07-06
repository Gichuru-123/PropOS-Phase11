import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc,
  getDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { AppState } from '../store.js';
import { logActivity } from './activityService.js';
import { currentProfile } from '../auth.js';

const COL = 'units';

export function listenUnits(onUpdate) {
  const q = query(collection(db, COL), where('deletedAt', '==', null));
  return onSnapshot(q, snap => {
    AppState.units = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate(AppState.units);
  }, err => console.error('Units listener error:', err));
}

export function getUnitsForBuilding(buildingId) {
  return AppState.units.filter(u => u.buildingId === buildingId);
}

export function getVacantUnits(buildingId) {
  return AppState.units.filter(u => u.buildingId === buildingId && u.status === 'vacant');
}

export async function getUnit(id) {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addUnit(buildingId, data) {
  const payload = {
    buildingId, number: data.number.trim(), type: data.type || '1 Bedroom',
    rent: Number(data.rent) || 0, floor: Number(data.floor) || 0,
    notes: data.notes || '', status: 'vacant', currentTenantId: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    deletedAt: null, createdBy: currentProfile?.uid || ''
  };
  const ref = await addDoc(collection(db, COL), payload);
  await logActivity('ADD_UNIT', 'unit', ref.id, `Added unit ${payload.number}`, null, payload);
  return ref.id;
}

export async function updateUnit(id, data) {
  const old = AppState.units.find(u => u.id === id);
  const payload = {
    number: data.number.trim(), type: data.type,
    rent: Number(data.rent) || 0, floor: Number(data.floor) || 0,
    notes: data.notes || '', updatedAt: serverTimestamp()
  };
  await updateDoc(doc(db, COL, id), payload);
  await logActivity('EDIT_UNIT', 'unit', id, `Updated unit ${payload.number}`, old, payload);
}

export async function occupyUnit(unitId, tenantId) {
  await updateDoc(doc(db, COL, unitId), {
    status: 'occupied', currentTenantId: tenantId, updatedAt: serverTimestamp()
  });
}

export async function vacateUnit(unitId) {
  await updateDoc(doc(db, COL, unitId), {
    status: 'vacant', currentTenantId: null, updatedAt: serverTimestamp()
  });
}

export async function deleteUnit(id) {
  const old = AppState.units.find(u => u.id === id);
  await updateDoc(doc(db, COL, id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await logActivity('DELETE_UNIT', 'unit', id, `Deleted unit ${old?.number}`, old, null);
}
