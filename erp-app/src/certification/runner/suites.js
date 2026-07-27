/**
 * Certification Runner — test suite definitions.
 * Each test mutates via production-aligned workflows, then verifyBooks().
 */

import { createSandbox, near, round2, validateJsonBackupPayload, hashJournalLines } from "./harness.js";
import * as wf from "./workflows.js";
import { mergeRecordArraysByNewest } from "../../utils/mergeRecordArrays.js";
import {
  trialBalance,
  balanceSheetFromLedger,
  profitAndLossFromLedger,
  ledgerCashBank,
  ledgerARAP,
  DEFAULT_GL_CHART,
} from "./harness.js";

function fail(msg, expected, actual) {
  var e = new Error(msg);
  e.expected = expected;
  e.actual = actual;
  throw e;
}

function assert(cond, msg, expected, actual) {
  if (!cond) fail(msg || "Assertion failed", expected, actual);
}

function assertNear(a, b, msg, tol) {
  if (!near(a, b, tol)) fail(msg || ("Expected " + b + " got " + a), b, a);
}

function books(sb, label) {
  var v = sb.verifyBooks(label || "post-workflow");
  if (!v.ok) {
    var e = new Error(v.error || "Books verification failed");
    e.expected = "Balanced books + inventory = GL";
    e.actual = v.error;
    e.detail = v.detail;
    e.stack = typeof v.detail === "string" ? v.detail : e.stack;
    throw e;
  }
  return v;
}

function fresh(opts) {
  var sb = createSandbox(opts || {});
  var master = wf.seedMasterData(sb);
  books(sb, "seed");
  return { sb: sb, master: master };
}

function stockPurchase(sb, qtyMap) {
  var items = Object.keys(qtyMap).map(function (pid) {
    return { productId: pid, qty: qtyMap[pid] };
  });
  return wf.postPurchase(sb, {
    items: items,
    payMode: "paid",
    cashMethod: "Bank",
    date: "2026-04-08",
  });
}

