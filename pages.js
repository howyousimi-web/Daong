/**
 * pages.js
 * ---------------------------------------------------------------
 * Per-page render hooks built on apiService.js (data) and
 * donations.js (domain logic). Every function checks for its own
 * page's root element first and does nothing if that page isn't the
 * current one, so this single file can load everywhere.
 *
 * Everything on screen now comes from the backend: drive funding, the
 * checkpoint trail, the impact figures, the dashboard totals and the
 * contribution history. Nothing is hardcoded in the markup and nothing
 * is invented in the browser.
 *
 * Three states are handled everywhere data is fetched — loading,
 * empty, and failed — because "no data" and "couldn't reach the
 * server" are different things and a blank panel says neither.
 * --------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  initHomeInteractions();
  renderDrivesGrid('home-drives-grid', { limit: 3, interactive: false });
  renderDrivesGrid('drives-grid', { interactive: true });
  renderImpactStats();
  initTrackPage();
  initContactForm();
  initDashboard();
});

// Auth state settles asynchronously (app.js validates the stored token
// against the backend). Anything role-dependent re-renders when it does.
document.addEventListener('daong:logged-in', () => {
  initDashboard();
  renderDrivesGrid('drives-grid', { interactive: true });
});
document.addEventListener('daong:logged-out', () => {
  initDashboard();
  renderDrivesGrid('drives-grid', { interactive: true });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function categoryBand(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('food')) return 'band-food';
  if (c.includes('medic')) return 'band-medical';
  if (c.includes('shelter')) return 'band-shelter';
  return 'band-cash';
}

function isAdmin() {
  const user = window.apiService.TokenStore.getUser();
  return !!(window.apiService.TokenStore.get() && user && user.role === 'admin');
}

function isSignedIn() {
  return !!(window.apiService.TokenStore.get() && window.apiService.TokenStore.getUser());
}

/* =========================================================
   HOME PAGE — hero search, path buttons, scroll cue
   ========================================================= */
function initHomeInteractions() {
  const scrollCue = document.getElementById('scroll-cue');
  scrollCue?.addEventListener('click', () => {
    document.getElementById('proof')?.scrollIntoView({ behavior: 'smooth' });
  });

  const heroSearch = document.getElementById('hero-search');
  const heroNote = document.getElementById('hero-note');
  const heroTrackBtn = document.getElementById('hero-track-btn');
  function handleHeroTrack() {
    const val = heroSearch.value.trim();
    if (!val) { heroNote.textContent = 'Enter a tracking ID first.'; return; }
    window.location.href = `track.html?id=${encodeURIComponent(val)}`;
  }
  heroTrackBtn?.addEventListener('click', handleHeroTrack);
  heroSearch?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleHeroTrack(); });

  document.getElementById('path-donor-btn')?.addEventListener('click', () => {
    window.location.href = 'track.html';
  });
  document.getElementById('path-recipient-btn')?.addEventListener('click', () => {
    window.location.href = 'drives.html';
  });
  document.getElementById('cta-track-btn')?.addEventListener('click', () => {
    window.location.href = 'track.html';
  });
}

/* =========================================================
   IMPACT FIGURES — home page and Info & Impact
   The four stat tiles used to be typed into the HTML. They are
   now served from the database via GET /stats/impact, so the
   "under review" tile in particular always matches what is
   actually flagged.
   ========================================================= */
