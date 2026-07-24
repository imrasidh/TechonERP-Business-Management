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
 * @param {object} [opts.state] — optional ERP state for subledger open-balance recon
 * @returns {{ ar: {...}, ap: {...}, arSubledger?: {...}, apSubledger?: {...} }}
 */
export function evaluateArApPolicy(opts) {
  opts = opts || {};
  var lines = opts.lines || [];
  var meta = opts.meta || {};
  var settings = opts.settings || {};
  var state = opts.state || null;

  var tol = settings.glArApNegativeTolerance;
  if (tol == null || tol === "" || isNaN(Number(tol))) tol = 50;
  tol = Math.max(0, round2(Number(tol)));

  var hard = settings.glArApHardBlockAt;
  if (hard == null || hard === "" || isNaN(Number(hard))) hard = 1000000;
  hard = Math.max(tol, round2(Number(hard)));

  var reconTol = settings.glArApSubledgerTolerance;
  if (reconTol == null || reconTol === "" || isNaN(Number(reconTol))) reconTol = 0.02;
  reconTol = Math.max(0.02, round2(Number(reconTol)));

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

  var out = {
    ar: checkSide("AR", arBal, GL.AR),
    ap: checkSide("AP", apBal, GL.AP),
  };

  if (state) {
    function phPaid(ph) {
      return (ph || []).reduce(function (a, p) { return a + Math.max(0, round2(p && p.amount || 0)); }, 0);
    }
    var openAr = 0;
    var arByParty = {};
    (state.sales || []).forEach(function (s) {
      if (!s || s.status === "Voided" || s.status === "Cancelled") return;
      var bal = Math.max(0, round2((s.total || 0) - (s.paid || 0)));
      openAr += bal;
      var pid = String(s.customerId || s.customerName || "_walkin");
      arByParty[pid] = round2((arByParty[pid] || 0) + bal);
    });
    (state.manualReceivables || []).forEach(function (mr) {
      if (!mr || mr._isOpening) return;
      var paid = phPaid(mr.paymentHistory);
      var bal = Math.max(0, round2((mr.amount || 0) - paid));
      openAr += bal;
      var pid = String(mr.person || mr.source || mr.id || "_manual_ar");
      arByParty[pid] = round2((arByParty[pid] || 0) + bal);
    });
    openAr = round2(openAr);
    var arDiff = round2(arBal - openAr);
    out.arSubledger = {
      ok: Math.abs(arDiff) <= reconTol,
      glBalance: arBal,
      openInvoices: openAr,
      difference: arDiff,
      detail: Math.abs(arDiff) <= reconTol ? "matches_open_invoices_and_manual" : "gl_vs_open_ar_mismatch",
    };
    if (!out.arSubledger.ok) out.ar.ok = false;

    var arPartyMax = 0;
    Object.keys(arByParty).forEach(function (k) {
      var v = Math.abs(arByParty[k] || 0);
      if (v > arPartyMax) arPartyMax = v;
    });
    out.arParty = {
      ok: true,
      partyCount: Object.keys(arByParty).length,
      maxPartyOpen: round2(arPartyMax),
      detail: "open_by_party_available",
      byParty: arByParty,
    };

    var openAp = 0;
    var apByParty = {};
    (state.purchases || []).forEach(function (p) {
      if (!p || p.status === "Voided" || p.status === "Cancelled") return;
      var bal = Math.max(0, round2((p.total || 0) - (p.paidAmount || 0)));
      openAp += bal;
      var pid = String(p.supplierId || p.supplierName || p.supplier || "_supplier");
      apByParty[pid] = round2((apByParty[pid] || 0) + bal);
    });
    (state.manualPayables || []).forEach(function (mp) {
      if (!mp || mp._isOpening) return;
      var paid = phPaid(mp.paymentHistory);
      var bal = Math.max(0, round2((mp.amount || 0) - paid));
      openAp += bal;
      var pid = String(mp.source || mp.supplierName || mp.id || "_manual_ap");
      apByParty[pid] = round2((apByParty[pid] || 0) + bal);
    });
    openAp = round2(openAp);
    var apDiff = round2(apBal - openAp);
    out.apSubledger = {
      ok: Math.abs(apDiff) <= reconTol,
      glBalance: apBal,
      openPurchases: openAp,
      difference: apDiff,
      detail: Math.abs(apDiff) <= reconTol ? "matches_open_purchases_and_manual" : "gl_vs_open_ap_mismatch",
    };
    if (!out.apSubledger.ok) out.ap.ok = false;

    var apPartyMax = 0;
    Object.keys(apByParty).forEach(function (k) {
      var v = Math.abs(apByParty[k] || 0);
      if (v > apPartyMax) apPartyMax = v;
    });
    out.apParty = {
      ok: true,
      partyCount: Object.keys(apByParty).length,
      maxPartyOpen: round2(apPartyMax),
      detail: "open_by_party_available",
      byParty: apByParty,
    };
  }

  return out;
}
