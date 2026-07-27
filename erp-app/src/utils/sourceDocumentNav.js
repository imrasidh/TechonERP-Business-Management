/**
 * Map journal references and UI rows to viewable source documents (invoice, receipt, return, etc.).
 */

function stripCompositeRef(referenceType, referenceId) {
  var rid = String(referenceId || "");
  if (!rid) return "";
  if (referenceType === "sales_return_cogs") return rid.replace(/-c$/, "");
  if (referenceType === "sale_payment" || referenceType === "sale_overpay") {
    return rid.replace(/-pay-\d+$/, "").replace(/-over-\d+$/, "").replace(/-overrev-\d+$/, "");
  }
  if (referenceType === "purchase_payment" || referenceType === "purchase_prepay") {
    return rid.replace(/-pay-\d+$/, "").replace(/-prepay-\d+$/, "");
  }
  if (referenceType === "manual_receivable_coll" || referenceType === "manual_payable_pay") {
    return rid.replace(/-ph-\d+$/, "");
  }
  if (referenceType === "capital") {
    return rid.replace(/^capw?-/, "");
  }
  if (referenceType === "profit_dist") return rid.replace(/^pd-/, "");
  return rid;
}

export function journalRefToSourceKind(referenceType) {
  var rt = String(referenceType || "");
  if (!rt || rt === "opening_balance" || rt === "reversal" || rt === "raw_material_usage" || rt === "damage") return "";
  if (rt === "sale" || rt === "sale_cogs" || rt === "sale_payment" || rt === "sale_overpay") return "sale";
  if (rt === "purchase" || rt === "purchase_payment" || rt === "purchase_prepay") return "purchase";
  if (rt === "sales_return" || rt === "sales_return_cogs") return "sale-return";
  if (rt === "purchase_return") return "purchase-return";
  if (rt === "manual_receivable" || rt === "manual_receivable_coll") return "manual-ar";
  if (rt === "manual_payable" || rt === "manual_payable_pay") return "manual-ap";
  if (rt === "expense") return "expense";
  if (rt === "asset") return "asset";
  if (rt === "capital") return "capital";
  if (rt === "profit_dist") return "profit-dist";
  if (rt.indexOf("cheque") >= 0 || rt.indexOf("standalone") >= 0) return "cheque";
  return "";
}

export function journalRefLabel(referenceType, referenceId, ctx) {
  var kind = journalRefToSourceKind(referenceType);
  var id = stripCompositeRef(referenceType, referenceId);
  if (!kind || !id) return String(referenceType || "Journal").replace(/_/g, " ");
  var resolved = resolveSourceDocument({ kind: kind, id: id, state: ctx && ctx.state, S: ctx && ctx.S });
  if (resolved && resolved.ok && resolved.label) return resolved.label;
  return String(referenceType || "").replace(/_/g, " ");
}