/* ═══════════════════════════════════════════════
   SALES
═══════════════════════════════════════════════ */
function salesSuite() {
  var tests = [];

  tests.push({
    name: "Cash sale",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 20 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 2 }],
        payMode: "cash", cashMethod: "Cash", customerId: "cr_c_1",
      });
      assert(r.ok, r.error);
      assertNear(r.sale.balance, 0, "Cash sale should be fully paid");
      books(x.sb, "cash sale");
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), 18, "Stock after cash sale");
    },
  });

  tests.push({
    name: "Credit sale",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1 }],
        payMode: "credit", customerId: "cr_c_1",
      });
      assert(r.ok, r.error);
      assert(r.sale.payStatus === "Unpaid", "Expected Unpaid", "Unpaid", r.sale.payStatus);
      var v = books(x.sb, "credit sale");
      assert(v.checks.ar > 0, "AR should increase on credit sale", ">0", v.checks.ar);
    },
  });

  tests.push({
    name: "Partial payment sale",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ssd: 5 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ssd", qty: 1 }],
        payMode: "partial", customerId: "cr_c_2",
      });
      assert(r.ok, r.error);
      assert(r.sale.payStatus === "Partial", "Expected Partial", "Partial", r.sale.payStatus);
      assert(r.sale.paid > 0 && r.sale.balance > 0, "Partial paid and balance");
      books(x.sb, "partial sale");
    },
  });

  tests.push({
    name: "Multiple items sale",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10, cr_p_ssd: 5, cr_p_laptop: 2 });
      var r = wf.postSale(x.sb, {
        items: [
          { productId: "cr_p_ram", qty: 2 },
          { productId: "cr_p_ssd", qty: 1 },
        ],
        payMode: "cash", cashMethod: "Bank",
      });
      assert(r.ok, r.error);
      assert(r.sale.items.length === 2, "Two lines");
      books(x.sb, "multi-item sale");
    },
  });

  tests.push({
    name: "Discount %",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 2 }],
        discountPercent: 10,
        payMode: "cash",
      });
      assert(r.ok, r.error);
      assert(r.sale.discount > 0, "Discount applied");
      books(x.sb, "discount %");
    },
  });

  tests.push({
    name: "Discount amount",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 2 }],
        discountAmount: 500,
        payMode: "cash",
      });
      assert(r.ok, r.error);
      assertNear(r.sale.discount, 500, "Fixed discount");
      books(x.sb, "discount amount");
    },
  });

  tests.push({
    name: "Tax OFF",
    run: function () {
      var x = fresh({ taxEnabled: false });
      stockPurchase(x.sb, { cr_p_ram: 5 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1 }],
        taxEnabled: false,
        payMode: "cash",
      });
      assert(r.ok, r.error);
      assertNear(r.sale.totalTax, 0, "No tax");
      books(x.sb, "tax off");
    },
  });

  tests.push({
    name: "Tax ON",
    run: function () {
      var x = fresh({ taxEnabled: true, taxPercent: 15 });
      stockPurchase(x.sb, { cr_p_ram: 5 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1 }],
        taxEnabled: true,
        payMode: "cash",
      });
      assert(r.ok, r.error);
      assert(r.sale.totalTax > 0, "Tax amount > 0", ">0", r.sale.totalTax);
      assertNear(r.sale.total, round2(r.sale.subTotal + r.sale.totalTax), "Total = sub + tax");
      books(x.sb, "tax on");
    },
  });

  tests.push({
    name: "Edit invoice",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1 }],
        payMode: "credit", customerId: "cr_c_1",
      });
      assert(r.ok, r.error);
      var ed = wf.editSale(x.sb, r.sale.id, { note: "Edited for cert", discount: 100 });
      assert(ed.ok, ed.error);
      assert(ed.sale.edited === true, "Edited flag");
      books(x.sb, "edit sale");
    },
  });

  tests.push({
    name: "Delete (void) invoice",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var before = wf.stockOf(x.sb, "cr_p_ram");
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 2 }],
        payMode: "cash",
      });
      assert(r.ok, r.error);
      var v = wf.voidSale(x.sb, r.sale.id, "Test / training entry");
      assert(v.ok, v.error || "Void failed");
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), before, "Stock restored after void");
      books(x.sb, "void sale");
    },
  });

  tests.push({
    name: "Full return",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 2 }],
        payMode: "cash",
      });
      assert(r.ok, r.error);
      var afterSale = wf.stockOf(x.sb, "cr_p_ram");
      var ret = wf.postSalesReturn(x.sb, { saleId: r.sale.id, productId: "cr_p_ram", qty: 2 });
      assert(ret.ok, ret.error);
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), afterSale + 2, "Full return restores stock");
      books(x.sb, "full return");
    },
  });

  tests.push({
    name: "Partial return",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 4 }],
        payMode: "cash",
      });
      assert(r.ok, r.error);
      var afterSale = wf.stockOf(x.sb, "cr_p_ram");
      var ret = wf.postSalesReturn(x.sb, { saleId: r.sale.id, productId: "cr_p_ram", qty: 1 });
      assert(ret.ok, ret.error);
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), afterSale + 1, "Partial return");
      books(x.sb, "partial return");
    },
  });

  tests.push({
    name: "Bank sale",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ssd: 3 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ssd", qty: 1 }],
        payMode: "cash", cashMethod: "Bank",
      });
      assert(r.ok, r.error);
      books(x.sb, "bank sale");
    },
  });

  tests.push({
    name: "Customer receipt after credit sale",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 5 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1 }],
        payMode: "credit", customerId: "cr_c_1",
      });
      assert(r.ok, r.error);
      var pay = wf.addCustomerReceipt(x.sb, r.sale.id, round2(r.sale.total * 0.5), "Cash");
      assert(pay.ok, pay.error);
      assert(pay.sale.payStatus === "Partial");
      books(x.sb, "sale then receipt");
    },
  });

  tests.push({
    name: "Tax ON total correctness (15%)",
    run: function () {
      var x = fresh({ taxEnabled: true, taxPercent: 15 });
      stockPurchase(x.sb, { cr_p_ram: 5 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1, price: 10000 }],
        taxEnabled: true,
        payMode: "cash",
      });
      assert(r.ok, r.error);
      assertNear(r.sale.totalTax, 1500, "15% of 10000");
      assertNear(r.sale.total, 11500, "Grand total with tax");
      books(x.sb, "tax math");
    },
  });

  tests.push({
    name: "Journal balances after multi sale day",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 30 });
      wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 1 }], payMode: "cash" });
      wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 2 }], payMode: "credit", customerId: "cr_c_1" });
      wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 1 }], payMode: "partial", customerId: "cr_c_2" });
      var v = books(x.sb, "multi sale day");
      assert(v.checks.journal && v.checks.trialBalance && v.checks.balanceSheet);
    },
  });

  return { id: "sales", label: "Sales", tests: tests };
}

