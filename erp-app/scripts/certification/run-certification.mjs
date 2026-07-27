#!/usr/bin/env node
/**
 * CLI: npm run test:certification [-- --suite=sales]
 */
import { runCertification, getAllSuites } from "../../src/certification/runner/runCertification.js";

function arg(name) {
  var hit = process.argv.find(function (a) { return a.indexOf("--" + name + "=") === 0; });
  return hit ? hit.slice(name.length + 3) : null;
}

var suiteArg = arg("suite");
var suiteIds = suiteArg ? suiteArg.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : null;

if (process.argv.indexOf("--list") >= 0) {
  getAllSuites().forEach(function (s) {
    console.log(s.id + "\t" + s.label + "\t" + s.tests.length + " tests");
  });
  process.exit(0);
}

console.log("TechonERP Certification Runner");
console.log(suiteIds ? ("Suites: " + suiteIds.join(", ")) : "Suites: ALL");
console.log("");

var result = await runCertification({
  suiteIds: suiteIds,
  onProgress: function (p) {
    if (p.testName) {
      process.stdout.write("\r[" + Math.round(p.pct) + "%] " + (p.suiteLabel || "") + " · " + p.testName + "   ");
    }
  },
});

process.stdout.write("\n\n");
console.log(result.reportText);
process.exit(result.ok ? 0 : 1);
