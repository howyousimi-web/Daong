/**
 * pages.js
 * ---------------------------------------------------------------
 * Per-page render hooks that build on apiService.js (data) and
 * donations.js (domain logic). Every function below checks for its
 * own page's root element first and does nothing if that page isn't
 * the current one, so this single file can be loaded everywhere.
 * --------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  initHomeInteractions();
  await renderDrivesGrid('home-drives-grid', { limit: 3, interactive: false });
  await renderDrivesGrid('drives-grid', { interactive: true });
  bindDashboardUser();
  await initAdminOps();
  await initTrackPage();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function categoryBand(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('food')) return 'band-food';
  if (c.includes('medic')) return 'band-medical';
  if (c.includes('shelter')) return 'band-shelter';
  return 'band-cash';
}

/* =========================================================
   HOME PAGE — hero search, path buttons, scroll cue
   (all a no-op if these elements aren't on the page)
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
   DRIVES GRID — used on the home teaser and the full Drives page.
   Each card shows live funding progress and, when interactive,
   lets a signed-in donor pledge (which mints a real tracked
   Donation ID under that Drive) and lists donations already
   tracked under it.
   ========================================================= */
async function renderDrivesGrid(containerId, opts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { limit, interactive } = opts || {};

  const [drivesRes, donationsRes] = await Promise.all([
    window.apiService.getDrives(),
    window.apiService.getDonations(),
  ]);

  if (!drivesRes.ok) {
    container.innerHTML = '<p class="empty-state">Drives are temporarily unavailable. Please check back shortly.</p>';
    return;
  }

  const drives = limit ? drivesRes.data.drives.slice(0, limit) : drivesRes.data.drives;
  const donations = donationsRes.ok ? donationsRes.data.donations : [];
  const money = window.donationLogic.money;

  container.innerHTML = drives.map((d) => {
    const linked = donations.filter((don) => don.driveId === d.id);
    const chipsHtml = linked.length
      ? `<div class="donation-chip-row">${linked.map((don) => donationChipHtml(don)).join('')}</div>`
      : '<div class="donation-chip-row"><span class="donation-chip-empty">No individually tracked donations logged yet.</span></div>';

    return `
    <article class="appeal-card" data-drive-id="${d.id}">
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
          <button type="button" class="btn btn-gold pledge-btn" style="width:100%;margin-top:1rem;" data-drive-id="${d.id}">Pledge to this Drive</button>
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
  return `<a href="track.html?id=${encodeURIComponent(donation.id)}" class="donation-chip is-${cls}"><span class="dot"></span>${donation.id}</a>`;
}

function wirePledgeButton(btn, drives) {
  btn.addEventListener('click', () => {
    if (window.__daong?.auth?.state !== 'authenticated') {
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
          <label for="pledge-amt-${driveId}">Amount (PHP)</label>
          <input type="number" min="1" id="pledge-amt-${driveId}" placeholder="e.g. 500">
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-gold pledge-confirm" style="flex:1;">Confirm Pledge</button>
        <button type="button" class="btn btn-outline pledge-cancel">Cancel</button>
      </div>
      <div class="field-error" id="pledge-error-${driveId}"></div>`;

    inline.querySelector('.pledge-cancel').addEventListener('click', () => {
      inline.hidden = true; inline.innerHTML = ''; btn.hidden = false;
    });
    inline.querySelector('.pledge-confirm').addEventListener('click', () => confirmPledge(driveId, drive, card, inline));
  });
}

