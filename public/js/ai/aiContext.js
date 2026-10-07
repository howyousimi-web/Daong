/**
 * js/ai/aiContext.js
 * -----------------------------------------------------------------
 * DAONG AI ASSISTANT — CONTEXT LAYER
 *
 * What lives here:
 *   - The assistant's user-facing copy (greeting, suggested questions)
 *     per page, so the panel never shows a generic "How can I help?".
 *   - A collector that snapshots what the *browser* currently knows and
 *     the server cannot: which page the visitor is on, whether they are
 *     signed in and in which demo role, and the live drive / donation
 *     data already fetched through apiService.js.
 *
 * What deliberately does NOT live here:
 *   - The system prompt / site knowledge base. That is authoritative on
 *     the server (server/ai-context.js) so that nothing a visitor types
 *     — and nothing an attacker injects into this file's output — can
 *     rewrite the assistant's instructions. Everything this file sends
 *     is treated by the backend as untrusted DATA, never as commands.
 *
 * Depends on: window.apiService (js/apiService.js), window.donationLogic
 * (js/donations.js). Both are optional — if either is missing the
 * snapshot simply omits that section.
 *
 * Exposes: window.daongAiContext
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  /* =========================================================
     PAGE MAP — mirrors the site's actual navigation
     ========================================================= */
  const PAGES = {
    'index.html': {
      key: 'home',
      label: 'Home',
      about: 'Landing page: hero tracking-ID search, the donor/recipient paths, and a teaser of active drives.',
    },
    'track.html': {
      key: 'track',
      label: 'Track a Donation',
      about: 'Public lookup — anyone can enter a Donation ID (e.g. TN-1001) and see every checkpoint it has passed, plus an AI journey summary.',
    },
    'drives.html': {
      key: 'drives',
      label: 'Donation Drives',
      about: 'The list of active campaigns. Pledging to a Drive mints a Donation ID underneath it so that specific contribution can be tracked.',
    },
    'info.html': {
      key: 'info',
      label: 'Info & Impact',
      about: 'Aggregate relief figures and the three field verification checkpoints (Supply Intake, Volunteer Logistics, Community Assembly).',
    },
    'about.html': {
      key: 'about',
      label: 'About Us',
      about: "DAONG's mandate, verification model, human-review policy, and the contact / partnership details.",
    },
    'dashboard.html': {
      key: 'dashboard',
      label: 'Dashboard',
      about: 'Signed-in view: contribution history and notifications. Coordinators (admin role) also get Admin Operations — register donations, log checkpoints, review flagged items.',
    },
  };

  /* =========================================================
     PANEL COPY — greeting + suggested questions.
     These are interface strings, not AI answers: the model never
     sees them as its own words.
     ========================================================= */
  const GREETING =
    "Hi — I'm the DAONG assistant. I can explain how donation tracking works here, what a Drive or a Donation ID is, or help you find the right page. Ask me anything about the site.";

  const SUGGESTIONS = {
    home: ['What is DAONG for?', 'How do I track a donation?', "What's the difference between a Drive and a Donation ID?"],
    track: ['What do the checkpoint stages mean?', 'Why would a donation be flagged?', 'My ID is not found — what now?'],
    drives: ['How does pledging to a Drive work?', 'What do the funding percentages mean?', 'Which drives are active right now?'],
    info: ['Where do these figures come from?', 'What are the three field checkpoints?', 'How is relief value calculated?'],
    about: ['How does DAONG verify deliveries?', 'How do I contact the team?', 'Who built this platform?'],
    dashboard: ['What can a coordinator do here?', 'Why is a donation flagged for review?', 'How do I log a checkpoint?'],
    default: ['What is this website for?', 'How do I track a donation?', 'What can you help me with?'],
  };

  /* =========================================================
     WHERE ARE WE?
     ========================================================= */
  function currentPageFile() {
    const file = (window.location.pathname.split('/').pop() || '').toLowerCase();
    return file && PAGES[file] ? file : 'index.html';
  }

  function currentPage() {
    return Object.assign({ file: currentPageFile() }, PAGES[currentPageFile()]);
  }

  function greeting() {
    return GREETING;
  }

  function suggestions() {
    return SUGGESTIONS[currentPage().key] || SUGGESTIONS.default;
  }

  /* =========================================================
     SESSION SNAPSHOT — auth state and role, read from the same
     store app.js uses. No tokens, no emails are ever sent.
     ========================================================= */
  function sessionSnapshot() {
    const snap = { signedIn: false, role: 'guest' };
    try {
      const store = window.apiService && window.apiService.TokenStore;
      const user = store && store.getUser();
      if (store && store.get() && user) {
        snap.signedIn = true;
        snap.role = user.role || 'donor';
      }
    } catch (err) {
      /* storage unavailable — stay a guest for context purposes */
    }
    return snap;
  }

  /* =========================================================
     WHAT THE VISITOR IS LOOKING AT

     This used to fetch every drive and the full checkpoint trail of
     the open donation and send them along with each question. That is
     now the server's job (server/ai/ai-data.js reads them straight
     from the database), for two reasons:

       - Accuracy. Data the browser asserts can be edited by whoever
         is sitting in front of it. The server reads its own database,
         so the assistant's figures are the real ones.
       - Weight. Each question no longer triggers two extra API calls
         before it can be sent.

     What stays here is the part only the browser knows: which page is
     open, which demo role is signed in, and — on the Track page — the
     ID currently being looked up. The ID is a pointer; the server
     resolves it to a record.
     ========================================================= */
  function openDonationId() {
    if (currentPage().key !== 'track') return null;
    const input = document.getElementById('track-search-input');
    const raw = (input && input.value.trim()) || new URLSearchParams(window.location.search).get('id');
    if (!raw) return null;
    const logic = window.donationLogic;
    return logic ? logic.normalizeTrackingId(raw) : String(raw).toUpperCase();
  }

  /**
   * The page-level hints the backend uses to phrase an answer.
   * Never throws: any section that can't be read is simply omitted.
   * @returns {Promise<Object>} plain JSON-serialisable data
   */
  async function build() {
    const page = currentPage();
    const context = {
      page: { key: page.key, file: page.file, label: page.label, about: page.about },
      session: sessionSnapshot(),
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      capturedAt: new Date().toISOString(),
    };

    try {
      const id = openDonationId();
      if (id) context.donationOnScreen = { id };
    } catch (err) {
      /* no donation on screen — the assistant just answers generally */
    }
    return context;
  }

  window.daongAiContext = {
    PAGES,
    currentPage,
    greeting,
    suggestions,
    build,
  };
})();
