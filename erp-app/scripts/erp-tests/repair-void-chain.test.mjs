import {
  buildVoidSaleUpdates,
  computeNetCOGS,
  activeSales,
  activeSalesReturns,
  computeNetCOGSForRange,
  reverseStrippedSalesReturnCustomerEffects,
} from "../../src/utils/voidInvoice.js";
import { rollbackRepairDevicesOnVoidSale } from "../../src/utils/repairVoidRollback.js";
import { mergeServerStateWithLocal } from "../../src/utils/mergeRecordArrays.js";
import { resolveVoidReturnConflictsByTimestamp } from "../../src/utils/reconcileVoidReturns.js";
import { applyVoidReturnReconcileSideEffects } from "../../src/utils/voidReturnSideEffects.js";
import { deriveInventoryEconomics } from "../../src/accounting/inventoryEngine.js";
import { activeCodRecords } from "../../src/utils/codTracking.js";
import { stampTransactionIsoDateTime } from "../../src/utils/stampUpdatedAt.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function markRepairDevicesDelivered(repairs, fromRepairId, deviceIndexes, day) {
  return (repairs || []).map(function (rep) {
    if (rep.id !== fromRepairId) return rep;
    var devices = (rep.devices || []).map(function (d, idx) {
      if (deviceIndexes.indexOf(idx) < 0) return d;
      return Object.assign({}, d, {
        status: "Delivered",
        timeline: Object.assign({}, (d && d.timeline) || {}, { deliveredAt: day }),
      });
    });
    var allDelivered = devices.every(function (d) { return (d.status || "Accepted") === "Delivered"; });
    return Object.assign({}, rep, { devices: devices, status: allDelivered ? "Delivered" : rep.status });
  });
}

export function runRepairVoidChainTests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;
  try {
    var repairId = "rep-chain-1";
    var saleId = "sale-chain-1";
    var repairs = [{
      id: repairId,
      customer: "Ali",
      devices: [{ deviceType: "Laptop", brand: "Dell", status: "Ready" }],
    }];
    var sale = {
      id: saleId,
      invoiceNo: "INV-R1",
      date: "2026-07-16",
      customerId: "c1",
      total: 500,
      paid: 500,
      balance: 0,
      fromRepairId: repairId,
      fromRepairDeviceIndexes: [0],
      items: [{ id: "svc1", name: "Repair Service", qty: 1, price: 500, cost: 200 }],
    };
    var state = {
      sales: [sale],
      purchases: [],
      salesReturns: [],
      purchaseReturns: [],
      products: [],
      customers: [{ id: "c1", name: "Ali", credit: 0, totalSpent: 500 }],
      cheques: [],
      repairs: repairs,
    };

    repairs = markRepairDevicesDelivered(repairs, repairId, [0], "2026-07-16");
    assert(repairs[0].devices[0].status === "Delivered", "invoice save marks device Delivered");

    var voidRes = buildVoidSaleUpdates(state, saleId, "Duplicate entry");
    assert(voidRes.ok, "void repair-linked sale");
    repairs = rollbackRepairDevicesOnVoidSale(repairs, voidRes.voidedSale, "2026-07-16");
    assert(repairs[0].devices[0].status === "Ready", "void rolls repair device back to Ready");

    var reSale = {
      id: "sale-chain-2",
      invoiceNo: "INV-R2",
      date: "2026-07-17",
      customerId: "c1",
      total: 600,
      paid: 600,
      balance: 0,
      fromRepairId: repairId,
      fromRepairDeviceIndexes: [0],
      items: [{ id: "svc2", name: "Repair Service", qty: 1, price: 600, cost: 250 }],
    };
    repairs = markRepairDevicesDelivered(repairs, repairId, [0], "2026-07-17");
    assert(repairs[0].devices[0].status === "Delivered", "re-invoice marks device Delivered again");
    assert(!activeSales([voidRes.sales[0], reSale]).some(function (s) { return s.id === saleId; }), "old sale excluded after void");

    pass("Repair void chain — deliver, void rollback, re-invoice");
  } catch (e) {
    fail("Repair void chain — deliver, void rollback, re-invoice", e && e.message ? e.message : e);
  }
}

