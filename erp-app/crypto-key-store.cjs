'use strict';

/**
 * Windows DPAPI-backed local encryption key storage (Electron safeStorage).
 * Falls back to plaintext file mode 0o600 when OS encryption unavailable.
 */

const fs = require('fs');
const path = require('path');

const DPAPI_MAGIC = Buffer.from('TCENC1');

function isEncryptionAvailable(safeStorage) {
  try {
    return !!(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
  } catch (_e) {
    return false;
  }
}

function readLocalEncKeyFile(keyPath, safeStorage) {
  if (!keyPath || !fs.existsSync(keyPath)) return null;
  var buf = fs.readFileSync(keyPath);
  if (buf.length > DPAPI_MAGIC.length && buf.slice(0, DPAPI_MAGIC.length).equals(DPAPI_MAGIC)) {
    if (!isEncryptionAvailable(safeStorage)) return null;
    try {
      var dec = safeStorage.decryptString(buf.slice(DPAPI_MAGIC.length));
      return dec && String(dec).length >= 16 ? String(dec) : null;
    } catch (_e) {
      return null;
    }
  }
  var plain = buf.toString('utf8').trim();
  return plain.length >= 16 ? plain : null;
}

function writeLocalEncKeyFile(keyPath, secret, safeStorage) {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  if (isEncryptionAvailable(safeStorage)) {
    var enc = safeStorage.encryptString(String(secret));
    fs.writeFileSync(keyPath, Buffer.concat([DPAPI_MAGIC, enc]), { mode: 0o600 });
    return 'dpapi';
  }
  fs.writeFileSync(keyPath, String(secret), { mode: 0o600 });
  return 'plain';
}

/** Migrate plaintext key file to DPAPI when available. */
function migratePlaintextKeyToDpapi(keyPath, safeStorage) {
  if (!keyPath || !fs.existsSync(keyPath)) return false;
  var buf = fs.readFileSync(keyPath);
  if (buf.length > DPAPI_MAGIC.length && buf.slice(0, DPAPI_MAGIC.length).equals(DPAPI_MAGIC)) return false;
  if (!isEncryptionAvailable(safeStorage)) return false;
  var plain = buf.toString('utf8').trim();
  if (plain.length < 16) return false;
  writeLocalEncKeyFile(keyPath, plain, safeStorage);
  return true;
}

module.exports = {
  readLocalEncKeyFile,
  writeLocalEncKeyFile,
  migratePlaintextKeyToDpapi,
  isEncryptionAvailable,
};