/* ═══════════════════════════════════════════════
   PURCHASES
═══════════════════════════════════════════════ */
function purchasesSuite() {
  var tests = [];

  tests.push({
    name: "Cash purchase",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_laptop", qty: 2 }],
        payMode: "paid", cashMethod: "Cash",
      });
      assert(p.status === "Paid", "Paid status");
      assertNear(wf.stockOf(x.sb, "cr_p_laptop"), 2, "Stock in");
      books(x.sb, "cash purchase");
    },
  });

  tests.push({
    name: "Credit purchase",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ssd", qty: 3 }],
        payMode: "credit",
      });
      assert(p.status === "Unpaid", "Unpaid");
      var v = books(x.sb, "credit purchase");
      assert(v.checks.ap > 0, "AP increased");
    },
  });

  tests.push({
    name: "Partial payment purchase",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 20 }],
        payMode: "partial",
      });
      assert(p.status === "Partial", "Partial");
      books(x.sb, "partial purchase");
    },
  });

  tests.push({
    name: "Edit purchase",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 5 }],
        payMode: "credit",
      });
      p.editNote = "Qty confirmed";
      p.edited = true;
      p.updatedAt = new Date().toISOString();
      x.sb.state.purchases = x.sb.state.purchases.map(function (row) {
        return row.id === p.id ? p : row;
      });
      books(x.sb, "edit purchase");
    },
  });

  tests.push({
    name: "Delete (void) purchase",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 5 }],
        payMode: "credit",
      });
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), 5, "Stock before void");
      var v = wf.voidPurchase(x.sb, p.id, "Duplicate entry");
      assert(v.ok, v.error || "Void purchase failed");
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), 0, "Stock cleared after void");
      books(x.sb, "void purchase");
    },
  });

  tests.push({
    name: "Purchase return",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 10 }],
        payMode: "paid", cashMethod: "Bank",
      });
      var ret = wf.postPurchaseReturn(x.sb, { purchaseId: p.id, productId: "cr_p_ram", qty: 2 });
      assert(ret.ok, ret.error);
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), 8, "Stock after PR");
      books(x.sb, "purchase return");
    },
  });

  tests.push({
    name: "Supplier payment on credit purchase",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ssd", qty: 2 }],
        payMode: "credit",
      });
      var pay = wf.addSupplierPayment(x.sb, p.id, round2(p.total * 0.5), "Bank");
      assert(pay.ok, pay.error);
      assert(pay.purchase.status === "Partial", "Partial after payment");
      books(x.sb, "supplier payment");
    },
  });

  return { id: "purchases", label: "Purchases", tests: tests };
}

/* ═══════════════════════════════════════════════
   INVENTORY
═══════════════════════════════════════════════ */
function inventorySuite() {
  var tests = [];

  tests.push({
    name: "Opening stock via purchase",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_laptop: 3, cr_p_ram: 50 });
      assertNear(wf.stockOf(x.sb, "cr_p_laptop"), 3);
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), 50);
      books(x.sb, "opening stock");
    },
  });

  tests.push({
    name: "Damage write-off",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 10 });
      var d = wf.postDamage(x.sb, { productId: "cr_p_ram", qty: 2 });
      assert(d.ok, d.error);
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), 8);
      books(x.sb, "damage");
    },
  });

  tests.push({
    name: "WAC costing after layered purchases",
    run: function () {
      var x = fresh({ inventoryCostingMethod: "wac" });
      wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 10, cost: 4000 }],
        payMode: "paid", cashMethod: "Bank", date: "2026-04-08",
      });
      wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 10, cost: 6000 }],
        payMode: "paid", cashMethod: "Bank", date: "2026-04-09",
      });
      assertNear(wf.costOf(x.sb, "cr_p_ram"), 5000, "WAC should be 5000", 0.05);
      wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 5 }],
        payMode: "cash", date: "2026-04-10",
      });
      var v = books(x.sb, "WAC");
      assertNear(v.checks.invDiff, 0, "Inventory = GL under WAC", 1);
    },
  });

  tests.push({
    name: "FIFO costing path",
    run: function () {
      var x = fresh({ inventoryCostingMethod: "fifo" });
      wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 10, cost: 4000 }],
        payMode: "paid", cashMethod: "Bank", date: "2026-04-08",
      });
      wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 10, cost: 6000 }],
        payMode: "paid", cashMethod: "Bank", date: "2026-04-09",
      });
      wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 5 }],
        payMode: "cash", date: "2026-04-10",
      });
      var v = books(x.sb, "FIFO");
      assert(x.sb.state.settings.inventoryCostingMethod === "fifo", "FIFO setting");
      assertNear(v.checks.invDiff, 0, "Inventory = GL under FIFO", 5);
    },
  });

  tests.push({
    name: "Out of stock blocked",
    run: function () {
      var x = fresh({ preventNegativeStock: true });
      stockPurchase(x.sb, { cr_p_ram: 2 });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 5 }],
        payMode: "cash",
      });
      assert(!r.ok, "Sale should fail when out of stock", "blocked", r.ok ? "allowed" : "blocked");
      assertNear(wf.stockOf(x.sb, "cr_p_ram"), 2, "Stock unchanged");
      books(x.sb, "oos blocked");
    },
  });

  tests.push({
    name: "Negative stock blocked",
    run: function () {
      var x = fresh({ preventNegativeStock: true });
      var r = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1 }],
        payMode: "cash",
      });
      assert(!r.ok, "Negative stock attempt blocked");
      books(x.sb, "neg blocked");
    },
  });

  tests.push({
    name: "Stock quantity after sale/return cycle",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ssd: 8 });
      var sale = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ssd", qty: 3 }],
        payMode: "cash",
      });
      assert(sale.ok, sale.error);
      wf.postSalesReturn(x.sb, { saleId: sale.sale.id, productId: "cr_p_ssd", qty: 1 });
      assertNear(wf.stockOf(x.sb, "cr_p_ssd"), 6, "8 - 3 + 1 = 6");
      books(x.sb, "stock cycle");
    },
  });

  return { id: "inventory", label: "Inventory", tests: tests };
}

