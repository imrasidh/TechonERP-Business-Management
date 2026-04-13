/**
 * Production launch profile — UI/safety only; does not alter business rules.
 * Set to false only for internal debugging builds.
 */
export var IS_PRODUCTION = true;

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
