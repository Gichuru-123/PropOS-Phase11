// ============================================================
// PropOS — Settings Page
// ============================================================

import { AppState, ksh } from '../store.js';
import { can } from '../auth.js';
import { toast } from '../components/toast.js';
import { saveSettings, appSettings } from '../services/settingsService.js';

export function render() {
  const el = document.getElementById('page-settings');
  if (!el) return;

  const s = appSettings;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">

      <!-- Owner Info -->
      <div class="card">
        <div class="section-title" style="margin-bottom:16px">🏠 Owner Information</div>
        <div class="form-group">
          <label class="form-label">Owner / Manager Name</label>
          <input type="text" class="form-input" id="s-owner"
            value="${esc(s.ownerName)}" placeholder="Your full name"/>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input type="text" class="form-input" id="s-phone"
            value="${esc(s.ownerPhone)}" placeholder="+254700000000"/>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" class="form-input" id="s-email"
            value="${esc(s.ownerEmail)}" placeholder="you@example.com"/>
        </div>
        <div class="form-group">
          <label class="form-label">Company / Trading Name</label>
          <input type="text" class="form-input" id="s-company"
            value="${esc(s.company)}" placeholder="e.g. Kamau Properties Ltd"/>
        </div>
        <button class="btn btn-primary" onclick="saveSettingsForm()">Save Changes</button>
      </div>

      <!-- Billing Settings -->
      <div class="card">
        <div class="section-title" style="margin-bottom:16px">📅 Billing Settings</div>
        <div class="form-group">
          <label class="form-label">Rent Due Day
            <span class="hint">— day of month rent is due (1–28)</span>
          </label>
          <input type="number" class="form-input" id="s-dueday"
            value="${s.dueDay||1}" min="1" max="28" placeholder="1"/>
        </div>
        <div class="form-group">
          <label class="form-label">Grace Period (days)
            <span class="hint">— days after due date before arrears flag</span>
          </label>
          <input type="number" class="form-input" id="s-grace"
            value="${s.graceDays||5}" min="0" max="30" placeholder="5"/>
        </div>
        <div style="background:var(--bg-hover);border-radius:var(--r);padding:14px;margin-top:8px;">
          <div style="font-size:0.78rem;color:var(--text-muted);line-height:1.6">
            <strong style="color:var(--text-secondary)">Current setting:</strong><br/>
            Rent is due on day <strong style="color:var(--accent-light)">${s.dueDay||1}</strong> of each month.
            Arrears are flagged after <strong style="color:var(--accent-light)">${s.graceDays||5}</strong> grace days.
          </div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" onclick="saveSettingsForm()">Save Changes</button>
      </div>

      <!-- Africa's Talking SMS -->
      <div class="card">
        <div class="section-title" style="margin-bottom:8px">📡 Africa's Talking — SMS</div>
        <div style="background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:var(--r);padding:10px 13px;font-size:0.78rem;color:var(--amber);margin-bottom:14px;line-height:1.5;">
          ⚠️ SMS requires this app to be hosted on a web server (not <code>file://</code>).
          Live Server on localhost works. Netlify deployment works.
          Phone numbers must be in <strong>+254XXXXXXXXX</strong> format — the app auto-converts.
        </div>
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input type="password" class="form-input" id="s-atkey"
            value="${esc(s.atApiKey)}" placeholder="Your Africa's Talking API key"/>
        </div>
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" class="form-input" id="s-atuser"
            value="${esc(s.atUsername||'sandbox')}" placeholder="sandbox or your AT username"/>
        </div>
        <div class="form-group">
          <label class="form-label">Sender ID (optional)</label>
          <input type="text" class="form-input" id="s-atsender"
            value="${esc(s.atSenderId)}" placeholder="e.g. PROPMANAGER (must be approved by AT)"/>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="saveSettingsForm()">Save</button>
          <button class="btn btn-ghost" onclick="testATConnection()">🔌 Test Connection</button>
        </div>
      </div>

      <!-- Data Management -->
      <div class="card">
        <div class="section-title" style="margin-bottom:6px">💾 Data Management</div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;line-height:1.5">
          Your data is stored in Firebase Firestore and is safe.
          Export regularly as an extra backup.
        </p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-ghost" onclick="exportDataCSV()">
            ⬇ Export Tenants CSV
          </button>
          <button class="btn btn-ghost" onclick="exportDataJSON()">
            ⬇ Export Full Backup (JSON)
          </button>
          <hr class="divider"/>
          <div style="background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--r);padding:12px;font-size:0.8rem;color:var(--red);line-height:1.5;">
            ⚠️ <strong>Danger Zone</strong><br/>
            Clearing data removes everything from your local app state.
            Firebase data is NOT affected — reload the page to restore it.
          </div>
        </div>
      </div>

    </div>

    <!-- App Info -->
    <div style="margin-top:18px;text-align:center;font-size:0.75rem;color:var(--text-muted);">
      PropOS v6 · Firebase Firestore · Project: propos-app-55227
    </div>
  `;
}

// ── SAVE SETTINGS ──────────────────────────────────────────
window.saveSettingsForm = async function() {
  const btn = event.target;
  btn.classList.add('loading'); btn.disabled = true;
  try {
    await saveSettings({
      ownerName:  document.getElementById('s-owner')?.value   || '',
      ownerPhone: document.getElementById('s-phone')?.value   || '',
      ownerEmail: document.getElementById('s-email')?.value   || '',
      company:    document.getElementById('s-company')?.value || '',
      atApiKey:   document.getElementById('s-atkey')?.value   || '',
      atUsername: document.getElementById('s-atuser')?.value  || 'sandbox',
      atSenderId: document.getElementById('s-atsender')?.value|| '',
      dueDay:     document.getElementById('s-dueday')?.value  || 1,
      graceDays:  document.getElementById('s-grace')?.value   || 5
    });
    // Sync to AppState for the engine
    AppState.settings.dueDay    = Number(document.getElementById('s-dueday')?.value) || 1;
    AppState.settings.graceDays = Number(document.getElementById('s-grace')?.value)  || 5;
    toast.success('Settings saved!');
    render(); // refresh to show updated values
  } catch(e) {
    toast.error('Failed to save: ' + e.message);
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
};

// ── TEST AT CONNECTION ─────────────────────────────────────
window.testATConnection = async function() {
  const apiKey   = document.getElementById('s-atkey')?.value.trim();
  const username = document.getElementById('s-atuser')?.value.trim() || 'sandbox';
  if (!apiKey) return toast.error('Enter your API key first');
  toast.info('Testing Africa\'s Talking connection…');
  try {
    const resp = await fetch(`/at-proxy/user?username=${encodeURIComponent(username)}`, {
      method: 'GET',
      headers: { 'apiKey': apiKey, 'Accept': 'application/json' }
    });
    const data = await resp.json();
    if (data?.UserData) {
      toast.success(`✅ Connected! Balance: ${data.UserData.balance}`);
    } else if (resp.status === 401 || resp.status === 403) {
      toast.error('❌ Invalid API key or username');
    } else {
      toast.warning('⚠ Unexpected response — check your credentials');
    }
  } catch(e) {
    toast.error('❌ Connection failed — ensure you are on a hosted server, not file://');
  }
};

// ── EXPORT CSV ─────────────────────────────────────────────
window.exportDataCSV = function() {
  let csv = 'Name,ID,Phone,Email,Building,Unit,Rent,Deposit,Move In,Lease End,Status\n';
  AppState.tenants.forEach(t => {
    const u = AppState.units.find(u => u.id === t.unitId);
    const b = AppState.buildings.find(b => b.id === t.buildingId);
    csv += [
      `"${t.name}"`, `"${t.idNumber||''}"`, `"${t.phone}"`, `"${t.email||''}"`,
      `"${b?.name||''}"`, `"${u?.number||''}"`, u?.rent||0, t.deposit||0,
      t.moveIn||'', t.leaseEnd||'', t.status||'active'
    ].join(',') + '\n';
  });
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download= `PropOS_Tenants_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast.success('CSV exported!');
};

// ── EXPORT JSON ────────────────────────────────────────────
window.exportDataJSON = function() {
  const backup = {
    exportedAt: new Date().toISOString(),
    buildings:  AppState.buildings,
    units:      AppState.units,
    tenants:    AppState.tenants,
    payments:   AppState.payments,
    expenses:   AppState.expenses
  };
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  a.download= `PropOS_Backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  toast.success('JSON backup exported!');
};

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
