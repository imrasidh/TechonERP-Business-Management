import {
  isVoidedTxn,
  activeSales,
  activePurchases,
  voidSaleBlockReason,
  voidPurchaseBlockReason,
  buildVoidSaleUpdates,
  buildVoidPurchaseUpdates,
} from "../../src/utils/voidInvoice.js";
import { rollbackRepairDevicesOnVoidSale } from "../../src/utils/repairVoidRollback.js";
import { rebuildJournalFromState, DEFAULT_GL_CHART, GL } from "../../src/accounting/generalLedger.js";
import { deriveInventoryEconomics } from "../../src/accounting/inventoryEngine.js";

function uid() {
  return "void_" + Math.random().toString(36).slice(2, 9);
}

function makeSmock() {
  return {
    get: function (k, def) {
      var d = {
        tc3_openBal: null,
        tc3_manualReceivables: [],
        tc3_manualPayables: [],
        tc3_capLedger: [],
        tc3_profitDist: [],
        tc3_assets: [],
        tc3_gl_accounts: DEFAULT_GL_CHART,
      };
      return d[k] !== undefined ? d[k] : def;
    },
  };
}

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
    assert(voidSale.voidedSale.updatedAt, "void stamps updatedAt");
    assert(voidSale.refundHint && voidSale.refundHint.cashBankRefund === 600, "paid cash refund hint");

    var stateWithCod = Object.assign({}, state, {
      cheques: [
        { id: "ch1", saleId: "s1", status: "Pending", amount: 100 },
        { id: "ch2", saleId: "s1", status: "Cleared", amount: 200 },
      ],
      codRecords: [{ id: "cod1", saleId: "s1" }, { id: "cod2", saleId: "other" }],
      sales: [Object.assign({}, sale, { paid: 600 })],
      customers: [{ id: "c1", name: "Ali", credit: 400, totalSpent: 1000 }],
      products: [{ id: "p1", name: "Laptop", stock: 3, cost: 250, type: "stock" }],
    });
    var void2 = buildVoidSaleUpdates(stateWithCod, "s1", "Duplicate entry");
    assert(void2.ok, "void with cheques/cod");
    assert(void2.cheques.every(function (c) { return c.saleId !== "s1" || c.status === "Voided"; }), "all sale cheques voided");
    assert(void2.codRecords.length === 1 && void2.codRecords[0].id === "cod2", "cod row for sale removed");
    assert(void2.refundHint.cashBankRefund === 300, "refund excludes pending+cleared (600-100-200)");
    assert(void2.refundHint.clearedChequeNote === 200, "cleared cheque noted separately");

    state.salesReturns = [{ invoiceId: "s1", productId: "p1", qty: 1, amount: 100 }];
    assert(voidSaleBlockReason(sale, state), "block void when returns exist");

    var voidPur = buildVoidPurchaseUpdates(state, "pur1", "Wrong supplier");
    assert(voidPur.ok, "void purchase should succeed");
    assert(voidPur.products[0].stock === 1, "purchase qty removed");
    assert(isVoidedTxn(voidPur.purchases[0]));

    state.products[0].stock = 0;
    assert(voidPurchaseBlockReason(purchase, state), "block void when stock insufficient");

    var repairs = [{
      id: "rep1",
      customer: "Ali",
      devices: [
        { deviceType: "Laptop", brand: "Dell", status: "Delivered" },
        { deviceType: "Phone", brand: "Apple", status: "Ready" },
      ],
    }];
    var voidedRepairSale = {
      id: "s-rep",
      fromRepairId: "rep1",
      fromRepairDeviceIndexes: [0],
      status: "Voided",
    };
    var rolled = rollbackRepairDevicesOnVoidSale(repairs, voidedRepairSale, "2026-07-16");
    assert(rolled[0].devices[0].status === "Ready", "delivered device rolls back to Ready");
    assert(rolled[0].devices[1].status === "Ready", "other device unchanged");
    assert(rolled[0].devices[0].timeline && rolled[0].devices[0].timeline.readyAt === "2026-07-16", "readyAt stamped");

    var glState = {
      settings: { taxEnabled: false, glVatPostingEnabled: false, inventoryCostingMethod: "wac" },
      sales: [{ id: "s-void", date: "2026-06-01", status: "Voided", total: 500, items: [{ id: "p1", qty: 1, price: 500, cost: 300 }] }],
      salesReturns: [{ id: "ret1", invoiceId: "s-void", date: "2026-06-02", productId: "p1", qty: 1, amount: 500, cost: 300 }],
      purchases: [{ id: "p-void", date: "2026-06-01", status: "Voided", total: 200, items: [{ id: "p1", qty: 1, cost: 200 }] }],
      purchaseReturns: [{ id: "pr1", purchaseId: "p-void", date: "2026-06-02", productId: "p1", qty: 1, cost: 200 }],
      products: [{ id: "p1", stock: 0, cost: 200 }],
      customers: [],
      suppliers: [],
      expenses: [],
    };
    var Smock = makeSmock();
    var invDer = deriveInventoryEconomics(glState, Smock);
    var gl = rebuildJournalFromState(glState, Smock, uid, invDer);
    assert(gl.validate.ok, "orphan return GL should still balance");
    var returnLines = (gl.lines || []).filter(function (l) {
      return l.referenceType === "sales_return" || l.referenceType === "sales_return_cogs"
        || l.referenceType === "purchase_return" || l.referenceType === "purchase_return_refund";
    });
    assert(returnLines.length === 0, "GL skips returns whose parent sale/purchase is voided");

    pass("Void invoice — sale/purchase reversal, blocks, filters");
  } catch (e) {
    fail("Void invoice — sale/purchase reversal, blocks, filters", e && e.message ? e.message : e);
  }
}