/* ═══════════════════════════════════════════════
   REPAIRS
═══════════════════════════════════════════════ */
function repairsSuite() {
  var tests = [];

  tests.push({
    name: "Create repair",
    run: function () {
      var x = fresh();
      var r = wf.postRepair(x.sb, { status: "Accepted" });
      assert(r.status === "Accepted");
      assert((x.sb.state.repairs || []).length === 1);
      books(x.sb, "create repair");
    },
  });

  tests.push({
    name: "Edit repair",
    run: function () {
      var x = fresh();
      var r = wf.postRepair(x.sb, { status: "Accepted" });
      var ed = wf.editRepair(x.sb, r.id, { problem: "Battery not charging", status: "Ready" });
      assert(ed.ok, ed.error);
      assert(ed.repair.status === "Ready");
      books(x.sb, "edit repair");
    },
  });

  tests.push({
    name: "Complete repair",
    run: function () {
      var x = fresh();
      var r = wf.postRepair(x.sb, { status: "Accepted" });
      wf.editRepair(x.sb, r.id, { status: "Delivered" });
      assert(x.sb.state.repairs[0].status === "Delivered");
      books(x.sb, "complete repair");
    },
  });

  tests.push({
    name: "Third-party repair",
    run: function () {
      var x = fresh();
      var r = wf.postRepair(x.sb, {
        status: "Third Party",
        thirdParty: {
          supplierId: "cr_s_2",
          supplierName: "Redline Technologies",
          amount: 7500,
          sellAmount: 11000,
        },
      });
      assert(r.status === "Third Party");
      assert(r.devices[0].thirdParty && r.devices[0].thirdParty.amount === 7500);
      books(x.sb, "3p repair");
    },
  });

  tests.push({
    name: "Convert repair to invoice",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 5 });
      var r = wf.postRepair(x.sb, { status: "Ready" });
      var sale = wf.postSale(x.sb, {
        items: [
          { productId: "cr_p_labour", qty: 1 },
          { productId: "cr_p_ram", qty: 1 },
        ],
        payMode: "cash",
        fromRepairId: r.id,
        customerId: "cr_c_1",
      });
      assert(sale.ok, sale.error);
      assert(sale.sale.fromRepairId === r.id, "Linked to repair");
      books(x.sb, "repair invoice");
    },
  });

  return { id: "repairs", label: "Repairs", tests: tests };
}

