/**
 * Coerce synced MySQL/JSON values to safe types for the renderer.
 * Server data may store phone numbers etc. as JSON numbers — .trim() on those crashes.
 */

export function safeStr(v) {
  return v == null ? "" : String(v);
}

export function safeTrim(v) {
  return safeStr(v).trim();
}

var SETTINGS_STRING_KEYS = [
  "shopName", "phone", "phone2", "address", "email", "website", "brn",
  "shopCountry", "costCodeWord", "backupFolder", "invoiceFooter", "currency",
  "taxCompoundMode", "taxMode", "taxApplyBase", "purchaseReturnCostMode",
  "inventoryCostingMethod", "lockedUntilDate", "booksClosedDate",
];

export function normalizeSettingsFromSync(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return settings;
  var out = Object.assign({}, settings);
  SETTINGS_STRING_KEYS.forEach(function (k) {
    if (out[k] != null && typeof out[k] !== "string") out[k] = String(out[k]);
  });
  return out;
}

export function normalizeStorageKeyFromSync(key, value) {
  if (key === "tc3_settings") return normalizeSettingsFromSync(value);
  if (key === "tc3_admin_name" || key === "tc3_businessType") return safeStr(value);
  return value;
}
