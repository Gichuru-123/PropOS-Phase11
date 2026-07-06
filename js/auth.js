// ============================================================
// PropOS — Authentication Module
// Handles: login, logout, password reset, session, role loading
// ============================================================

import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { showToast } from './components/toast.js';

// ── Current session state ──────────────────────────────────
export let currentUser = null;   // Firebase Auth user
export let currentProfile = null; // Firestore user document
export let currentRole = null;   // 'admin' | 'owner' | 'accountant' | 'caretaker'

// ── Role permission map ────────────────────────────────────
export const ROLE_PERMISSIONS = {
  admin: {
    canManageBuildings: true,
    canManageUnits: true,
    canManageTenants: true,
    canRecordPayments: true,
    canDeletePayments: true,
    canViewFinancials: true,
    canViewReports: true,
    canExportReports: true,
    canManageExpenses: true,
    canSendNotifications: true,
    canManageMaintenance: true,
    canUploadDocuments: true,
    canManageUsers: true,
    canChangeSettings: true,
    canDeleteRecords: true,
    canViewAuditLog: true,
    canUseSMSParser: true
  },
  owner: {
    canManageBuildings: false,
    canManageUnits: false,
    canManageTenants: false,
    canRecordPayments: false,
    canDeletePayments: false,
    canViewFinancials: true,
    canViewReports: true,
    canExportReports: true,
    canManageExpenses: false,
    canSendNotifications: false,
    canManageMaintenance: false,
    canUploadDocuments: false,
    canManageUsers: false,
    canChangeSettings: false,
    canDeleteRecords: false,
    canViewAuditLog: true,
    canUseSMSParser: false
  },
  accountant: {
    canManageBuildings: false,
    canManageUnits: false,
    canManageTenants: true,
    canRecordPayments: true,
    canDeletePayments: false,
    canViewFinancials: true,
    canViewReports: true,
    canExportReports: true,
    canManageExpenses: true,
    canSendNotifications: true,
    canManageMaintenance: false,
    canUploadDocuments: true,
    canManageUsers: false,
    canChangeSettings: false,
    canDeleteRecords: false,
    canViewAuditLog: false,
    canUseSMSParser: true
  },
  caretaker: {
    canManageBuildings: false,
    canManageUnits: true,
    canManageTenants: true,
    canRecordPayments: false,
    canDeletePayments: false,
    canViewFinancials: false,
    canViewReports: false,
    canExportReports: false,
    canManageExpenses: false,
    canSendNotifications: true,
    canManageMaintenance: true,
    canUploadDocuments: true,
    canManageUsers: false,
    canChangeSettings: false,
    canDeleteRecords: false,
    canViewAuditLog: false,
    canUseSMSParser: false
  }
};

// ── Check if current user has a permission ─────────────────
export function can(permission) {
  if (!currentRole) return false;
  return ROLE_PERMISSIONS[currentRole]?.[permission] === true;
}

// ── Login ──────────────────────────────────────────────────
export async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

// ── Logout ─────────────────────────────────────────────────
export async function logout() {
  currentUser = null;
  currentProfile = null;
  currentRole = null;
  await signOut(auth);
  window.location.href = 'index.html';
}

// ── Password Reset ─────────────────────────────────────────
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Load user profile from Firestore ──────────────────────
export async function loadUserProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('User profile not found. Contact your administrator.');
  }
  const profile = snap.data();
  if (!profile.active) {
    throw new Error('Your account has been deactivated. Contact your administrator.');
  }
  // Update last login
  await updateDoc(ref, { lastLogin: serverTimestamp() });
  return profile;
}

// ── Auth State Observer ────────────────────────────────────
// Call this once on app load. Calls onLoggedIn(user, profile) or onLoggedOut()
export function watchAuthState(onLoggedIn, onLoggedOut) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const profile = await loadUserProfile(user.uid);
        currentUser    = user;
        currentProfile = profile;
        currentRole    = profile.role;
        onLoggedIn(user, profile);
      } catch (err) {
        console.error('Auth state error:', err);
        await signOut(auth);
        onLoggedOut(err.message);
      }
    } else {
      currentUser    = null;
      currentProfile = null;
      currentRole    = null;
      onLoggedOut();
    }
  });
}

// ── Create first admin (for initial setup only) ────────────
// This is called once from the setup screen
export async function createAdminProfile(uid, email, name) {
  await setDoc(doc(db, 'users', uid), {
    uid,
    email,
    displayName: name,
    phone: '',
    role: 'admin',
    active: true,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
    invitedBy: null,
    photoURL: ''
  });
}

// ── Get initials for avatar ────────────────────────────────
export function getInitials(name = '') {
  return name.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}
