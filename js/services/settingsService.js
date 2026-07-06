// ============================================================
// PropOS — Settings Service
// ============================================================

import { db } from '../firebase-config.js';
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DOC_ID = 'main';
const COL    = 'settings';

// Default settings
export const DEFAULT_SETTINGS = {
  ownerName:       '',
  ownerPhone:      '',
  ownerEmail:      '',
  company:         'PropOS',
  logoURL:         '',
  beemApiKey:      '',
  beemSecretKey:   '',
  beemSenderName:  'PROPMAN',
  whatsappNumber:  '',   // WhatsApp Business number e.g. +254700000000
  dueDay:          1,
  graceDays:       5,
  currency:        'KSh',
  timezone:        'Africa/Nairobi',
  dateFormat:      'DD/MM/YYYY'
};

// In-memory cache
export let appSettings = { ...DEFAULT_SETTINGS };

// ── Load settings once ─────────────────────────────────────
export async function loadSettings() {
  const snap = await getDoc(doc(db, COL, DOC_ID));
  if (snap.exists()) {
    appSettings = { ...DEFAULT_SETTINGS, ...snap.data() };
  }
  return appSettings;
}

// ── Real-time listener ─────────────────────────────────────
export function listenSettings(onUpdate) {
  return onSnapshot(doc(db, COL, DOC_ID), snap => {
    if (snap.exists()) {
      appSettings = { ...DEFAULT_SETTINGS, ...snap.data() };
      // Keep AppState.settings in sync for the engine
      import('../store.js').then(({ AppState }) => {
        AppState.settings = { ...appSettings };
      });
    }
    if (onUpdate) onUpdate(appSettings);
  });
}

// ── Save settings ──────────────────────────────────────────
export async function saveSettings(data) {
  const payload = {
    ownerName:      data.ownerName       || '',
    ownerPhone:     data.ownerPhone      || '',
    ownerEmail:     data.ownerEmail      || '',
    company:        data.company         || 'PropOS',
    beemApiKey:     data.beemApiKey      || '',
    beemSecretKey:  data.beemSecretKey   || '',
    beemSenderName: data.beemSenderName  || 'PROPMAN',
    whatsappNumber: data.whatsappNumber  || '',
    dueDay:         Number(data.dueDay)    || 1,
    graceDays:      Number(data.graceDays) || 5,
    updatedAt:      serverTimestamp()
  };
  await setDoc(doc(db, COL, DOC_ID), payload, { merge: true });
  appSettings = { ...appSettings, ...payload };
  return appSettings;
}
