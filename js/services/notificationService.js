// ============================================================
// PropOS — Notification Service
// Handles SMS (Beem Africa) and WhatsApp (wa.me) sends
// Logs every outbound message to Firestore for audit trail
// ============================================================

import { db } from '../firebase-config.js';
import {
  collection, addDoc, onSnapshot, query,
  orderBy, limit, serverTimestamp,
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { AppState, getCurMonth, monthLabel } from '../store.js';
import { currentUser, currentProfile } from '../auth.js';
import { logActivity } from './activityService.js';
import { appSettings } from './settingsService.js';

const COL           = 'notifications';
const TEMPLATES_DOC = 'notificationTemplates';

// ── Phone normalisation ────────────────────────────────────
// Converts: 07XX → +2547XX, 01XX → +2541XX, 7XX → +2547XX
// Handles existing +254 or 254 prefixes safely
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return raw;
  if (digits.startsWith('254'))  return '+' + digits;
  if (digits.startsWith('07') || digits.startsWith('01')) return '+254' + digits.slice(1);
  if (digits.startsWith('7')  || digits.startsWith('1'))  return '+254' + digits;
  return raw;
}

// ── Merge tag substitution ─────────────────────────────────
// Available tags: {name} {amount} {balance} {month} {building}
//                 {unit}  {company} {date}   {dueday} {leaseend} {phone}
export function applyMergeTags(template, tenant, extra = {}) {
  const unit     = AppState.units.find(u => u.id === tenant?.unitId);
  const building = AppState.buildings.find(b => b.id === tenant?.buildingId);
  const s        = AppState.settings;
  const today    = new Date().toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  const tags = {
    name:     tenant?.name      || 'Tenant',
    amount:   `KSh ${(unit?.rent || 0).toLocaleString('en-KE')}`,
    balance:  extra.balance     || 'KSh 0',
    month:    monthLabel(getCurMonth()),
    building: building?.name    || '',
    unit:     unit?.number      || '',
    company:  s.company         || 'PropOS',
    date:     today,
    dueday:   String(s.dueDay   || 1),
    leaseend: tenant?.leaseEnd  || '—',
    phone:    tenant?.phone     || ''
  };

  return Object.entries(tags).reduce(
    (msg, [key, val]) => msg.replaceAll(`{${key}}`, val),
    template
  );
}

// ── Send a single SMS via Beem Africa ──────────────────────
// Returns { success, messageId }
// Throws on configuration or API error
export async function sendSMS(phone, message) {
  const apiKey    = appSettings.beemApiKey?.trim();
  const secretKey = appSettings.beemSecretKey?.trim();
  const sender    = appSettings.beemSenderName?.trim() || 'PROPMAN';

  if (!apiKey || !secretKey) {
    throw new Error('Beem Africa API key / secret not configured. Add them in Settings → SMS.');
  }

  // Beem expects international format without '+' e.g. 254700000000
  const normalised = normalizePhone(phone).replace(/^\+/, '');

  // Basic Auth header: base64(apiKey:secretKey)
  const credentials = btoa(`${apiKey}:${secretKey}`);

  const resp = await fetch('/beem-proxy/send', {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json'
    },
    body: JSON.stringify({
      source_addr:   sender,
      schedule_time: '',
      encoding:      0,
      message,
      recipients: [{ recipient_id: 1, dest_addr: normalised }]
    })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => String(resp.status));
    throw new Error(`Beem API ${resp.status}: ${txt.slice(0, 120)}`);
  }

  const data = await resp.json();
  if (data?.successful === false) {
    throw new Error(`Beem rejected: ${data?.message || 'unknown error'}`);
  }

  return { success: true, messageId: data?.data?.request_id || '' };
}

