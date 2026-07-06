// ============================================================
// PropOS — Maintenance Service (Phase 11)
// CRUD for maintenance jobs + photo uploads via Firebase Storage
// ============================================================

import { db, storage }           from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { AppState }              from '../store.js';
import { currentUser, currentProfile } from '../auth.js';
import { logActivity }           from './activityService.js';

const COL = 'maintenance';

// ── Add a new job ─────────────────────────────────────────
export async function addMaintenanceJob(data) {
  const payload = {
    title:          data.title          || '',
    description:    data.description    || '',
    category:       data.category       || 'general',
    priority:       data.priority       || 'medium',
    status:         'open',
    buildingId:     data.buildingId     || '',
    buildingName:   data.buildingName   || '',
    unitId:         data.unitId         || '',
    unitNumber:     data.unitNumber     || '',
    tenantId:       data.tenantId       || '',
    tenantName:     data.tenantName     || '',
    assignedTo:     data.assignedTo     || '',
    dueDate:        data.dueDate        || '',
    photoUrls:      [],
    notes:          '',
    resolvedAt:     null,
    createdBy:      currentUser?.uid    || '',
    createdByName:  currentProfile?.displayName || currentUser?.email || '',
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
    deletedAt:      null
  };

  const ref_ = await addDoc(collection(db, COL), payload);
  await logActivity('CREATED', 'maintenance', ref_.id,
    `Logged maintenance job: "${payload.title}" in ${payload.buildingName} ${payload.unitNumber}`,
    null, { title: payload.title, priority: payload.priority, category: payload.category }
  );
  return ref_.id;
}

// ── Update an existing job ────────────────────────────────
export async function updateMaintenanceJob(id, data, oldData) {
  const patch = {
    updatedAt: serverTimestamp(),
    ...data
  };
  // If status changed to done, record resolvedAt
  if (data.status === 'done' && oldData?.status !== 'done') {
    patch.resolvedAt = serverTimestamp();
  }
  if (data.status && data.status !== 'done' && oldData?.status === 'done') {
    patch.resolvedAt = null; // reopened
  }
  await updateDoc(doc(db, COL, id), patch);
  await logActivity('UPDATED', 'maintenance', id,
    `Updated maintenance job: "${oldData?.title || id}"`,
    { status: oldData?.status, priority: oldData?.priority },
    { status: data.status   ?? oldData?.status,
      priority: data.priority ?? oldData?.priority }
  );
}

// ── Soft-delete ───────────────────────────────────────────
export async function deleteMaintenanceJob(id, title) {
  await updateDoc(doc(db, COL, id), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logActivity('DELETED', 'maintenance', id,
    `Deleted maintenance job: "${title || id}"`, { title }, null
  );
}

// ── Upload a photo and append URL to job ──────────────────
export async function uploadJobPhoto(jobId, file) {
  const storageRef = ref(storage, `maintenance/${jobId}/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  // Append to photoUrls — read current array first then update
  const job = AppState.maintenanceJobs.find(j => j.id === jobId);
  const existing = job?.photoUrls || [];
  await updateDoc(doc(db, COL, jobId), {
    photoUrls: [...existing, url],
    updatedAt: serverTimestamp()
  });
  return url;
}

// ── Real-time listener ────────────────────────────────────
// NOTE: Only orderBy('createdAt') — no compound where() to avoid requiring
// a composite Firestore index. Soft-delete filtering is done client-side.
export function listenMaintenance(onUpdate) {
  const q = query(
    collection(db, COL),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => {
    AppState.maintenanceJobs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(j => !j.deletedAt);          // client-side soft-delete filter
    if (onUpdate) onUpdate();
  }, err => console.error('Maintenance listener error:', err));
}
