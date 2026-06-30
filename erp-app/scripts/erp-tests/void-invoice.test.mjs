import {
  isVoidedTxn,
  activeSales,
  activePurchases,
  voidSaleBlockReason,
  voidPurchaseBlockReason,
  buildVoidSaleUpdates,
  buildVoidPurchaseUpdates,
} from "../../src/utils/voidInvoice.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function runVoidInvoiceTests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;
  try {
    var sale = {
      id: "s1",
      invoiceNo: "INV-100",
      date: "2026-06-25",
      customerId: "c1",
      total: 1000,
      paid: 600,
      balance: 400,
      items: [{ id: "p1", name: "Laptop", qty: 1, price: 1000, cost: 700 }],
    };
    var purchase = {
      id: "pur1",
      invoiceNo: "PO-50",
      date: "2026-06-25",
      supplier: "ABC",
      total: 500,
      paidAmount: 500,
      items: [{ id: "p1", name: "Laptop", qty: 2, cost: 250 }],
    };
    var state = {
      sales: [sale],
      purchases: [purchase],
      salesReturns: [],
      purchaseReturns: [],
      products: [{ id: "p1", name: "Laptop", stock: 3, cost: 250, type: "stock" }],
      customers: [{ id: "c1", name: "Ali", credit: 400, totalSpent: 1000 }],
      cheques: [],
    };

    assert(!isVoidedTxn(sale));
    assert(activeSales(state.sales).length === 1);

    var voidSale = buildVoidSaleUpdates(state, "s1", "Duplicate entry");
    assert(voidSale.ok, "void sale should succeed");
    assert(voidSale.voidedSale.status === "Voided");
    assert(voidSale.products[0].stock === 4, "stock restored +1");
    assert(voidSale.customers[0].credit === 0);
    assert(voidSale.customers[0].totalSpent === 0);
    assert(isVoidedTxn(voidSale.sales[0]));

    state.salesReturns = [{ invoiceId: "s1", productId: "p1", qty: 1, amount: 100 }];
    assert(voidSaleBlockReason(sale, state), "block void when returns exist");

    var voidPur = buildVoidPurchaseUpdates(state, "pur1", "Wrong supplier");
    assert(voidPur.ok, "void purchase should succeed");
    assert(voidPur.products[0].stock === 1, "purchase qty removed");
    assert(isVoidedTxn(voidPur.purchases[0]));

    state.products[0].stock = 0;
    assert(voidPurchaseBlockReason(purchase, state), "block void when stock insufficient");

    pass("Void invoice — sale/purchase reversal, blocks, filters");
  } catch (e) {
    fail("Void invoice — sale/purchase reversal, blocks, filters", e && e.message ? e.message : e);
  }
}