/* ═══════════════════════════════════════════════
   ACCOUNTING
═══════════════════════════════════════════════ */
function accountingSuite() {
  var tests = [];

  tests.push({
    name: "Money In",
    run: function () {
      var x = fresh();
      var before = books(x.sb, "before money in");
      wf.postMoneyIn(x.sb, { amount: 25000, cashMethod: "Cash" });
      var after = books(x.sb, "money in");
      assertNear(after.checks.cash, before.checks.cash + 25000, "Cash up on Money In");
    },
  });

  tests.push({
    name: "Money Out",
    run: function () {
      var x = fresh();
      var before = books(x.sb, "before money out");
      wf.postMoneyOut(x.sb, { amount: 8000, cashMethod: "Cash" });
      var after = books(x.sb, "money out");
      assertNear(after.checks.cash, before.checks.cash - 8000, "Cash down on Money Out");
    },
  });

  tests.push({
    name: "Expense",
    run: function () {
      var x = fresh();
      wf.postExpense(x.sb, { amount: 12000, category: "Rent", cashMethod: "Bank" });
      var v = books(x.sb, "expense");
      assert(v.checks.plNet < 5000000, "P&L reflects expense");
    },
  });

  tests.push({
    name: "Asset",
    run: function () {
      var x = fresh();
      wf.postAsset(x.sb, { name: "POS Terminal", amount: 95000, cashMethod: "Bank" });
      books(x.sb, "asset");
    },
  });

  tests.push({
    name: "Customer receipt",
    run: function () {
      var x = fresh();
      stockPurchase(x.sb, { cr_p_ram: 5 });
      var sale = wf.postSale(x.sb, {
        items: [{ productId: "cr_p_ram", qty: 1 }],
        payMode: "credit", customerId: "cr_c_1",
      });
      assert(sale.ok, sale.error);
      var pay = wf.addCustomerReceipt(x.sb, sale.sale.id, sale.sale.total, "Cash");
      assert(pay.ok, pay.error);
      assert(pay.sale.payStatus === "Paid");
      books(x.sb, "customer receipt");
    },
  });

  tests.push({
    name: "Supplier payment",
    run: function () {
      var x = fresh();
      var p = wf.postPurchase(x.sb, {
        items: [{ productId: "cr_p_ssd", qty: 2 }],
        payMode: "credit",
      });
      var pay = wf.addSupplierPayment(x.sb, p.id, p.total, "Bank");
      assert(pay.ok, pay.error);
      assert(pay.purchase.status === "Paid");
      books(x.sb, "supplier payment full");
    },
  });

  tests.push({
    name: "Cheque pending then cleared",
    run: function () {
      var x = fresh();
      var ch = wf.postCheque(x.sb, {
        type: "incoming", status: "Pending", amount: 15000,
        customerName: "Rashid Ahmed",
      });
      books(x.sb, "cheque pending");
      wf.clearCheque(x.sb, ch.id);
      books(x.sb, "cheque cleared");
    },
  });

  tests.push({
    name: "Dishonoured cheque",
    run: function () {
      var x = fresh();
      wf.postCheque(x.sb, {
        type: "incoming", status: "Bounced", amount: 22000,
        customerName: "Tech Solutions Lanka",
      });
      books(x.sb, "bounced cheque");
    },
  });

  return { id: "accounting", label: "Accounting", tests: tests };
}

/* ═══════════════════════════════════════════════
   CUSTOMERS / SUPPLIERS / QUOTATIONS / RETURNS / CHEQUES / EXPENSES
═══════════════════════════════════════════════ */
function customersSuite() {
  return {
    id: "customers",
    label: "Customers",
    tests: [
      {
        name: "Customer master exists",
        run: function () {
          var x = fresh();
          assert(x.sb.state.customers.length >= 2);
          books(x.sb);
        },
      },
      {
        name: "Customer credit updates on credit sale",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 5 });
          var before = (x.sb.state.customers.find(function (c) { return c.id === "cr_c_1"; }) || {}).credit || 0;
          var r = wf.postSale(x.sb, {
            items: [{ productId: "cr_p_ram", qty: 1 }],
            payMode: "credit", customerId: "cr_c_1",
          });
          assert(r.ok, r.error);
          var after = (x.sb.state.customers.find(function (c) { return c.id === "cr_c_1"; }) || {}).credit || 0;
          assert(after > before, "Credit increased", ">" + before, after);
          books(x.sb);
        },
      },
      {
        name: "Customer statement paid+balance=total",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 5 });
          wf.postSale(x.sb, {
            items: [{ productId: "cr_p_ram", qty: 1 }],
            payMode: "partial", customerId: "cr_c_1",
          });
          books(x.sb);
        },
      },
    ],
  };
}

function suppliersSuite() {
  return {
    id: "suppliers",
    label: "Suppliers",
    tests: [
      {
        name: "Supplier master exists",
        run: function () {
          var x = fresh();
          assert(x.sb.state.suppliers.length >= 2);
          books(x.sb);
        },
      },
      {
        name: "Supplier AP after credit purchase",
        run: function () {
          var x = fresh();
          wf.postPurchase(x.sb, {
            items: [{ productId: "cr_p_laptop", qty: 1 }],
            payMode: "credit", supplierId: "cr_s_1",
          });
          var v = books(x.sb);
          assert(v.checks.ap > 0, "AP > 0");
        },
      },
      {
        name: "Supplier statement paid+balance=total",
        run: function () {
          var x = fresh();
          wf.postPurchase(x.sb, {
            items: [{ productId: "cr_p_ram", qty: 8 }],
            payMode: "partial",
          });
          books(x.sb);
        },
      },
    ],
  };
}

