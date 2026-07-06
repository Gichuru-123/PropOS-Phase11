// ============================================================
// PropOS — Document Service
// Handles document storage in Firebase Storage and metadata in Firestore
// ============================================================

import { db, storage } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where, serverTimestamp, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { AppState } from '../store.js';
import { logActivity } from './activityService.js';
import { currentProfile } from '../auth.js';

const COL = 'documents';

export function listenDocuments(onUpdate) {
  const q = query(collection(db, COL), where('deletedAt', '==', null));
  return onSnapshot(q, snap => {
    AppState.documents = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        // Sort client-side by uploadedAt (newest first)
        const aTime = a.uploadedAt?.toDate ? a.uploadedAt.toDate().getTime() : (a.uploadedAt || 0);
        const bTime = b.uploadedAt?.toDate ? b.uploadedAt.toDate().getTime() : (b.uploadedAt || 0);
        return bTime - aTime;
      });
    if (onUpdate) onUpdate(AppState.documents);
  }, err => console.error('Documents listener error:', err));
}

export async function getDocument(id) {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function uploadDocument(file, metadata) {
  const { entityType, entityId, documentType, name } = metadata;
  
  // Generate unique filename
  const timestamp = Date.now();
  const fileName = `${entityType}_${entityId}_${timestamp}_${file.name}`;
  const storagePath = `documents/${entityType}/${entityId}/${fileName}`;
  const storageRef = ref(storage, storagePath);
  
  try {
    // Upload file to Firebase Storage
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    // Save metadata to Firestore
    const payload = {
      name: name || file.name,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      documentType: documentType || 'other', // lease, id, receipt, photo, other
      entityType: entityType || 'general', // tenant, building, general
      entityId: entityId || '',
      storagePath,
      downloadURL,
      uploadedAt: serverTimestamp(),
      uploadedBy: currentProfile?.uid || '',
      deletedAt: null
    };
    
    const ref = await addDoc(collection(db, COL), payload);
    await logActivity('UPLOAD_DOCUMENT', 'document', ref.id, `Uploaded document: ${payload.name}`, null, payload);
    return ref.id;
  } catch (error) {
    console.error('Document upload error:', error);
    throw new Error('Failed to upload document: ' + error.message);
  }
}

export async function deleteDocument(id) {
  const docData = AppState.documents.find(d => d.id === id);
  if (!docData) throw new Error('Document not found');
  
  try {
    // Delete from Firebase Storage
    if (docData.storagePath) {
      const storageRef = ref(storage, docData.storagePath);
      await deleteObject(storageRef);
    }
    
    // Mark as deleted in Firestore
    await updateDoc(doc(db, COL, id), { deletedAt: serverTimestamp() });
    await logActivity('DELETE_DOCUMENT', 'document', id, `Deleted document: ${docData.name}`, docData, null);
  } catch (error) {
    console.error('Document delete error:', error);
    throw new Error('Failed to delete document: ' + error.message);
  }
}

export function filterDocuments(entityType = '', entityId = '') {
  let filtered = [...AppState.documents];
  
  if (entityType) {
    filtered = filtered.filter(d => d.entityType === entityType);
  }
  
  if (entityId) {
    filtered = filtered.filter(d => d.entityId === entityId);
  }
  
  return filtered;
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export function getDocumentTypeLabel(type) {
  const labels = {
    lease: 'Lease Agreement',
    id: 'ID Document',
    receipt: 'Payment Receipt',
    photo: 'Photo',
    other: 'Other'
  };
  return labels[type] || 'Other';
}
