/**
 * Pre-commit integrity checks for journal persistence (ledger + controls).
 * Does not alter amounts or posting logic — validation only.
 */

import {
  validateJournalBalanced,
  trialBalance,
  DEFAULT_GL_CHART,
  round2,
} from "./generalLedger.js";
import { reconcileInventoryToLedger, isInventoryReconcileOk } from "./inventoryEngine.js";
import { evaluateArApPolicy } from "./arApPolicy.js";

function badNumber(x) {
  if (x == null) return true;
  var n = Number(x);
  return typeof n !== "number" || !isFinite(n) || isNaN(n);
}

/**
 * @param {object} ctx
 * @param {Array} ctx.lines — journal lines to persist
 * @param {Array} ctx.chart
 * @param {object} [ctx.invDer] — optional; inventory reconciliation when present
 * @param {object} [ctx.settings] — tc3_settings merge (AR/AP tolerance)
 * @param {string} [ctx.source]
 * @returns {{ ok: boolean, errors: Array }}
 */
export function validateAccountingCommitInvariants(ctx) {
  ctx = ctx || {};
  var lines = ctx.lines || [];
  var chart = ctx.chart || DEFAULT_GL_CHART;
  var invDer = ctx.invDer;
  var settings = ctx.settings || {};
  var errors = [];

  var vj = validateJournalBalanced(lines);
  if (!vj.ok) {
    errors.push({ code: "journal_group_balance", detail: vj.imbalances || [] });
  }

  var tb = trialBalance(lines, chart);
  if (!tb.balanced) {
    errors.push({
      code: "trial_balance",
      message: "Total debits must equal total credits",
      detail: { totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, diff: round2(tb.totalDebit - tb.totalCredit) },
    });
  }

  var meta = {};
  chart.forEach(function (a) {
    meta[a.id] = a;
  });

  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    if (!ln) continue;
    if (badNumber(ln.debit) || badNumber(ln.credit)) {
      errors.push({ code: "unsafe_numeric", lineIndex: i, id: ln.id });
      break;
    }
  }

  if (invDer) {
    var rec = reconcileInventoryToLedger(lines, invDer, chart);
    if (!isInventoryReconcileOk(rec, settings)) {
      errors.push({ code: "inventory_vs_gl", detail: rec });
    }
  }

  var apAr = evaluateArApPolicy({ lines: lines, meta: meta, settings: settings });
  if (!apAr.ar.ok) {
    errors.push({ code: "ar_policy", detail: apAr.ar });
  }
  if (!apAr.ap.ok) {
    errors.push({ code: "ap_policy", detail: apAr.ap });
  }

  return { ok: errors.length === 0, errors: errors };
}
