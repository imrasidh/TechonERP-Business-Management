/**
 * Trial record limits (20 per module) and license read-only write guards.
 */

export var TRIAL_MAX_RECORDS = 20;

/** Counted modules during trial — each capped at TRIAL_MAX_RECORDS. */
export var TRIAL_COUNT_MODULES = [
  { key: "sales", label: "Sales", storageKey: "tc3_sales" },
  { key: "products", label: "Products", storageKey: "tc3_products" },
  { key: "customers", label: "Customers", storageKey: "tc3_customers" },
  { key: "purchases", label: "Purchases", storageKey: "tc3_purchases" },
  { key: "suppliers", label: "Suppliers", storageKey: "tc3_suppliers" },
  { key: "others", label: "Others", storageKey: "tc3_others" },
  { key: "expenses", label: "Expenses", storageKey: "tc3_expenses" },
  { key: "quotations", label: "Quotations", storageKey: "tc3_quotations" },
  { key: "repairs", label: "Repairs", storageKey: "tc3_repairs" },
  { key: "salesReturns", label: "Sales returns", storageKey: "tc3_salesReturns" },
  { key: "purchaseReturns", label: "Purchase returns", storageKey: "tc3_purchaseReturns" },
  { key: "cheques", label: "Cheques", storageKey: "tc3_cheques" },
  { key: "assets", label: "Assets", storageKey: "tc3_assets" },
  { key: "manualReceivables", label: "Manual receivables", storageKey: "tc3_manualReceivables" },
  { key: "manualPayables", label: "Manual payables", storageKey: "tc3_manualPayables" },
  { key: "codRecords", label: "COD records", storageKey: "tc3_codRecords" },
  { key: "codWithdrawals", label: "COD withdrawals", storageKey: "tc3_codWithdrawals" },
];

var _STORAGE_TO_MODULE = {};
for (var i = 0; i < TRIAL_COUNT_MODULES.length; i++) {
  _STORAGE_TO_MODULE[TRIAL_COUNT_MODULES[i].storageKey] = TRIAL_COUNT_MODULES[i];
}

/** Keys that may still be written while the license is read-only (settings, auth, flags). */
export var READONLY_ALLOWED_STORAGE_KEYS = {
  tc3_settings: true,
  tc3_users: true,
  tc3_admin_name: true,
  tc3_businessType: true,
  tc3_startup_wizard_done: true,
  tc3_apppass: true,
  tc3_gl_audit: true,
  tc3_auditLog: true,
  tc3_financial_mutation_log: true,
  tc3_invoice_edit_locks: true,
};

export function countArrayLength(v) {
  return Array.isArray(v) ? v.length : 0;
}

export function buildUsageCountsFromStorage(getFn) {
  var counts = {};
  for (var i = 0; i < TRIAL_COUNT_MODULES.length; i++) {
    var m = TRIAL_COUNT_MODULES[i];
    counts[m.key] = countArrayLength(getFn(m.storageKey, []));
  }
  return counts;
}

/** @returns {{ module: string, label: string, count: number, max: number } | null} */
export function getTrialLimitExceeded(usageCounts, max) {
  max = max == null ? TRIAL_MAX_RECORDS : max;
  if (!usageCounts) return null;
  for (var i = 0; i < TRIAL_COUNT_MODULES.length; i++) {
    var m = TRIAL_COUNT_MODULES[i];
    var n = usageCounts[m.key] || 0;
    if (n >= max) {
      return { module: m.key, label: m.label, count: n, max: max };
    }
  }
  return null;
}

export function getTrialModuleForStorageKey(storageKey) {
  return _STORAGE_TO_MODULE[storageKey] || null;
}

function _licenseInfo() {
  try {
    return typeof window !== "undefined" ? window._tcLicInfo : null;
  } catch (e) {
    return null;
  }
}

export function isLicenseReadOnly(info) {
  info = info || _licenseInfo();
  if (!info) return false;
  if (info.isReadOnly) return true;
  if (info.status === "expired") return true;
  return false;
}

