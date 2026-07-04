#!/usr/bin/env node
/**
 * Techon ERP — Device Authentication Engine Tests
 *
 * Run: node scripts/device-auth-engine.test.mjs
 * Optional PHP cross-check: php network-api/device_auth_selftest.php
 */
'use strict';

import crypto from 'crypto';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  bodyHashHex,
  buildSignString,
  computeSignature,
  generateDeviceId,
  generateDeviceSecret,
  generateNonce,
  pathFromUrl,
  signHttpRequest,
  signWsAuth,
  verifySignature,
} from '../device-crypto.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(name) {
  passed++;
  console.log('  PASS  ' + name);
}

function fail(name, detail) {
  failed++;
  console.log('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
}

function assert(cond, name, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

console.log('\n=== Device Auth Engine Tests ===\n');

/* ── 1. Canonical string / HMAC parity ───────────────────────────── */
const secret = generateDeviceSecret();
const method = 'POST';
const reqPath = '/api/sync_patch.php';
const ts = '1700000000';
const nonce = generateNonce();
const body = '{"patches":[]}';
const hash = bodyHashHex(body);
const sig = computeSignature(secret, method, reqPath, ts, nonce, hash);

assert(
  buildSignString(method, reqPath, ts, nonce, hash) === 'POST\n/api/sync_patch.php\n1700000000\n' + nonce + '\n' + hash,
  'Canonical sign string format'
);
assert(sig.length === 64 && /^[0-9a-f]+$/.test(sig), 'HMAC-SHA256 hex signature');

/* ── 2. signHttpRequest headers ───────────────────────────────────── */
const url = 'http://192.168.1.10/api/sync_patch.php';
const headers = signHttpRequest({
  method: 'POST',
  url,
  body,
  deviceId: generateDeviceId(),
  deviceSecret: secret,
});

assert(!!headers['X-TC-DEVICE-ID'], 'signHttpRequest sets X-TC-DEVICE-ID');
assert(!!headers['X-TC-TIMESTAMP'], 'signHttpRequest sets X-TC-TIMESTAMP');
assert(!!headers['X-TC-NONCE'], 'signHttpRequest sets X-TC-NONCE');
assert(!!headers['X-TC-SIGNATURE'], 'signHttpRequest sets X-TC-SIGNATURE');

const verifyOk = verifySignature({
  deviceId: headers['X-TC-DEVICE-ID'],
  deviceSecret: secret,
  method: 'POST',
  path: pathFromUrl(url),
  body,
  timestamp: headers['X-TC-TIMESTAMP'],
  nonce: headers['X-TC-NONCE'],
  signature: headers['X-TC-SIGNATURE'],
});
assert(verifyOk.ok, 'verifySignature accepts valid request', verifyOk.reason);

/* ── 3. Wrong signature rejected ─────────────────────────────────── */
const badSig = verifySignature({
  deviceId: headers['X-TC-DEVICE-ID'],
  deviceSecret: secret,
  method: 'POST',
  path: pathFromUrl(url),
  body: '{"tampered":true}',
  timestamp: headers['X-TC-TIMESTAMP'],
  nonce: headers['X-TC-NONCE'],
  signature: headers['X-TC-SIGNATURE'],
});
assert(!badSig.ok && badSig.reason === 'invalid_signature', 'Reject modified body');

/* ── 4. Timestamp skew ───────────────────────────────────────────── */
const oldTs = verifySignature({
  deviceId: headers['X-TC-DEVICE-ID'],
  deviceSecret: secret,
  method: 'GET',
  path: '/api/server_state.php',
  body: '',
  timestamp: '1000000000',
  nonce: generateNonce(),
  signature: computeSignature(secret, 'GET', '/api/server_state.php', '1000000000', generateNonce(), bodyHashHex('')),
});
assert(!oldTs.ok && oldTs.reason === 'timestamp_skew', 'Reject old timestamp');

/* ── 5. WebSocket auth payload ───────────────────────────────────── */
const wsMsg = signWsAuth({
  deviceId: generateDeviceId(),
  deviceSecret: secret,
  clientId: 'client_test_1',
  lastRevision: 5,
});
assert(wsMsg.type === 'auth' && !!wsMsg.signature, 'signWsAuth produces auth message');
assert(wsMsg.device_id && wsMsg.nonce && wsMsg.timestamp, 'WS auth has required fields');

const wsPayload = JSON.stringify({
  type: 'auth',
  device_id: wsMsg.device_id,
  timestamp: wsMsg.timestamp,
  nonce: wsMsg.nonce,
  client_id: wsMsg.client_id,
  last_revision: wsMsg.last_revision,
});
const wsVerify = verifySignature({
  deviceId: wsMsg.device_id,
  deviceSecret: secret,
  method: 'WS',
  path: '/ws',
  body: wsPayload,
  timestamp: wsMsg.timestamp,
  nonce: wsMsg.nonce,
  signature: wsMsg.signature,
});
assert(wsVerify.ok, 'WS auth signature verifies', wsVerify.reason);

/* ── 6. pathFromUrl with query string ────────────────────────────── */
assert(
  pathFromUrl('http://192.168.1.5/api/server_state.php?keys=tc3_sales') === '/api/server_state.php?keys=tc3_sales',
  'pathFromUrl preserves query string'
);

/* ── 7. Empty body hash ──────────────────────────────────────────── */
assert(bodyHashHex('') === crypto.createHash('sha256').update('').digest('hex'), 'Empty body SHA256');

/* ── 8. Device store module loads ────────────────────────────────── */
try {
  const { createDeviceStore } = await import('../device-store.cjs');
  const store = createDeviceStore(() => 'test-root-secret-32chars-minimum!!');
  const tmpDir = path.join(root, 'node_modules', '.cache', 'tc-device-test');
  const id = store.createLocalDeviceIdentity('Test Counter', 'PC-01', '2.0.2');
  assert(!!id.device_id && !!id.device_secret && id.status === 'pending', 'createLocalDeviceIdentity');
  assert(store.saveDeviceCredentials(tmpDir, { ...id, status: 'approved' }), 'saveDeviceCredentials');
  const loaded = store.loadDeviceCredentials(tmpDir);
  assert(loaded && loaded.device_secret === id.device_secret, 'loadDeviceCredentials round-trip');
  assert(!loaded.device_secret.includes('plaintext'), 'Stored encrypted not plaintext file');
  store.clearDeviceCredentials(tmpDir);
} catch (e) {
  fail('device-store module', e.message);
}

/* ── 9. PHP cross-check (if php available) ─────────────────────── */
const phpScript = path.join(root, 'network-api', 'device_auth_selftest.php');
const phpRun = spawnSync('php', [phpScript], { encoding: 'utf8', cwd: root });
if (phpRun.error && phpRun.error.code === 'ENOENT') {
  pass('PHP selftest skipped (php not in PATH)');
} else if (phpRun.status === 0) {
  pass('PHP device_auth_selftest.php');
} else {
  fail('PHP device_auth_selftest.php', (phpRun.stderr || phpRun.stdout || '').trim().slice(0, 200));
}

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
