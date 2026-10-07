/* DAONG role selector, sample audit activity and CSV reports. */
(() => {
  const $ = id => document.getElementById(id);
  function route() {
    const panel = location.hash.slice(1);
    const admin = ['super-admin', 'reports', 'audit'].includes(panel);
    $('role-picker').hidden = admin;
    $('super-admin').hidden = !admin;
    $('admin-overview').hidden = panel !== 'super-admin';
    ['reports', 'audit'].forEach(id => $(id).hidden = panel !== id);
    document.querySelectorAll('[data-panel]').forEach(link => {
      if (link.dataset.panel === panel) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  $('back-to-roles').addEventListener('click', () => { location.hash = 'roles'; });
  window.addEventListener('hashchange', route); route();
  const auditRows = [...document.querySelectorAll('#audit-table tbody tr')];
  const empty = document.createElement('p'); empty.className = 'subtle'; empty.textContent = 'No activity matches these filters.'; empty.hidden = true;
  $('audit-table').parentElement.appendChild(empty);
  function filterAudit() {
    const term = $('audit-search').value.toLowerCase().trim(), category = $('audit-filter').value;
    auditRows.forEach(row => { row.hidden = (category !== 'all' && row.dataset.category !== category) || !row.textContent.toLowerCase().includes(term); });
    empty.hidden = auditRows.some(row => !row.hidden);
  }
  $('audit-search').addEventListener('input', filterAudit);
  $('audit-filter').addEventListener('change', filterAudit);
})();
