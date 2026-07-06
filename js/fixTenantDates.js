// ============================================================
// ONE-TIME FIX SCRIPT
// Run from browser console: 
// import('/js/fixTenantDates.js').then(m => m.fixTenants())
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs, updateDoc, doc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function fixTenants() {
  // Get current month
  const curMonth = new Date().toISOString().substr(0, 7);
  console.log('Fixing tenant openBalDate to current month:', curMonth);

  const snap = await getDocs(query(
    collection(db, 'tenants'),
    where('deletedAt', '==', null)
  ));

  const fixes = {
    // Set correct opening balances that represent arrears/credits
    // as of the START of this month
    // James: paid in full, 0 balance
    // Grace: owes 6000 from before
    // Peter: owes 10000 (missed this month, paid last month only)  
    // Amina: has credit of 3000
  };

  let count = 0;
  for (const d of snap.docs) {
    const t = d.data();
    await updateDoc(doc(db, 'tenants', d.id), {
      openBalDate: curMonth
    });
    count++;
    console.log(`✅ Fixed ${t.name} → openBalDate: ${curMonth}`);
  }

  console.log(`🎉 Fixed ${count} tenants. Reload the app now.`);
  return count;
}