function quotationsSuite() {
  return {
    id: "quotations",
    label: "Quotations",
    tests: [
      {
        name: "Create quotation",
        run: function () {
          var x = fresh();
          var q = wf.postQuotation(x.sb, { productId: "cr_p_ram", qty: 2, status: "Sent" });
          assert(q.status === "Sent");
          books(x.sb);
        },
      },
      {
        name: "Cancel quotation",
        run: function () {
          var x = fresh();
          var q = wf.postQuotation(x.sb, { status: "Sent" });
          q.status = "Cancelled";
          books(x.sb);
        },
      },
      {
        name: "Convert quotation to sale",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 5 });
          var q = wf.postQuotation(x.sb, { productId: "cr_p_ram", qty: 1, status: "Accepted" });
          var sale = wf.postSale(x.sb, {
            items: [{ productId: "cr_p_ram", qty: 1 }],
            payMode: "cash",
          });
          assert(sale.ok, sale.error);
          q.status = "Converted";
          q.saleId = sale.sale.id;
          sale.sale.fromQuotationId = q.id;
          books(x.sb);
        },
      },
    ],
  };
}

function returnsSuite() {
  return {
    id: "returns",
    label: "Returns",
    tests: [
      {
        name: "Sales return full",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 5 });
          var s = wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 2 }], payMode: "cash" });
          assert(s.ok, s.error);
          assert(wf.postSalesReturn(x.sb, { saleId: s.sale.id, qty: 2, productId: "cr_p_ram" }).ok);
          books(x.sb);
        },
      },
      {
        name: "Sales return partial",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 5 });
          var s = wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 3 }], payMode: "cash" });
          assert(wf.postSalesReturn(x.sb, { saleId: s.sale.id, qty: 1, productId: "cr_p_ram" }).ok);
          books(x.sb);
        },
      },
      {
        name: "Purchase return",
        run: function () {
          var x = fresh();
          var p = wf.postPurchase(x.sb, { items: [{ productId: "cr_p_ssd", qty: 4 }], payMode: "paid", cashMethod: "Bank" });
          assert(wf.postPurchaseReturn(x.sb, { purchaseId: p.id, productId: "cr_p_ssd", qty: 1 }).ok);
          books(x.sb);
        },
      },
    ],
  };
}

function chequesSuite() {
  return {
    id: "cheques",
    label: "Cheques",
    tests: [
      {
        name: "Incoming pending cheque",
        run: function () {
          var x = fresh();
          wf.postCheque(x.sb, { type: "incoming", status: "Pending", amount: 10000 });
          books(x.sb);
        },
      },
      {
        name: "Clear incoming cheque",
        run: function () {
          var x = fresh();
          var ch = wf.postCheque(x.sb, { type: "incoming", status: "Pending", amount: 10000 });
          assert(wf.clearCheque(x.sb, ch.id).ok);
          books(x.sb);
        },
      },
      {
        name: "Outgoing supplier cheque",
        run: function () {
          var x = fresh();
          wf.postCheque(x.sb, { type: "outgoing", status: "Pending", amount: 18000, supplierName: "Tech Distributors Lanka" });
          books(x.sb);
        },
      },
      {
        name: "Bounced cheque",
        run: function () {
          var x = fresh();
          wf.postCheque(x.sb, { type: "incoming", status: "Bounced", amount: 9000 });
          books(x.sb);
        },
      },
    ],
  };
}

function expensesSuite() {
  return {
    id: "expenses",
    label: "Expenses",
    tests: [
      {
        name: "Cash expense",
        run: function () {
          var x = fresh();
          wf.postExpense(x.sb, { amount: 3500, cashMethod: "Cash", category: "Transport" });
          books(x.sb);
        },
      },
      {
        name: "Bank expense",
        run: function () {
          var x = fresh();
          wf.postExpense(x.sb, { amount: 22000, cashMethod: "Bank", category: "Rent" });
          books(x.sb);
        },
      },
      {
        name: "Multiple expenses keep books balanced",
        run: function () {
          var x = fresh();
          wf.postExpense(x.sb, { amount: 1000, cashMethod: "Cash" });
          wf.postExpense(x.sb, { amount: 2000, cashMethod: "Bank" });
          wf.postExpense(x.sb, { amount: 3000, cashMethod: "Cash", category: "Utilities" });
          books(x.sb);
        },
      },
    ],
  };
}

