/**
 * validators.js
 * ---------------------------------------------------------------
 * Input validation helpers for API routes. Ensures required fields
 * are present, within acceptable ranges, and of the correct type.
 * --------------------------------------------------------------- */

const CATEGORIES = ['Cash Relief', 'Food', 'Medicine', 'Shelter', 'Water', 'Hygiene', 'Other'];
const VALID_ROLES = ['donor', 'admin'];
const MIN_AMOUNT = 100; // PHP
const MAX_AMOUNT = 10000000; // PHP (10M cap)

function validateDonation(data) {
  const errors = [];

  if (!data.donor || typeof data.donor !== 'string' || data.donor.trim().length === 0) {
    errors.push('donor: required string');
  }
  if (data.donor && data.donor.length > 200) {
    errors.push('donor: max 200 chars');
  }

  if (data.amountPhp === undefined || data.amountPhp === null) {
    errors.push('amountPhp: required');
  } else {
    const amount = Number(data.amountPhp);
    if (Number.isNaN(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      errors.push(`amountPhp: must be number between ${MIN_AMOUNT} and ${MAX_AMOUNT}`);
    }
  }

  if (data.category && !CATEGORIES.includes(data.category)) {
    errors.push(`category: must be one of ${CATEGORIES.join(', ')}`);
  }

  if (data.org && typeof data.org !== 'string') {
    errors.push('org: must be string');
  }
  if (data.org && data.org.length > 300) {
    errors.push('org: max 300 chars');
  }

  if (data.driveId && typeof data.driveId !== 'string') {
    errors.push('driveId: must be string');
  }

  if (data.lat !== undefined && data.lat !== null) {
    const lat = Number(data.lat);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('lat: must be number between -90 and 90');
    }
  }

  if (data.lng !== undefined && data.lng !== null) {
    const lng = Number(data.lng);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.push('lng: must be number between -180 and 180');
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateCheckpoint(data) {
  const errors = [];

  if (!data.loc || typeof data.loc !== 'string' || data.loc.trim().length === 0) {
    errors.push('loc: required string');
  }
  if (data.loc && data.loc.length > 300) {
    errors.push('loc: max 300 chars');
  }

  if (data.lat !== undefined && data.lat !== null) {
    const lat = Number(data.lat);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('lat: must be number between -90 and 90');
    }
  }

  if (data.lng !== undefined && data.lng !== null) {
    const lng = Number(data.lng);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.push('lng: must be number between -180 and 180');
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateRole(role) {
  return VALID_ROLES.includes(role);
}

module.exports = { validateDonation, validateCheckpoint, validateRole };
