#!/usr/bin/env node
import {
  FREE_ITEM_LABEL,
  isFreeSaleLine,
  splitSaleItemsByFree,
  baseQtyInCartLines,
  formatInvoiceLinePrice,
  formatInvoiceLineTotal,
} from "../../src/utils/posFreeItems.js";

export function runPosFreeItemsTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  if (!isFreeSaleLine({ isFree: true })) return fail("POS free items: isFree flag");
  if (isFreeSaleLine({ price: 0 })) return fail("POS free items: price 0 alone is not free");

  var split = splitSaleItemsByFree([
    { id: "a", name: "Laptop", price: 1000 },
    { id: "b", name: "Mouse", isFree: true, price: 0 },
  ]);
  if (split.paid.length !== 1 || split.free.length !== 1) {
    return fail("POS free items: split paid/free");
  }

  var product = { id: "p1", unit: "Pcs" };
  var toBase = function (qty) { return qty; };
  var lines = [
    { id: "p1", qty: 2, saleUnit: "Pcs" },
    { id: "p1", qty: 1, saleUnit: "Pcs" },
  ];
  if (baseQtyInCartLines(product, lines, toBase) !== 3) {
    return fail("POS free items: base qty in cart lines");
  }

  if (formatInvoiceLinePrice({ isFree: true, price: 0 }, function (n) { return String(n); }, function () { return "Rs"; }) !== FREE_ITEM_LABEL) {
    return fail("POS free items: format price FREE");
  }
  if (formatInvoiceLineTotal({ isFree: true, qty: 2, price: 0 }, function (n) { return String(n); }, function () { return "Rs"; }) !== FREE_ITEM_LABEL) {
    return fail("POS free items: format total FREE");
  }

  pass("POS free items — split, stock qty, invoice FREE labels");
}
