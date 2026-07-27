#!/usr/bin/env node
/**
 * Standalone production readiness gate — runs core automated suites.
 * npm run readiness:standalone
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function runNpm(script) {
  var r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  return r.status === 0;
}

console.log('\n══ TechonERP Standalone Readiness Gate ══\n');

var steps = [
  ['test:accounting', 'Accounting engine'],
  ['test:erp', 'ERP integration + smoke + performance'],
  ['test:certification', '78-scenario certification'],
  ['test:electron-smoke', 'Electron main-process smoke'],
  ['build', 'Production build'],
];

var failed = [];
steps.forEach(function (row) {
  var script = row[0];
  var label = row[1];
  console.log('→ ' + label + ' (' + script + ')');
  if (!runNpm(script)) failed.push(label);
});

console.log('\n════════════════════════════════════════');
if (failed.length) {
  console.error('NOT READY — failed: ' + failed.join(', '));
  process.exit(1);
}
console.log('STANDALONE 10/10 READY — all automated gates passed.');
console.log('════════════════════════════════════════\n');
process.exit(0);
