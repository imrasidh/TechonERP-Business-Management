import { makeUniqueTransactionId, getOrCreateDeviceId } from "./ids.js";

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function groupKey(ln) {
  return String(ln.transactionId || ln.entryGroupId || "");
}

function groupLinesByTransaction(lines) {
  var m = {};
  (lines || []).forEach(function (ln) {
    var k = groupKey(ln);
    if (!k) return;
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
      };
    })
    .sort(function (a, b) {
      return a.accountId.localeCompare(b.accountId) || a.debit - b.debit || a.credit - b.credit;
    });
}

function groupsEqual(a, b) {
  return JSON.stringify(normalizeGroup(a)) === JSON.stringify(normalizeGroup(b));
}

/**
 * Merge rebuilt journal with prior posted lines (append-only corrections when facts change).
 */
export function mergeRebuildWithImmutableHistory(prevLines, rebuiltLines, makeLineId) {
  var prevByTxn = groupLinesByTransaction(prevLines);
  var rebByTxn = groupLinesByTransaction(rebuiltLines);
  var mk = typeof makeLineId === "function" ? makeLineId : function () { return "ln_" + Math.random().toString(36).slice(2, 11); };
  var dev = getOrCreateDeviceId();

  var out = [];

  /* Retain posted groups that no longer appear in rebuild (source record removed) — immutable history */
  Object.keys(prevByTxn).forEach(function (t) {
    if (!rebByTxn[t]) {
      prevByTxn[t].forEach(function (ln) { out.push(ln); });
    }
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
      oldG.forEach(function (ln) { out.push(ln); });
      return;
    }

    var revTxn = makeUniqueTransactionId(dev);
    oldG.forEach(function (ln) {
      var d = round2(ln.debit || 0);
      var c = round2(ln.credit || 0);
      out.push({
        id: mk(),
        transactionId: revTxn,
        entryGroupId: revTxn,
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

    var postTxn = makeUniqueTransactionId(dev);
    newG.forEach(function (ln) {
      out.push(Object.assign({}, ln, {
        id: mk(),
        transactionId: postTxn,
        entryGroupId: postTxn,
        isPosted: true,
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
