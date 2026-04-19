/**
 * Golden dataset: fixed transactions → TB / P&L / BS must match expected.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { makeSmock, rebuild, trialBalance, profitAndLossFromLedger, balanceSheetFromLedger, DEFAULT_GL_CHART } from "./lib/harness.mjs";

var __dirname = path.dirname(fileURLToPath(import.meta.url));

function deepEqualNums(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {{ fail: (name: string, detail?: unknown) => void, pass: (name: string) => void }} ctx
 */
export function runGoldenTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var dataPath = path.join(__dirname, "golden-data.json");
  var expPath = path.join(__dirname, "golden-expected.json");
  var raw;
  var expected;
  try {
    raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    expected = JSON.parse(fs.readFileSync(expPath, "utf8"));
  } catch (e) {
    return fail("Golden dataset: read JSON", e && e.message);
  }

  var Smock = makeSmock();
  var state = {
    settings: raw.settings,
    products: raw.products,
    purchases: raw.purchases,
    sales: raw.sales,
    salesReturns: raw.salesReturns || [],
    purchaseReturns: raw.purchaseReturns || [],
    customers: raw.customers || [],
    suppliers: raw.suppliers || [],
    expenses: raw.expenses || [],
  };

  var x = rebuild(state, Smock);
  if (!x.r.validate.ok) return fail("Golden: rebuild validate", x.r.validate);
  var lines = x.r.lines;
  var chart = x.r.chart || DEFAULT_GL_CHART;

  var tb = trialBalance(lines, chart);
  var pl = profitAndLossFromLedger(lines, chart, null, null);
  var bs = balanceSheetFromLedger(lines, chart, null);

  var got = {
    trialBalance: { totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, balanced: tb.balanced },
    profitAndLoss: { income: pl.income, expenses: pl.expenses, net: pl.net },
    balanceSheet: {
      assets: bs.assets,
      liabilities: bs.liabilities,
      equity: bs.equity,
      balanced: bs.balanced,
      difference: bs.difference,
      rhsTotal: bs.rhsTotal,
      equityBase: bs.equityBase,
      currentEarnings: bs.currentEarnings,
      equityWithCurrentEarnings: bs.equityWithCurrentEarnings,
      balancedWithEarnings: bs.balancedWithEarnings,
      differenceWithEarnings: bs.differenceWithEarnings,
      rhsTotalWithEarnings: bs.rhsTotalWithEarnings,
    },
  };

  if (!deepEqualNums(got.trialBalance, expected.trialBalance)) {
    return fail("Golden dataset: trial balance mismatch", { got: got.trialBalance, expected: expected.trialBalance });
  }
  if (!deepEqualNums(got.profitAndLoss, expected.profitAndLoss)) {
    return fail("Golden dataset: P&L mismatch", { got: got.profitAndLoss, expected: expected.profitAndLoss });
  }
  if (!deepEqualNums(got.balanceSheet, expected.balanceSheet)) {
    return fail("Golden dataset: balance sheet mismatch", { got: got.balanceSheet, expected: expected.balanceSheet });
  }

  pass("Golden dataset (TB + P&L + BS vs expected)");
}
