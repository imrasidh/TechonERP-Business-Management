/**
 * Production launch profile — UI/safety only; does not alter business rules.
 * Set to false only for internal debugging builds.
 */
export var IS_PRODUCTION = true;

/** Vite production bundle (npm run build). */
export function isProductionViteBuild() {
  try {
    return typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PROD === true;
  } catch (e) {
    return false;
  }
}

/** Enforce strict period lock in production builds (settings UX may still show toggle; loadState forces on). */
export function enforceProductionStrictPeriodLock() {
  return isProductionViteBuild();
}

/**
 * Device-pepper snapshot HMAC (v1) allowed only in non-production bundles.
 * Production must seal with LICENSE_SECRET (v2) or leave integrity unsealed.
 */
export function isSnapshotDeviceHmacAllowed() {
  return !isProductionViteBuild();
}

/** Safe backup shape before writing to disk / IDB mirror */
export function validateJsonBackupPayload(bk) {
  try {
    if (!bk || typeof bk !== "object") return false;
    if (bk.version !== 2) return false;
    if (!bk.data || typeof bk.data !== "object" || Array.isArray(bk.data)) return false;
    var st = bk.data.tc3_settings;
    if (st !== undefined && (typeof st !== "object" || Array.isArray(st))) return false;
    JSON.stringify(bk);
    return true;
  } catch (e) {
    return false;
  }
}

/** User-facing message; logs full detail when console is available (errors only in production console policy). */
export function toUserErrorMessage(err, fallback) {
  fallback = fallback || "Something went wrong. Please try again.";
  if (err == null) return fallback;
  var m = typeof err === "string" ? err : err.message;
  if (!m || typeof m !== "string") return fallback;
  m = m.trim();
  if (/network|fetch|failed to fetch|timeout|HTTP\s+\d+/i.test(m)) {
    return "Connection problem. Check your network and try again.";
  }
  if (/quota|storage|IndexedDB|IDB/i.test(m)) {
    return "Storage is full or unavailable. Free disk space and try again.";
  }
  return fallback;
}

var _consoleInstalled = false;

export function installProductionConsole() {
  if (!IS_PRODUCTION || _consoleInstalled || typeof console === "undefined") return;
  _consoleInstalled = true;
  var noop = function () {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.warn = noop;
}
