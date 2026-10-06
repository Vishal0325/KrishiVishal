/**
 * landUnitConverter.js
 * Agronomy & Land Measurement Normalization Utilities for KrishiVishal
 * Standard North Bihar calibration (1 Acre = 32 Katha = 100 Decimal, 1 Bigha = 20 Katha = 0.625 Acre)
 */

/**
 * Normalizes any localized land unit into standard acres.
 * @param {number|string} value - The numeric value of the land area
 * @param {string} unit - The unit string ('Katha', 'Bigha', 'Acre', 'Decimal', 'Dismil')
 * @returns {number} Normalized value in acres (rounded to 4 decimal places)
 */
function normalizeToAcres(value, unit) {
  const numVal = Number(value);
  if (isNaN(numVal) || numVal <= 0) {
    return 0.0;
  }

  const cleanUnit = (unit || '').toString().trim().toLowerCase();

  let acres = 0;
  if (cleanUnit.includes('katha') || cleanUnit.includes('kattha')) {
    acres = numVal * 0.03125; // 1 / 32
  } else if (cleanUnit.includes('bigha')) {
    acres = numVal * 0.625; // 20 / 32
  } else if (cleanUnit.includes('dec') || cleanUnit.includes('dismil') || cleanUnit.includes('decimal')) {
    acres = numVal * 0.01; // 1 / 100
  } else if (cleanUnit.includes('acre') || cleanUnit.includes('ekad')) {
    acres = numVal * 1.0;
  } else {
    // Default fallback to Katha if unrecognized local unit
    acres = numVal * 0.03125;
  }

  return Math.round(acres * 10000) / 10000;
}

/**
 * Calculates exact days elapsed since the sowing date.
 * Clamps future dates or negative values to 0.
 * @param {number|string|Date} sowingDateMillis - Epoch millis or Date string
 * @param {number|Date} [nowReference] - Optional reference date (default Date.now())
 * @returns {number} Number of full days elapsed (clamped >= 0)
 */
function calculateDaysElapsed(sowingDateMillis, nowReference = Date.now()) {
  if (!sowingDateMillis) return 0;

  const sowingTime = typeof sowingDateMillis === 'number'
    ? sowingDateMillis
    : new Date(sowingDateMillis).getTime();

  if (isNaN(sowingTime) || sowingTime <= 0) return 0;

  const nowTime = typeof nowReference === 'number' ? nowReference : new Date(nowReference).getTime();
  const diffMillis = nowTime - sowingTime;
  const days = Math.floor(diffMillis / (1000 * 60 * 60 * 24));

  return Math.max(0, days);
}

/**
 * Formats land with localized unit and approximate acre representation.
 * e.g., "15 Katha (~0.47 Acre)"
 * @param {number} value
 * @param {string} unit
 * @returns {string}
 */
function formatLandWithAcres(value, unit) {
  const acres = normalizeToAcres(value, unit);
  const displayUnit = unit || 'Katha';
  return `${value} ${displayUnit} (~${acres} Acre)`;
}

module.exports = {
  normalizeToAcres,
  calculateDaysElapsed,
  formatLandWithAcres,
};
