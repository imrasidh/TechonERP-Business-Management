/**
 * Techon ERP — LAN Device Authentication Engine (Node.js)
 *
 * Shared HMAC-SHA256 signing used by Electron main process, WebSocket client,
 * and automated tests. Must stay in sync with network-api/device_auth.php.
 */
'use strict';

const crypto = require('crypto');

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[0-9a-f]{32,64}$/i;
const TIMESTAMP_SKEW_SEC = 300;

function bodyHashHex(rawBody) {
  const buf = rawBody == null ? '' : (Buffer.isBuffer(rawBody) ? rawBody : String(rawBody));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function buildSignString(method, path, timestamp, nonce, bodyHash) {
  return String(method).toUpperCase() + '\n'
    + String(path) + '\n'
    + String(timestamp) + '\n'
    + String(nonce) + '\n'
    + String(bodyHash);
}

function computeSignature(secret, method, path, timestamp, nonce, bodyHash) {
  const payload = buildSignString(method, path, timestamp, nonce, bodyHash);
  return crypto.createHmac('sha256', String(secret)).update(payload).digest('hex');
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function generateDeviceSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function generateDeviceId() {
  return crypto.randomUUID();
}

function generateTokenId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Extract path + query from full URL (must match PHP REQUEST_URI path).
 */
function pathFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch (_e) {
    const s = String(url || '');
    const slash = s.indexOf('/', s.indexOf('://') + 3);
    if (slash >= 0) return s.slice(slash);
    return s.startsWith('/') ? s : '/' + s;
  }
}

/**
 * Build auth headers for an HTTP request.
 * @param {{ method: string, url: string, body?: string|Buffer, deviceId: string, deviceSecret: string }} opts
 */
function signHttpRequest(opts) {
  const method = String(opts.method || 'GET').toUpperCase();
  const path = pathFromUrl(opts.url);
  const body = opts.body == null ? '' : opts.body;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = generateNonce();
  const hash = bodyHashHex(body);
  const signature = computeSignature(opts.deviceSecret, method, path, timestamp, nonce, hash);

  return {
    'X-TC-DEVICE-ID': String(opts.deviceId),
    'X-TC-TIMESTAMP': timestamp,
    'X-TC-NONCE': nonce,
    'X-TC-SIGNATURE': signature,
  };
}

/**
 * Build WebSocket auth message body fields.
 */
function signWsAuth(opts) {
  const deviceId = String(opts.deviceId);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = generateNonce();
  const clientId = String(opts.clientId || '').slice(0, 128);
  const lastRevision = opts.lastRevision != null ? parseInt(opts.lastRevision, 10) : 0;

  const wsPayload = JSON.stringify({
    type: 'auth',
    device_id: deviceId,
    timestamp: timestamp,
    nonce: nonce,
    client_id: clientId,
    last_revision: isNaN(lastRevision) || lastRevision < 0 ? 0 : lastRevision,
  });

  const signature = computeSignature(
    opts.deviceSecret,
    'WS',
    '/ws',
    timestamp,
    nonce,
    bodyHashHex(wsPayload)
  );

  return {
    type: 'auth',
    device_id: deviceId,
    timestamp: timestamp,
    nonce: nonce,
    signature: signature,
    client_id: clientId,
    last_revision: isNaN(lastRevision) || lastRevision < 0 ? 0 : lastRevision,
    apiKey: opts.apiKey || '',
  };
}

/**
 * Verify signature (for tests and optional server-side Node validation).
 */
function verifySignature(opts) {
  const method = String(opts.method || 'GET').toUpperCase();
  const path = opts.path || pathFromUrl(opts.url || '/');
  const body = opts.body == null ? '' : opts.body;
  const timestamp = String(opts.timestamp);
  const nonce = String(opts.nonce);
  const signature = String(opts.signature || '').toLowerCase();
  const secret = String(opts.deviceSecret);

  if (!DEVICE_ID_RE.test(String(opts.deviceId || ''))) {
    return { ok: false, reason: 'invalid_device_id' };
  }
  if (!NONCE_RE.test(nonce)) {
    return { ok: false, reason: 'invalid_nonce' };
  }
  if (!/^\d+$/.test(timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_SKEW_SEC) {
    return { ok: false, reason: 'timestamp_skew' };
  }

  const expected = computeSignature(secret, method, path, timestamp, nonce, bodyHashHex(body));
  const sigBuf = Buffer.from(signature.length === 64 ? signature : '', 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== 32 || !crypto.timingSafeEqual(expBuf, sigBuf)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true, reason: null };
}

module.exports = {
  DEVICE_ID_RE,
  NONCE_RE,
  TIMESTAMP_SKEW_SEC,
  bodyHashHex,
  buildSignString,
  computeSignature,
  generateNonce,
  generateDeviceSecret,
  generateDeviceId,
  generateTokenId,
  pathFromUrl,
  signHttpRequest,
  signWsAuth,
  verifySignature,
};
