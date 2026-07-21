import {
  mergeProductRow,
  mergeDocumentWithPaymentHistory,
  mergeRecordArraysByNewest,
  mergeCustomerRow,
  unionPaymentHistory,
} from "../../src/utils/mergeRecordArrays.js";
import { stampProductStock, stampCustomerBalance } from "../../src/utils/stampUpdatedAt.js";
import { assertPaymentFitsSaleBalance, assertPaymentFitsPurchaseBalance } from "../../src/utils/concurrencyGuards.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function runConcurrencyMergeTests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;
  try {
    var baseSale = {
      id: "s1",
      total: 1000,
      paid: 0,
      balance: 1000,
      payStatus: "Unpaid",
      paymentHistory: [],
      updatedAt: "2026-07-16T10:00:00.000Z",
    };
    var payA = Object.assign({}, baseSale, {
      paid: 400,
      balance: 600,
      payStatus: "Partial",
      paymentHistory: [{ id: "ph-a", date: "2026-07-16", amount: 400, cashMethod: "Cash" }],
      updatedAt: "2026-07-16T10:00:01.000Z",
    });
    var payB = Object.assign({}, baseSale, {
      paid: 300,
      balance: 700,
      payStatus: "Partial",
      paymentHistory: [{ id: "ph-b", date: "2026-07-16", amount: 300, cashMethod: "Bank" }],
      updatedAt: "2026-07-16T10:00:02.000Z",
    });
    var mergedSale = mergeDocumentWithPaymentHistory(payA, payB, "sale");
    assert(mergedSale.paymentHistory.length === 2, "both payments kept");
    assert(mergedSale.paid === 700, "paid = sum of both payments");
    assert(mergedSale.balance === 300, "balance after dual pay");

    var arrMerged = mergeRecordArraysByNewest([payA], [payB], "tc3_sales");
    assert(arrMerged.length === 1 && arrMerged[0].paid === 700, "array merge keeps both pays");

    /* Concurrent full-balance pays: keep both PH, cap paid at total */
    var fullA = Object.assign({}, baseSale, {
      paid: 1000,
      balance: 0,
      payStatus: "Paid",
      paymentHistory: [{ id: "ph-full-a", date: "2026-07-16", amount: 1000, cashMethod: "Cash" }],
      updatedAt: "2026-07-16T10:00:01.000Z",
    });
    var fullB = Object.assign({}, baseSale, {
      paid: 1000,
      balance: 0,
      payStatus: "Paid",
      paymentHistory: [{ id: "ph-full-b", date: "2026-07-16", amount: 1000, cashMethod: "Bank" }],
      updatedAt: "2026-07-16T10:00:02.000Z",
    });
    var over = mergeDocumentWithPaymentHistory(fullA, fullB, "sale");
    assert(over.paymentHistory.length === 2, "both full pays kept in PH");
    assert(over.paid === 1000, "paid capped at total");
    assert(over.balance === 0, "balance zero after cap");
    assert(over.overpaidAmount === 1000, "overpaidAmount recorded");

    var parent = { id: "p1", name: "Widget", stock: 10, cost: 50, stockUpdatedAt: "2026-07-16T09:00:00.000Z" };
    var a = stampProductStock(Object.assign({}, parent, { stock: 9 }), "2026-07-16T10:00:01.000Z", parent);
    var b = stampProductStock(Object.assign({}, parent, { stock: 9 }), "2026-07-16T10:00:02.000Z", parent);
    assert(mergeProductRow(a, b).stock === 8, "concurrent stock deltas combine 10-1-1=8");

    var child = stampProductStock(Object.assign({}, a, { stock: 7 }), "2026-07-16T10:00:03.000Z", a);
    assert(mergeProductRow(a, child).stock === 7, "linear child wins");

    var cust = { id: "c1", name: "Ali", credit: 500, totalSpent: 1000, updatedAt: "2026-07-16T09:00:00.000Z" };
    var ca = stampCustomerBalance(Object.assign({}, cust, { credit: 300 }), "2026-07-16T10:00:01.000Z", cust);
    var cb = stampCustomerBalance(Object.assign({}, cust, { credit: 400 }), "2026-07-16T10:00:02.000Z", cust);
    assert(mergeCustomerRow(ca, cb).credit === 200, "credit deltas combine 500-200-100=200");

    assert(!assertPaymentFitsSaleBalance({ total: 1000, paid: 800 }, 300).ok, "overpay rejected");
    assert(assertPaymentFitsSaleBalance({ total: 1000, paid: 800 }, 200).ok, "exact balance ok");
    assert(!assertPaymentFitsPurchaseBalance({ total: 500, paidAmount: 400 }, 200).ok, "purchase overpay rejected");

    var u = unionPaymentHistory(
      [{ id: "c1", amount: 0, chequeId: "ch1" }],
      [{ id: "c1", amount: 250, chequeId: "ch1" }]
    );
    assert(u.length === 1 && u[0].amount === 250, "cleared amount preferred");

    pass("Concurrency merge — dual pay + dual stock");
  } catch (e) {
    fail("Concurrency merge — dual pay + dual stock", e && e.message ? e.message : e);
  }
}