async function renderImpactStats() {
  const targets = document.querySelectorAll('[data-stat]');
  if (!targets.length) return;

  const wanted = new Set(Array.from(targets).map((el) => el.getAttribute('data-stat')));
  // Only the impact tiles are served by this endpoint; the dashboard's
  // own tiles are filled by initDashboard().
  const impactKeys = ['reliefValue', 'activeOperations', 'individualsReached', 'underReview'];
  if (!impactKeys.some((k) => wanted.has(k))) return;

  setStat(impactKeys, '…');

  const res = await window.apiService.getImpactStats();
  if (!res.ok) {
    setStat(impactKeys, '—');
    return;
  }

  const s = res.data.stats;
  const money = window.donationLogic.money;
  const compactPhp = (n) => (n >= 1000000
    ? `₱${(n / 1000000).toFixed(1)}M`
    : money(n));

  applyStat('reliefValue', compactPhp(s.reportedReliefValuePhp));
  applyStat('activeOperations', String(s.activeOperations));
  applyStat('individualsReached', Number(s.individualsReached).toLocaleString('en-PH'));
  applyStat('underReview', String(s.underReview));
}

function applyStat(key, value) {
  document.querySelectorAll(`[data-stat="${key}"]`).forEach((el) => { el.textContent = value; });
}

function setStat(keys, value) {
  keys.forEach((k) => applyStat(k, value));
}

/* =========================================================
   DRIVES GRID — home teaser and the full Drives page
   ========================================================= */
