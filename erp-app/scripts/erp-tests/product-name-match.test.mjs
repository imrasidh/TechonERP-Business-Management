#!/usr/bin/env node
import {
  productNameFingerprint,
  evaluateProductNameMatch,
  checkProductName,
  getProductNameRelation,
  findSimilarProductNameCandidates,
} from "../../src/utils/productNameMatch.js";

export function runProductNameMatchTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var products = [
    { id: "1", name: "Laptop T480", barcode: "111", category: "Laptops", productId: "P001", status: "active" },
    { id: "2", name: "ThinkPad T480s", barcode: "222", category: "Laptops", productId: "P002", status: "active" },
    { id: "3", name: "Lenovo T480", barcode: "333", category: "Laptops", productId: "P003", status: "active" },
    { id: "4", name: "Dell Mouse", barcode: "444", category: "Accessories", productId: "P004", status: "active" },
  ];

  if (productNameFingerprint("T480 Laptop") !== productNameFingerprint("Laptop T480")) {
    return fail("Product name match: reordered fingerprint");
  }
  if (productNameFingerprint("T480") === productNameFingerprint("T480s")) {
    return fail("Product name match: T480 vs T480s must differ");
  }

  if (getProductNameRelation("Lenovo T480", "Lenovo ThinkPad T480") !== "same_core") {
    return fail("Product name match: Lenovo T480 vs Lenovo ThinkPad T480");
  }

  var lenovoLikely = evaluateProductNameMatch("Lenovo ThinkPad T480", products, null);
  if (!lenovoLikely || lenovoLikely.type !== "likely_same") {
    return fail("Product name match: Lenovo thinkpad variant detection");
  }

  var reordered = evaluateProductNameMatch("T480 Laptop", products, null);
  if (!reordered || reordered.type !== "likely_same" || reordered.matches[0].name !== "Laptop T480") {
    return fail("Product name match: reordered detection");
  }

  var exact = evaluateProductNameMatch("Laptop T480", products, null);
  if (!exact || exact.type !== "exact") {
    return fail("Product name match: exact detection");
  }

  var different = evaluateProductNameMatch("ThinkPad T480s", products, null);
  if (different && different.type === "likely_same" && different.matches.some(function (m) { return m.name === "Laptop T480"; })) {
    return fail("Product name match: T480s should not match T480");
  }

  var live = findSimilarProductNameCandidates("Lenovo T", products, null, 5);
  if (!live.length || !live.some(function (r) { return r.match.name === "Lenovo T480"; })) {
    return fail("Product name match: live search while typing");
  }

  var legacy = checkProductName("T480 Laptop", products, null);
  if (!legacy || legacy.type !== "likely_same") {
    return fail("Product name match: checkProductName wrapper");
  }

  pass("Product name match — exact, likely-same, live search, model-safe");
}
