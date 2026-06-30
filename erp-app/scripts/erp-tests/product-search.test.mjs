import assert from "node:assert/strict";
import {
  productMatchesSearch,
  productMatchesSearchExact,
  findActiveProductByExactSearch,
} from "../../src/utils/productSearch.js";

var sample = {
  name: "Widget Pro",
  barcode: "BC12345",
  category: "Hardware",
  productId: "1010",
  status: "active",
};

assert.equal(productMatchesSearch(sample, "1010"), true);
assert.equal(productMatchesSearch(sample, "widget"), true);
assert.equal(productMatchesSearch(sample, "hard"), true);
assert.equal(productMatchesSearch(sample, "bc123"), true);
assert.equal(productMatchesSearch(sample, "9999"), false);

assert.equal(productMatchesSearchExact(sample, "1010"), true);
assert.equal(productMatchesSearchExact(sample, "BC12345"), true);
assert.equal(productMatchesSearchExact(sample, "Widget Pro"), true);
assert.equal(productMatchesSearchExact(sample, "101"), false);

var found = findActiveProductByExactSearch(
  [sample, { name: "Other", productId: "1011", status: "inactive" }],
  "1010"
);
assert.equal(found && found.productId, "1010");

var skipInactive = findActiveProductByExactSearch(
  [{ name: "X", productId: "1011", status: "inactive" }],
  "1011"
);
assert.equal(skipInactive, null);

console.log("product-search.test.mjs: ok");
