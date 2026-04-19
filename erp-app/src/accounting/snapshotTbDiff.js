/**
 * Compare sealed snapshot per-account trial balance vs live ledger (for support / dev).
 */

import { round2, signedBalanceForAccount } from "./generalLedger.js";

/**
 * @param chart GL chart
 * @param snapshot — may include trialBalanceAccounts from buildFinancialSnapshot (additive field)
 * @param liveTb — output of trialBalance(lines, chart)
 * @param topN — max differences to return
 */
export function diffTrialBalanceSnapshotVsLive(chart, snapshot, liveTb, topN) {
  topN = topN != null ? topN : 25;
  var meta = {};
  (chart || []).forEach(function (a) {
    meta[a.id] = a;
  });
  var stored = snapshot && snapshot.trialBalanceAccounts;
  if (!stored || typeof stored !== "object") {
    return {
      legacy: true,
      rows: [],
      message: "This snapshot predates per-account trial balance capture. Save a new snapshot for row-level diff.",
    };
  }

  var liveRows = (liveTb && liveTb.rows) ? liveTb.rows : [];
  var liveMap = {};
  liveRows.forEach(function (r) {
    liveMap[r.accountId] = r;
  });

  var keys = {};
  Object.keys(stored).forEach(function (k) { keys[k] = true; });
  liveRows.forEach(function (r) { keys[r.accountId] = true; });

  var diffs = [];
  Object.keys(keys).forEach(function (aid) {
    var s = stored[aid];
    var L = liveMap[aid];
    var sd = s ? round2(s.debit || 0) : 0;
    var sc = s ? round2(s.credit || 0) : 0;
    var ld = L ? round2(L.debit || 0) : 0;
    var lc = L ? round2(L.credit || 0) : 0;
    var signedOld = signedBalanceForAccount(meta[aid], sd, sc);
    var signedNew = signedBalanceForAccount(meta[aid], ld, lc);
    var delta = round2(signedNew - signedOld);
    if (Math.abs(delta) > 0.01) {
      diffs.push({
        accountId: aid,
        code: (L && L.code) || (meta[aid] && meta[aid].code) || aid,
        name: (L && L.name) || (meta[aid] && meta[aid].name) || "",
        deltaSigned: delta,
        snapshotSigned: signedOld,
        liveSigned: signedNew,
      });
    }
  });

  diffs.sort(function (a, b) {
    return Math.abs(b.deltaSigned || 0) - Math.abs(a.deltaSigned || 0);
  });

  return {
    legacy: false,
    rows: diffs.slice(0, topN),
    totalCompared: Object.keys(keys).length,
    truncated: diffs.length > topN,
  };
}