export function resolveSourceDocument(opts) {
  var kind = opts && opts.kind ? String(opts.kind) : "";
  var id = opts && opts.id != null ? String(opts.id) : "";
  var state = (opts && opts.state) || {};
  var S = opts && opts.S;
  var get = S && typeof S.get === "function" ? function (k, d) { return S.get(k, d); } : function () { return []; };

  if (!kind || !id) return { ok: false, message: "Missing document reference." };

  if (kind === "sale") {
    var sale = (state.sales || []).find(function (s) { return s && String(s.id) === id; });
    if (!sale) return { ok: false, message: "Invoice not found." };
    return { ok: true, kind: "sale", id: id, label: sale.invoiceNo || id.slice(0, 8), payload: sale };
  }
  if (kind === "purchase") {
    var pur = (state.purchases || []).find(function (p) { return p && String(p.id) === id; });
    if (!pur) return { ok: false, message: "Purchase not found." };
    return { ok: true, kind: "purchase", id: id, label: pur.invoiceNo || pur.purchaseNo || id.slice(0, 8), payload: pur };
  }
  if (kind === "sale-return") {
    var sret = (state.salesReturns || []).find(function (r) { return r && String(r.id) === id; });
    if (!sret) return { ok: false, message: "Sales return not found." };
    var sParent = (state.sales || []).find(function (s) {
      return s && (String(s.id) === String(sret.invoiceId) || (s.invoiceNo && sret.invoiceNo && s.invoiceNo === sret.invoiceNo));
    }) || null;
    var sRows = (state.salesReturns || []).filter(function (r) {
      return r && String(r.returnId || r.id) === String(sret.returnId || sret.id);
    });
    if (sRows.length <= 1) sRows = [sret];
    return {
      ok: true,
      kind: "sale-return",
      id: id,
      label: sret.returnId || id.slice(0, 8),
      payload: { mode: "sales", rows: sRows, parent: sParent },
      parentKind: sParent ? "sale" : "",
      parentId: sParent ? sParent.id : "",
      parentLabel: sParent ? (sParent.invoiceNo || String(sParent.id).slice(0, 8)) : (sret.invoiceNo || ""),
    };
  }
  if (kind === "purchase-return") {
    var pret = (state.purchaseReturns || []).find(function (r) { return r && String(r.id) === id; });
    if (!pret) return { ok: false, message: "Purchase return not found." };
    var pParent = (state.purchases || []).find(function (p) {
      return p && (String(p.id) === String(pret.purchaseId) || (p.invoiceNo && pret.purchaseNo && p.invoiceNo === pret.purchaseNo));
    }) || null;
    var pRows = (state.purchaseReturns || []).filter(function (r) {
      return r && String(r.returnId || r.id) === String(pret.returnId || pret.id);
    });
    if (pRows.length <= 1) pRows = [pret];
    return {
      ok: true,
      kind: "purchase-return",
      id: id,
      label: pret.returnId || id.slice(0, 8),
      payload: { mode: "purchase", rows: pRows, parent: pParent },
      parentKind: pParent ? "purchase" : "",
      parentId: pParent ? pParent.id : "",
      parentLabel: pParent ? (pParent.invoiceNo || String(pParent.id).slice(0, 8)) : (pret.purchaseNo || ""),
    };
  }
  if (kind === "manual-ar") {
    var mr = (get("tc3_manualReceivables", []) || []).find(function (x) { return x && String(x.id) === id; });
    if (!mr) return { ok: false, message: "Receipt not found." };
    return { ok: true, kind: "manual-ar", id: id, label: mr.receiptNo || mr.reference || id.slice(0, 8), payload: mr, receiptMode: "out" };
  }
  if (kind === "manual-ap") {
    var mp = (get("tc3_manualPayables", []) || []).find(function (x) { return x && String(x.id) === id; });
    if (!mp) return { ok: false, message: "Receipt not found." };
    return { ok: true, kind: "manual-ap", id: id, label: mp.receiptNo || mp.reference || id.slice(0, 8), payload: mp, receiptMode: "in" };
  }
  if (kind === "expense") {
    var exp = (state.expenses || []).find(function (e) { return e && String(e.id) === id; });
    if (!exp) return { ok: false, message: "Expense not found." };
    return { ok: true, kind: "expense", id: id, label: (exp.category || "Expense") + " · " + (exp.description || id.slice(0, 8)), payload: exp };
  }
  if (kind === "asset") {
    var ast = (state.assets || []).find(function (a) { return a && String(a.id) === id; });
    if (!ast) return { ok: false, message: "Asset record not found." };
    return { ok: true, kind: "asset", id: id, label: ast.name || id.slice(0, 8), payload: ast };
  }
  if (kind === "capital") {
    var cap = (get("tc3_capLedger", []) || []).find(function (e) { return e && String(e.id) === id; });
    if (!cap) return { ok: false, message: "Capital entry not found." };
    return { ok: true, kind: "capital", id: id, label: cap.ref || cap.note || "Capital", payload: cap };
  }
  if (kind === "profit-dist") {
    var pd = (get("tc3_profitDist", []) || []).find(function (e) { return e && String(e.id) === id; });
    if (!pd) return { ok: false, message: "Profit distribution not found." };
    return { ok: true, kind: "profit-dist", id: id, label: pd.partner || pd.name || "Profit dist.", payload: pd };
  }
  if (kind === "cheque") {
    var ch = (state.cheques || []).find(function (c) { return c && String(c.id) === id; });
    if (!ch) return { ok: false, message: "Cheque not found." };
    return { ok: true, kind: "cheque", id: id, label: ch.chequeNo || ch.number || id.slice(0, 8), payload: ch };
  }

  return { ok: false, message: "Unsupported document type." };
}