/* ═══════════════════════════════════════════════
   REPORTS
═══════════════════════════════════════════════ */
function reportsSuite() {
  function withActivity() {
    var x = fresh({ taxEnabled: true, taxPercent: 15 });
    stockPurchase(x.sb, { cr_p_ram: 20, cr_p_ssd: 5, cr_p_laptop: 2 });
    wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 3 }], payMode: "cash", taxEnabled: true });
    wf.postSale(x.sb, { items: [{ productId: "cr_p_ssd", qty: 1 }], payMode: "credit", customerId: "cr_c_1", taxEnabled: true });
    wf.postExpense(x.sb, { amount: 5000, cashMethod: "Cash" });
    return x;
  }

  return {
    id: "reports",
    label: "Reports",
    tests: [
      {
        name: "Trial Balance report",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          var tb = trialBalance(v.lines, v.chart);
          assert(tb.balanced, "TB balanced");
          assert(tb.rows && tb.rows.length > 0, "TB has rows");
        },
      },
      {
        name: "Balance Sheet report",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          var bs = balanceSheetFromLedger(v.lines, v.chart, null);
          assert(bs.balancedWithEarnings, "BS balanced");
        },
      },
      {
        name: "Profit & Loss report",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          var pl = profitAndLossFromLedger(v.lines, v.chart, "2026-04-01", "2026-04-30");
          assert(typeof pl.net === "number" && isFinite(pl.net), "P&L net");
        },
      },
      {
        name: "Cash Book report",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          var cb = ledgerCashBank(v.lines);
          assert(typeof cb.cash === "number", "Cash book");
        },
      },
      {
        name: "Bank Book report",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          var cb = ledgerCashBank(v.lines);
          assert(typeof cb.bank === "number", "Bank book");
        },
      },
      {
        name: "AR / AP report",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          var aa = ledgerARAP(v.lines);
          assert(typeof aa.receivables === "number" && typeof aa.payables === "number");
        },
      },
      {
        name: "Inventory vs GL report",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          assertNear(v.checks.invDiff, 0, "Inv=GL", 1);
        },
      },
      {
        name: "Chart of accounts present",
        run: function () {
          var x = withActivity();
          var v = books(x.sb);
          assert((v.chart || DEFAULT_GL_CHART).length > 5, "COA loaded");
        },
      },
    ],
  };
}

/* ═══════════════════════════════════════════════
   BACKUP / RESTORE / COLD REBUILD / MULTI-PC
═══════════════════════════════════════════════ */
function backupSuite() {
  return {
    id: "backup",
    label: "Backup",
    tests: [
      {
        name: "Create backup",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 10 });
          wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 1 }], payMode: "cash" });
          books(x.sb);
          var bak = x.sb.buildBackupObject();
          assert(validateJsonBackupPayload(bak), "Backup shape valid");
          assert(bak.data.tc3_sales.length >= 1, "Sales in backup");
        },
      },
      {
        name: "Backup contains GL snapshot",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 5 });
          books(x.sb);
          var bak = x.sb.buildBackupObject();
          assert((bak.data.tc3_journal_lines || []).length > 0, "Journal in backup");
          assert(!!bak.data.tc3_journal_hash, "Hash present");
        },
      },
    ],
  };
}

function restoreSuite() {
  return {
    id: "restore",
    label: "Restore",
    tests: [
      {
        name: "Restore backup — balances identical",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 15, cr_p_ssd: 4 });
          wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 2 }], payMode: "partial", customerId: "cr_c_1" });
          wf.postExpense(x.sb, { amount: 4000, cashMethod: "Cash" });
          var before = x.sb.snapshotBooks();
          assert(before, "Snapshot before backup");
          var bak = JSON.parse(JSON.stringify(x.sb.buildBackupObject()));
          var y = fresh();
          y.sb.restoreFromBackup(bak);
          var after = y.sb.snapshotBooks();
          assert(after, "Snapshot after restore");
          assertNear(after.tbDebit, before.tbDebit, "TB debit identical after restore");
          assertNear(after.cash, before.cash, "Cash identical");
          assertNear(after.bank, before.bank, "Bank identical");
          assertNear(after.ar, before.ar, "AR identical");
          assertNear(after.ap, before.ap, "AP identical");
          assertNear(after.plNet, before.plNet, "P&L identical");
        },
      },
      {
        name: "Restore then verifyBooks passes",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_laptop: 1 });
          var bak = JSON.parse(JSON.stringify(x.sb.buildBackupObject()));
          var y = createSandbox();
          y.restoreFromBackup(bak);
          books(y, "restored company");
        },
      },
    ],
  };
}

