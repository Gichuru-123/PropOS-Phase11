// ============================================================
// ONE-TIME FIX: Sets openBalDate to current month for all
// existing tenants that have an old/wrong openBalDate.
// Run from browser console:
// import('./js/fixOpenBalDate.js').then(m => m.fixAll())
// ============================================================

import { db } from './firebase-config.js';
import { collection, getDocs, updateDoc, doc, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function fixAll() {
  const curMonth = new Date().toISOString().substr(0, 7);
  console.log('🔧 Fixing openBalDate to', curMonth, 'for all tenants...');

  const snap = await getDocs(query(
    collection(db, 'tenants'),
    where('deletedAt', '==', null)
  ));

  let count = 0;
  for (const d of snap.docs) {
    const t = d.data();
    await updateDoc(doc(db, 'tenants', d.id), {
      openBalDate: curMonth
    });
    count++;
    console.log(`✅ ${t.name} → openBalDate: ${curMonth}`);
  }

  console.log(`🎉 Fixed ${count} tenant(s). Reload the app.`);
  alert(`Fixed ${count} tenant(s). Reload the app now.`);
}
