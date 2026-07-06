// ============================================================
// PropOS — Toast Notifications
// ============================================================

let _container = null;

function getContainer() {
  if (!_container) {
    _container = document.getElementById('toast-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'toast-container';
      document.body.appendChild(_container);
    }
  }
  return _container;
}

// type: 'success' | 'error' | 'warning' | 'info'
export function showToast(message, type = 'info', duration = 3500) {
  const container = getContainer();
  const icons = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️'
  };

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    el.style.transition = 'all 0.4s ease';
    setTimeout(() => el.remove(), 400);
  }, duration);
}

export const toast = {
  success: (msg, d) => showToast(msg, 'success', d),
  error:   (msg, d) => showToast(msg, 'error',   d),
  warning: (msg, d) => showToast(msg, 'warning', d),
  info:    (msg, d) => showToast(msg, 'info',    d)
};
