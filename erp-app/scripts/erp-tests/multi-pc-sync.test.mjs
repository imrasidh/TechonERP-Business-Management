/**
 * Multi-PC LAN sync guards — client pull sanitization, stock assert, immediate push batching.
 */
import {
  sanitizeClientPullDocuments,
  sanitizeMergedPullState,
} from "../../src/utils/syncPullGuards.js";
import { assertCartStockAvailable, pushKeysNow } from "../../src/utils/concurrencyGuards.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function withWindowRole(role, fn) {
  var prev = globalThis.window;
  globalThis.window = { _tcNetRole: role };
  try {
    return fn();
  } finally {
    globalThis.window = prev;
  }
}

export function runMultiPcSyncTests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;

  try {
    var inflated = {
      tc3_sales: [{
        id: "s1",
        total: 1000,
        paid: 5000,
        balance: 0,
        payStatus: "Paid",
        paymentHistory: [
          { id: "ph1", amount: 3000, cashMethod: "Cash" },
          { id: "ph2", amount: 2000, cashMethod: "Bank" },
        ],
      }],
    };
    var clamped = withWindowRole("network_client", function () {
      return sanitizeClientPullDocuments(inflated);
    });
    assert(clamped.tc3_sales[0].paid === 1000, "client pull caps paid at invoice total");
    assert(clamped.tc3_sales[0].balance === 0, "client pull balance after cap");
    assert(clamped.tc3_sales[0].paymentHistory.length === 2, "payment history rows kept");

    var unchanged = withWindowRole("network_server", function () {
      return sanitizeClientPullDocuments(inflated);
    });
    assert(unchanged.tc3_sales[0].paid === 5000, "server role skips client payment clamp");

    var merged = sanitizeMergedPullState(
      { tc3_users: [{ id: "remote", name: "Hacker" }], tc3_products: [] },
      { tc3_users: [{ id: "local", name: "Admin" }] }
    );
    assert(merged.tc3_users[0].id === "local", "server pull keeps local auth users");

    var products = [{ id: "p1", name: "Widget", stock: 2, unit: "Pcs" }];
    var cart = [{ id: "p1", name: "Widget", qty: 3 }];
    var bad = assertCartStockAvailable(cart, products, function () { return 3; }, function () { return false; });
    assert(!bad.ok && /server/i.test(bad.message || ""), "stock assert blocks oversell with server message");

    var ok = assertCartStockAvailable(cart, products, function () { return 1; }, function () { return false; });
    assert(ok.ok, "stock assert allows when qty fits");

    var svc = assertCartStockAvailable(
      [{ id: "s1", qty: 99 }],
      [{ id: "s1", name: "Repair", stock: 0 }],
      function () { return 99; },
      function () { return true; }
    );
    assert(svc.ok, "service lines skip stock check");

    var pushed = [];
    var prevWin = globalThis.window;
    globalThis.window = {
      TC_SYNC: {
        syncStorageKeysNow: function (pairs) {
          pushed.push(pairs);
        },
      },
    };
    try {
      pushKeysNow([
        ["tc3_products", [{ id: "p1" }]],
        ["tc3_sales", [{ id: "s1" }]],
      ]);
    } finally {
      globalThis.window = prevWin;
    }
    assert(pushed.length === 1 && pushed[0].length === 2, "pushKeysNow batches keys in one call");

    pass("Multi-PC sync — pull guards, stock assert, push batching");
  } catch (e) {
    fail("Multi-PC sync", e && e.message ? e.message : e);
  }
}
