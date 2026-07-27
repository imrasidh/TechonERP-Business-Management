import { makeUniqueTransactionId, getOrCreateDeviceId } from "./ids.js";

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function groupKey(ln) {
  return String(ln.transactionId || ln.entryGroupId || "");
}

function groupLinesByTransaction(lines) {
  var m = {};
  (lines || []).forEach(function (ln, idx) {
    var k = groupKey(ln);
    /* Quarantine malformed lines under a stable synthetic key instead of dropping them. */
    if (!k) {
      k = "__orphan__:" + String((ln && ln.id) || ("i" + idx));
    }
    if (!m[k]) m[k] = [];
    m[k].push(ln);
  });
  return m;
}

function normalizeGroup(lines) {
  return (lines || [])
    .map(function (ln) {
      return {
        accountId: String(ln.accountId || ""),
        debit: round2(ln.debit || 0),
        credit: round2(ln.credit || 0),
        date: String(ln.date || "").slice(0, 10),
      };
    })
    .sort(function (a, b) {
      return a.accountId.localeCompare(b.accountId)
        || a.date.localeCompare(b.date)
        || a.debit - b.debit
        || a.credit - b.credit;
    });
}

function groupsEqual(a, b) {
  var na = normalizeGroup(a);
  var nb = normalizeGroup(b);
  if (na.length !== nb.length) return false;
  for (var i = 0; i < na.length; i++) {
    if (na[i].accountId !== nb[i].accountId) return false;
    if (na[i].date !== nb[i].date) return false;
    if (Math.abs(na[i].debit - nb[i].debit) > 1e-9) return false;
    if (Math.abs(na[i].credit - nb[i].credit) > 1e-9) return false;
  }
  return true;
}

function isReversalGroup(lines) {
  return (lines || []).some(function (ln) {
    return ln.isReversal === true || String(ln.referenceType || "") === "reversal";
  });
}

function correctsSourceId(lines) {
  for (var i = 0; i < (lines || []).length; i++) {
    var c = lines[i].correctsTransactionId;
    if (c) return String(c);
  }
  return "";
}

function groupIsReversed(prevByTxn, txnId) {
  return Object.keys(prevByTxn).some(function (k) {
    return (prevByTxn[k] || []).some(function (ln) {
      return String(ln.reversesTransactionId || "") === String(txnId);
    });
  });
}

/** Keep every posted group that belongs to a source txn chain (original + revs + corrections). */
function emitSourceChain(out, prevByTxn, sourceTxnId, emitted) {
  var keepIds = {};
  keepIds[String(sourceTxnId)] = true;
  var changed = true;
  while (changed) {
    changed = false;
    Object.keys(prevByTxn).forEach(function (k) {
      if (keepIds[k]) return;
      var g = prevByTxn[k] || [];
      var linked = g.some(function (ln) {
        var rev = String(ln.reversesTransactionId || "");
        var corr = String(ln.correctsTransactionId || "");
        return (rev && keepIds[rev])
          || (corr && keepIds[corr])
          || corr === String(sourceTxnId)
          || rev === String(sourceTxnId);
      });
      if (linked) {
        keepIds[k] = true;
        changed = true;
      }
    });
  }
  Object.keys(keepIds).forEach(function (k) {
    if (emitted[k]) return;
    emitted[k] = true;
    (prevByTxn[k] || []).forEach(function (ln) { out.push(ln); });
  });
}

/** Rank correction txn ids by embedded Date.now (base36) for tip selection. */
function correctionTipRank(txnId) {
  var parts = String(txnId || "").split(":");
  if (parts.length >= 6 && parts[0] === "urn") {
    var n = parseInt(parts[parts.length - 2], 36);
    if (!isNaN(n)) return n;
  }
  return 0;
}

/**
 * Active correction groups for a source (not themselves reversed).
 * Ordered by embedded creation time so tip is the latest correction.
 */
function activeCorrectionsFor(prevByTxn, sourceTxnId) {
  var list = [];
  Object.keys(prevByTxn).forEach(function (k) {
    var g = prevByTxn[k];
    if (correctsSourceId(g) !== String(sourceTxnId)) return;
    if (isReversalGroup(g)) return;
    if (groupIsReversed(prevByTxn, k)) return;
    list.push({ id: k, lines: g });
  });
  list.sort(function (a, b) {
    return correctionTipRank(a.id) - correctionTipRank(b.id);
  });
  return list;
}

/**
 * Merge rebuilt journal with prior posted lines (append-only corrections when facts change).
 * Idempotent: a second rebuild with the same facts does not reverse/correct again.
 */