async function renderDrivesGrid(containerId, opts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { limit, interactive } = opts || {};

  container.innerHTML = '<p class="empty-state">Loading active drives…</p>';

  const [drivesRes, donationsRes] = await Promise.all([
    window.apiService.getDrives(),
    window.apiService.getDonations(),
  ]);

  if (!drivesRes.ok) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(drivesRes.message)}</p>`;
    return;
  }

  const all = drivesRes.data.drives || [];
  if (!all.length) {
    container.innerHTML = '<p class="empty-state">No active drives at the moment. Please check back soon.</p>';
    return;
  }

  const drives = limit ? all.slice(0, limit) : all;
  const donations = donationsRes.ok ? (donationsRes.data.donations || []) : [];
  const money = window.donationLogic.money;

  container.innerHTML = drives.map((d) => {
    const linked = donations.filter((don) => don.driveId === d.id);
    const chipsHtml = linked.length
      ? `<div class="donation-chip-row">${linked.map((don) => donationChipHtml(don)).join('')}</div>`
      : '<div class="donation-chip-row"><span class="donation-chip-empty">No individually tracked donations logged yet.</span></div>';

    return `
    <article class="appeal-card" data-drive-id="${escapeHtml(d.id)}">
      <div class="op-band ${categoryBand(d.category)}"></div>
      <div class="card-body">
        <span class="category-tag">${escapeHtml(d.category)}</span>
        <h3>${escapeHtml(d.title)}</h3>
        <div class="progress-container">
          <div class="progress-bar" role="progressbar" aria-valuenow="${d.percentFunded}" aria-valuemin="0" aria-valuemax="100" style="width:${d.percentFunded}%;"></div>
        </div>
        <div class="progress-meta">
          <span class="progress-pct"><strong>${d.percentFunded}%</strong> Funded</span>
          <span>Goal: ${money(d.goalPhp)}</span>
        </div>
        ${interactive ? `
          <button type="button" class="btn btn-gold pledge-btn" style="width:100%;margin-top:1rem;" data-drive-id="${escapeHtml(d.id)}">Pledge to this Drive</button>
          <div class="pledge-inline" hidden></div>
          <div class="drive-donations">
            <div class="drive-donations-head">Tracked Donations · ${linked.length}</div>
            ${chipsHtml}
          </div>
        ` : `
          <a href="drives.html" class="text-btn" style="margin-top:1rem;display:inline-block;">View &amp; pledge →</a>
        `}
      </div>
    </article>`;
  }).join('');

  if (interactive) {
    container.querySelectorAll('.pledge-btn').forEach((btn) => wirePledgeButton(btn, drives));
  }
}

function donationChipHtml(donation) {
  const cls = window.donationLogic.stampClass(donation.status);
  return `<a href="track.html?id=${encodeURIComponent(donation.id)}" class="donation-chip is-${cls}"><span class="dot"></span>${escapeHtml(donation.id)}</a>`;
}

function wirePledgeButton(btn, drives) {
  btn.addEventListener('click', () => {
    if (!isSignedIn()) {
      window.__daongAuthModal.open();
      return;
    }
    const driveId = btn.getAttribute('data-drive-id');
    const drive = drives.find((d) => d.id === driveId);
    const card = btn.closest('.appeal-card');
    const inline = card.querySelector('.pledge-inline');
    btn.hidden = true;
    inline.hidden = false;
    inline.innerHTML = `
      <div class="form-row">
        <div class="field">
          <label for="pledge-amt-${escapeHtml(driveId)}">Amount (PHP)</label>
          <input type="number" min="100" step="1" id="pledge-amt-${escapeHtml(driveId)}" placeholder="e.g. 500">
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-gold pledge-confirm" style="flex:1;">Confirm Pledge</button>
        <button type="button" class="btn btn-outline pledge-cancel">Cancel</button>
      </div>
      <div class="field-error" id="pledge-error-${escapeHtml(driveId)}"></div>`;

    inline.querySelector('.pledge-cancel').addEventListener('click', () => {
      inline.hidden = true; inline.innerHTML = ''; btn.hidden = false;
    });
    inline.querySelector('.pledge-confirm').addEventListener('click', () => confirmPledge(driveId, drive, card, inline));
  });
}

async function confirmPledge(driveId, drive, card, inline) {
  const amountInput = inline.querySelector('input[type="number"]');
  const errEl = inline.querySelector('.field-error');
  const confirmBtn = inline.querySelector('.pledge-confirm');
  const amount = parseFloat(amountInput.value);

  const showError = (msg) => {
    errEl.textContent = msg;
    errEl.classList.add('show');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Pledge';
  };

  // Mirrors the backend's own minimum so the common mistake is caught
  // without a round trip. The backend still enforces it independently.
  if (!amount || amount < 100) {
    showError('Enter a pledge amount of at least ₱100.');
    return;
  }
  errEl.textContent = '';
  errEl.classList.remove('show');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Submitting…';

  const result = await window.apiService.pledgeDonation({
    driveId,
    amountPhp: amount,
    category: 'Cash Relief',
  });

  // Nothing on screen changes until the backend confirms the write.
  if (!result.ok) {
    if (result.status === window.apiService.STATUS.AUTH_EXPIRED) {
      showError('Your session has ended. Please log in again to pledge.');
      return;
    }
    showError(result.errors && result.errors.length ? result.errors[0] : result.message);
    return;
  }

  const { donation, drive: updatedDrive } = result.data;

  if (updatedDrive) {
    const bar = card.querySelector('.progress-bar');
    const pctEl = card.querySelector('.progress-pct');
    if (bar) { bar.style.width = updatedDrive.percentFunded + '%'; bar.setAttribute('aria-valuenow', updatedDrive.percentFunded); }
    if (pctEl) pctEl.innerHTML = `<strong>${updatedDrive.percentFunded}%</strong> Funded`;
  }

  const chipRow = card.querySelector('.donation-chip-row');
  const headEl = card.querySelector('.drive-donations-head');
  if (chipRow) {
    const emptyEl = chipRow.querySelector('.donation-chip-empty');
    if (emptyEl) emptyEl.remove();
    chipRow.insertAdjacentHTML('beforeend', donationChipHtml(donation));
  }
  if (headEl) {
    const count = chipRow ? chipRow.querySelectorAll('.donation-chip').length : 1;
    headEl.textContent = `Tracked Donations · ${count}`;
  }

  inline.innerHTML = `<div class="ai-box"><div class="ai-label">Pledge received</div>Your donation is now tracked as <strong>${escapeHtml(donation.id)}</strong>. <a href="track.html?id=${encodeURIComponent(donation.id)}" style="color:var(--gold-2);text-decoration:underline;">Track its journey →</a></div>`;
}

/* =========================================================
   TRACK PAGE (Citizen Lookup) — public, no auth required
   ========================================================= */
function initTrackPage() {
  const input = document.getElementById('track-search-input');
  const resultEl = document.getElementById('track-result');
  if (!input || !resultEl) return;

  const btn = document.getElementById('track-search-btn');
  const doSearch = () => {
    const val = input.value.trim();
    if (val) renderTrackResult(val, resultEl);
  };
  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  const params = new URLSearchParams(window.location.search);
  const deepLinkId = params.get('id');
  if (deepLinkId) {
    input.value = deepLinkId;
    renderTrackResult(deepLinkId, resultEl);
  } else {
    input.value = 'TN-1001';
    renderTrackResult('TN-1001', resultEl);
  }
}

async function renderTrackResult(rawId, resultEl) {
  resultEl.innerHTML = '<div class="mini-card"><p class="empty-state">Searching…</p></div>';
  const logic = window.donationLogic;
  const normalized = logic.normalizeTrackingId(rawId);

  // One record, fetched by ID — not the whole donation list filtered in
  // the browser.
  const res = await window.apiService.getDonation(normalized);

  if (!res.ok) {
    const msg = res.status === window.apiService.STATUS.NOT_FOUND
      ? `No donation found for "${escapeHtml(rawId)}". Try TN-1001, TN-1002, or TN-1003.`
      : escapeHtml(res.message);
    resultEl.innerHTML = `<div class="mini-card"><div class="empty-state">${msg}</div></div>`;
    return;
  }

  const donation = res.data.donation;
  const tl = logic.STAGES.map((stage, i) => {
    const cp = (donation.checkpoints || []).find((c) => c.stage === stage);
    const isFlaggedStage = donation.status === 'flagged' && stage === logic.STAGES[donation.stageIndex];
    let cls = 'pending';
    if (cp) cls = isFlaggedStage ? 'flagged' : 'done';
    return `<div class="tl-item ${cls}">
      <div class="tl-dot">${cp ? (isFlaggedStage ? '!' : '✓') : (i + 1)}</div>
      <div class="tl-body">
        <div class="tl-stage">${stage}</div>
        ${cp ? `<div class="tl-time">${escapeHtml(cp.loc)} &middot; ${escapeHtml(cp.time)}</div>` : '<div class="tl-note">Not yet reached</div>'}
        ${isFlaggedStage ? '<div class="tl-note" style="color:var(--red);">Flagged for verification — under review.</div>' : ''}
      </div></div>`;
  }).join('');

  resultEl.innerHTML = `
    <div class="mini-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
        <div>
          <div class="shipment sid" style="border:none;padding:0;">${escapeHtml(donation.id)}</div>
          <div class="donor" style="font-size:17px;">${logic.money(donation.amountPhp)} — ${escapeHtml(donation.category)}</div>
          <div class="meta">${escapeHtml(donation.org)} &middot; Logged ${escapeHtml(donation.date)}</div>
        </div>
        <span class="stamp ${logic.stampClass(donation.status)}">${logic.stampLabel(donation.status)}</span>
      </div>
      <button class="btn-ai" id="btn-track-ai">Ask AI to summarize this journey</button>
      <div id="track-ai-slot"></div>
      <div class="timeline" style="margin-top:20px;">${tl}</div>
    </div>`;

  document.getElementById('btn-track-ai').addEventListener('click', (e) => runSummarize(donation, e.target));
}

async function runSummarize(donation, btn) {
  const slot = document.getElementById('track-ai-slot');
  btn.disabled = true; btn.textContent = 'Summarizing…';
  slot.innerHTML = '<div class="ai-box"><div class="ai-label"><span class="ai-pulse"></span>AI Summary</div>Reading the checkpoint history…</div>';
  const { ok, text } = await window.donationLogic.summarizeJourney(donation);
  slot.innerHTML = `<div class="ai-box${ok ? '' : ' is-error'}"><div class="ai-label">${ok ? '<span class="ai-pulse"></span>AI Summary' : 'AI Summary — Unavailable'}</div>${escapeHtml(text)}</div>`;
  btn.disabled = false; btn.textContent = 'Ask AI to summarize this journey';
}

/* =========================================================
   CONTACT FORM (About Us)
   Previously inert — the form had no submit handler at all, so
   pressing Send reloaded the page and dropped the message. It
   now posts to the backend and reports what happened.
   ========================================================= */
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const status = document.createElement('div');
  status.className = 'field-error';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.appendChild(status);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const message = document.getElementById('contact-msg').value.trim();

    status.classList.add('show');
    status.style.color = '';
    status.textContent = 'Sending…';
    submitBtn.disabled = true;

    const res = await window.apiService.submitContact({ name, email, message });

    submitBtn.disabled = false;
    if (res.ok) {
      form.reset();
      status.style.color = 'var(--green)';
      status.textContent = 'Thanks — your message has reached the DAONG team.';
      return;
    }
    status.style.color = '';
    status.textContent = res.errors && res.errors.length ? res.errors[0] : res.message;
  });
}

/* =========================================================
   DASHBOARD
   Donor tiles + contribution history come from GET /me/summary;
   Admin Operations from the donations API. Both re-run when the
   session changes.
   ========================================================= */
function initDashboard() {
  if (!document.getElementById('dash-user-name') && !document.getElementById('admin-ops')) return;
  bindDashboardUser();
  renderDonorSummary();
  initAdminOps();
}

function bindDashboardUser() {
  const nameEl = document.getElementById('dash-user-name');
  if (!nameEl) return;
  const user = window.apiService.TokenStore.getUser();
  if (!user) return;
  nameEl.textContent = user.name;
  const roleEl = document.getElementById('dash-user-role');
  if (roleEl) {
    roleEl.textContent = user.role;
    roleEl.classList.toggle('is-admin', user.role === 'admin');
  }
}

async function renderDonorSummary() {
  const historyEl = document.getElementById('dash-history');
  if (!historyEl) return;
  const summaryKeys = ['totalPledged', 'drivesSupported', 'unreadNotifications'];

  if (!isSignedIn()) {
    setStat(summaryKeys, '—');
    historyEl.innerHTML = '<tr><td colspan="3" class="empty-state">Log in to see your contribution history.</td></tr>';
    return;
  }

  setStat(summaryKeys, '…');
  historyEl.innerHTML = '<tr><td colspan="3" class="empty-state">Loading your contributions…</td></tr>';

  const res = await window.apiService.getMySummary();
  if (!res.ok) {
    setStat(summaryKeys, '—');
    historyEl.innerHTML = `<tr><td colspan="3" class="empty-state">${escapeHtml(res.message)}</td></tr>`;
    return;
  }

  const s = res.data.summary;
  const logic = window.donationLogic;
  applyStat('totalPledged', logic.money(s.totalPledgedPhp));
  applyStat('drivesSupported', String(s.drivesSupported));
  applyStat('unreadNotifications', String(s.unreadNotifications));

  if (!s.history.length) {
    historyEl.innerHTML = '<tr><td colspan="3" class="empty-state">No contributions yet — pledge to a drive to start tracking one.</td></tr>';
    return;
  }

  historyEl.innerHTML = s.history.map((d) => `
    <tr>
      <td><a href="track.html?id=${encodeURIComponent(d.id)}" style="color:var(--gold-2);text-decoration:underline;">${escapeHtml(d.org)}</a></td>
      <td>${logic.money(d.amountPhp)}</td>
      <td><span class="stamp ${logic.stampClass(d.status)}">${logic.stampLabel(d.status)}</span></td>
    </tr>`).join('');
}

async function initAdminOps() {
  const root = document.getElementById('admin-ops');
  if (!root) return;

  // Coordinator data needs a coordinator token. Without one the panel
  // stays quiet rather than firing requests that will 403.
  if (!isAdmin()) {
    const list = document.getElementById('admin-shipment-list');
    const flagged = document.getElementById('flagged-panel');
    if (list) list.innerHTML = '';
    if (flagged) flagged.innerHTML = '';
    return;
  }

  if (!root.dataset.wired) {
    root.dataset.wired = 'true';
    document.getElementById('btn-add-donation')?.addEventListener('click', handleRegisterDonation);
    document.getElementById('btn-reset-demo')?.addEventListener('click', handleResetDemo);
  }

  const driveSelect = document.getElementById('in-drive');
  if (driveSelect) {
    const drivesRes = await window.apiService.getDrives();
    driveSelect.innerHTML = drivesRes.ok
      ? '<option value="">No linked drive (independent donation)</option>'
        + (drivesRes.data.drives || []).map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title)}</option>`).join('')
      : '<option value="">Drives unavailable</option>';
  }

  await refreshAdminLists();
}

