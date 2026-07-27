/**
 * Source document navigation — journal refs and UI rows to viewable proofs.
 */
import {
  journalRefToSourceKind,
  resolveSourceDocument,
  resolveFromNavInput,
  cashBookEntryNavMeta,
} from "../../src/utils/sourceDocumentNav.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

export function runSourceDocumentNavTests(ctx) {
  var pass = ctx && ctx.pass ? ctx.pass : function (n) { console.log("PASS —", n); };
  var fail = ctx && ctx.fail ? ctx.fail : function (n, d) { console.error("FAIL —", n, d); process.exitCode = 1; };
  try {
  var state = {
    sales: [{ id: "s1", invoiceNo: "INV-100", customerName: "PC Gallery", date: "2026-01-10", total: 100000 }],
    purchases: [{ id: "p1", invoiceNo: "PO-50", supplier: "Tech Supplier", date: "2026-01-05", total: 50000 }],
    salesReturns: [{
      id: "ret1",
      returnId: "SR-001",
      invoiceId: "s1",
      invoiceNo: "INV-100",
      productName: "Phone",
      qty: 1,
      amount: 66800,
      returnGross: 66800,
      date: "2026-01-15",
      customer: "PC Gallery",
      reason: "Defective",
    }],
    purchaseReturns: [],
    expenses: [{ id: "e1", category: "Rent", amount: 1000, date: "2026-01-18", cashMethod: "Cash" }],
    assets: [],
    cheques: [],
  };
  var S = {
    get: function (k, d) {
      if (k === "tc3_manualReceivables") return [{ id: "mr1", receiptNo: "RC-9", person: "Ali", amount: 500, date: "2026-01-12" }];
      if (k === "tc3_manualPayables") return [];
      return d;
    },
  };

  assert(journalRefToSourceKind("sale_payment") === "sale", "sale_payment maps to sale");
  assert(journalRefToSourceKind("sales_return") === "sale-return", "sales_return kind");

  var salePay = resolveFromNavInput({ referenceType: "sale_payment", referenceId: "s1-pay-0" }, { state: state, S: S });
  assert(salePay.ok && salePay.kind === "sale" && salePay.id === "s1", "sale payment opens invoice");

  var sret = resolveFromNavInput({ referenceType: "sales_return", referenceId: "ret1" }, { state: state, S: S });
  assert(sret.ok && sret.kind === "sale-return", "sales return resolves");
  assert(sret.parentKind === "sale" && sret.parentId === "s1", "return links parent invoice");
  assert(sret.parentLabel === "INV-100", "parent label is invoice no");

  var stmtRow = resolveFromNavInput({ sourceKind: "sale-return", sourceId: "ret1" }, { state: state, S: S });
  assert(stmtRow.ok && stmtRow.label === "SR-001", "statement row opens return");

  var exp = resolveFromNavInput({ referenceType: "expense", referenceId: "e1" }, { state: state, S: S });
  assert(exp.ok && exp.kind === "expense", "expense resolves");

  var meta = cashBookEntryNavMeta({ sourceKind: "sale", sourceId: "s1" });
  assert(meta && meta.sourceKind === "sale", "cash book meta");

    pass("Source document nav");
  } catch (e) {
    fail("Source document nav", e && e.message ? e.message : e);
  }
}
