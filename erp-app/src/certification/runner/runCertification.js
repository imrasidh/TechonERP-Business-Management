/**
 * Automated Certification Runner orchestrator.
 */

import { getAllSuites, getSuiteById } from "./suites.js";

/**
 * @param {{ suiteIds?: string[], onProgress?: function }} opts
 */
export async function runCertification(opts) {
  opts = opts || {};
  var onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};
  var all = getAllSuites();
  var selected = opts.suiteIds && opts.suiteIds.length
    ? opts.suiteIds.map(function (id) { return getSuiteById(id); }).filter(Boolean)
    : all;

  var startedAt = new Date().toISOString();
  var suiteResults = [];
  var totalPassed = 0;
  var totalFailed = 0;
  var failures = [];

  var totalTests = selected.reduce(function (a, s) { return a + (s.tests || []).length; }, 0);
  var done = 0;

  for (var si = 0; si < selected.length; si++) {
    var suite = selected[si];
    var passed = 0;
    var failed = 0;
    var tests = [];

    onProgress({
      phase: "Running " + suite.label,
      suiteId: suite.id,
      suiteLabel: suite.label,
      pct: totalTests ? Math.round((done / totalTests) * 100) : 0,
      passed: totalPassed,
      failed: totalFailed,
    });

    for (var ti = 0; ti < suite.tests.length; ti++) {
      var test = suite.tests[ti];
      var result = {
        name: test.name,
        suiteId: suite.id,
        suiteLabel: suite.label,
        ok: false,
        durationMs: 0,
        expected: null,
        actual: null,
        reason: null,
        stack: null,
      };
      var t0 = Date.now();
      try {
        var ret = test.run();
        if (ret && typeof ret.then === "function") await ret;
        result.ok = true;
        result.durationMs = Date.now() - t0;
        passed += 1;
        totalPassed += 1;
      } catch (e) {
        result.ok = false;
        result.durationMs = Date.now() - t0;
        result.reason = (e && e.message) || String(e);
        result.expected = e && e.expected != null ? e.expected : null;
        result.actual = e && e.actual != null ? e.actual : (e && e.detail != null ? e.detail : null);
        result.stack = e && e.stack ? String(e.stack) : null;
        failed += 1;
        totalFailed += 1;
        failures.push(result);
      }
      tests.push(result);
      done += 1;
      onProgress({
        phase: suite.label + " — " + test.name,
        suiteId: suite.id,
        suiteLabel: suite.label,
        testName: test.name,
        pct: totalTests ? Math.round((done / totalTests) * 100) : 0,
        passed: totalPassed,
        failed: totalFailed,
        lastResult: result,
      });
      /* Yield to UI */
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    suiteResults.push({
      id: suite.id,
      label: suite.label,
      passed: passed,
      failed: failed,
      total: suite.tests.length,
      tests: tests,
    });
  }

  onProgress({
    phase: "Complete",
    pct: 100,
    passed: totalPassed,
    failed: totalFailed,
  });

  return {
    ok: totalFailed === 0,
    startedAt: startedAt,
    finishedAt: new Date().toISOString(),
    suites: suiteResults,
    totalPassed: totalPassed,
    totalFailed: totalFailed,
    total: totalPassed + totalFailed,
    failures: failures,
    reportText: formatCertificationReport({
      suites: suiteResults,
      totalPassed: totalPassed,
      totalFailed: totalFailed,
      failures: failures,
    }),
  };
}

export function formatCertificationReport(summary) {
  var lines = [];
  lines.push("------------------------------------");
  lines.push("TechonERP Certification Runner Report");
  lines.push("------------------------------------");
  lines.push("");
  (summary.suites || []).forEach(function (s) {
    lines.push(s.label + " Tests");
    lines.push(s.passed + " Passed");
    lines.push(s.failed + " Failed");
    lines.push("");
  });
  lines.push("------------------------------------");
  lines.push("TOTAL");
  lines.push(summary.totalPassed + " Passed");
  lines.push(summary.totalFailed + " Failed");
  lines.push("------------------------------------");
  if (summary.failures && summary.failures.length) {
    lines.push("");
    lines.push("FAILURES");
    summary.failures.forEach(function (f, i) {
      lines.push("");
      lines.push((i + 1) + ". [" + f.suiteLabel + "] " + f.name);
      lines.push("   Reason:   " + (f.reason || ""));
      if (f.expected != null) lines.push("   Expected: " + stringify(f.expected));
      if (f.actual != null) lines.push("   Actual:   " + stringify(f.actual));
      if (f.stack) {
        lines.push("   Stack:");
        String(f.stack).split("\n").slice(0, 8).forEach(function (sl) {
          lines.push("     " + sl);
        });
      }
    });
  }
  return lines.join("\n");
}

function stringify(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

export { getAllSuites, getSuiteById };