function showFormError(msg) {
  const errEl = document.getElementById('form-error');
  const amountInput = document.getElementById('in-amount');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.classList.toggle('show', !!msg);
  if (amountInput) amountInput.classList.toggle('input-error', !!msg);
}

async function handleRegisterDonation() {
  const btn = document.getElementById('btn-add-donation');
  const donor = document.getElementById('in-donor').value.trim();
  const amount = parseFloat(document.getElementById('in-amount').value) || 0;
  const category = document.getElementById('in-category').value;
  const org = document.getElementById('in-org').value.trim();
  const driveId = document.getElementById('in-drive').value || null;

  if (amount < 100) { showFormError('Enter a donation amount of at least ₱100.'); return; }
  showFormError('');

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Logging…';

  const result = await window.apiService.createDonation({ donor, amountPhp: amount, category, org, driveId });

  btn.disabled = false;
  btn.textContent = original;

  if (!result.ok) {
    // Field-level detail from the backend beats a generic apology.
    showFormError(result.errors && result.errors.length ? result.errors[0] : result.message);
    return;
  }

  document.getElementById('in-donor').value = '';
  document.getElementById('in-amount').value = '';
  document.getElementById('in-org').value = '';
  await refreshAdminLists();
  await renderDonorSummary();
}

async function handleResetDemo() {
  const btn = document.getElementById('btn-reset-demo');
  // This destroys every donation anyone has registered, so it asks first.
  if (!window.confirm('Reset all donations and drives back to the original demo data? This cannot be undone.')) return;

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Resetting…';

  const res = await window.apiService.resetDemoData();

  btn.disabled = false;
  btn.textContent = original;
  showFormError(res.ok ? '' : res.message);

  if (res.ok) {
    await refreshAdminLists();
    await renderDonorSummary();
    await renderDrivesGrid('drives-grid', { interactive: true });
  }
}

