/* Browser-local demo registry; hardware/API integration is not connected. */
(() => {
  const key = 'daong-esp32-registry-v1';
  const seed = [
    { id: 'ESP-001', vehicle: 'CHU-6767', registered: '2026-10-05T08:00:00+08:00' },
    { id: 'ESP-002', vehicle: 'DAN-1254', registered: '2026-10-05T08:01:00+08:00' },
    { id: 'ESP-003', vehicle: 'NCR-4088', registered: '2026-10-05T08:02:00+08:00' },
    { id: 'ESP-004', vehicle: 'SEF-123', registered: '2026-10-05T08:03:00+08:00' }
  ];
  let modules = seed, pendingId = null;
  const $ = id => document.getElementById(id);
  const safe = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved) && saved.every(m => m && typeof m.id === 'string' && typeof m.vehicle === 'string' && Number.isFinite(Date.parse(m.registered)))) modules = saved;
  } catch (_) { /* Keep the seed when storage is unavailable or invalid. */ }
  const chip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M8 2v3m4-3v3m4-3v3M8 19v3m4-3v3m4-3v3M2 8h3m-3 4h3m-3 4h3m14-8h3m-3 4h3m-3 4h3"/></svg>';
  const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
  function save(message) {
    try { localStorage.setItem(key, JSON.stringify(modules)); $('esp-message').textContent = message; }
    catch (_) { $('esp-message').textContent = message + ' Browser storage is unavailable; this change will not survive a reload.'; }
    render();
  }
  function view(register) {
    $('registry-view').hidden = register;
    $('register-view').hidden = !register;
    ['registry-tab', 'register-tab'].forEach((id, i) => {
      const active = register === (i === 1);
      $(id).classList.toggle('active', active);
      $(id).setAttribute('aria-pressed', String(active));
    });
    if (register) $('module-id').focus();
  }
  function render() {
    const attached = modules.filter(m => m.vehicle).length;
    $('total-modules').textContent = modules.length;
    $('attached-modules').textContent = attached;
    $('available-modules').textContent = modules.length - attached;
    const q = $('module-search').value.trim().toLowerCase(), status = $('module-status').value;
    const rows = modules.filter(m => `${m.id} ${m.vehicle}`.toLowerCase().includes(q) && (status === 'all' || (m.vehicle ? 'attached' : 'available') === status));
    rows.sort((a, b) => $('module-sort').value === 'id' ? a.id.localeCompare(b.id, undefined, { numeric: true }) : $('module-sort').value === 'oldest' ? Date.parse(a.registered) - Date.parse(b.registered) : Date.parse(b.registered) - Date.parse(a.registered));
    $('result-count').textContent = `${rows.length} of ${modules.length} modules`;
    $('module-list').innerHTML = rows.length ? rows.map(m => `<article class="module-row"><span class="module-chip">${chip}</span><div><span class="module-label">Hardware ID</span><strong class="module-id">${safe(m.id)}</strong></div><div class="module-status-wrap"><span class="module-label">Status</span><span class="module-badge ${m.vehicle ? '' : 'available'}">${m.vehicle ? 'Attached' : 'Available'}</span><span class="module-vehicle">${m.vehicle ? 'on ' + safe(m.vehicle) : 'Ready to assign'}</span></div><div class="module-date-wrap"><span class="module-label">Date registered</span><span class="module-date">${new Date(m.registered).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}</span></div><button type="button" class="module-remove" data-remove="${safe(m.id)}" aria-label="Remove ${safe(m.id)}">${trash}</button></article>`).join('') : `<div class="esp-empty"><strong>${modules.length ? 'No matching modules' : 'Your registry is empty'}</strong>${modules.length ? 'Try another search or status filter.' : 'Register a module to start building your fleet.'}</div>`;
  }
  $('registry-tab').addEventListener('click', () => view(false));
  $('register-tab').addEventListener('click', () => view(true));
  $('cancel-register').addEventListener('click', () => { view(false); $('registry-tab').focus(); });
  ['module-search', 'module-status', 'module-sort'].forEach(id => $(id).addEventListener(id === 'module-search' ? 'input' : 'change', render));
  $('module-id').addEventListener('input', () => $('module-id').setCustomValidity(''));
  $('module-form').addEventListener('submit', e => {
    e.preventDefault();
    const id = $('module-id').value.trim().toUpperCase(), vehicle = $('module-vehicle').value.trim().toUpperCase();
    if (modules.some(m => m.id.toUpperCase() === id)) {
      $('module-id').setCustomValidity('This hardware ID is already registered.');
      $('module-id').reportValidity(); return;
    }
    modules.push({ id, vehicle, registered: new Date().toISOString() });
    $('module-form').reset(); $('module-search').value = ''; $('module-status').value = 'all'; $('module-sort').value = 'recent';
    save(`${id} registered successfully.`); view(false); $('registry-tab').focus();
  });
  $('module-list').addEventListener('click', e => {
    const button = e.target.closest('[data-remove]'); if (!button) return;
    const m = modules.find(m => m.id === button.dataset.remove); if (!m) return;
    pendingId = m.id;
    $('delete-description').textContent = m.vehicle ? `${m.id} is attached to ${m.vehicle}. Removing it will delete this browser's registry entry. Live Tracking demo data will remain separate.` : `Remove ${m.id} from this browser's registry?`;
    $('delete-module').showModal();
  });
  $('delete-module').addEventListener('close', () => {
    if ($('delete-module').returnValue === 'delete' && pendingId) {
      modules = modules.filter(m => m.id !== pendingId); save(`${pendingId} removed.`); $('module-search').focus();
    }
    pendingId = null;
  });
  render();
})();
