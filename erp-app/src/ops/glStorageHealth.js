/**
 * Detect and repair corrupted GL metadata (empty COA, wrong types).
 * Does not rebuild journal lines — only storage keys that blank Reports / Trial Balance.
 */

import { DEFAULT_GL_CHART, profitAndLossFromLedger, resolveGlChart } from "../accounting/generalLedger.js";

function detectDuplicateJournalGroups(lines) {
  var byTxn = {};
  var dupes = 0;
  (Array.isArray(lines) ? lines : []).forEach(function (ln, idx) {
    var txn = String((ln && (ln.transactionId || ln.entryGroupId)) || "");
    if (!txn) return;
    var fp = [
      txn,
      String(ln.accountId || ""),
      Number(ln.debit) || 0,
      Number(ln.credit) || 0,
      String(ln.date || "").slice(0, 10),
      String(ln.memo || "").slice(0, 80),
    ].join("|");
    if (byTxn[fp]) dupes++;
    else byTxn[fp] = idx + 1;
  });
  return dupes;
}

/**
 * @param {{ get: function(string, *): * }} storage
 * @returns {{ ok: boolean, issues: Array<{code:string,severity:string,message:string}>, lineCount: number, chartAccountCount: number }}
 */
export function diagnoseGlStorage(storage) {
  var S = storage;
  var issues = [];
  var lines = S.get("tc3_journal_lines", []) || [];
  var lineCount = Array.isArray(lines) ? lines.length : 0;
  var chart = S.get("tc3_gl_accounts", null);
  var chartEmpty = !Array.isArray(chart) || chart.length === 0;
  var chartCount = chartEmpty ? 0 : chart.length;
  var duplicateJournalGroups = detectDuplicateJournalGroups(lines);

  if (lineCount > 0 && chartEmpty) {
    issues.push({
      code: "coa_empty",
      severity: "critical",
      message: "Chart of accounts is empty but the journal has " + lineCount + " lines. Trial Balance and Reports will be wrong until repaired.",
    });
  }
  if (duplicateJournalGroups > 0) {
    issues.push({
      code: "journal_duplicate_groups",
      severity: "critical",
      message: "General ledger contains " + duplicateJournalGroups + " duplicate journal lines inside transaction groups. Run a ledger rebuild after sync.",
    });
  }

  var mode = S.get("tc3_gl_mode", null);
  if (mode == null || mode === "" || Array.isArray(mode)) {
    issues.push({
      code: "gl_mode_bad",
      severity: "warning",
      message: "GL mode is missing or invalid.",
    });
  }

  var hash = S.get("tc3_journal_hash", null);
  if (Array.isArray(hash)) {
    issues.push({
      code: "journal_hash_array",
      severity: "warning",
      message: "Journal integrity hash is stored as an array instead of text.",
    });
  }

  var layers = S.get("tc3_inventory_layers", null);
  if (Array.isArray(layers)) {
    issues.push({
      code: "layers_array",
      severity: "warning",
      message: "Inventory costing layers are stored as an array instead of an object.",
    });
  }

  return {
    ok: issues.every(function (i) { return i.severity !== "critical"; }),
    issues: issues,
    lineCount: lineCount,
    chartAccountCount: chartCount,
    duplicateJournalGroups: duplicateJournalGroups,
  };
}

/**
 * @param {{ get: function(string, *): * }} storage
 * @param {function(string, *): void} [writeFn] — use _coreStorageSet during sync hydrate
 * @returns {{ healed: string[], issues: ReturnType<typeof diagnoseGlStorage>["issues"] }}
 */
export function healGlStorageMetadata(storage, writeFn) {
  var S = storage;
  var set = typeof writeFn === "function" ? writeFn : function (k, v) {
    if (storage.set) storage.set(k, v);
  };
  var healed = [];
  var lines = S.get("tc3_journal_lines", []) || [];
  var chart = S.get("tc3_gl_accounts", null);

  if (lines.length && (!Array.isArray(chart) || chart.length === 0)) {
    set("tc3_gl_accounts", DEFAULT_GL_CHART.slice());
    healed.push("coa_empty");
  }

  var mode = S.get("tc3_gl_mode", null);
  if (mode == null || mode === "" || Array.isArray(mode)) {
    set("tc3_gl_mode", "live");
    healed.push("gl_mode_bad");
  }

  var hash = S.get("tc3_journal_hash", null);
  if (Array.isArray(hash)) {
    set("tc3_journal_hash", "");
    healed.push("journal_hash_array");
  }

  var layers = S.get("tc3_inventory_layers", null);
  if (Array.isArray(layers)) {
    set("tc3_inventory_layers", {});
    healed.push("layers_array");
  }

  return { healed: healed, issues: diagnoseGlStorage(S).issues };
}

/**
 * True when ledger P&L income is zero but operational invoice totals are materially higher.
 * @param {{ get: function(string, *): * }} storage
 * @param {number} operationalSalesTotal
 * @returns {boolean}
 */
export function hasGlOperationalSalesMismatch(storage, operationalSalesTotal) {
  var ops = Number(operationalSalesTotal) || 0;
  if (ops <= 0) return false;
  var lines = storage.get("tc3_journal_lines", []) || [];
  if (!lines.length) return false;
  var chart = resolveGlChart(storage.get("tc3_gl_accounts", null));
  var pl = profitAndLossFromLedger(lines, chart, null, null);
  return pl && typeof pl.income === "number" && Math.abs(pl.income) < 0.01 && ops > 0.01;
}