async function refreshAdminLists() {
  const wrap = document.getElementById('admin-shipment-list');
  const flaggedWrap = document.getElementById('flagged-panel');
  if (wrap) wrap.innerHTML = '<p class="empty-state">Loading donations…</p>';
  if (flaggedWrap) flaggedWrap.innerHTML = '<div class="mini-card"><div class="empty-state">Loading…</div></div>';

  const res = await window.apiService.getDonations();
  if (!res.ok) {
    if (wrap) wrap.innerHTML = `<p class="empty-state">${escapeHtml(res.message)}</p>`;
    if (flaggedWrap) flaggedWrap.innerHTML = `<div class="mini-card"><div class="empty-state">${escapeHtml(res.message)}</div></div>`;
    return;
  }

  const donations = res.data.donations || [];
  renderAdminShipmentList(donations);
  renderFlaggedPanel(donations.filter((d) => d.status === 'flagged'));
}

function renderAdminShipmentList(donations) {
  const wrap = document.getElementById('admin-shipment-list');
  if (!wrap) return;
  const logic = window.donationLogic;

  wrap.innerHTML = donations.slice().reverse().map((s) => `
    <div class="shipment">
      <div class="left">
        <div class="sid">${escapeHtml(s.id)} &middot; ${escapeHtml(s.date)}</div>
        <div class="donor">${escapeHtml(s.donor || 'Anonymous Donor')}</div>
        <div class="meta">${escapeHtml(s.category)} &middot; ${logic.money(s.amountPhp)} &middot; ${escapeHtml(s.org)}</div>
        ${s.driveId ? `<span class="drive-link">Linked to drive: ${escapeHtml(s.driveId)}</span>` : ''}
        <ul class="cp-list">${(s.checkpoints || []).map((c) => `<li><span class="cp-loc">${escapeHtml(c.stage)} — ${escapeHtml(c.loc)}</span><span>${escapeHtml(c.time)}</span></li>`).join('')}</ul>
      </div>
      <div class="right">
        <span class="stamp ${logic.stampClass(s.status)}">${logic.stampLabel(s.status)}</span>
        ${s.stageIndex < logic.STAGES.length - 1 ? `<button class="small-btn" data-checkpoint="${escapeHtml(s.id)}">Log Next Checkpoint</button>` : ''}
      </div>
    </div>`).join('') || '<p class="empty-state">No donations logged yet.</p>';

  wrap.querySelectorAll('[data-checkpoint]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Logging…';
      const res = await window.apiService.logDonationCheckpoint(btn.getAttribute('data-checkpoint'));
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = original;
        showFormError(res.message);
        return;
      }
      showFormError('');
      await refreshAdminLists();
    });
  });
}

