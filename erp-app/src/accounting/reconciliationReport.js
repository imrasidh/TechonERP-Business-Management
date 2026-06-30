/**
 * One-shot reconciliation checklist (GL vs subsystems + policy).
 */

import { trialBalance, DEFAULT_GL_CHART, round2 } from "./generalLedger.js";
import { reconcileInventoryToLedger, isInventoryReconcileOk } from "./inventoryEngine.js";
import { getOrCreateDeviceId } from "./ids.js";
import { evaluateArApPolicy } from "./arApPolicy.js";

/**
 * @param {object} o
 * @param {Array} o.lines
 * @param {Array} o.chart
 * @param {object} o.invDer
 * @param {Function} o.validateJournalBalanced
 * @param {object} o.settings
 */
export function buildReconciliationReport(o) {
  o = o || {};
  var lines = o.lines || [];
  var chart = o.chart || DEFAULT_GL_CHART;
  var invDer = o.invDer;
  var settings = o.settings || {};
  var validateJB = o.validateJournalBalanced;
  var rows = [];

  var tb = trialBalance(lines, chart);
  var jbal = typeof validateJB === "function" ? validateJB(lines) : { ok: true };
  rows.push({
    id: "journal_balance",
    label: "Journal double-entry (groups)",
    ok: !!(jbal && jbal.ok),
    detail: jbal && jbal.ok ? "OK" : "❌ Imbalance",
    amounts: jbal && jbal.imbalances ? jbal.imbalances : null,
  });
  rows.push({
    id: "trial_balance",
    label: "Trial balance (totals)",
    ok: !!tb.balanced,
    detail: tb.balanced ? "OK" : "❌ Mismatch",
    amounts: { totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, diff: round2(tb.totalDebit - tb.totalCredit) },
  });

  var meta = {};
  chart.forEach(function (a) {
    meta[a.id] = a;
  });
  if (invDer) {
    var rec = reconcileInventoryToLedger(lines, invDer, chart);
    var invOk = isInventoryReconcileOk(rec, settings);
    rows.push({
      id: "inv_vs_gl",
      label: "Inventory valuation vs GL inventory account",
      ok: invOk,
      detail: invOk ? (rec.ok ? "OK" : "OK (within WAC tolerance)") : "❌ Mismatch",
      amounts: { glInventoryBalance: rec.glInventoryBalance, physicalValue: rec.physicalValue, difference: rec.difference },
    });
  } else {
    rows.push({ id: "inv_vs_gl", label: "Inventory vs GL", ok: null, detail: "— (no inventory derive)", amounts: null });
  }

  var apAr = evaluateArApPolicy({ lines: lines, meta: meta, settings: settings });
  rows.push({
    id: "ar_sanity",
    label: "AR (GL) — policy (tolerance + references)",
    ok: !!apAr.ar.ok,
    detail: apAr.ar.ok ? "OK" : "❌ " + (apAr.ar.detail || ""),
    amounts: { balance: apAr.ar.balance, accountId: "1100", policy: apAr.ar.detail },
  });
  rows.push({
    id: "ap_sanity",
    label: "AP (GL) — policy (tolerance + references)",
    ok: !!apAr.ap.ok,
    detail: apAr.ap.ok ? "OK" : "❌ " + (apAr.ap.detail || ""),
    amounts: { balance: apAr.ap.balance, accountId: "2000", policy: apAr.ap.detail },
  });

  var lock = settings.lockedUntilDate;
  var strict = settings.strictPeriodLock === true;
  rows.push({
    id: "period_lock_policy",
    label: "Period lock policy",
    ok: true,
    detail: (lock ? "Lock date " + lock : "No lock date") + (strict ? " · strict on" : " · strict off"),
    amounts: null,
  });

  var hasFail = rows.some(function (r) {
    return r.ok === false;
  });
  var allOk = !hasFail;

  return {
    generatedAt: new Date().toISOString(),
    deviceId: typeof getOrCreateDeviceId === "function" ? getOrCreateDeviceId() : "",
    summaryOk: allOk,
    rows: rows,
  };
}
