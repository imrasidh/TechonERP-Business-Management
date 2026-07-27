/**
 * Map account-statement rows to GL journal referenceIds for AR/AP reconciliation.
 * Sales/purchase returns post under return.id — not parent invoice id.
 */

export function collectStatementGlRefIds(opts) {
  opts = opts || {};
  var idSet = {};
  var add = function (id) {
    if (id == null) return;
    var s = String(id).trim();
    if (s) idSet[s] = true;
  };
  (opts.rows || []).forEach(function (r) {
    if (!r) return;
    add(r.sourceId);
    add(r.glRefId);
  });
  if (opts.mode === "customer" && typeof opts.partyMatchesCustomer === "function") {
    (opts.salesReturns || []).forEach(function (r) {
      if (opts.partyMatchesCustomer(r)) add(r.id);
    });
  } else if (opts.mode === "supplier" && typeof opts.partyMatchesSupplier === "function") {
    (opts.purchaseReturns || []).forEach(function (r) {
      if (opts.partyMatchesSupplier(r)) add(r.id);
    });
  }
  return idSet;
}

export function journalLineMatchesRefId(referenceId, idSet) {
  var rid = String(referenceId || "");
  if (!rid) return false;
  if (idSet[rid]) return true;
  var keys = Object.keys(idSet || {});
  for (var i = 0; i < keys.length; i++) {
    var sid = keys[i];
    if (rid === sid || rid.indexOf(sid + "-") === 0) return true;
  }
  return false;
}

/** Net AR/AP movement on control account for statement party reference ids. */
export function sumGlControlNetForRefIds(jlines, controlAccountId, idSet) {
  var glNet = 0;
  (jlines || []).forEach(function (ln) {
    if (!ln || String(ln.accountId || "") !== String(controlAccountId || "")) return;
    if (!journalLineMatchesRefId(ln.referenceId, idSet || {})) return;
    glNet += (Number(ln.debit) || 0) - (Number(ln.credit) || 0);
  });
  return Math.round(glNet * 100) / 100;
}
