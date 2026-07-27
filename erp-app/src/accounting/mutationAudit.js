/**
 * Append-only financial mutation log (IndexedDB via _coreStorageSet from App).
 * Key: tc3_financial_mutation_log — do not expose arbitrary S.set from UI for this key.
 */

export var FINANCIAL_MUTATION_LOG_KEY = "tc3_financial_mutation_log";
var MAX_ROWS = 200;

export var MUTATION_ENTITY_BY_STORAGE_KEY = {
  tc3_sales: "sale",
  tc3_purchases: "purchase",
  tc3_expenses: "expense",
  tc3_salesReturns: "sales_return",
  tc3_purchaseReturns: "purchase_return",
  tc3_manualReceivables: "manual_receivable",
  tc3_manualPayables: "manual_payable",
  tc3_capLedger: "capital",
  tc3_assets: "asset",
  tc3_profitDist: "profit_distribution",
  tc3_cheques: "cheque",
  tc3_repairs: "repair",
  tc3_openBal: "opening_balance",
};

function safeSerialize(o, maxLen) {
  maxLen = maxLen || 4000;
  try {
    /* Sample first — never stringify a full sales/products array just to truncate. */
    var compact = o;
    if (Array.isArray(o)) {
      compact = { _type: "array", length: o.length, sample: o.slice(0, 3) };
    } else if (o && typeof o === "object") {
      var keys = Object.keys(o);
      if (keys.length > 40) {
        compact = { _type: "object", keys: keys.slice(0, 40), keyCount: keys.length };
      }
    }
    var s = JSON.stringify(compact);
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + "…(truncated)";
  } catch (e) {
    return "{\"_error\":\"serialize_failed\"}";
  }
}

/**
 * @param {object} opts
 * @param {Function} opts.coreStorageSet — _coreStorageSet from App
 * @param {Function} opts.storageGet — S.get
 * @param {string} opts.storageKey — tc3_sales, etc.
 * @param {*} opts.before
 * @param {*} opts.after
 * @param {string} [opts.source] — manual | sync | repair
 * @param {string} [opts.reason]
 * @param {Function} [opts.getDeviceId]
 */
export function appendFinancialMutationLog(opts) {
  opts = opts || {};
  var coreSet = opts.coreStorageSet;
  var get = opts.storageGet;
  if (typeof coreSet !== "function" || typeof get !== "function") return;
  var sk = opts.storageKey;
  var entity = MUTATION_ENTITY_BY_STORAGE_KEY[sk] || sk.replace(/^tc3_/, "");
  var row = {
    id: "fml_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
    type: "mutation",
    entity: entity,
    storageKey: sk,
    entity_id: null,
    before_state: safeSerialize(opts.before),
    after_state: safeSerialize(opts.after),
    timestamp: new Date().toISOString(),
    device: typeof navigator !== "undefined" && navigator.userAgent ? String(navigator.userAgent).slice(0, 160) : "",
    device_id: typeof opts.getDeviceId === "function" ? opts.getDeviceId() : "",
    reason: opts.reason || "",
    source: opts.source || "manual",
  };
  try {
    var prev = get(FINANCIAL_MUTATION_LOG_KEY, []);
    if (!Array.isArray(prev)) prev = [];
    coreSet(FINANCIAL_MUTATION_LOG_KEY, prev.concat([row]).slice(-MAX_ROWS));
  } catch (e) { /* ignore */ }
}