export function mergeRebuildWithImmutableHistory(prevLines, rebuiltLines, makeLineId) {
  var prevByTxn = groupLinesByTransaction(prevLines);
  var rebByTxn = groupLinesByTransaction(rebuiltLines);
  var mk = typeof makeLineId === "function" ? makeLineId : function () { return "ln_" + Math.random().toString(36).slice(2, 11); };
  var dev = getOrCreateDeviceId();
  var out = [];
  var emitted = {};

  /* Posted groups missing from rebuild (voided/deleted source): keep + reverse once. */
  Object.keys(prevByTxn).forEach(function (t) {
    if (rebByTxn[t]) return;
    if (emitted[t]) return;
    var oldG = prevByTxn[t];

    if (isReversalGroup(oldG)) {
      emitted[t] = true;
      oldG.forEach(function (ln) { out.push(ln); });
      return;
    }

    var corrSrc = correctsSourceId(oldG);
    if (corrSrc) {
      /* Keep live corrections while their source is still being rebuilt. */
      if (rebByTxn[corrSrc]) {
        emitted[t] = true;
        oldG.forEach(function (ln) { out.push(ln); });
        return;
      }
      /* Source gone: keep correction and reverse it once if needed. */
      emitted[t] = true;
      oldG.forEach(function (ln) { out.push(ln); });
      if (groupIsReversed(prevByTxn, t)) return;
      var revCorr = makeUniqueTransactionId(dev);
      oldG.forEach(function (ln) {
        var d = round2(ln.debit || 0);
        var c = round2(ln.credit || 0);
        if (d === 0 && c === 0) return;
        out.push({
          id: mk(),
          transactionId: revCorr,
          entryGroupId: revCorr,
          date: ln.date || "",
          accountId: ln.accountId,
          debit: c,
          credit: d,
          referenceType: "reversal",
          referenceId: String(ln.referenceId || "") + "_void_rev",
          memo: "Void/source removed · " + (ln.memo || ""),
          isPosted: true,
          isReversal: true,
          reversesTransactionId: t,
          deviceId: ln.deviceId || dev,
        });
      });
      return;
    }

    /* Reversal of a still-active rebuild source (part of correction chain) — keep. */
    var revOf = "";
    (oldG || []).some(function (ln) {
      if (ln.reversesTransactionId) {
        revOf = String(ln.reversesTransactionId);
        return true;
      }
      return false;
    });
    if (revOf && rebByTxn[revOf]) {
      emitted[t] = true;
      oldG.forEach(function (ln) { out.push(ln); });
      return;
    }

    emitted[t] = true;
    oldG.forEach(function (ln) { out.push(ln); });
    if (groupIsReversed(prevByTxn, t)) return;

    var revTxn = makeUniqueTransactionId(dev);
    oldG.forEach(function (ln) {
      var d = round2(ln.debit || 0);
      var c = round2(ln.credit || 0);
      if (d === 0 && c === 0) return;
      out.push({
        id: mk(),
        transactionId: revTxn,
        entryGroupId: revTxn,
        date: ln.date || "",
        accountId: ln.accountId,
        debit: c,
        credit: d,
        referenceType: "reversal",
        referenceId: String(ln.referenceId || "") + "_void_rev",
        memo: "Void/source removed · " + (ln.memo || ""),
        isPosted: true,
        isReversal: true,
        reversesTransactionId: t,
        deviceId: ln.deviceId || dev,
      });
    });
  });

  Object.keys(rebByTxn).forEach(function (txnId) {
    var newG = rebByTxn[txnId];
    var oldG = prevByTxn[txnId];
    var hasPosted = oldG && oldG.some(function (ln) { return ln.isPosted === true; });

    if (!oldG) {
      newG.forEach(function (ln) {
        out.push(Object.assign({}, ln, { isPosted: true }));
      });
      return;
    }

    if (!hasPosted) {
      newG.forEach(function (ln) {
        out.push(Object.assign({}, ln, { isPosted: true }));
      });
      return;
    }

    if (groupsEqual(oldG, newG)) {
      emitSourceChain(out, prevByTxn, txnId, emitted);
      return;
    }

    var corrs = activeCorrectionsFor(prevByTxn, txnId);
    if (corrs.length) {
      var tip = corrs[corrs.length - 1];
      if (groupsEqual(tip.lines, newG)) {
        /* Already corrected to current facts — keep chain, do not re-correct. */
        emitSourceChain(out, prevByTxn, txnId, emitted);
        return;
      }
      /* Facts changed again: keep chain, reverse tip correction, post new correction. */
      emitSourceChain(out, prevByTxn, txnId, emitted);
      var revTip = makeUniqueTransactionId(dev);
      tip.lines.forEach(function (ln) {
        var d = round2(ln.debit || 0);
        var c = round2(ln.credit || 0);
        out.push({
          id: mk(),
          transactionId: revTip,
          entryGroupId: revTip,
          date: ln.date || "",
          accountId: ln.accountId,
          debit: c,
          credit: d,
          referenceType: "reversal",
          referenceId: String(ln.referenceId || "") + "_rev",
          memo: "Reversal · " + (ln.memo || ""),
          isPosted: true,
          isReversal: true,
          reversesTransactionId: tip.id,
          deviceId: ln.deviceId || dev,
        });
      });
      var postTxn2 = makeUniqueTransactionId(dev);
      newG.forEach(function (ln) {
        out.push(Object.assign({}, ln, {
          id: mk(),
          transactionId: postTxn2,
          entryGroupId: postTxn2,
          isPosted: true,
          correctsTransactionId: txnId,
          memo: (ln.memo || "") + " · correction",
          deviceId: ln.deviceId || dev,
        }));
      });
      return;
    }

    /* First correction: keep original, reverse it, post correction tagged to source. */
    if (!emitted[txnId]) {
      oldG.forEach(function (ln) { out.push(ln); });
      emitted[txnId] = true;
    } else {
      emitSourceChain(out, prevByTxn, txnId, emitted);
    }

    if (!groupIsReversed(prevByTxn, txnId)) {
      var revTxn2 = makeUniqueTransactionId(dev);
      oldG.forEach(function (ln) {
        var d = round2(ln.debit || 0);
        var c = round2(ln.credit || 0);
        out.push({
          id: mk(),
          transactionId: revTxn2,
          entryGroupId: revTxn2,
          date: ln.date || "",
          accountId: ln.accountId,
          debit: c,
          credit: d,
          referenceType: "reversal",
          referenceId: String(ln.referenceId || "") + "_rev",
          memo: "Reversal · " + (ln.memo || ""),
          isPosted: true,
          isReversal: true,
          reversesTransactionId: txnId,
          deviceId: ln.deviceId || dev,
        });
      });
    }

    var postTxn = makeUniqueTransactionId(dev);
    newG.forEach(function (ln) {
      out.push(Object.assign({}, ln, {
        id: mk(),
        transactionId: postTxn,
        entryGroupId: postTxn,
        isPosted: true,
        correctsTransactionId: txnId,
        memo: (ln.memo || "") + " · correction",
        deviceId: ln.deviceId || dev,
      }));
    });
  });

  return out;
}

