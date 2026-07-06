// ============================================================
// PropOS — Database Seed Script
// Run this ONCE to populate Firestore with sample data
// Opens as a page in the app: router.nav('seed')
// ============================================================

import { db } from '../firebase-config.js';
import {
  collection, doc, setDoc, getDocs,
  serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { currentProfile } from '../auth.js';

// ── Check if already seeded ────────────────────────────────
export async function isSeeded() {
  const snap = await getDocs(collection(db, 'buildings'));
  return !snap.empty;
}

// ── Run the seed ───────────────────────────────────────────
export async function seedDatabase(onProgress) {
  const log = msg => { console.log(msg); if (onProgress) onProgress(msg); };

  // Check not already seeded
  if (await isSeeded()) {
    log('⚠️ Database already has data. Skipping seed.');
    return false;
  }

  log('🌱 Starting database seed...');
  const batch = writeBatch(db);
  const by    = currentProfile?.uid || 'seed';
  const now   = serverTimestamp();

  // ── SETTINGS ──────────────────────────────────────────
  const settingsRef = doc(db, 'settings', 'main');
  batch.set(settingsRef, {
    ownerName:   'Ian Kamau',
    ownerPhone:  '+254700000000',
    ownerEmail:  'ian@propos.app',
    company:     'Kamau Properties',
    logoURL:     '',
    atApiKey:    '',
    atUsername:  'sandbox',
    atSenderId:  '',
    dueDay:      1,
    graceDays:   5,
    currency:    'KSh',
    timezone:    'Africa/Nairobi',
    dateFormat:  'DD/MM/YYYY',
    updatedAt:   now
  });
  log('✅ Settings created');

  // ── BUILDINGS ──────────────────────────────────────────
  const b1Ref = doc(collection(db, 'buildings'));
  const b2Ref = doc(collection(db, 'buildings'));

  batch.set(b1Ref, {
    name:      'Sunrise Apartments',
    location:  'Utawala, Nairobi',
    floors:    4,
    notes:     'Main residential block',
    createdAt: now, updatedAt: now,
    deletedAt: null, createdBy: by
  });

  batch.set(b2Ref, {
    name:      'Green Court',
    location:  'Juja, Kiambu',
    floors:    3,
    notes:     'Near JKUAT campus',
    createdAt: now, updatedAt: now,
    deletedAt: null, createdBy: by
  });
  log('✅ Buildings created');

  // ── UNITS ──────────────────────────────────────────────
  const u1Ref = doc(collection(db, 'units'));
  const u2Ref = doc(collection(db, 'units'));
  const u3Ref = doc(collection(db, 'units'));
  const u4Ref = doc(collection(db, 'units'));
  const u5Ref = doc(collection(db, 'units'));
  const u6Ref = doc(collection(db, 'units'));

  batch.set(u1Ref, {
    buildingId: b1Ref.id, number: '1A', type: '1 Bedroom',
    rent: 12000, floor: 1, notes: '',
    status: 'occupied', currentTenantId: null,
    createdAt: now, updatedAt: now, deletedAt: null, createdBy: by
  });
  batch.set(u2Ref, {
    buildingId: b1Ref.id, number: '2B', type: '2 Bedroom',
    rent: 18000, floor: 2, notes: 'Ensuite bathroom',
    status: 'occupied', currentTenantId: null,
    createdAt: now, updatedAt: now, deletedAt: null, createdBy: by
  });
  batch.set(u3Ref, {
    buildingId: b1Ref.id, number: '3C', type: 'Bedsitter',
    rent: 7500, floor: 3, notes: '',
    status: 'vacant', currentTenantId: null,
    createdAt: now, updatedAt: now, deletedAt: null, createdBy: by
  });
  batch.set(u4Ref, {
    buildingId: b2Ref.id, number: 'A1', type: '1 Bedroom',
    rent: 10000, floor: 1, notes: '',
    status: 'occupied', currentTenantId: null,
    createdAt: now, updatedAt: now, deletedAt: null, createdBy: by
  });
  batch.set(u5Ref, {
    buildingId: b2Ref.id, number: 'A2', type: 'Studio',
    rent: 7000, floor: 1, notes: '',
    status: 'vacant', currentTenantId: null,
    createdAt: now, updatedAt: now, deletedAt: null, createdBy: by
  });
  batch.set(u6Ref, {
    buildingId: b2Ref.id, number: 'B1', type: '2 Bedroom',
    rent: 15000, floor: 2, notes: 'Corner unit',
    status: 'occupied', currentTenantId: null,
    createdAt: now, updatedAt: now, deletedAt: null, createdBy: by
  });
  log('✅ Units created');

  // ── TENANTS ────────────────────────────────────────────
  const t1Ref = doc(collection(db, 'tenants'));
  const t2Ref = doc(collection(db, 'tenants'));
  const t3Ref = doc(collection(db, 'tenants'));
  const t4Ref = doc(collection(db, 'tenants'));

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const moveIn = threeMonthsAgo.toISOString().split('T')[0];
  const moveInMonth = moveIn.substr(0, 7);

  batch.set(t1Ref, {
    name: 'James Mwangi', idNumber: '28456789',
    phone: '+254712345678', email: 'james@email.com',
    photoURL: '', buildingId: b1Ref.id, unitId: u1Ref.id,
    moveIn, leaseEnd: '2026-12-31',
    payMethod: 'M-PESA', deposit: 12000,
    emergency: 'Mary Mwangi — +254700000001',
    openingBalance: 0, openBalDate: moveInMonth,
    status: 'active', vacatedAt: null, notes: '',
    healthScore: 95, createdAt: now, updatedAt: now,
    deletedAt: null, createdBy: by
  });

  batch.set(t2Ref, {
    name: 'Grace Akinyi', idNumber: '31234567',
    phone: '+254723456789', email: 'grace@email.com',
    photoURL: '', buildingId: b1Ref.id, unitId: u2Ref.id,
    moveIn, leaseEnd: '2026-08-31',
    payMethod: 'M-PESA', deposit: 18000,
    emergency: 'Tom Odhiambo — +254700000002',
    openingBalance: 6000, openBalDate: moveInMonth,
    status: 'active', vacatedAt: null, notes: 'Has arrears from previous month',
    healthScore: 65, createdAt: now, updatedAt: now,
    deletedAt: null, createdBy: by
  });

  batch.set(t3Ref, {
    name: 'Peter Njoroge', idNumber: '29876543',
    phone: '+254734567890', email: '',
    photoURL: '', buildingId: b2Ref.id, unitId: u4Ref.id,
    moveIn, leaseEnd: '2026-06-30',
    payMethod: 'Cash', deposit: 10000,
    emergency: '',
    openingBalance: 0, openBalDate: moveInMonth,
    status: 'active', vacatedAt: null, notes: '',
    healthScore: 45, createdAt: now, updatedAt: now,
    deletedAt: null, createdBy: by
  });

  batch.set(t4Ref, {
    name: 'Amina Hassan', idNumber: '33456789',
    phone: '+254745678901', email: 'amina@email.com',
    photoURL: '', buildingId: b2Ref.id, unitId: u6Ref.id,
    moveIn, leaseEnd: '2026-12-31',
    payMethod: 'Bank Transfer', deposit: 15000,
    emergency: 'Hassan Ali — +254700000004',
    openingBalance: -3000, openBalDate: moveInMonth,
    status: 'active', vacatedAt: null, notes: 'Paid 3 months in advance',
    healthScore: 98, createdAt: now, updatedAt: now,
    deletedAt: null, createdBy: by
  });
  log('✅ Tenants created');

  // ── Update units with correct tenant IDs ───────────────
  batch.update(u1Ref, { currentTenantId: t1Ref.id });
  batch.update(u2Ref, { currentTenantId: t2Ref.id });
  batch.update(u4Ref, { currentTenantId: t3Ref.id });
  batch.update(u6Ref, { currentTenantId: t4Ref.id });

  // ── PAYMENTS (transactions) ────────────────────────────
  const curMonth = new Date().toISOString().substr(0, 7);
  const lastMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().substr(0, 7);
  })();

  // James — paid in full this month
  const p1Ref = doc(collection(db, 'transactions'));
  batch.set(p1Ref, {
    tenantId: t1Ref.id, unitId: u1Ref.id, buildingId: b1Ref.id,
    type: 'PAYMENT', direction: 'credit',
    amount: 12000, date: curMonth + '-02',
    month: curMonth,
    description: 'Payment (M-PESA · QGH7TE1234)',
    reference: 'QGH7TE1234', method: 'M-PESA', notes: '',
    createdAt: now, createdBy: by, deletedAt: null,
    metadata: { smsRaw: '', bank: 'M-PESA', senderPhone: '+254712345678', senderName: 'JAMES MWANGI' }
  });

  // Grace — paid partial this month
  const p2Ref = doc(collection(db, 'transactions'));
  batch.set(p2Ref, {
    tenantId: t2Ref.id, unitId: u2Ref.id, buildingId: b1Ref.id,
    type: 'PAYMENT', direction: 'credit',
    amount: 10000, date: curMonth + '-03',
    month: curMonth,
    description: 'Payment (M-PESA · RJK8UF5678)',
    reference: 'RJK8UF5678', method: 'M-PESA', notes: 'partial payment',
    createdAt: now, createdBy: by, deletedAt: null,
    metadata: { smsRaw: '', bank: 'M-PESA', senderPhone: '+254723456789', senderName: 'GRACE AKINYI' }
  });

  // Peter — paid last month only
  const p3Ref = doc(collection(db, 'transactions'));
  batch.set(p3Ref, {
    tenantId: t3Ref.id, unitId: u4Ref.id, buildingId: b2Ref.id,
    type: 'PAYMENT', direction: 'credit',
    amount: 10000, date: lastMonth + '-05',
    month: lastMonth,
    description: 'Payment (Cash)',
    reference: '', method: 'Cash', notes: '',
    createdAt: now, createdBy: by, deletedAt: null,
    metadata: { smsRaw: '', bank: '', senderPhone: '', senderName: '' }
  });

  // Amina — paid 3 months in advance (opening credit)
  // Her openingBalance of -3000 represents this

  log('✅ Sample payments created');

  // ── EXPENSES ───────────────────────────────────────────
  const e1Ref = doc(collection(db, 'expenses'));
  const e2Ref = doc(collection(db, 'expenses'));
  const e3Ref = doc(collection(db, 'expenses'));

  batch.set(e1Ref, {
    buildingId: b1Ref.id, category: 'Water Bill',
    amount: 3500, date: curMonth + '-01',
    description: 'Monthly water bill — Sunrise Apartments',
    receiptNo: 'W-001', payee: 'Nairobi Water',
    receiptURL: '', createdAt: now, createdBy: by, deletedAt: null
  });
  batch.set(e2Ref, {
    buildingId: b1Ref.id, category: 'Repairs & Maintenance',
    amount: 8000, date: curMonth + '-10',
    description: 'Plumbing repairs — Unit 2B',
    receiptNo: 'R-002', payee: 'Joe Plumbing Services',
    receiptURL: '', createdAt: now, createdBy: by, deletedAt: null
  });
  batch.set(e3Ref, {
    buildingId: b2Ref.id, category: 'Security',
    amount: 5000, date: curMonth + '-01',
    description: 'Monthly security guard — Green Court',
    receiptNo: 'S-001', payee: 'SafeGuard Ltd',
    receiptURL: '', createdAt: now, createdBy: by, deletedAt: null
  });
  log('✅ Sample expenses created');

  // ── Commit everything at once ──────────────────────────
  await batch.commit();
  log('🎉 Database seeded successfully!');
  return true;
}
