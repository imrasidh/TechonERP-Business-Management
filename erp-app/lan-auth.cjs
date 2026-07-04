/**
 * Techon ERP — LAN request auth header builder (main process).
 *
 * Prefers approved device credentials; falls back to legacy X-TC-KEY.
 */
'use strict';

const { signHttpRequest } = require('./device-crypto.cjs');

/**
 * @param {{ method: string, url: string, body?: string|object, networkConfig?: object, deviceStore?: object, userDataPath?: string, extraHeaders?: object }} opts
 */
function buildLanAuthHeaders(opts) {
  const cfg = opts.networkConfig || {};
  const extra = Object.assign({}, opts.extraHeaders || {});
  const method = String(opts.method || 'GET').toUpperCase();
  let bodyStr = '';
  if (opts.body != null) {
    bodyStr = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  const store = opts.deviceStore;
  const userDataPath = opts.userDataPath;
  if (!opts.forceLegacy && store && userDataPath) {
    const creds = store.loadDeviceCredentials(userDataPath);
    if (creds && creds.device_id && creds.device_secret && creds.status === 'approved') {
      const deviceHeaders = signHttpRequest({
        method,
        url: opts.url,
        body: bodyStr,
        deviceId: creds.device_id,
        deviceSecret: creds.device_secret,
      });
      return Object.assign({}, deviceHeaders, extra, { _authMode: 'device' });
    }
  }

  if (cfg.apiKey) {
    return Object.assign({ 'X-TC-KEY': cfg.apiKey }, extra, { _authMode: 'legacy' });
  }

  return Object.assign({}, extra, { _authMode: 'none' });
}

function stripInternalHeaders(headers) {
  const out = Object.assign({}, headers || {});
  delete out._authMode;
  return out;
}

module.exports = {
  buildLanAuthHeaders,
  stripInternalHeaders,
};
