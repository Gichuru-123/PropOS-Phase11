// ============================================================
// PropOS — SMS / M-PESA Parser Page
// ============================================================
import { AppState, ksh, getToday } from '../store.js';
import { toast } from '../components/toast.js';
import { recordPayment } from '../services/paymentService.js';

// ── SMS PATTERNS ───────────────────────────────────────────
const SMS_PATTERNS = [
  {
    bank:'M-PESA', cls:'bank-mpesa', method:'M-PESA',
    tests:[/m-?pesa/i,/confirmed\.\s*ksh/i,/ksh[\d,]+\s+received from/i],
    parse(txt){
      const ref  = (txt.match(/^([A-Z0-9]{6,12})\s+confirmed/i)||[])[1]||'';
      const amt  = txt.match(/ksh\s*([0-9,]+(?:\.\d{1,2})?)/i);
      const phone= txt.match(/from\s+((?:0|\+?254)\s*\d[\d\s]{7,11})/i);
      const name = txt.match(/from\s+(?:0|\+?254)[\d\s]{8,13}\s+([A-Z][A-Z\s]+?)(?:\s+on\s|\s+New|\s+M-PESA)/i);
      return { ref, method:'M-PESA',
        amount: amt?parseFloat(amt[1].replace(/,/g,'')):null,
        phone: phone?phone[1].replace(/\s+/g,''):'',
        senderName: name?name[1].trim():'', date: extractDate(txt) };
    }
  },
  {
    bank:'Equity Bank', cls:'bank-equity', method:'Bank Transfer',
    tests:[/equity/i,/you have received kes/i,/eazzy/i],
    parse(txt){
      const amt  = txt.match(/kes\s*([0-9,]+(?:\.\d{1,2})?)/i)||txt.match(/ksh\s*([0-9,]+(?:\.\d{1,2})?)/i);
      const ref  = (txt.match(/(?:ref(?:erence)?|txn)[:\s#]+([A-Z0-9]+)/i)||[])[1]||'';
      const phone= (txt.match(/(0[17]\d{8}|254\d{9})/)||[])[1]||'';
      const name = (txt.match(/from\s+([A-Z][A-Z\s]{3,30})(?:\s+0|\s+on|\s+KES|\.|$)/i)||[])[1]||'';
      return { ref, method:'Bank Transfer', amount:amt?parseFloat(amt[1].replace(/,/g,'')):null,
        phone, senderName:name.trim(), date:extractDate(txt) };
    }
  },
  {
    bank:'KCB', cls:'bank-kcb', method:'Bank Transfer',
    tests:[/\bkcb\b/i,/kcb:\s*ksh/i],
    parse(txt){
      const amt  = txt.match(/ksh\s*([0-9,]+(?:\.\d{1,2})?)/i)||txt.match(/kes\s*([0-9,]+(?:\.\d{1,2})?)/i);
      const ref  = (txt.match(/ref[:\s#]+([A-Z0-9]+)/i)||[])[1]||'';
      const name = (txt.match(/from[:\s]+([A-Z][A-Z\s]{3,30})(?:\.|$|\s+Bal)/i)||[])[1]||'';
      return { ref, method:'Bank Transfer', amount:amt?parseFloat(amt[1].replace(/,/g,'')):null,
        phone:'', senderName:name.trim(), date:extractDate(txt) };
    }
  },
  {
    bank:'Co-op Bank', cls:'bank-coop', method:'Bank Transfer',
    tests:[/co-?op/i,/coop bank/i,/cooperative/i],
    parse(txt){
      const amt  = txt.match(/kes\s*([0-9,]+(?:\.\d{1,2})?)/i)||txt.match(/ksh\s*([0-9,]+(?:\.\d{1,2})?)/i);
      const ref  = (txt.match(/(?:trans(?:action)?\s*id|ref)[:\s#]+([A-Z0-9]+)/i)||[])[1]||'';
      const name = (txt.match(/from\s+([A-Z][A-Z\s]{3,30})(?:\.|$)/i)||[])[1]||'';
      return { ref, method:'Bank Transfer', amount:amt?parseFloat(amt[1].replace(/,/g,'')):null,
        phone:'', senderName:name.trim(), date:extractDate(txt) };
    }
  },
  {
    bank:'Airtel Money', cls:'bank-airtel', method:'Airtel Money',
    tests:[/airtel/i,/txn:am/i],
    parse(txt){
      const amt  = txt.match(/ksh\s*([0-9,]+(?:\.\d{1,2})?)/i)||txt.match(/kes\s*([0-9,]+(?:\.\d{1,2})?)/i);
      const ref  = (txt.match(/(?:txn|trans(?:action)?)[:\s#]+([A-Z0-9]+)/i)||[])[1]||'';
      const phone= (txt.match(/(07\d{8}|254\d{9})/)||[])[1]||'';
      const name = (txt.match(/from\s+(?:0\d{9}|254\d{9})\s+([A-Z][A-Z\s]{3,30})(?:\.|$)/i)||
                   txt.match(/from\s+([A-Z][A-Z\s]{3,30})(?:\.|$)/i)||[])[1]||'';
      return { ref, method:'Airtel Money', amount:amt?parseFloat(amt[1].replace(/,/g,'')):null,
        phone, senderName:name.trim(), date:extractDate(txt) };
    }
  },
  {
    bank:'Other/Beem', cls:'bank-other', method:'Bank Transfer',
    tests:[/transaction of kes/i,/credited to your account/i,/received kes/i,/received ksh/i,/beem/i],
    parse(txt){
      const amt  = txt.match(/(?:kes|ksh)\s*([0-9,]+(?:\.\d{1,2})?)/i);
      const ref  = (txt.match(/(?:ref(?:erence)?|trans(?:action)?(?:\s*id)?)[:\s#]+([A-Z0-9]+)/i)||[])[1]||'';
      const name = (txt.match(/from\s+([A-Z][A-Z\s]{3,30})(?:\.|$)/i)||[])[1]||'';
      return { ref, method:'Bank Transfer', amount:amt?parseFloat(amt[1].replace(/,/g,'')):null,
        phone:'', senderName:name.trim(), date:extractDate(txt) };
    }
  }
];

function extractDate(txt) {
  const mo={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  let m=txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
  m=txt.match(/(\d{1,2})[\/\-\s]([A-Za-z]{3})[\/\-\s](\d{2,4})/);
  if(m){const mn=mo[m[2].toLowerCase().substr(0,3)]||'01';const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${mn}-${m[1].padStart(2,'0')}`;}
  m=txt.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
  if(m){const mn=mo[m[2].toLowerCase().substr(0,3)]||'01';return `${m[3]}-${mn}-${m[1].padStart(2,'0')}`;}
  return getToday();
}

function detectAndParse(txt) {
  for(const p of SMS_PATTERNS){
    if(p.tests.some(re=>re.test(txt))){
      return {bank:p.bank,cls:p.cls,...p.parse(txt),raw:txt};
    }
  }
  return null;
}

function matchTenant(parsed) {
  if(!parsed)return null;
  const norm=p=>(p||'').replace(/\D/g,'').replace(/^254/,'0').replace(/^0+/,'0');
  const pp=norm(parsed.phone);
  if(pp.length>=9){
    const byPhone=AppState.tenants.find(t=>norm(t.phone)===pp);
    if(byPhone)return byPhone;
  }
  if(parsed.senderName&&parsed.senderName.length>2){
    const sw=parsed.senderName.toLowerCase().split(/\s+/).filter(w=>w.length>2);
    const byName=AppState.tenants.find(t=>{
      const tw=t.name.toLowerCase().split(/\s+/);
      return sw.some(s=>tw.some(w=>w===s||w.startsWith(s)||s.startsWith(w)));
    });
    if(byName)return byName;
  }
  return null;
}

let currentParsed=null;

// ── TENANT DROPDOWN HELPER ─────────────────────────────────
function buildTenantOptions(matched) {
  // Debug — log what we have
  console.log('[SMS Parser] AppState.tenants count:', AppState.tenants.length);
  console.log('[SMS Parser] Sample tenant:', AppState.tenants[0]);

  if (!AppState.tenants.length) {
    return '<option value="">No tenants found — check Firebase connection</option>';
  }

  const sorted = AppState.tenants
    .filter(t=>t.unitId&&t.status!=='vacated')
    .sort((a,b)=>{
      const uA=AppState.units.find(u=>u.id===a.unitId)?.number||'';
      const uB=AppState.units.find(u=>u.id===b.unitId)?.number||'';
      return uA.localeCompare(uB,undefined,{numeric:true});
    });
  return '<option value="">-- Select Tenant --</option>'+
    sorted.map(t=>{
      const b=AppState.buildings.find(b=>b.id===t.buildingId);
      const u=AppState.units.find(u=>u.id===t.unitId);
      const sel=matched?.id===t.id?'selected':'';
      return `<option value="${t.id}" ${sel}>${esc(t.name)} — ${b?esc(b.name):''} ${u?esc(u.number):''}</option>`;
    }).join('');
}

// ── RENDER PAGE ────────────────────────────────────────────
export function render() {
  const el=document.getElementById('page-smsparser');
  if(!el)return;

  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">

      <!-- LEFT: Paste + Result + Confirm -->
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="section-header" style="margin-bottom:12px">
            <div>
              <div class="section-title">📱 Paste Payment SMS</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
                Paste any M-PESA, Equity, KCB, Co-op, Airtel or Beem SMS
              </div>
            </div>
          </div>
          <div class="sms-drop">
            <textarea class="sms-textarea" id="sms-input"
              placeholder="Paste your SMS here...&#10;&#10;M-PESA example:&#10;BG27SH3 Confirmed. Ksh12,000 received from 0712345678 JANE WANJIKU on 3/7/26..."></textarea>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary btn-sm" id="btn-parse-sms">⚡ Parse SMS</button>
            <button class="btn btn-ghost btn-sm" id="btn-clear-sms">✕ Clear</button>
            <button class="btn btn-ghost btn-sm" id="btn-example-sms">Try Example</button>
          </div>
        </div>

        <!-- Parse result -->
        <div id="sms-parse-result"></div>

        <!-- Confirm area — shown after parse -->
        <div id="sms-confirm-area" style="display:none;margin-top:14px">
          <div class="card" style="border-color:var(--green-border)">
            <div class="section-title" style="margin-bottom:4px;color:var(--green)">
              ✅ Confirm & Log Payment
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;line-height:1.5">
              Select which tenant made this payment. All details are auto-filled from the SMS — edit if needed.
            </p>

            <!-- Tenant selector -->
            <div class="form-group">
              <label class="form-label">Which tenant paid?</label>
              <select class="form-select" id="sms-tenant-sel">
                <option value="">-- Select Tenant --</option>
              </select>
            </div>

            <!-- Payment details -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group" style="margin:0">
                <label class="form-label">Amount (KSh)</label>
                <input type="number" class="form-input" id="sms-amount"/>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Date</label>
                <input type="date" class="form-input" id="sms-date"/>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Method</label>
                <input type="text" class="form-input" id="sms-method" readonly
                  style="background:var(--bg-hover);cursor:default"/>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Reference</label>
                <input type="text" class="form-input" id="sms-ref"/>
              </div>
            </div>
            <div class="form-group" style="margin-top:10px">
              <label class="form-label">Notes</label>
              <input type="text" class="form-input" id="sms-notes"/>
            </div>
            <div class="form-actions">
              <button class="btn btn-ghost" id="btn-cancel-sms">Cancel</button>
              <button class="btn btn-success" id="btn-confirm-sms">✅ Log This Payment</button>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Supported formats -->
      <div class="card">
        <div class="section-title" style="margin-bottom:14px">📖 Supported SMS Formats</div>
        ${[
          ['bank-mpesa',  'M-PESA',       '"BG27SH3 Confirmed. Ksh12,000 received from 0712345678 JANE WANJIKU on 3/7/26..."'],
          ['bank-equity', 'Equity Bank',  '"You have received KES 8,500.00 from PETER NJOROGE 0723456789 on 03-Jul-2026..."'],
          ['bank-kcb',    'KCB',          '"KCB: Ksh15,000 received. Ref: KCB1234567. From: JOHN KAMAU..."'],
          ['bank-coop',   'Co-op Bank',   '"COOP: KES 10,000.00 received from MARY AKINYI. Trans ID: 9876543210..."'],
          ['bank-airtel', 'Airtel Money', '"TXN:AM887234 KSh7,500 received from 0733123456 GRACE WAWERU..."'],
          ['bank-other',  'Beem/Other',   '"Transaction of KES 20,000 credited. Ref: 1234567890. From JAMES MWANGI..."']
        ].map(([cls,name,ex])=>`
          <div style="padding:10px 12px;background:var(--bg-hover);border-radius:var(--r);margin-bottom:8px;font-size:0.78rem">
            <span class="bank-chip ${cls}">${name}</span>
            <div style="margin-top:5px;color:var(--text-muted);font-style:italic">${ex}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Import Log -->
    <div class="card" style="margin-top:20px">
      <div class="section-header">
        <div class="section-title">📜 SMS Import Log</div>
      </div>
      <div id="sms-log"></div>
    </div>`;

  // ── Wire up buttons with addEventListener (not inline onclick) ──
  document.getElementById('btn-parse-sms').addEventListener('click', doParseSmS);
  document.getElementById('btn-clear-sms').addEventListener('click', doClearSMS);
  document.getElementById('btn-example-sms').addEventListener('click', doExampleSMS);
  document.getElementById('btn-confirm-sms').addEventListener('click', doConfirmSMS);
  document.getElementById('btn-cancel-sms').addEventListener('click', doClearSMS);

  // Also parse on input (debounced)
  let parseTimer;
  document.getElementById('sms-input').addEventListener('input', () => {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(doParseSmS, 400);
  });

  renderSMSLog();
}

// ── PARSE ──────────────────────────────────────────────────
function doParseSmS() {
  const txt    = document.getElementById('sms-input')?.value.trim();
  const resEl  = document.getElementById('sms-parse-result');
  const confEl = document.getElementById('sms-confirm-area');
  if(!resEl||!confEl)return;

  if(!txt){resEl.innerHTML='';confEl.style.display='none';return;}

  const parsed=detectAndParse(txt);
  if(!parsed||!parsed.amount){
    resEl.innerHTML=`<div class="parse-result">
      <div style="color:var(--amber);font-size:0.85rem;padding:8px 0">
        ⚠️ Could not extract payment details. Paste the full SMS text.
      </div></div>`;
    confEl.style.display='none';return;
  }
  currentParsed=parsed;
  const matched=matchTenant(parsed);

  // Show parse result
  resEl.innerHTML=`
    <div class="parse-result">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span class="bank-chip ${parsed.cls}">${parsed.bank}</span>
        <span style="font-size:0.8rem;color:var(--green);font-weight:600">✓ Parsed successfully</span>
      </div>
      <div class="parse-field"><span class="parse-key">Amount</span>
        <span class="parse-val" style="color:var(--green);font-size:1.05rem">${ksh(parsed.amount)}</span></div>
      <div class="parse-field"><span class="parse-key">Date</span><span class="parse-val">${parsed.date}</span></div>
      <div class="parse-field"><span class="parse-key">Method</span><span class="parse-val">${parsed.method}</span></div>
      ${parsed.ref?`<div class="parse-field"><span class="parse-key">Reference</span><span class="parse-val">${parsed.ref}</span></div>`:''}
      ${parsed.senderName?`<div class="parse-field"><span class="parse-key">Sender Name</span><span class="parse-val">${parsed.senderName}</span></div>`:''}
      ${parsed.phone?`<div class="parse-field"><span class="parse-key">Phone</span><span class="parse-val">${parsed.phone}</span></div>`:''}
      <div class="parse-field"><span class="parse-key">Tenant Match</span>
        <span class="parse-val ${matched?'match':'nomatch'}">${matched?'✓ '+matched.name:'⚠ No match — select below'}</span></div>
    </div>`;

  // Populate tenant dropdown
  const sel=document.getElementById('sms-tenant-sel');
  if(sel) sel.innerHTML=buildTenantOptions(matched);

  // Fill other fields
  const amt=document.getElementById('sms-amount'); if(amt)amt.value=parsed.amount||'';
  const dt =document.getElementById('sms-date');   if(dt) dt.value=parsed.date||getToday();
  const met=document.getElementById('sms-method'); if(met)met.value=parsed.method||'M-PESA';
  const ref=document.getElementById('sms-ref');    if(ref)ref.value=parsed.ref||'';
  const not=document.getElementById('sms-notes');  if(not)not.value=`Imported from ${parsed.bank} SMS${parsed.senderName?' · '+parsed.senderName:''}`;

  // Show confirm area
  confEl.style.display='block';
  confEl.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ── CONFIRM / LOG ──────────────────────────────────────────
async function doConfirmSMS() {
  const tId   =document.getElementById('sms-tenant-sel')?.value;
  const amount=parseFloat(document.getElementById('sms-amount')?.value)||0;
  if(!tId)   return toast.error('Please select a tenant');
  if(!amount)return toast.error('Amount is required');

  const btn=document.getElementById('btn-confirm-sms');
  if(btn){btn.classList.add('loading');btn.disabled=true;}
  try{
    await recordPayment({
      tenantId:tId,amount,
      date:   document.getElementById('sms-date')?.value  ||getToday(),
      method: document.getElementById('sms-method')?.value||'M-PESA',
      ref:    document.getElementById('sms-ref')?.value   ||'',
      notes:  document.getElementById('sms-notes')?.value ||'',
      smsRaw: currentParsed?.raw?.substr(0,200)||'',
      bank:   currentParsed?.bank||'',
      senderPhone:currentParsed?.phone||'',
      senderName: currentParsed?.senderName||''
    });
    const t=AppState.tenants.find(t=>t.id===tId);
    toast.success(`${ksh(amount)} logged for ${t?.name} ✓`);
    doClearSMS();
    renderSMSLog();
  }catch(e){toast.error(e.message);}
  finally{if(btn){btn.classList.remove('loading');btn.disabled=false;}}
}

// ── CLEAR ──────────────────────────────────────────────────
function doClearSMS() {
  const inp=document.getElementById('sms-input');      if(inp)inp.value='';
  const res=document.getElementById('sms-parse-result');if(res)res.innerHTML='';
  const con=document.getElementById('sms-confirm-area');if(con)con.style.display='none';
  currentParsed=null;
}

// ── EXAMPLE ────────────────────────────────────────────────
function doExampleSMS() {
  const examples=[
    'BG27SH3 Confirmed. Ksh12,000 received from 0712345678 JANE WANJIKU on 3/7/26 at 10:23 AM. New M-PESA balance is Ksh23,456. Transaction cost, Ksh0.00.',
    'You have received KES 8,500.00 from PETER NJOROGE 0723456789 on 03-Jul-2026 via Equity Bank. Ref: EQB9876543.',
    'KCB: Ksh15,000 received. Ref: KCB1234567. From: JOHN KAMAU. Date: 03/07/2026. Bal: Ksh45,230.'
  ];
  const inp=document.getElementById('sms-input');
  if(inp){
    inp.value=examples[Math.floor(Math.random()*examples.length)];
    doParseSmS();
  }
}

// ── SMS LOG ────────────────────────────────────────────────
function renderSMSLog() {
  const el=document.getElementById('sms-log');
  if(!el)return;
  const smsPayments=AppState.payments
    .filter(p=>p.metadata?.bank||p.metadata?.smsRaw)
    .sort((a,b)=>b.date?.localeCompare(a.date))
    .slice(0,20);

  if(!smsPayments.length){
    el.innerHTML=`<div style="text-align:center;padding:30px;color:var(--text-muted)">
      <div style="font-size:1.5rem;margin-bottom:8px">📱</div>
      <p style="font-size:0.85rem">Payments imported via SMS will appear here.</p></div>`;
    return;
  }
  el.innerHTML=`<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Bank</th><th>Reference</th></tr></thead>
    <tbody>${smsPayments.map(p=>{
      const t=AppState.tenants.find(t=>t.id===p.tenantId);
      const cls=getBankCls(p.metadata?.bank||'');
      return `<tr>
        <td style="color:var(--text-muted);font-size:0.82rem">${p.date}</td>
        <td><strong>${esc(t?.name||'—')}</strong></td>
        <td style="color:var(--green);font-weight:700">${ksh(p.amount)}</td>
        <td><span class="bank-chip ${cls}">${esc(p.metadata?.bank||'—')}</span></td>
        <td style="color:var(--text-muted);font-size:0.8rem;font-family:var(--font-mono)">${p.reference||'—'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function getBankCls(bank){
  const b=(bank||'').toLowerCase();
  if(b.includes('m-pesa')||b.includes('mpesa'))return 'bank-mpesa';
  if(b.includes('equity'))return 'bank-equity';
  if(b.includes('kcb'))return 'bank-kcb';
  if(b.includes('co-op')||b.includes('coop'))return 'bank-coop';
  if(b.includes('airtel'))return 'bank-airtel';
  return 'bank-other';
}

function esc(str){
  return String(str||'').replace(/[&<>"']/g,c=>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
