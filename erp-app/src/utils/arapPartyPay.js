function normName(name) {
  return String(name || "").trim().toLowerCase();
}

export function entryMatchesParty(entry, party, mode) {
  if (!party || !entry) return false;
  if ((entry.balance || 0) <= 0) return false;
  var name = normName(party.name);
  if (!name) return false;

  if (mode === "receive") {
    if (entry._type === "sale") {
      var sale = entry._saleObj || {};
      if (party.kind === "customer" && sale.customerId && String(sale.customerId) === String(party.id)) return true;
      return normName(entry.source || sale.customerName) === name;
    }
    if (entry._type === "manual") {
      var mr = entry._manualObj || {};
      if (mr.partyId && party.id && String(mr.partyId) === String(party.id)) {
        if (!mr.partyKind || mr.partyKind === party.kind) return true;
      }
      return normName(mr.person || entry.source) === name;
    }
  } else {
    if (entry._type === "purchase") {
      return normName(entry.source) === name;
    }
    if (entry._type === "manual") {
      var mp = entry._manualObj || {};
      if (mp.partyId && party.id && String(mp.partyId) === String(party.id)) {
        if (!mp.partyKind || mp.partyKind === party.kind) return true;
      }
      return normName(mp.source || entry.source) === name;
    }
  }
  return false;
}

export function pendingChequeOnEntry(entry, cheques, mode) {
  return (cheques || []).reduce(function (sum, ch) {
    if (!ch || String(ch.status || "") !== "Pending") return sum;
    var amt = parseFloat(ch.amount) || 0;
    if (mode === "receive") {
      if (entry._type === "sale" && ch.saleId === entry.id) return sum + amt;
      if (entry._type === "manual" && ch.manualReceivableId === entry.id) return sum + amt;
    } else {
      if (entry._type === "purchase" && ch.purchaseId === entry.id) return sum + amt;
      if (entry._type === "manual" && ch.manualPayableId === entry.id) return sum + amt;
    }
    return sum;
  }, 0);
}

export function effectiveBalance(entry, cheques, mode) {
  var bal = Math.max(0, parseFloat(entry.balance) || 0);
  var pending = pendingChequeOnEntry(entry, cheques, mode);
  return Math.max(0, Math.round((bal - pending) * 100) / 100);
}

export function filterUnsettledForParty(entries, party, mode, cheques) {
  return (entries || [])
    .filter(function (e) { return entryMatchesParty(e, party, mode); })
    .map(function (e) {
      return Object.assign({}, e, { effectiveBalance: effectiveBalance(e, cheques, mode) });
    })
    .filter(function (e) { return e.effectiveBalance > 0.009; })
    .sort(function (a, b) {
      var da = a.date || "";
      var db = b.date || "";
      if (da !== db) return da < db ? -1 : 1;
      return String(a.reference || "").localeCompare(String(b.reference || ""));
    });
}

export function allocateFifo(lines, totalAmount) {
  var remaining = Math.round((parseFloat(totalAmount) || 0) * 100) / 100;
  return (lines || []).map(function (line) {
    if (!line.selected) return Object.assign({}, line, { payAmount: 0 });
    var cap = line.effectiveBalance || 0;
    var alloc = Math.min(cap, remaining);
    alloc = Math.round(alloc * 100) / 100;
    remaining = Math.round((remaining - alloc) * 100) / 100;
    return Object.assign({}, line, { payAmount: alloc });
  });
}

export function sumAllocation(lines) {
  return Math.round((lines || []).reduce(function (a, l) {
    return a + (l.selected ? (parseFloat(l.payAmount) || 0) : 0);
  }, 0) * 100) / 100;
}

export function sumSelectedBalance(lines) {
  return Math.round((lines || []).reduce(function (a, l) {
    return a + (l.selected ? (l.effectiveBalance || 0) : 0);
  }, 0) * 100) / 100;
}