// ── WhatsApp via wa.me link ────────────────────────────────
// No API key needed. Opens WhatsApp in a new tab.
export function openWhatsAppLink(phone, message) {
  const e164 = normalizePhone(phone).replace('+', '');
  const url  = `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ── Persist a notification record to Firestore ─────────────
export async function logNotification(data) {
  const payload = {
    tenantId:   data.tenantId   || '',
    tenantName: data.tenantName || '',
    phone:      data.phone      || '',
    type:       data.type       || 'CUSTOM',  // RENT_REMINDER | RECEIPT | ARREARS | LEASE_RENEWAL | CUSTOM
    channel:    data.channel    || 'sms',     // sms | whatsapp
    message:    data.message    || '',
    status:     data.status     || 'sent',    // sent | failed
    errorMsg:   data.errorMsg   || null,
    gateway:    data.gateway    || 'at',      // at | manual
    cost:       data.cost       || null,
    buildingId: data.buildingId || '',
    sentAt:     serverTimestamp(),
    sentBy:     currentProfile?.displayName || currentUser?.email || 'system',
    sentByUid:  currentUser?.uid || 'system'
  };
  const ref = await addDoc(collection(db, COL), payload);
  return { id: ref.id, ...payload };
}

// ── Bulk SMS ───────────────────────────────────────────────
// recipients: Array<{ tenantId, tenantName, phone, buildingId, balance }>
// Returns { sent, failed, total, results }
export async function sendBulkSMS(recipients, message, type = 'CUSTOM') {
  const results = [];
  let sent = 0, failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];

    // Throttle: 100 ms between API calls
    if (i > 0) await new Promise(res => setTimeout(res, 100));

    let status = 'sent', errorMsg = null, cost = null;
    const tenant     = AppState.tenants.find(t => t.id === r.tenantId);
    const personalised = applyMergeTags(message, tenant, { balance: r.balance });

    try {
      const result = await sendSMS(r.phone, personalised);
      cost = result.cost;
      sent++;
    } catch (err) {
      status   = 'failed';
      errorMsg = err.message;
      failed++;
    }

    // Always log — even failures are part of the audit trail
    await logNotification({
      tenantId:   r.tenantId,
      tenantName: r.tenantName,
      phone:      r.phone,
      buildingId: r.buildingId,
      type, channel: 'sms',
      message: personalised,
      status, errorMsg, gateway: 'at', cost
    }).catch(e => console.warn('Log failed (non-critical):', e.message));

    results.push({ ...r, status, errorMsg, cost });
  }

  await logActivity(
    'BULK_SMS', 'notification', 'bulk',
    `Bulk SMS: ${sent} sent, ${failed} failed — type: ${type}`,
    null, { type, total: recipients.length, sent, failed }
  );

  return { sent, failed, total: recipients.length, results };
}

// ── Bulk WhatsApp ──────────────────────────────────────────
// Opens wa.me tabs; browsers allow this only via user-triggered events.
// Throttle: 800 ms between opens to avoid browser blocking.
export async function sendBulkWhatsApp(recipients, message, type = 'CUSTOM') {
  const results = [];
  let sent = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r      = recipients[i];
    const tenant = AppState.tenants.find(t => t.id === r.tenantId);
    const personalised = applyMergeTags(message, tenant, { balance: r.balance });

    openWhatsAppLink(r.phone, personalised);

    await logNotification({
      tenantId:   r.tenantId,
      tenantName: r.tenantName,
      phone:      r.phone,
      buildingId: r.buildingId,
      type, channel: 'whatsapp',
      message: personalised,
      status: 'sent', gateway: 'manual'
    }).catch(() => {});

    results.push({ ...r, status: 'sent' });
    sent++;

    if (i < recipients.length - 1) await new Promise(res => setTimeout(res, 800));
  }

  await logActivity(
    'BULK_WHATSAPP', 'notification', 'bulk',
    `Bulk WhatsApp: ${sent} opened — type: ${type}`,
    null, { type, total: recipients.length, sent }
  );

  return { sent, failed: 0, total: recipients.length, results };
}

// ── Real-time notifications listener ──────────────────────
export function listenNotifications(onUpdate) {
  const q = query(collection(db, COL), orderBy('sentAt', 'desc'), limit(500));
  return onSnapshot(q, snap => {
    AppState.notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (onUpdate) onUpdate(AppState.notifications);
  }, err => console.error('Notifications listener error:', err));
}

// ── Notification templates ─────────────────────────────────
export function getDefaultTemplates() {
  return {
    rentReminder:
      'Dear {name}, your rent of {amount} for {month} is due on day {dueday}. ' +
      'Please pay promptly to avoid penalties. — {company}',
    paymentReceipt:
      'Dear {name}, we confirm receipt of {amount} on {date}. ' +
      'Your balance is {balance}. Thank you! — {company}',
    arrearsWarning:
      'Dear {name}, you have outstanding arrears of {balance} at {building} Unit {unit}. ' +
      'Please settle urgently to avoid further action. — {company}',
    leaseRenewal:
      'Dear {name}, your lease at {building} Unit {unit} expires on {leaseend}. ' +
      'Please contact us to arrange renewal. — {company}',
    custom: ''
  };
}

export async function getNotificationTemplates() {
  try {
    const snap = await getDoc(doc(db, 'settings', TEMPLATES_DOC));
    if (snap.exists()) {
      return { ...getDefaultTemplates(), ...snap.data() };
    }
  } catch (_) { /* fall through to defaults */ }
  return getDefaultTemplates();
}

export async function saveNotificationTemplates(templates) {
  await setDoc(doc(db, 'settings', TEMPLATES_DOC), {
    ...templates,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.uid || 'system'
  }, { merge: true });
}
