/**
 * Safe defaults for release vs dev (never changes posting rules).
 */
export function defaultStrictPeriodLock() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PROD === true) {
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}