function renderFlaggedPanel(flagged) {
  const wrap = document.getElementById('flagged-panel');
  if (!wrap) return;
  const logic = window.donationLogic;
  if (!flagged.length) {
    wrap.innerHTML = '<div class="mini-card"><div class="empty-state">Nothing flagged right now.</div></div>';
    return;
  }
  wrap.innerHTML = flagged.map((s) => {
    const anomaly = logic.computeAnomalySignals(s);
    const rows = (anomaly ? anomaly.signals : []).map((sig) => `
      <li class="${sig.key === anomaly.primaryKey ? 'trigger' : ''}">
        <span class="cp-loc">${escapeHtml(sig.label)}</span><span>${escapeHtml(sig.value)}</span>
      </li>`).join('');
    return `
      <div class="flag-card">
        <div class="fc-top">
          <div><div class="sid">${escapeHtml(s.id)}</div><div class="donor">${escapeHtml(s.donor || 'Anonymous Donor')}</div></div>
          <span class="stamp flagged">Flagged</span>
        </div>
        <ul class="cp-list" style="margin-top:12px;">${rows}</ul>
        <button class="btn-ai" data-ai="${escapeHtml(s.id)}">Ask AI why this was flagged</button>
        <div id="ai-slot-${escapeHtml(s.id)}"></div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('[data-ai]').forEach((btn) => {
    btn.addEventListener('click', () => runExplain(btn.getAttribute('data-ai'), btn));
  });
}

async function runExplain(id, btn) {
  const slot = document.getElementById('ai-slot-' + id);
  if (!slot) return;
  btn.disabled = true; btn.textContent = 'Asking AI…';
  slot.innerHTML = '<div class="ai-box"><div class="ai-label"><span class="ai-pulse"></span>AI Insight</div>Reading checkpoint data…</div>';
  // Only the ID travels — the backend loads the record and builds the prompt.
  const { ok, text } = await window.donationLogic.explainFlag({ id });
  slot.innerHTML = `<div class="ai-box${ok ? '' : ' is-error'}"><div class="ai-label">${ok ? '<span class="ai-pulse"></span>AI Insight' : 'AI Insight — Unavailable'}</div>${escapeHtml(text)}</div>`;
  btn.disabled = false; btn.textContent = 'Ask AI why this was flagged';
}
