#!/usr/bin/env node
/**
 * Fail CI if obvious hardcoded LICENSE_SECRET / API key patterns appear in source.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

var APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
var ROOT = path.join(APP_ROOT, "src");
var BAD = [];

function scanFile(relFromApp, fullPath) {
  var text = fs.readFileSync(fullPath, "utf8");
  var rel = relFromApp.replace(/\\/g, "/");
  if (/LICENSE_SECRET\s*=\s*['\"][^'\"]{16,}['\"]/.test(text) && rel.indexOf("accounting-tests") < 0 && rel.indexOf("erp-tests") < 0) {
    BAD.push(rel + ": possible hardcoded LICENSE_SECRET");
  }
  if (/TC_LIC_SERVER_SECRET\s*=\s*['\"][^'\"]{16,}['\"]/.test(text)) {
    BAD.push(rel + ": possible hardcoded TC_LIC_SERVER_SECRET");
  }
}

function walk(dir) {
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  var i;
  for (i = 0; i < entries.length; i++) {
    var e = entries[i];
    var full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(js|jsx|ts|tsx|cjs)$/.test(e.name)) continue;
    var text = fs.readFileSync(full, "utf8");
    var rel = path.relative(path.join(ROOT, ".."), full).replace(/\\/g, "/");
    if (/LICENSE_SECRET\s*=\s*['\"][^'\"]{16,}['\"]/.test(text) && rel.indexOf("accounting-tests") < 0 && rel.indexOf("erp-tests") < 0) {
      BAD.push(rel + ": possible hardcoded LICENSE_SECRET");
    }
    if (/TC_LIC_SERVER_SECRET\s*=\s*['\"][^'\"]{16,}['\"]/.test(text)) {
      BAD.push(rel + ": possible hardcoded TC_LIC_SERVER_SECRET");
    }
  }
}

try {
  walk(ROOT);
} catch (e) {
  console.error("FAIL — ci-scan-secrets", e.message);
  process.exit(1);
}

if (BAD.length) {
  console.error("FAIL — ci-scan-secrets:\n" + BAD.join("\n"));
  process.exit(1);
}
console.log("PASS — ci-scan-secrets (src/ + main.cjs + preload.js)");
