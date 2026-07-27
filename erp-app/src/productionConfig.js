/**
 * Production launch profile — UI/safety only; does not alter business rules.
 * Set to false only for internal debugging builds.
 */
export var IS_PRODUCTION = true;

/**
 * Computer-shop standalone edition: one installer, tech profile, no network/mode wizard,
 * always full admin navigation (no Sales/Admin mode toggle).
 */
export var COMPUTER_SHOP_EDITION = true;

/** Default POS line comment label (generic — serial/IMEI entered at checkout). */
export var DEFAULT_PRODUCT_COMMENT_LABEL = "Comment";

/** Vite production bundle (npm run build). */
export function isProductionViteBuild() {
  try {
    return typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PROD === true;
  } catch (e) {
    return false;
  }
}

/**
 * Certification tools (dataset generator + runner) replace the whole company database
 * with a synthetic dataset that has a published admin password, so they stay off in
 * production builds unless an operator deliberately arms them for an internal run.
 */
export var CERT_TOOLS_UNLOCK_KEY = "techon_certification_tools";

export function areCertificationToolsEnabled() {
  /* Non-production unpackaged builds: always on for developers. */
  if (!IS_PRODUCTION && !isProductionViteBuild()) return true;
  try {
    /* Packaged .exe: never unlock via renderer localStorage (published cert password). */
    if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.isPackaged === "function") {
      if (window.electronAPI.isPackaged() === true) return false;
    }
    if (typeof window !== "undefined" && window.__TC_IS_PACKAGED === true) return false;
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(CERT_TOOLS_UNLOCK_KEY) === "1";
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

/** Credential keys that must never leave the machine in exported backups. */
export var TC_BACKUP_EXCLUDE_KEYS = ["tc3_users", "tc3_apppass", "tc3_admin_name"];

/** Strip credential material from a backup data object before export to disk/download. */
export function sanitizeBackupDataForExport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  var out = {};
  Object.keys(data).forEach(function (k) {
    if (TC_BACKUP_EXCLUDE_KEYS.indexOf(k) >= 0) return;
    out[k] = data[k];
  });
  if (out.tc3_settings && typeof out.tc3_settings === "object" && !Array.isArray(out.tc3_settings)) {
    var st = Object.assign({}, out.tc3_settings);
    delete st.adminPin;
    delete st.mainAdminPassHash;
    out.tc3_settings = st;
  }
  return out;
}

/** Keys that must be arrays when present in a backup (mirrors TC_FULL_BACKUP_KEYS document arrays). */
var BACKUP_ARRAY_KEYS = [
  "tc3_products", "tc3_customers", "tc3_suppliers", "tc3_others", "tc3_sales", "tc3_purchases",
  "tc3_expenses", "tc3_repairs", "tc3_assets", "tc3_damageLog", "tc3_productLog", "tc3_repairDeleteLog",
  "tc3_capLedger", "tc3_capLog", "tc3_manualPayables", "tc3_manualReceivables", "tc3_profitDist",
  "tc3_assetLog", "tc3_auditLog", "tc3_gl_audit", "tc3_financial_mutation_log", "tc3_salesReturns",
  "tc3_purchaseReturns", "tc3_quotations", "tc3_cheques", "tc3_raw_material_counts", "tc3_raw_material_usage",
  "tc3_labelDesigns", "tc3_journal_lines", "tc3_gl_accounts", "tc3_financial_snapshots",
  "tc3_stock_movements", "tc3_codRecords", "tc3_codPartners", "tc3_codWithdrawals", "tc3_invoice_edit_locks",
  "tc3_users",
];

/** Safe backup shape before writing to disk / IDB mirror */
export function validateJsonBackupPayload(bk) {
  try {
    if (!bk || typeof bk !== "object") return false;
    if (bk.version !== 2) return false;
    if (!bk.data || typeof bk.data !== "object" || Array.isArray(bk.data)) return false;
    var st = bk.data.tc3_settings;
    if (st !== undefined && (typeof st !== "object" || Array.isArray(st))) return false;
    for (var i = 0; i < BACKUP_ARRAY_KEYS.length; i++) {
      var k = BACKUP_ARRAY_KEYS[i];
      if (bk.data[k] !== undefined && !Array.isArray(bk.data[k])) return false;
    }
    if (bk.data.tc3_gl_mode !== undefined && typeof bk.data.tc3_gl_mode !== "string") return false;
    if (bk.data.tc3_journal_hash !== undefined && typeof bk.data.tc3_journal_hash !== "string") return false;
    if (bk.data.tc3_inventory_layers !== undefined) {
      var layers = bk.data.tc3_inventory_layers;
      if (typeof layers !== "object" || Array.isArray(layers)) return false;
    }
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
  console.error = noop;
}