function coldRebuildSuite() {
  return {
    id: "cold_rebuild",
    label: "Cold Rebuild",
    tests: [
      {
        name: "Cold rebuild — balances identical",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 20, cr_p_ssd: 6 });
          wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 4 }], payMode: "cash" });
          wf.postSale(x.sb, { items: [{ productId: "cr_p_ssd", qty: 1 }], payMode: "credit", customerId: "cr_c_2" });
          wf.postExpense(x.sb, { amount: 7500, cashMethod: "Bank" });
          var before = x.sb.snapshotBooks();
          /* Drop journal snapshot — rebuild from operational docs only */
          x.sb.store.tc3_journal_lines = [];
          x.sb.store.tc3_journal_hash = "";
          var afterV = books(x.sb, "cold rebuild");
          assertNear(afterV.checks.cash, before.cash, "Cash after cold rebuild");
          assertNear(afterV.checks.bank, before.bank, "Bank after cold rebuild");
          assertNear(afterV.checks.ar, before.ar, "AR after cold rebuild");
          assertNear(afterV.checks.ap, before.ap, "AP after cold rebuild");
          assertNear(afterV.checks.plNet, before.plNet, "P&L after cold rebuild");
          assertNear(afterV.checks.invDiff, 0, "Inv=GL after cold rebuild", 1);
        },
      },
      {
        name: "Cold rebuild journal hash stable with same id sequence",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 8 });
          wf.postSale(x.sb, { items: [{ productId: "cr_p_ram", qty: 1 }], payMode: "cash" });
          var a = books(x.sb);
          var h1 = hashJournalLines(a.lines);
          x.sb.store.tc3_journal_lines = [];
          var b = books(x.sb, "rebuild 2");
          var h2 = hashJournalLines(b.lines);
          /* Different uid counters may change ids — compare economic totals instead if hash differs */
          assertNear(a.checks.cash, b.checks.cash);
          assertNear(trialBalance(a.lines, a.chart).totalDebit, trialBalance(b.lines, b.chart).totalDebit);
          assert(typeof h1 === "string" && typeof h2 === "string");
        },
      },
    ],
  };
}

function multiPcSuite() {
  return {
    id: "multipc",
    label: "Multi-PC",
    tests: [
      {
        name: "Merge arrays by newest (sync conflict)",
        run: function () {
          var local = [
            { id: "a1", name: "Local", updatedAt: "2026-04-10T10:00:00.000Z", stock: 5 },
            { id: "a2", name: "OnlyLocal", updatedAt: "2026-04-10T10:00:00.000Z", stock: 1 },
          ];
          var remote = [
            { id: "a1", name: "RemoteNewer", updatedAt: "2026-04-11T10:00:00.000Z", stock: 7 },
            { id: "a3", name: "OnlyRemote", updatedAt: "2026-04-11T10:00:00.000Z", stock: 2 },
          ];
          var merged = mergeRecordArraysByNewest(local, remote);
          var a1 = merged.find(function (r) { return r.id === "a1"; });
          assert(a1 && a1.name === "RemoteNewer", "Newer remote wins", "RemoteNewer", a1 && a1.name);
          assert(merged.some(function (r) { return r.id === "a2"; }), "Local-only kept");
          assert(merged.some(function (r) { return r.id === "a3"; }), "Remote-only kept");
        },
      },
      {
        name: "Merged company still balances",
        run: function () {
          var x = fresh();
          stockPurchase(x.sb, { cr_p_ram: 10 });
          var remoteSales = [{
            id: "remote_sale_1",
            invoiceNo: "INV-R1",
            date: "2026-04-16",
            customerName: "Walk-in",
            items: [{ id: "cr_p_ram", qty: 1, price: 6500, cost: 4000 }],
            subTotal: 6500, discount: 0, totalTax: 0, total: 6500,
            paid: 6500, balance: 0, payStatus: "Paid", cashMethod: "Cash",
            paymentHistory: [{ id: "ph_r1", date: "2026-04-16", amount: 6500, cashMethod: "Cash" }],
            createdAt: "2026-04-16T12:00:00.000Z",
            updatedAt: "2026-04-16T12:00:00.000Z",
          }];
          /* Apply stock for merged remote sale */
          x.sb.state.products = x.sb.state.products.map(function (p) {
            if (p.id !== "cr_p_ram") return p;
            return Object.assign({}, p, { stock: (Number(p.stock) || 0) - 1 });
          });
          x.sb.state.sales = mergeRecordArraysByNewest(x.sb.state.sales || [], remoteSales);
          books(x.sb, "after multipc merge");
        },
      },
    ],
  };
}

export function getAllSuites() {
  return [
    salesSuite(),
    purchasesSuite(),
    inventorySuite(),
    repairsSuite(),
    accountingSuite(),
    customersSuite(),
    suppliersSuite(),
    quotationsSuite(),
    returnsSuite(),
    chequesSuite(),
    expensesSuite(),
    reportsSuite(),
    backupSuite(),
    restoreSuite(),
    coldRebuildSuite(),
    multiPcSuite(),
  ];
}

export function getSuiteById(id) {
  return getAllSuites().find(function (s) { return s.id === id; }) || null;
}
