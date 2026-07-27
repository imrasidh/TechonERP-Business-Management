/**
 * Summarize a backup payload before restore (dry-run preview).
 */

import { validateJsonBackupPayload } from "../productionConfig.js";
import { trialBalance, resolveGlChart } from "../accounting/generalLedger.js";

function countArr(d, key) {
  return Array.isArray(d[key]) ? d[key].length : 0;
}

/**
 * @param {object} backup — { version, timestamp, shopName, data }
 * @returns {object}
 */
export function summarizeBackupForRestore(backup) {
  var valid = validateJsonBackupPayload(backup);
  var d = backup && backup.data && typeof backup.data === "object" ? backup.data : {};
  var settings = d.tc3_settings && typeof d.tc3_settings === "object" ? d.tc3_settings : {};
  var journalLines = Array.isArray(d.tc3_journal_lines) ? d.tc3_journal_lines : [];
  var tbOk = false;
  var tbDebit = 0;
  var tbCredit = 0;

  if (journalLines.length > 0) {
    try {
      var chart = resolveGlChart(d.tc3_gl_accounts);
      var tb = trialBalance(journalLines, chart);
      tbDebit = Number(tb && tb.totalDebit) || 0;
      tbCredit = Number(tb && tb.totalCredit) || 0;
      tbOk = Math.abs(tbDebit - tbCredit) < 0.02;
    } catch (_e) {
      tbOk = false;
    }
  }

  return {
    valid: valid,
    shopName: settings.shopName || backup.shopName || "Unknown shop",
    timestamp: backup && backup.timestamp ? backup.timestamp : null,
    sales: countArr(d, "tc3_sales"),
    purchases: countArr(d, "tc3_purchases"),
    products: countArr(d, "tc3_products"),
    customers: countArr(d, "tc3_customers"),
    suppliers: countArr(d, "tc3_suppliers"),
    expenses: countArr(d, "tc3_expenses"),
    journalLines: journalLines.length,
    trialBalanceOk: journalLines.length === 0 ? true : tbOk,
    trialBalanceDebit: tbDebit,
    trialBalanceCredit: tbCredit,
    hasSettings: !!settings.shopName || Object.keys(settings).length > 0,
  };
}

export function formatBackupPreviewText(preview) {
  if (!preview) return "Invalid backup.";
  var lines = [
    "Shop: " + preview.shopName,
    "Backup date: " + (preview.timestamp ? new Date(preview.timestamp).toLocaleString() : "unknown"),
    "Sales: " + preview.sales,
    "Purchases: " + preview.purchases,
    "Products: " + preview.products,
    "Customers: " + preview.customers,
    "Journal lines: " + preview.journalLines,
  ];
  if (preview.journalLines > 0) {
    lines.push(
      "Trial balance: " + (preview.trialBalanceOk ? "balanced" : "UNBALANCED") +
      " (Dr " + (preview.trialBalanceDebit || 0).toFixed(2) + " / Cr " + (preview.trialBalanceCredit || 0).toFixed(2) + ")"
    );
  }
  if (!preview.valid) lines.unshift("WARNING: Backup file failed validation checks.");
  return lines.join("\n");
}
