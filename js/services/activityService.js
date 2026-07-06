// ============================================================
// PropOS — Activity Log Service
// Writes an immutable audit entry for every action
// ============================================================

import { db } from '../firebase-config.js';
import {
  collection, addDoc, onSnapshot, query,
  orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { currentUser, currentProfile } from '../auth.js';
import { AppState } from '../store.js';

const COL = 'activityLog';

// ── Write an activity entry ────────────────────────────────
export async function logActivity(action, entityType, entityId, description, oldValue, newValue) {
  try {
    await addDoc(collection(db, COL), {
      userId:      currentUser?.uid        || 'system',
      userEmail:   currentUser?.email      || 'system',
      userRole:    currentProfile?.role    || 'system',
      userName:    currentProfile?.displayName || 'System',
      action,
      entityType,
      entityId,
      description,
      oldValue:    oldValue  || null,
      newValue:    newValue  || null,
      timestamp:   serverTimestamp()
    });
  } catch (err) {
    // Never let logging errors break the main flow
    console.warn('Activity log failed (non-critical):', err.message);
  }
}

// ── Real-time listener (last 500 entries) ─────────────────
export function listenActivity(onUpdate) {
  const q = query(
    collection(db, COL),
    orderBy('timestamp', 'desc'),
    limit(500)
  );
  return onSnapshot(q, snap => {
    AppState.activityLog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate();
  }, err => console.error('Activity listener error:', err));
}
