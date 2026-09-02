/**
 * donations.js
 * ---------------------------------------------------------------
 * Domain logic for the Donation ID / lifecycle / anomaly-detection
 * system, ported from the TANAW prototype into DAONG's module
 * structure. This file does NOT talk to the DAONG backend directly
 * (that's apiService.js's job) and does NOT touch the DOM (that's
 * pages.js's job) ΓÇö it only knows how to format IDs, score anomaly
 * signals, and ask the AI-explanation service a question.
 *
 * Anomaly scores here are a human-review aid, never a verdict:
 * every explanation this module produces is explicitly instructed
 * to describe a signal as "needs verification," not "confirmed
 * wrongdoing."
 * --------------------------------------------------------------- */

function money(n) {
  return 'Γé▒' + Number(n || 0).toLocaleString('en-PH');
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
// four equally-weighted numbers. Returns null if the donation isn't
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
 * Calls the Anthropic API directly (same pattern as an in-artifact AI
 * call ΓÇö no key handling needed here). Returns { ok, text }. Never
 * throws; callers just check `ok`.
 */
async function callClaude(prompt, maxTokens) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await response.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { ok: !!text, text: text || 'The AI service did not return a usable response.' };
  } catch (err) {
    console.error('Claude call failed:', err);
    return { ok: false, text: 'Could not reach the AI explanation service right now.' };
  }
}

// For admins: a short, factual explanation of why a shipment was
// flagged ΓÇö explicitly framed as "needs verification," never as an
// accusation of theft or wrongdoing.
function explainFlag(donation) {
  const r = donation.flagReason;
  const prompt = `You are the anomaly-explanation module inside DAONG, a Philippine disaster-relief donation tracking system built on the TANAW tracking engine. Given the following structured checkpoint data for donation ${donation.id}, write a short, plain-language explanation (3-4 sentences max) for a relief-org admin of WHY this donation was flagged for human review. Do not accuse anyone of theft or wrongdoing ΓÇö describe it as something needing verification, not a confirmed problem. Be specific about which signals triggered the flag. Data: hours since last checkpoint = ${r.hoursSinceLastCheckpoint}, expected weight = ${r.expectedWeight}kg, current recorded weight = ${r.currentWeight}kg, route deviation = ${r.routeDeviationKm}km from expected corridor. Category: ${donation.category}, relief operation: ${donation.org}.`;
  return callClaude(prompt, 300);
}

// For citizens: a warm, plain-language summary of a donation's
// journey so far. Gently mentions a pending verification step
// without alarming the donor, and says nothing at all about issues
// when there aren't any.
function summarizeJourney(donation) {
  const cpText = donation.checkpoints.map((c) => `${c.stage} at ${c.loc} (${c.time})`).join('; ');
  const prompt = `You are a friendly, plain-language assistant inside DAONG, a Philippine disaster-relief donation tracker, writing directly for a citizen donor. Summarize this donation's journey so far in 2-3 short, warm, clear sentences. Donation: ${money(donation.amountPhp)} worth of ${donation.category} for ${donation.org}. Checkpoints so far: ${cpText}. Current status: ${donation.status}. ${donation.status === 'flagged' ? 'Mention gently that this donation currently has a step under verification, and reassure them this is a routine check, not a confirmed problem.' : 'Do not mention any issues since there are none.'}`;
  return callClaude(prompt, 250);
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