/**
 * Multi-device merge: append remote-only transaction groups; log conflicts when same id differs.
 */
export function mergeJournalLinesByTransactionId(localLines, remoteLines, logConflict) {
  var byTxn = groupLinesByTransaction(localLines);
  var remByTxn = groupLinesByTransaction(remoteLines);
  var appendedIds = [];

  Object.keys(remByTxn).forEach(function (t) {
    if (!byTxn[t]) {
      byTxn[t] = remByTxn[t].map(function (ln) {
        return Object.assign({}, ln, { isPosted: true });
      });
      appendedIds.push(t);
      return;
    }
    if (!groupsEqual(byTxn[t], remByTxn[t])) {
      if (typeof logConflict === "function") {
        logConflict({ transactionId: t, message: "same transactionId different lines — keeping local posted copy" });
      }
    }
  });

  var out = [];
  Object.keys(byTxn).forEach(function (k) {
    byTxn[k].forEach(function (x) { out.push(x); });
  });
  return { lines: out, appendedIds: appendedIds };
}

function lineFingerprint(ln) {
  return [
    String(ln && ln.accountId || ""),
    round2(ln && ln.debit || 0),
    round2(ln && ln.credit || 0),
    String(ln && ln.date || "").slice(0, 10),
    String(ln && ln.memo || "").slice(0, 80),
  ].join("|");
}

/**
 * After append-only journal merge, drop duplicate lines within the same transactionId
 * (multi-PC rebuild races create identical account lines with different line ids).
 */
export function dedupeJournalLinesAfterMerge(lines) {
  var input = Array.isArray(lines) ? lines : [];
  var byTxn = groupLinesByTransaction(input);
  var out = [];
  Object.keys(byTxn).sort().forEach(function (t) {
    var group = byTxn[t];
    var seen = {};
    group.forEach(function (ln) {
      var fp = lineFingerprint(ln);
      if (seen[fp]) return;
      seen[fp] = true;
      out.push(ln);
    });
  });
  return out;
}