async function confirmPledge(driveId, drive, card, inline) {
  const amountInput = inline.querySelector('input[type="number"]');
  const errEl = inline.querySelector('.field-error');
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) {
    errEl.textContent = 'Enter a pledge amount greater than 0.';
    errEl.classList.add('show');
    return;
  }
  const confirmBtn = inline.querySelector('.pledge-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Submitting…';

  const user = window.apiService.TokenStore.getUser();
  const result = await window.apiService.pledgeDonation({
    driveId, amountPhp: amount, donor: (user && user.name) || 'Anonymous Donor',
    category: 'Cash Relief', org: drive ? drive.title : 'General Relief Fund',
  });

  if (!result.ok) {
    errEl.textContent = 'Something went wrong submitting that pledge. Please try again.';
    errEl.classList.add('show');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Pledge';
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

  inline.innerHTML = `<div class="ai-box"><div class="ai-label">Pledge received</div>Your donation is now tracked as <strong>${donation.id}</strong>. <a href="track.html?id=${encodeURIComponent(donation.id)}" style="color:var(--gold-2);text-decoration:underline;">Track its journey →</a></div>`;
}

/* =========================================================
   TRACK PAGE (Citizen Lookup) — public, no auth required
   ========================================================= */
async function initTrackPage() {
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
  const res = await window.apiService.getDonations();
  const donations = res.ok ? res.data.donations : [];
  const donation = donations.find((d) => d.id.toUpperCase() === normalized);

  if (!donation) {
    resultEl.innerHTML = `<div class="mini-card"><div class="empty-state">No donation found for "${escapeHtml(rawId)}". Try TN-1001, TN-1002, or TN-1003.</div></div>`;
    return;
  }

  const tl = logic.STAGES.map((stage, i) => {
    const cp = donation.checkpoints.find((c) => c.stage === stage);
    const isFlaggedStage = donation.status === 'flagged' && stage === logic.STAGES[donation.stageIndex];
    let cls = 'pending';
    if (cp) cls = isFlaggedStage ? 'flagged' : 'done';
    return `<div class="tl-item ${cls}">
      <div class="tl-dot">${cp ? (isFlaggedStage ? '!' : '✓') : (i + 1)}</div>
      <div class="tl-body">
        <div class="tl-stage">${stage}</div>
        ${cp ? `<div class="tl-time">${escapeHtml(cp.loc)} &middot; ${cp.time}</div>` : '<div class="tl-note">Not yet reached</div>'}
        ${isFlaggedStage ? '<div class="tl-note" style="color:var(--red);">Flagged for verification — under review.</div>' : ''}
      </div></div>`;
  }).join('');

  resultEl.innerHTML = `
    <div class="mini-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
        <div>
          <div class="shipment sid" style="border:none;padding:0;">${donation.id}</div>
          <div class="donor" style="font-size:17px;">${logic.money(donation.amountPhp)} — ${escapeHtml(donation.category)}</div>
          <div class="meta">${escapeHtml(donation.org)} &middot; Logged ${donation.date}</div>
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
   DASHBOARD — donor stat chip (existing) + Admin Ops (new,
   gated by [data-admin-only] / data-role="admin")
   ========================================================= */
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

async function initAdminOps() {
  const root = document.getElementById('admin-ops');
  if (!root) return;

  const driveSelect = document.getElementById('in-drive');
  const drivesRes = await window.apiService.getDrives();
  if (driveSelect && drivesRes.ok) {
    driveSelect.innerHTML = '<option value="">No linked drive (independent donation)</option>' +
      drivesRes.data.drives.map((d) => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join('');
  }

  document.getElementById('btn-add-donation')?.addEventListener('click', handleRegisterDonation);
  document.getElementById('btn-reset-demo')?.addEventListener('click', async () => {
    await window.apiService.resetDemoData();
    showFormError('');
    await refreshAdminLists();
  });

  await refreshAdminLists();
}

function showFormError(msg) {
  const errEl = document.getElementById('form-error');
  const amountInput = document.getElementById('in-amount');
  if (!errEl || !amountInput) return;
  errEl.textContent = msg;
  errEl.classList.toggle('show', !!msg);
  amountInput.classList.toggle('input-error', !!msg);
}

async function handleRegisterDonation() {
  const donor = document.getElementById('in-donor').value.trim();
  const amount = parseFloat(document.getElementById('in-amount').value) || 0;
  const category = document.getElementById('in-category').value;
  const org = document.getElementById('in-org').value.trim();
  const driveId = document.getElementById('in-drive').value || null;

  if (amount <= 0) { showFormError('Enter a donation amount greater than 0.'); return; }
  showFormError('');

  const result = await window.apiService.createDonation({ donor, amountPhp: amount, category, org, driveId });
  if (!result.ok) { showFormError('Could not register that donation — please try again.'); return; }

  document.getElementById('in-donor').value = '';
  document.getElementById('in-amount').value = '';
  document.getElementById('in-org').value = '';
  await refreshAdminLists();
}

async function refreshAdminLists() {
  const res = await window.apiService.getDonations();
  const donations = res.ok ? res.data.donations : [];
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
        <div class="sid">${s.id} &middot; ${s.date}</div>
        <div class="donor">${escapeHtml(s.donor)}</div>
        <div class="meta">${escapeHtml(s.category)} &middot; ${logic.money(s.amountPhp)} &middot; ${escapeHtml(s.org)}</div>
        ${s.driveId ? `<span class="drive-link">Linked to drive: ${s.driveId}</span>` : ''}
        <ul class="cp-list">${s.checkpoints.map((c) => `<li><span class="cp-loc">${c.stage} — ${escapeHtml(c.loc)}</span><span>${c.time}</span></li>`).join('')}</ul>
      </div>
      <div class="right">
        <span class="stamp ${logic.stampClass(s.status)}">${logic.stampLabel(s.status)}</span>
        ${s.stageIndex < logic.STAGES.length - 1 ? `<button class="small-btn" data-checkpoint="${s.id}">Log Next Checkpoint</button>` : ''}
      </div>
    </div>`).join('') || '<p class="empty-state">No donations logged yet.</p>';

  wrap.querySelectorAll('[data-checkpoint]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.apiService.logDonationCheckpoint(btn.getAttribute('data-checkpoint'));
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
        <span class="cp-loc">${sig.label}</span><span>${sig.value}</span>
      </li>`).join('');
    return `
      <div class="flag-card">
        <div class="fc-top">
          <div><div class="sid">${s.id}</div><div class="donor">${escapeHtml(s.donor)}</div></div>
          <span class="stamp flagged">Flagged</span>
        </div>
        <ul class="cp-list" style="margin-top:12px;">${rows}</ul>
        <button class="btn-ai" data-ai="${s.id}">Ask AI why this was flagged</button>
        <div id="ai-slot-${s.id}"></div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('[data-ai]').forEach((btn) => {
    btn.addEventListener('click', () => runExplain(btn.getAttribute('data-ai'), btn));
  });
}

async function runExplain(id, btn) {
  const res = await window.apiService.getDonations();
  const donation = (res.ok ? res.data.donations : []).find((d) => d.id === id);
  const slot = document.getElementById('ai-slot-' + id);
  if (!donation || !slot) return;
  btn.disabled = true; btn.textContent = 'Asking AI…';
  slot.innerHTML = '<div class="ai-box"><div class="ai-label"><span class="ai-pulse"></span>AI Insight</div>Reading checkpoint data…</div>';
  const { ok, text } = await window.donationLogic.explainFlag(donation);
  slot.innerHTML = `<div class="ai-box${ok ? '' : ' is-error'}"><div class="ai-label">${ok ? '<span class="ai-pulse"></span>AI Insight' : 'AI Insight — Unavailable'}</div>${escapeHtml(text)}</div>`;
  btn.disabled = false; btn.textContent = 'Ask AI why this was flagged';
}
