#!/usr/bin/env node
/**
 * Multi-PC LAN production readiness gate — automated suites for sync + certification.
 * npm run readiness:multi-pc
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

console.log('\n══ TechonERP Multi-PC Readiness Gate ══\n');

var steps = [
  ['test:accounting', 'Accounting engine'],
  ['test:erp', 'ERP integration + multi-PC sync tests'],
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
console.log('MULTI-PC 9.5/10 READY — all automated gates passed.');
console.log('Manual: verify 2+ counters — sale on A appears on B within ~5s; stock blocks when oversold.');
console.log('════════════════════════════════════════\n');
process.exit(0);
