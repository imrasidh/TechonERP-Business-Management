/**
 * Non-destructive reconciliation hints (display only — no posting).
 */

import { round2 } from "./generalLedger.js";

/**
 * @returns {{
 *   checks: { key: string, label: string, severity: string, detail: string }[],
 *   displayOnlyClosingAdjustment: number,
 *   closingAdjustmentNote: string
 * }}
 */
export function buildReconAutoSuggest(state, lines, chart, reconciliation, drilldown) {
  var diff = reconciliation && typeof reconciliation.difference === "number" ? reconciliation.difference : 0;
  var checks = [];

  var purchaseIdsWithGl = {};
  var purchaseIdsRecent = {};
  var prIdsWithGl = {};
  var prIdsRecent = {};

  var i;
  for (i = 0; i < (lines || []).length; i++) {
    var ln = lines[i];
    var rt = String(ln.referenceType || "");
    if (rt === "purchase" && ln.referenceId) purchaseIdsWithGl[String(ln.referenceId)] = true;
    if ((rt === "purchase_return" || rt === "purchase_return_refund") && ln.referenceId) prIdsWithGl[String(ln.referenceId)] = true;
  }

  var recentPur = (state.purchases || []).slice(-40);
  for (i = 0; i < recentPur.length; i++) {
    var p = recentPur[i];
    if (p && p.id) purchaseIdsRecent[String(p.id)] = true;
  }
  var recentPr = (state.purchaseReturns || []).slice(-40);
  for (i = 0; i < recentPr.length; i++) {
    var r = recentPr[i];
    if (r && r.id) prIdsRecent[String(r.id)] = true;
  }

  var missingPurGl = [];
  Object.keys(purchaseIdsRecent).forEach(function (pid) {
    if (!purchaseIdsWithGl[pid]) missingPurGl.push(pid);
  });
  checks.push({
    key: "pur_gl",
    label: "Recent purchases without INV GL lines",
    severity: missingPurGl.length ? "warn" : "ok",
    detail: missingPurGl.length ? missingPurGl.length + " of last 40 purchases have no matching posted purchase journal ref on INV (" + missingPurGl.slice(0, 5).join(", ") + (missingPurGl.length > 5 ? "…" : "") + ")" : "Last 40 purchases appear referenced on inventory postings.",
  });

  var missingPrGl = [];
  Object.keys(prIdsRecent).forEach(function (rid) {
    if (!prIdsWithGl[rid]) missingPrGl.push(rid);
  });
  checks.push({
    key: "pr_gl",
    label: "Recent purchase returns without INV GL lines",
    severity: missingPrGl.length ? "warn" : "ok",
    detail: missingPrGl.length ? missingPrGl.length + " recent return row(s) lack matching INV rows (" + missingPrGl.slice(0, 5).join(", ") + (missingPrGl.length > 5 ? "…" : "") + ")" : "Recent purchase returns appear on GL.",
  });

  var expectedPr = 0;
  (state.purchaseReturns || []).forEach(function (r) {
    expectedPr += round2((r.qty || 0) * round2(r.cost || 0));
  });
  var bucketPr = drilldown && drilldown.buckets && drilldown.buckets.returns_purchase ? drilldown.buckets.returns_purchase : null;
  var glReturnsPurApprox = bucketPr ? bucketPr.subtotal : 0;
  checks.push({
    key: "pr_consistency",
    label: "Purchase returns (qty × cost) vs GL bucket (approx)",
    severity: Math.abs(expectedPr - glReturnsPurApprox) > 5 ? "warn" : "ok",
    detail: "Summed rows Rs " + fmtLite(expectedPr) + " · GL drill-down abs subtotal Rs " + fmtLite(glReturnsPurApprox) + " (large gaps may indicate mixed refs).",
  });

  var adjN = drilldown && drilldown.buckets && drilldown.buckets.adjustments ? drilldown.buckets.adjustments.rows.length : 0;
  checks.push({
    key: "adjustments",
    label: "Adjustments touching inventory",
    severity: adjN > 0 ? "info" : "ok",
    detail: adjN ? adjN + " adjustment lines in recent INV sample — review damage/stock counts." : "No adjustment lines in recent INV drill-down sample.",
  });

  var closing = Math.abs(diff) > 0.005 ? round2(-diff) : 0;
  var note = "Illustration only (not posted): a single adjustment changing net inventory (1200) by " + fmtLite(closing) + " would align reported GL − physical difference to zero if no other movements occur.";

  return {
    checks: checks,
    displayOnlyClosingAdjustment: closing,
    closingAdjustmentNote: Math.abs(diff) > 0.005 ? note : "",
  };
}

function fmtLite(n) {
  return String(round2(Number(n) || 0));
}
