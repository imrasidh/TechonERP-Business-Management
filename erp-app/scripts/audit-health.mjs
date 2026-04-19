#!/usr/bin/env node
/**
 * Local quality gate: accounting + ERP tests + production build.
 * Exit 1 if any step fails.
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

var root = join(dirname(fileURLToPath(import.meta.url)), "..");
var npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function runStep(name, script) {
  var r = spawnSync(npmCmd, ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  var ok = r.status === 0;
  console.log(ok ? "[PASS] " + name : "[FAIL] " + name);
  return ok;
}

var steps = [
  ["test:accounting", "accounting tests"],
  ["test:erp", "ERP integration tests"],
  ["build", "vite build"],
];

console.log("TechonERP audit:health — " + root + "\n");

var allOk = true;
for (var i = 0; i < steps.length; i++) {
  if (!runStep(steps[i][1], steps[i][0])) allOk = false;
}

console.log(allOk ? "\naudit:health — ALL PASSED" : "\naudit:health — FAILED");
process.exit(allOk ? 0 : 1);
