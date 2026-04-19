/**
 * Period lock boundary (matches tc3_settings.lockedUntilDate).
 * Transaction dates on or before the lock date are frozen unless Admin accounting unlock is active.
 */

export function isLockedThroughDate(txnDate, lockedUntilDate) {
  return !!(txnDate && lockedUntilDate && String(txnDate) <= String(lockedUntilDate));
}

/** Next calendar day (UTC-safe) — for HTML date `min` after a lock-through date */
export function nextCalendarDay(dateStr) {
  if (!dateStr) return "";
  var parts = String(dateStr).split("-");
  if (parts.length !== 3) return "";
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  if (!y || !m || !d) return "";
  var dt = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dt.getTime())) return "";
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
