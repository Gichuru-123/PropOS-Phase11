// ============================================================
// PropOS — Modal Component
// ============================================================

// Open a modal overlay by ID
export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  // Focus first input if present
  setTimeout(() => {
    const first = el.querySelector('input:not([type=hidden]), select, textarea');
    if (first) first.focus();
  }, 100);
}

// Close a modal overlay by ID
export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  document.body.style.overflow = '';
}

// Close on backdrop click
export function initModalBackdrops() {
  document.querySelectorAll('.overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  });
  // Close on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.overlay.open');
      if (open) {
        open.classList.remove('open');
        document.body.style.overflow = '';
      }
    }
  });
}

// Confirmation dialog (returns Promise<boolean>)
export function confirmDialog(message, title = 'Confirm') {
  return new Promise(resolve => {
    const overlay = document.getElementById('m-confirm');
    if (!overlay) {
      // Fallback to native
      resolve(window.confirm(message));
      return;
    }
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    openModal('m-confirm');
    const yes = document.getElementById('confirm-yes');
    const no  = document.getElementById('confirm-no');
    const cleanup = () => { yes.onclick = null; no.onclick = null; closeModal('m-confirm'); };
    yes.onclick = () => { cleanup(); resolve(true); };
    no.onclick  = () => { cleanup(); resolve(false); };
  });
}