/** Resolve from a statement/cash-book row or journal line. */
export function resolveFromNavInput(input, ctx) {
  if (!input) return { ok: false, message: "No reference." };
  if (input.sourceKind && input.sourceId) {
    return resolveSourceDocument({ kind: input.sourceKind, id: input.sourceId, state: ctx && ctx.state, S: ctx && ctx.S });
  }
  if (input.referenceType && input.referenceId) {
    var kind = journalRefToSourceKind(input.referenceType);
    var id = stripCompositeRef(input.referenceType, input.referenceId);
    if (!kind || !id) return { ok: false, message: "No linked document." };
    return resolveSourceDocument({ kind: kind, id: id, state: ctx && ctx.state, S: ctx && ctx.S });
  }
  if (input.kind && input.id) {
    return resolveSourceDocument({ kind: input.kind, id: input.id, state: ctx && ctx.state, S: ctx && ctx.S });
  }
  return { ok: false, message: "No linked document." };
}

export function cashBookEntryNavMeta(entry) {
  if (!entry) return null;
  if (entry.sourceKind && entry.sourceId) {
    return { sourceKind: entry.sourceKind, sourceId: entry.sourceId, label: entry.refLabel || "" };
  }
  if (entry.referenceType && entry.referenceId) {
    var kind = journalRefToSourceKind(entry.referenceType);
    var id = stripCompositeRef(entry.referenceType, entry.referenceId);
    if (kind && id) return { sourceKind: kind, sourceId: id };
  }
  return null;
}

export function journalLineNavMeta(line, ctx) {
  if (!line || !line.referenceType || !line.referenceId) return null;
  var kind = journalRefToSourceKind(line.referenceType);
  var id = stripCompositeRef(line.referenceType, line.referenceId);
  if (!kind || !id) return null;
  return {
    sourceKind: kind,
    sourceId: id,
    label: journalRefLabel(line.referenceType, line.referenceId, ctx),
  };
}

export function receivableEntryNav(entry) {
  if (!entry) return null;
  if (entry._type === "sale" && entry.id) {
    return { sourceKind: "sale", sourceId: entry.id, label: entry.reference || "" };
  }
  if (entry._type === "manual" && entry.id) {
    return { sourceKind: "manual-ar", sourceId: entry.id, label: entry.reference || entry.receiptNo || "" };
  }
  return null;
}

export function payableEntryNav(entry) {
  if (!entry) return null;
  if (entry._type === "purchase" && entry.id) {
    return { sourceKind: "purchase", sourceId: entry.id, label: entry.reference || "" };
  }
  if (entry._type === "manual" && entry.id) {
    return { sourceKind: "manual-ap", sourceId: entry.id, label: entry.reference || entry.receiptNo || "" };
  }
  return null;
}

export function expenseEntryNav(expense) {
  if (!expense || !expense.id) return null;
  return {
    sourceKind: "expense",
    sourceId: expense.id,
    label: expense.reference || expense.category || String(expense.id).slice(0, 8),
  };
}

export function saleByInvoiceNoNav(invoiceNo, state) {
  if (!invoiceNo) return null;
  var sale = (state.sales || []).find(function (s) {
    return s && String(s.invoiceNo || "") === String(invoiceNo);
  });
  if (!sale) return null;
  return { sourceKind: "sale", sourceId: sale.id, label: sale.invoiceNo || invoiceNo };
}