export function runVoidReturnResidualTests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;
  try {
    var activeSale = {
      id: "s1",
      status: "Paid",
      total: 1000,
      updatedAt: "2026-07-16T10:00:00.000Z",
      items: [{ id: "p1", qty: 2, cost: 100 }],
    };
    var voidedSale = Object.assign({}, activeSale, {
      status: "Voided",
      updatedAt: "2026-07-16T11:00:00.000Z",
    });
    var saleReturn = { id: "r1", invoiceId: "s1", qty: 1, cost: 100, amount: 500 };

    var merged = mergeServerStateWithLocal(
      { tc3_sales: [activeSale], tc3_salesReturns: [saleReturn] },
      { tc3_sales: [voidedSale], tc3_salesReturns: [saleReturn] }
    );
    assert(merged.tc3_sales.length === 1 && merged.tc3_sales[0].status !== "Voided", "void loses merge when returns exist");
    assert(merged.tc3_salesReturns.length === 1, "return row preserved");

    var orphanOnly = mergeServerStateWithLocal(
      { tc3_sales: [voidedSale], tc3_salesReturns: [saleReturn] },
      { tc3_sales: [voidedSale], tc3_salesReturns: [saleReturn] }
    );
    assert(orphanOnly.tc3_salesReturns.length === 0, "orphan returns stripped when parent voided");

    var voidedWithAt = Object.assign({}, voidedSale, {
      voidedAt: "2026-07-16T10:00:00.000Z",
      total: 1000,
      paid: 1000,
    });
    var newerReturn = {
      id: "r-new",
      invoiceId: "s1",
      qty: 1,
      cost: 100,
      amount: 500,
      createdAt: "2026-07-16T12:00:00.000Z",
    };
    var returnWins = mergeServerStateWithLocal(
      { tc3_sales: [voidedWithAt], tc3_salesReturns: [newerReturn] },
      { tc3_sales: [voidedWithAt], tc3_salesReturns: [newerReturn] }
    );
    assert(returnWins.tc3_sales.length === 1 && returnWins.tc3_sales[0].status !== "Voided", "newer return restores parent when void is older");
    assert(returnWins.tc3_salesReturns.length === 1, "return kept when it wins timestamp over void");

    var voidNewer = Object.assign({}, voidedWithAt, {
      voidedAt: "2026-07-16T14:00:00.000Z",
      updatedAt: "2026-07-16T14:00:00.000Z",
    });
    var staleReturn = Object.assign({}, newerReturn, { createdAt: "2026-07-16T11:00:00.000Z" });
    var voidWins = mergeServerStateWithLocal(
      { tc3_sales: [voidNewer], tc3_salesReturns: [staleReturn] },
      { tc3_sales: [voidNewer], tc3_salesReturns: [staleReturn] }
    );
    assert(voidWins.tc3_salesReturns.length === 0, "stale return stripped when void is newer");

    var resolved = resolveVoidReturnConflictsByTimestamp(
      [voidedWithAt],
      [newerReturn],
      [],
      []
    );
    assert(resolved.sales[0].status !== "Voided", "timestamp resolver restores sale directly");

    var product = { id: "p1", name: "Widget", stock: 12, cost: 10, type: "stock" };
    var basePurchase = {
      id: "pur1",
      date: "2026-07-01",
      items: [{ id: "p1", qty: 10, cost: 10 }],
      total: 100,
      paidAmount: 100,
      balance: 0,
      status: "Paid",
      isoDateTime: "2026-07-01T10:00:00.000Z",
    };
    var voidedRace = Object.assign({}, voidedWithAt, {
      voidedAt: "2026-07-16T10:00:00.000Z",
      date: "2026-07-16",
      items: [{ id: "p1", qty: 2, cost: 10, price: 20 }],
      isoDateTime: "2026-07-16T10:00:00.000Z",
    });
    var raceReturn = Object.assign({}, newerReturn, {
      productId: "p1",
      qty: 1,
      cost: 10,
      date: "2026-07-16",
      createdAt: "2026-07-16T12:00:00.000Z",
    });
    var raceBase = {
      tc3_sales: [voidedRace],
      tc3_salesReturns: [raceReturn],
      tc3_purchases: [basePurchase],
      tc3_products: [Object.assign({}, product, { stock: 12 })],
      tc3_customers: [],
      tc3_cheques: [],
      tc3_settings: { inventoryCostingMethod: "wac" },
    };
    var raceMerged = mergeServerStateWithLocal(raceBase, raceBase);
    assert(raceMerged.tc3_sales[0].status !== "Voided", "race merge restores sale when return is newer");
    assert(raceMerged.tc3_salesReturns.length === 1, "race merge keeps return");
    var raceProd = (raceMerged.tc3_products || []).find(function (p) { return p.id === "p1"; });
    assert(raceProd && raceProd.stock === 9, "race merge realigns stock from replay (10 purchase - 2 sale + 1 return = 9)");

    var live = activeSales([activeSale]);
    var net = computeNetCOGS(live, [saleReturn, { invoiceId: "missing", qty: 1, cost: 50 }]);
    assert(net === 100, "net COGS ignores orphan/unlinked returns (2*100 - 100)");

    var orphanNet = computeNetCOGS(live, [{ invoiceId: "s-void-only", qty: 1, cost: 200 }]);
    assert(orphanNet === 200, "net COGS ignores returns without active parent in sales set");

    var orphans = activeSalesReturns(
      [voidedSale],
      [saleReturn, { id: "r2", invoiceId: "missing", amount: 50 }]
    );
    assert(orphans.length === 0, "activeSalesReturns excludes void-parent and missing-parent rows");

    var voidSaleCust = {
      id: "s-cust-void",
      status: "Voided",
      total: 500,
      paid: 200,
      customerId: "c1",
    };
    var strippedRet = { id: "r-strip", invoiceId: "s-cust-void", customerId: "c1", amount: 300, qty: 1, productId: "p1" };
    var driftedCust = [{ id: "c1", name: "Ali", credit: 0, totalSpent: 200 }];
    var fixedCust = reverseStrippedSalesReturnCustomerEffects(driftedCust, [voidSaleCust], [strippedRet]);
    assert(fixedCust[0].credit === 300, "stripped return restores customer credit");
    assert(fixedCust[0].totalSpent === 500, "stripped return restores customer totalSpent");

    var sideFx = applyVoidReturnReconcileSideEffects({
      tc3_sales: [voidSaleCust],
      tc3_salesReturns: [],
      tc3_products: [{ id: "p1", stock: 11, cost: 10, type: "stock" }],
      tc3_customers: driftedCust,
      tc3_cheques: [],
      tc3_purchases: [],
      tc3_settings: { inventoryCostingMethod: "wac" },
    }, { strippedSalesReturns: [strippedRet] }, { get: function () { return null; } });
    assert(sideFx.tc3_customers[0].totalSpent === 500, "reconcile side effects restore customer totals");

    pass("Void/return residuals — sync reconcile + net COGS guard");
  } catch (e) {
    fail("Void/return residuals — sync reconcile + net COGS guard", e && e.message ? e.message : e);
  }
}