export function isTrialMode(info) {
  info = info || _licenseInfo();
  return !!(info && info.status === "trial" && !isLicenseReadOnly(info));
}

export function trialMaxForInfo(info) {
  info = info || _licenseInfo();
  return (info && info.trialMaxRecords) || TRIAL_MAX_RECORDS;
}

export function readOnlyBlockMessage(info) {
  info = info || _licenseInfo();
  var reason = info && info.readOnlyReason;
  if (reason === "trial_limit_reached") {
    return "Trial limit reached (20 records per module).\n\nActivate your TechonERP license to continue adding data.\n\n🔒 Your data is safe — activate to unlock full access.";
  }
  if (info && info.status === "trial") {
    return "Trial limit reached.\n\nActivate your license to continue.\n\n🔒 Your data is safe.";
  }
  return "License expired or inactive.\n\nRenew or activate your license to continue.\n\n🔒 View-only mode — your data is safe.";
}

export function trialLimitBlockMessage(moduleKeyOrLabel, count, max) {
  var label = moduleKeyOrLabel;
  for (var i = 0; i < TRIAL_COUNT_MODULES.length; i++) {
    if (TRIAL_COUNT_MODULES[i].key === moduleKeyOrLabel) {
      label = TRIAL_COUNT_MODULES[i].label;
      break;
    }
  }
  return (
    "You have reached the free trial limit for " + (label || "this module") +
    " (" + count + "/" + max + ").\n\n" +
    "Activate your license to continue adding records.\n\n" +
    "🔒 Your data is safe — activate to unlock all features."
  );
}

/**
 * Storage-layer guard for S.set — blocks trial over-limit inserts and read-only mutations.
 * @returns {{ blocked: boolean, message?: string }}
 */
export function evaluateLicenseStorageWrite(storageKey, newVal, oldVal) {
  if (!storageKey || typeof storageKey !== "string") return { blocked: false };
  if (storageKey.indexOf("tc3_") !== 0) return { blocked: false };

  try {
    if (typeof window !== "undefined" && window._tcRestoreInProgress) return { blocked: false };
  } catch (e0) { /* ignore */ }

  var info = _licenseInfo();
  if (!info) return { blocked: false };

  if (isLicenseReadOnly(info)) {
    if (READONLY_ALLOWED_STORAGE_KEYS[storageKey]) return { blocked: false };
    try {
      var prevStr = JSON.stringify(oldVal === undefined ? null : oldVal);
      var nextStr = JSON.stringify(newVal === undefined ? null : newVal);
      if (prevStr === nextStr) return { blocked: false };
    } catch (e) { /* unserializable — block */ }
    return { blocked: true, message: readOnlyBlockMessage(info) };
  }

  if (!isTrialMode(info)) return { blocked: false };

  var mod = getTrialModuleForStorageKey(storageKey);
  if (!mod) return { blocked: false };

  var max = trialMaxForInfo(info);
  var oldLen = countArrayLength(oldVal);
  var newLen = countArrayLength(newVal);
  if (newLen <= oldLen) return { blocked: false };

  /* Network client: enforce using server counts from main PC MySQL kv_store */
  try {
    var netRole = typeof window !== "undefined" ? window._tcNetRole : "";
    if (netRole === "network_client" && info.serverCounts && typeof info.serverCounts === "object") {
      var sc = info.serverCounts[mod.key];
      if (typeof sc === "number" && sc >= max) {
        return {
          blocked: true,
          message: trialLimitBlockMessage(mod.label, sc, max) +
            "\n\nActivate the license on the main server PC to continue.",
        };
      }
      return { blocked: false };
    }
  } catch (eNet) { /* fall through to local length check */ }

  if (newLen > max || oldLen >= max) {
    return {
      blocked: true,
      message: trialLimitBlockMessage(mod.label, Math.max(newLen, oldLen), max),
    };
  }
  return { blocked: false };
}
