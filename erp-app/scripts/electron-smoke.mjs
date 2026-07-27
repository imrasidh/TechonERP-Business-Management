#!/usr/bin/env node
/**
 * Main-process smoke test via Electron (no UI). npm run test:electron-smoke
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const electronCli = path.join(appRoot, 'node_modules', 'electron', 'cli.js');

const child = spawn(process.execPath, [electronCli, appRoot, '--run-smoke'], {
  cwd: appRoot,
  stdio: 'inherit',
  env: Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: undefined,
  }),
});

child.on('exit', function (code) {
  process.exit(code == null ? 1 : code);
});

child.on('error', function (err) {
  console.error('electron-smoke spawn failed:', err.message);
  process.exit(1);
});