export function runMediumLowFixTests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;
  try {
    var dmg = stampTransactionIsoDateTime({ id: "d1", date: "2026-07-16", productId: "p1", qty: 1, cost: 5 }, "2026-07-16T14:30:00.000Z");
    assert(dmg.isoDateTime === "2026-07-16T14:30:00.000Z", "isoDateTime stamped on damage row");

    var state = {
      settings: { inventoryCostingMethod: "wac", taxEnabled: false },
      products: [{ id: "p1", name: "Part", stock: 3, cost: 10, type: "stock" }],
      purchases: [{ id: "pur1", date: "2026-07-01", items: [{ id: "p1", qty: 10, cost: 10 }], paymentHistory: [] }],
      sales: [],
      salesReturns: [],
      purchaseReturns: [],
      damageLog: [{
        id: "dmg-rep",
        date: "2026-07-16",
        isoDateTime: "2026-07-16T10:00:00.000Z",
        productId: "p1",
        qty: 2,
        cost: 10,
        repairId: "rep1",
        reason: "Repair internal use",
      }],
      customers: [],
      suppliers: [],
      expenses: [],
    };
    var Smock = { get: function (k, def) { return def; } };
    var inv = deriveInventoryEconomics(state, Smock);
    var dmgMv = (inv.movements || []).filter(function (m) { return m.referenceType === "damage"; });
    assert(dmgMv.length >= 1, "repair internal damage appears in inventory replay");
    assert(dmgMv.some(function (m) { return m.qtyOut === 2; }), "damage qty matches internal parts use");

    var cod = activeCodRecords(
      [{ id: "c1", saleId: "s1" }, { id: "c2", saleId: "s2" }, { id: "c3" }],
      [{ id: "s1", status: "Paid" }, { id: "s2", status: "Voided" }]
    );
    assert(cod.length === 2, "COD hides void-linked rows, keeps unlinked");
    assert(cod.some(function (r) { return r.id === "c1"; }), "active sale COD kept");
    assert(cod.some(function (r) { return r.id === "c3"; }), "manual COD kept");

    var salesMix = [{ id: "s1", status: "Voided", items: [] }, { id: "s2", status: "Paid", items: [{ cost: 10, qty: 1 }] }];
    var returnsMix = [
      { id: "r1", invoiceId: "s1", date: "2026-07-16", qty: 1, cost: 5 },
      { id: "r2", invoiceId: "s2", date: "2026-07-16", qty: 1, cost: 3 },
    ];
    var activeRets = activeSalesReturns(salesMix, returnsMix);
    assert(activeRets.length === 1 && activeRets[0].id === "r2", "activeSalesReturns drops void-parent orphans");
    assert(computeNetCOGS([salesMix[1]], returnsMix) === 7, "net COGS ignores orphan return on voided parent");

    var pur = stampTransactionIsoDateTime({ id: "p1", date: "2026-07-16", createdAt: "2026-07-16T09:00:00.000Z" }, "2026-07-16T09:00:00.000Z");
    assert(pur.isoDateTime === "2026-07-16T09:00:00.000Z", "isoDateTime stamped on purchase-like row");

    var priorSale = { id: "s-prior", status: "Paid", date: "2026-07-10", items: [{ cost: 20, qty: 1 }] };
    var daySale = { id: "s-today", status: "Paid", date: "2026-07-16", items: [{ cost: 50, qty: 1 }] };
    var crossReturn = { id: "r-cross", invoiceId: "s-prior", date: "2026-07-16", qty: 1, cost: 20 };
    assert(computeNetCOGSForRange([daySale], [crossReturn]) === 50, "without parent lookup cross-day return ignored");
    assert(computeNetCOGSForRange([daySale], [crossReturn], [priorSale, daySale]) === 30, "parent lookup subtracts cross-day return COGS");

    pass("Medium/low fixes — repair damage GL path, isoDateTime, COD filter, active returns");
  } catch (e) {
    fail("Medium/low fixes — repair damage GL path, isoDateTime, COD filter, active returns", e && e.message ? e.message : e);
  }
}
