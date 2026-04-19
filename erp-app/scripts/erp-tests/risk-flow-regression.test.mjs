/**
 * Logic-only regression tests for documented formulas (no App.jsx execution).
 */

/** Mirrors Dashboard stock retail sum for physical (non-service) products */
function dashboardStockRetailSum(products) {
  var stockable = products.filter(function (p) {
    return String((p && p.type) || "stock").toLowerCase() !== "service";
  });
  return stockable.reduce(function (a, p) {
    return a + (Number(p.price) || 0) * (Number(p.stock) || 0);
  }, 0);
}

/** Purchase WAC after receipt when old stock positive (Purchases.jsx save path) */
function wacAfterPurchase(oldStock, oldCost, receiptQty, receiptUnitCost) {
  var newStock = oldStock + receiptQty;
  if (newStock <= 0) return receiptUnitCost;
  if (oldStock <= 0) return receiptUnitCost;
  return Math.round((((oldStock * oldCost) + (receiptQty * receiptUnitCost)) / newStock) * 100) / 100;
}

export function runRiskFlowRegressionTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var retail = dashboardStockRetailSum([
    { type: "stock", price: 100, stock: 10 },
    { type: "service", price: 999, stock: 0 },
    { type: "stock", price: 5, stock: 2 },
  ]);
  if (Math.abs(retail - 1010) > 0.001) return fail("Dashboard-style retail sum excludes service", retail);

  var wac = wacAfterPurchase(10, 5, 10, 3);
  if (Math.abs(wac - 4) > 0.01) return fail("WAC blend formula baseline", wac);

  pass("Risk-flow regression — dashboard retail sum + WAC blend");
}
