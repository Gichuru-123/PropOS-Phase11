import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc,
  getDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { AppState } from '../store.js';
import { logActivity } from './activityService.js';
import { currentProfile } from '../auth.js';

const COL = 'buildings';

export function listenBuildings(onUpdate) {
  const q = query(collection(db, COL), where('deletedAt', '==', null));
  return onSnapshot(q, snap => {
    AppState.buildings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate(AppState.buildings);
  }, err => console.error('Buildings listener error:', err));
}

export async function getBuilding(id) {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addBuilding(data) {
  const payload = {
    name: data.name.trim(), location: data.location.trim(),
    floors: Number(data.floors) || 1, notes: data.notes || '',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    deletedAt: null, createdBy: currentProfile?.uid || ''
  };
  const ref = await addDoc(collection(db, COL), payload);
  await logActivity('ADD_BUILDING', 'building', ref.id, `Added building: ${payload.name}`, null, payload);
  return ref.id;
}

export async function updateBuilding(id, data) {
  const old = await getBuilding(id);
  const payload = {
    name: data.name.trim(), location: data.location.trim(),
    floors: Number(data.floors) || 1, notes: data.notes || '',
    updatedAt: serverTimestamp()
  };
  await updateDoc(doc(db, COL, id), payload);
  await logActivity('EDIT_BUILDING', 'building', id, `Updated building: ${payload.name}`, old, payload);
}

export async function deleteBuilding(id) {
  const old = await getBuilding(id);
  await updateDoc(doc(db, COL, id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await logActivity('DELETE_BUILDING', 'building', id, `Deleted building: ${old?.name}`, old, null);
}
