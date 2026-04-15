/**
 * Real-world AR/AP sanity for GL (validation only — no posting changes).
 * Uses tolerance + optional journal reference metadata; blocks only large unexplained negatives.
 */

import { sumAccount, signedBalanceForAccount, GL, round2 } from "./generalLedger.js";

function accountHasReferenceMetadata(lines, accountId) {
  var i;
  var ln;
  for (i = 0; i < (lines || []).length; i++) {
    ln = lines[i];
    if (!ln || ln.accountId !== accountId) continue;
    var rt = ln.referenceType != null ? String(ln.referenceType).trim() : "";
    var rid = ln.referenceId != null ? String(ln.referenceId).trim() : "";
    var memo = ln.memo != null ? String(ln.memo).trim() : "";
    if (rt || rid || memo) return true;
  }
  return false;
}

/**
 * @param {object} opts
 * @param {Array} opts.lines
 * @param {object} opts.meta — chart row by id for GL.AR / GL.AP
 * @param {object} [opts.settings]
 * @returns {{ ar: { ok: boolean, balance: number, detail: string }, ap: { ok: boolean, balance: number, detail: string } }}
 */
export function evaluateArApPolicy(opts) {
  opts = opts || {};
  var lines = opts.lines || [];
  var meta = opts.meta || {};
  var settings = opts.settings || {};

  var tol = settings.glArApNegativeTolerance;
  if (tol == null || tol === "" || isNaN(Number(tol))) tol = 50;
  tol = Math.max(0, round2(Number(tol)));

  var hard = settings.glArApHardBlockAt;
  if (hard == null || hard === "" || isNaN(Number(hard))) hard = 1000000;
  hard = Math.max(tol, round2(Number(hard)));

  var arM = meta[GL.AR] || { normal: "debit" };
  var arS = sumAccount(lines, GL.AR);
  var arBal = signedBalanceForAccount(arM, arS.debit, arS.credit);

  var apM = meta[GL.AP] || { normal: "credit" };
  var apS = sumAccount(lines, GL.AP);
  var apBal = signedBalanceForAccount(apM, apS.debit, apS.credit);

  function checkSide(label, bal, accountId) {
    if (bal >= -tol) {
      return { ok: true, balance: bal, detail: "within_tolerance" };
    }
    if (bal < -hard) {
      return { ok: false, balance: bal, detail: "hard_block_large_negative" };
    }
    if (accountHasReferenceMetadata(lines, accountId)) {
      return { ok: true, balance: bal, detail: "negative_with_journal_references" };
    }
    return { ok: false, balance: bal, detail: "negative_beyond_tolerance_unexplained" };
  }

  return {
    ar: checkSide("AR", arBal, GL.AR),
    ap: checkSide("AP", apBal, GL.AP),
  };
}
