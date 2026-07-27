/**
 * Performance guardrails for large standalone datasets (Node only).
 */
import { trialBalance, DEFAULT_GL_CHART } from "../../src/accounting/generalLedger.js";
import { dedupeJournalLinesAfterMerge } from "../../src/accounting/journalMerge.js";

var TARGET_LINES = 50000;
var TB_MS_BUDGET = 8000;
var DEDUPE_MS_BUDGET = 6000;

export function runPerformanceScaleTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var lines = [];
  var i;
  for (i = 0; i < TARGET_LINES; i++) {
    var txn = "perf_txn_" + Math.floor(i / 4);
    var isDebit = i % 4 < 2;
    lines.push({
      id: "ln_" + i,
      transactionId: txn,
      accountId: isDebit ? "1000" : "4000",
      debit: isDebit ? 1 : 0,
      credit: isDebit ? 0 : 1,
      date: "2026-01-" + String((i % 28) + 1).padStart(2, "0"),
      memo: "perf",
    });
  }

  var t0 = Date.now();
  var tb = trialBalance(lines, DEFAULT_GL_CHART);
  var tbMs = Date.now() - t0;
  if (!tb || Math.abs((tb.totalDebit || 0) - (tb.totalCredit || 0)) > 0.02) {
    return fail("Performance: trial balance on " + TARGET_LINES + " lines");
  }
  if (tbMs > TB_MS_BUDGET) {
    return fail("Performance: trial balance too slow (" + tbMs + "ms > " + TB_MS_BUDGET + "ms)");
  }
  pass("Performance — trial balance " + TARGET_LINES + " lines in " + tbMs + "ms");

  var dupLines = lines.concat(lines.slice(0, 500));
  t0 = Date.now();
  var deduped = dedupeJournalLinesAfterMerge(dupLines);
  var dedupeMs = Date.now() - t0;
  if (deduped.length >= dupLines.length) return fail("Performance: dedupe should shrink input");
  if (dedupeMs > DEDUPE_MS_BUDGET) {
    return fail("Performance: journal dedupe too slow (" + dedupeMs + "ms > " + DEDUPE_MS_BUDGET + "ms)");
  }
  pass("Performance — journal dedupe " + dupLines.length + " → " + deduped.length + " in " + dedupeMs + "ms");
}

if (process.argv[1] && String(process.argv[1]).replace(/\\/g, "/").endsWith("performance-scale.test.mjs")) {
  runPerformanceScaleTests({
    pass: function (name) { console.log("PASS —", name); },
    fail: function (name, detail) {
      console.error("FAIL —", name, detail != null ? detail : "");
      process.exitCode = 1;
    },
  });
  process.exit(process.exitCode || 0);
}
