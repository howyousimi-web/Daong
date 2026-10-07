/**
 * donations.js
 * ---------------------------------------------------------------
 * Domain logic for the Donation ID / lifecycle / anomaly-detection
 * system. This file does NOT talk to the backend directly (that's
 * apiService.js and js/ai/aiService.js) and does NOT touch the DOM
 * (that's pages.js) — it formats IDs, scores anomaly signals, and
 * asks the backend's named AI tasks a question.
 *
 * Two things changed when the AI moved server-side:
 *
 *  1. The legacy `callClaudeDirect()` fallback — a fetch straight from
 *     the browser to the model vendor — is gone. It could never have
 *     worked without shipping an API key to every visitor, which is
 *     exactly what must not happen.
 *  2. These functions now send only a donation ID. The server loads
 *     the record from the database and builds the prompt from it, so
 *     nobody can ask the assistant to explain a flag using figures
 *     they invented.
 *
 * Anomaly scores here are a human-review aid, never a verdict: every
 * explanation is instructed (server-side) to describe a signal as
 * "needs verification," not "confirmed wrongdoing."
 * --------------------------------------------------------------- */

function money(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH');
}

function stampClass(status) {
  return status === 'flagged' ? 'flagged' : status === 'verified' ? 'verified' : 'transit';
}
function stampLabel(status) {
  return status === 'flagged' ? 'Flagged' : status === 'verified' ? 'Verified' : 'In Transit';
}

// Accepts "tn1001", "TN 1001", "1001", "TN-1001" and normalizes to "TN-1001"
function normalizeTrackingId(raw) {
  const digits = String(raw).trim().toUpperCase().replace(/^TN-?/, '').replace(/[^0-9]/g, '');
  return digits ? `TN-${digits}` : String(raw).trim().toUpperCase();
}

// Scores each anomaly signal by severity and flags which one is the
// strongest trigger, so the review panel shows a hierarchy instead of
// three equally-weighted numbers. Returns null if the donation isn't
// flagged or carries no flagReason data.
function computeAnomalySignals(donation) {
  const r = donation && donation.flagReason;
  if (!r) return null;
  const weightDropPct = ((r.expectedWeight - r.currentWeight) / r.expectedWeight) * 100;
  const signals = [
    { key: 'hours', label: 'Hours since last checkpoint', value: `${r.hoursSinceLastCheckpoint}h`, severity: r.hoursSinceLastCheckpoint / 24 },
    { key: 'weight', label: 'Weight discrepancy', value: `${r.currentWeight}kg vs ${r.expectedWeight}kg expected`, severity: weightDropPct / 10 },
    { key: 'route', label: 'Route deviation', value: `${r.routeDeviationKm} km off corridor`, severity: r.routeDeviationKm / 3 },
  ];
  const primary = signals.reduce((a, b) => (b.severity > a.severity ? b : a));
  return { signals, primaryKey: primary.key };
}

/**
 * Runs one of the backend's named AI tasks through js/ai/aiService.js —
 * the same service layer the floating assistant uses, so there is one
 * AI path in this project rather than two competing ones.
 *
 * Sends a task name and a donation ID. Nothing else: the instructions
 * and the data both live on the server.
 *
 * Returns { ok, text }; never throws — callers just check `ok`.
 */
async function runAiTask(task, donationId) {
  if (!window.daongAiService) {
    return { ok: false, text: 'The AI service is not available on this page.' };
  }

  const result = await window.daongAiService.runTask({ task, donationId });
  if (result.ok) return { ok: true, text: result.text };

  // Reuse the assistant's plain-language wording so the same failure
  // reads the same way wherever it surfaces.
  const friendly = window.daongAiAssistant && window.daongAiAssistant.friendly;
  return {
    ok: false,
    text: friendly ? friendly(result.code) : 'Could not reach the AI explanation service right now.',
  };
}

// For coordinators: a short, factual explanation of why a donation was
// flagged — explicitly framed as "needs verification," never as an
// accusation of wrongdoing (enforced server-side). Requires a
// coordinator token; the backend answers 403 otherwise.
function explainFlag(donation) {
  return runAiTask('explain-flag', donation && donation.id);
}

// For citizens: a warm, plain-language summary of a donation's journey
// so far. Mentions a pending verification step gently, and says nothing
// about problems when there aren't any.
function summarizeJourney(donation) {
  return runAiTask('summarize-journey', donation && donation.id);
}

window.donationLogic = {
  STAGES: ['Received', 'Allocated', 'Dispatched', 'In Transit', 'Delivered'],
  money,
  stampClass,
  stampLabel,
  normalizeTrackingId,
  computeAnomalySignals,
  explainFlag,
  summarizeJourney,
};
