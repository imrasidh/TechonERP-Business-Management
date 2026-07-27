'use strict';

/**
 * Headless main-process checks (invoked from main.cjs with --run-smoke).
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeBackupContent } = require('../backup-sanitize.cjs');
const keyStore = require('../crypto-key-store.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function runCryptoRoundtrip(getSecret, encryptData, decryptData) {
  var secret = getSecret();
  assert(secret && secret.length >= 16, 'crypto root secret');
  var sample = { ok: true, ts: Date.now(), nested: { a: 1 } };
  var enc = encryptData(sample);
  assert(enc && typeof enc === 'string', 'encryptData');
  var dec = decryptData(enc);
  assert(dec && dec.ok === true && dec.nested.a === 1, 'decryptData roundtrip');
}

function runBackupSanitizeSmoke() {
  var raw = JSON.stringify({
    version: 2,
    data: {
      tc3_settings: { shopName: 'Smoke' },
      tc3_sales: [{ id: '1', total: 10 }],
      tc3_apppass: 'secret-should-strip',
    },
  });
  var out = sanitizeBackupContent(raw);
  var parsed = JSON.parse(out);
  assert(parsed.data && parsed.data.tc3_settings, 'sanitize keeps settings');
  assert(parsed.data.tc3_apppass === undefined, 'sanitize strips apppass');
}

function runDpapiKeySmoke(safeStorage) {
  var tmp = path.join(os.tmpdir(), 'tc-smoke-key-' + Date.now() + '.key');
  try {
    var rnd = crypto.randomBytes(32).toString('base64');
    var mode = keyStore.writeLocalEncKeyFile(tmp, rnd, safeStorage);
    assert(mode === 'dpapi' || mode === 'plain', 'key write mode');
    var readBack = keyStore.readLocalEncKeyFile(tmp, safeStorage);
    assert(readBack === rnd, 'key read roundtrip');
    if (mode === 'plain' && keyStore.isEncryptionAvailable(safeStorage)) {
      keyStore.migratePlaintextKeyToDpapi(tmp, safeStorage);
      assert(keyStore.readLocalEncKeyFile(tmp, safeStorage) === rnd, 'dpapi migration');
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
  }
}

function runMainProcessSmoke(deps) {
  deps = deps || {};
  var safeStorage = deps.safeStorage || null;
  var getSecret = deps.getCryptoRootSecret;
  var encryptData = deps.encryptData;
  var decryptData = deps.decryptData;

  console.log('PASS — smoke: backup sanitize');
  runBackupSanitizeSmoke();

  console.log('PASS — smoke: crypto roundtrip');
  runCryptoRoundtrip(getSecret, encryptData, decryptData);

  console.log('PASS — smoke: local key store (' + (keyStore.isEncryptionAvailable(safeStorage) ? 'DPAPI' : 'plain') + ')');
  runDpapiKeySmoke(safeStorage);

  console.log('\nMain-process smoke: ALL PASSED');
  return true;
}

module.exports = { runMainProcessSmoke };