export function purchaseByInvoiceNoNav(invoiceNo, state) {
  if (!invoiceNo) return null;
  var pur = (state.purchases || []).find(function (p) {
    return p && String(p.invoiceNo || "") === String(invoiceNo);
  });
  if (!pur) return null;
  return { sourceKind: "purchase", sourceId: pur.id, label: pur.invoiceNo || invoiceNo };
}

export function auditEntryNav(entry, state, S) {
  if (!entry) return null;
  var ref = String(entry.reference || "").trim();
  if (!ref) return null;
  var sale = (state.sales || []).find(function (s) {
    return s && (String(s.invoiceNo || "") === ref || String(s.id || "").slice(0, 8) === ref);
  });
  if (sale) return { sourceKind: "sale", sourceId: sale.id, label: ref };
  var pur = (state.purchases || []).find(function (p) {
    return p && (String(p.invoiceNo || "") === ref || String(p.id || "").slice(0, 8) === ref);
  });
  if (pur) return { sourceKind: "purchase", sourceId: pur.id, label: ref };
  var sret = (state.salesReturns || []).find(function (r) { return r && String(r.returnId || "") === ref; });
  if (sret) return { sourceKind: "sale-return", sourceId: sret.id, label: ref };
  var pret = (state.purchaseReturns || []).find(function (r) { return r && String(r.returnId || "") === ref; });
  if (pret) return { sourceKind: "purchase-return", sourceId: pret.id, label: ref };
  var get = S && typeof S.get === "function" ? function (k, d) { return S.get(k, d); } : function () { return []; };
  var mr = (get("tc3_manualReceivables", []) || []).find(function (x) {
    return x && (String(x.receiptNo || "") === ref || String(x.reference || "") === ref);
  });
  if (mr) return { sourceKind: "manual-ar", sourceId: mr.id, label: ref };
  var mp = (get("tc3_manualPayables", []) || []).find(function (x) {
    return x && (String(x.receiptNo || "") === ref || String(x.reference || "") === ref);
  });
  if (mp) return { sourceKind: "manual-ap", sourceId: mp.id, label: ref };
  var ch = (state.cheques || []).find(function (c) {
    return c && (String(c.chequeNo || c.number || "") === ref);
  });
  if (ch) return { sourceKind: "cheque", sourceId: ch.id, label: ref };
  var exp = (state.expenses || []).find(function (e) { return e && String(e.reference || "") === ref; });
  if (exp) return { sourceKind: "expense", sourceId: exp.id, label: ref };
  return null;
}

export function chequeLinkedDocNav(ch, state, S) {
  if (!ch) return null;
  if (ch.type === "incoming" && ch.saleId) {
    return { sourceKind: "sale", sourceId: ch.saleId, label: ch.invoiceNo || "Invoice" };
  }
  if (ch.type === "outgoing" && ch.purchaseId) {
    return { sourceKind: "purchase", sourceId: ch.purchaseId, label: ch.purchaseNo || "Purchase" };
  }
  if (ch.type === "incoming" && ch.manualReceivableId) {
    return { sourceKind: "manual-ar", sourceId: ch.manualReceivableId, label: ch.invoiceNo || "Receipt" };
  }
  if (ch.type === "outgoing" && (ch.manualPayableId || ch.thirdPartyRepairId)) {
    var mp = (S && typeof S.get === "function" ? S.get("tc3_manualPayables", []) : []).find(function (p) {
      if (ch.manualPayableId && p.id === ch.manualPayableId) return true;
      if (!ch.manualPayableId && ch.thirdPartyRepairId && p.thirdPartyRepairId === ch.thirdPartyRepairId) return true;
      return false;
    });
    if (mp) return { sourceKind: "manual-ap", sourceId: mp.id, label: mp.receiptNo || mp.reference || "Receipt" };
  }
  if (ch.invoiceNo) {
    var byNo = saleByInvoiceNoNav(ch.invoiceNo, state);
    if (byNo) return byNo;
  }
  if (ch.purchaseNo) {
    var byPur = purchaseByInvoiceNoNav(ch.purchaseNo, state);
    if (byPur) return byPur;
  }
  return null;
}
