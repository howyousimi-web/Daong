/**
 * validators.js
 * ---------------------------------------------------------------
 * Server-side input validation. The frontend validates too, for a
 * faster and friendlier form experience, but nothing here trusts it:
 * every write route runs these before touching the store.
 *
 * The rules are deliberately aligned with what the existing UI can
 * actually send, so a legitimate click never fails validation:
 *  - donor is optional (the admin intake form's Donor Name field is a
 *    placeholder-hinted optional; the store defaults to
 *    "Anonymous Donor"), but is length-capped when supplied.
 *  - checkpoint `loc` is optional — the dashboard's "Log Next
 *    Checkpoint" button has no location input and the store stamps
 *    "Field Checkpoint (manual log)". Previously required, which made
 *    that button fail with a 400 every single time.
 * --------------------------------------------------------------- */

const CATEGORIES = ['Cash Relief', 'Food', 'Medicine', 'Shelter', 'Water', 'Hygiene', 'Other'];
const VALID_ROLES = ['donor', 'admin'];

const MIN_AMOUNT = 100; // PHP — mirrored in the frontend's form hints
const MAX_AMOUNT = 10000000; // PHP (10M cap)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isFiniteNumber(v) {
  const n = Number(v);
  return !Number.isNaN(n) && Number.isFinite(n);
}

function validateCoords(data, errors) {
  if (data.lat !== undefined && data.lat !== null) {
    const lat = Number(data.lat);
    if (!isFiniteNumber(lat) || lat < -90 || lat > 90) errors.push('lat: must be a number between -90 and 90');
  }
  if (data.lng !== undefined && data.lng !== null) {
    const lng = Number(data.lng);
    if (!isFiniteNumber(lng) || lng < -180 || lng > 180) errors.push('lng: must be a number between -180 and 180');
  }
}

function validateDonation(data) {
  const errors = [];

  if (data.donor !== undefined && data.donor !== null && data.donor !== '') {
    if (typeof data.donor !== 'string') errors.push('donor: must be a string');
    else if (data.donor.length > 200) errors.push('donor: maximum 200 characters');
  }

  if (data.amountPhp === undefined || data.amountPhp === null || data.amountPhp === '') {
    errors.push('amountPhp: required');
  } else if (!isFiniteNumber(data.amountPhp)) {
    errors.push('amountPhp: must be a number');
  } else {
    const amount = Number(data.amountPhp);
    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      errors.push(`amountPhp: must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}`);
    }
  }

  if (data.category && !CATEGORIES.includes(data.category)) {
    errors.push(`category: must be one of ${CATEGORIES.join(', ')}`);
  }

  if (data.org !== undefined && data.org !== null && data.org !== '') {
    if (typeof data.org !== 'string') errors.push('org: must be a string');
    else if (data.org.length > 300) errors.push('org: maximum 300 characters');
  }

  if (data.driveId !== undefined && data.driveId !== null && data.driveId !== '') {
    if (typeof data.driveId !== 'string' || data.driveId.length > 60) {
      errors.push('driveId: must be a string of at most 60 characters');
    }
  }

  validateCoords(data, errors);
  return { valid: errors.length === 0, errors };
}

function validateCheckpoint(data) {
  const errors = [];

  if (data.loc !== undefined && data.loc !== null && data.loc !== '') {
    if (typeof data.loc !== 'string') errors.push('loc: must be a string');
    else if (data.loc.length > 300) errors.push('loc: maximum 300 characters');
  }

  validateCoords(data, errors);
  return { valid: errors.length === 0, errors };
}

function validateContact(data) {
  const errors = [];

  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('name: required');
  } else if (data.name.length > 200) {
    errors.push('name: maximum 200 characters');
  }

  if (!data.email || typeof data.email !== 'string' || !EMAIL_RE.test(data.email.trim())) {
    errors.push('email: a valid email address is required');
  } else if (data.email.length > 200) {
    errors.push('email: maximum 200 characters');
  }

  if (!data.message || typeof data.message !== 'string' || data.message.trim().length < 5) {
    errors.push('message: at least 5 characters required');
  } else if (data.message.length > 4000) {
    errors.push('message: maximum 4000 characters');
  }

  return { valid: errors.length === 0, errors };
}

function validateRole(role) {
  return VALID_ROLES.includes(role);
}

module.exports = {
  validateDonation,
  validateCheckpoint,
  validateContact,
  validateRole,
  CATEGORIES,
  MIN_AMOUNT,
  MAX_AMOUNT,
};
