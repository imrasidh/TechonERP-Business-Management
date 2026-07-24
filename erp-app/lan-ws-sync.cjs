/**
 * TechonERP — LAN WebSocket sync (main process)
 * Push notifications when kv_store changes; complements HTTP polling in SyncEngine.
 *
 * Reliability features: heartbeat, batching, message IDs, validation, health metrics (debug logs).
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const { signWsAuth } = require('./device-crypto.cjs');

const DEFAULT_WS_PORT = 9876;
const AUTH_TIMEOUT_MS = 15000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_DEAD_MS = 45000;
const BATCH_WINDOW_MS = 150;
const MAX_MESSAGE_BYTES = 65536;
const MAX_KEYS_PER_NOTIFY = 64;
const MAX_PROCESSED_MSG_IDS = 512;
const CLIENT_MSG_TYPES = { auth: 1, ping: 1, notify: 1 };
const SERVER_MSG_TYPES = { auth_ok: 1, auth_fail: 1, pong: 1, kv_changed: 1, sync_catchup: 1 };

let wss = null;
let wsClient = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let revision = 0;
let wsStatus = 'disconnected';
let activeRole = null;
let activeCfg = null;
let lastKnownRevision = 0;
let lastEmittedRevision = 0;
let processedMsgIds = new Map();
let getMainWindow = function () { return null; };
let logFn = function () {};
let wsDeviceValidatorFn = null;

let serverHeartbeatTimer = null;
let clientHeartbeatTimer = null;
let clientHeartbeatWatchdog = null;
let batchTimer = null;
let batchKeys = Object.create(null);
let batchSourceClientId = '';

const health = {
  lastMessageAt: null,
  lastPongAt: null,
  lastPingSentAt: null,
  lastPingLatencyMs: null,
  lastReconnectAt: null,
  totalReconnects: 0,
  lastAuthAt: null,
};

function setMainWindowGetter(fn) {
  getMainWindow = typeof fn === 'function' ? fn : function () { return null; };
}

function setLogFn(fn) {
  logFn = typeof fn === 'function' ? fn : function () {};
}

function logHealth(context) {
  logFn('debug', '[LanWS:health] ' + context + ' ' + JSON.stringify({
    status: wsStatus,
    role: activeRole,
    revision: revision,
    lastKnownRevision: lastKnownRevision,
    lastEmittedRevision: lastEmittedRevision,
    reconnectAttempt: reconnectAttempt,
    totalReconnects: health.totalReconnects,
    lastPingLatencyMs: health.lastPingLatencyMs,
    lastMessageAt: health.lastMessageAt,
    lastPongAt: health.lastPongAt,
    lastReconnectAt: health.lastReconnectAt,
    lastAuthAt: health.lastAuthAt,
  }));
}

function getWsPort(cfg) {
  const p = parseInt(cfg && cfg.wsPort, 10);
  return p >= 1024 && p <= 65535 ? p : DEFAULT_WS_PORT;
}

function parseHostFromApiUrl(apiUrl) {
  try {
    return new URL(String(apiUrl || '')).hostname || '127.0.0.1';
  } catch (_e) {
    return '127.0.0.1';
  }
}

function newMsgId(prefix) {
  return String(prefix || 'ws') + '_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function rememberMsgId(msgId) {
  if (!msgId) return;
  processedMsgIds.set(msgId, Date.now());
  if (processedMsgIds.size <= MAX_PROCESSED_MSG_IDS) return;
  var oldestKey = null;
  var oldestTs = Infinity;
  processedMsgIds.forEach(function (ts, id) {
    if (ts < oldestTs) { oldestTs = ts; oldestKey = id; }
  });
  if (oldestKey) processedMsgIds.delete(oldestKey);
}

function hasProcessedMsgId(msgId) {
  return !!(msgId && processedMsgIds.has(msgId));
}

function sanitizeKeys(keys) {
  if (!Array.isArray(keys)) return [];
  var out = [];
  for (var i = 0; i < keys.length && out.length < MAX_KEYS_PER_NOTIFY; i++) {
    var k = keys[i];
    if (typeof k === 'string' && k.indexOf('tc3_') === 0) out.push(k);
  }
  return out;
}

function parseInboundMessage(raw, allowedTypes) {
  if (raw == null) return null;
  var str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  if (str.length > MAX_MESSAGE_BYTES) {
    logFn('warn', '[LanWS] Rejected oversized message (' + str.length + ' bytes)');
    return null;
  }
  var msg;
  try { msg = JSON.parse(str); } catch (e) {
    logFn('warn', '[LanWS] Malformed JSON: ' + (e && e.message ? e.message : String(e)));
    return null;
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    logFn('warn', '[LanWS] Rejected non-object message');
    return null;
  }
  if (typeof msg.type !== 'string' || !allowedTypes[msg.type]) {
    logFn('warn', '[LanWS] Rejected invalid message type: ' + String(msg.type));
    return null;
  }
  health.lastMessageAt = new Date().toISOString();
  return msg;
}

function emitStatus(extra) {
  var win = getMainWindow();
  var payload = Object.assign({ status: wsStatus, role: activeRole || '' }, extra || {});
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('tc-ws-status', payload); } catch (e) {
      logFn('warn', '[LanWS] emitStatus failed: ' + (e && e.message ? e.message : String(e)));
    }
  }
}

function emitKvChanged(payload) {
  if (!payload || !payload.msg_id) return;
  if (hasProcessedMsgId(payload.msg_id)) return;
  if (payload.revision && payload.revision < lastEmittedRevision) return;
  rememberMsgId(payload.msg_id);
  if (payload.revision) {
    lastEmittedRevision = Math.max(lastEmittedRevision, payload.revision);
    lastKnownRevision = lastEmittedRevision;
  }
  var win = getMainWindow();
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('tc-ws-kv-changed', payload); } catch (e) {
      logFn('warn', '[LanWS] emitKvChanged failed: ' + (e && e.message ? e.message : String(e)));
    }
  }
}

function emitSyncCatchup(reason, fromRev, toRev) {
  var msgId = newMsgId('catchup');
  var payload = {
    type: 'sync_catchup',
    msg_id: msgId,
    needs_full_sync: true,
    reason: reason || 'reconnect',
    from_revision: fromRev,
    to_revision: toRev,
    revision: toRev,
    server_time: new Date().toISOString(),
  };
  rememberMsgId(msgId);
  lastEmittedRevision = Math.max(lastEmittedRevision, toRev || 0);
  lastKnownRevision = lastEmittedRevision;
  emitStatus({ needsFullSync: true, fromRevision: fromRev, toRevision: toRev });
  var win = getMainWindow();
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('tc-ws-kv-changed', payload); } catch (e) {
      logFn('warn', '[LanWS] emitSyncCatchup failed: ' + (e && e.message ? e.message : String(e)));
    }
  }
  logFn('info', '[LanWS] Sync catchup requested (' + reason + ') rev ' + fromRev + ' -> ' + toRev);
  logHealth('sync_catchup');
}

function setStatus(st, extra) {
  wsStatus = st;
  emitStatus(extra);
}

/** Avoid uncaught errors when tearing down or abandoning sockets (CONNECTING / timeout). */
function safeCloseSocket(ws, reason) {
  if (!ws) return;
  var noop = function () {};
  try { ws.on('error', noop); } catch (_e0) {}
  ws._tcAbandoned = true;
  var state = ws.readyState;
  try {
    if (state === WebSocket.CONNECTING) {
      var raw = ws._socket;
      if (raw && typeof raw.destroy === 'function') {
        raw.destroy();
      }
    } else if (state === WebSocket.OPEN) {
      try {
        ws.close(1000, reason || 'shutdown');
      } catch (_e2) {
        var rawOpen = ws._socket;
        if (rawOpen && typeof rawOpen.destroy === 'function') rawOpen.destroy();
      }
    }
  } catch (e) {
    logFn('warn', '[LanWS] safeCloseSocket: ' + (e && e.message ? e.message : String(e)));
  }
  try {
    ws.removeAllListeners('open');
    ws.removeAllListeners('message');
    ws.removeAllListeners('close');
    ws.removeAllListeners('unexpected-response');
    ws.removeAllListeners('upgrade');
  } catch (_e3) {}
  try { ws.on('error', noop); } catch (_e4) {}
}

function clearBatchState() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  batchKeys = Object.create(null);
  batchSourceClientId = '';
}

function clearServerHeartbeat() {
  if (serverHeartbeatTimer) {
    clearInterval(serverHeartbeatTimer);
    serverHeartbeatTimer = null;
  }
}

function clearClientHeartbeat() {
  if (clientHeartbeatTimer) {
    clearInterval(clientHeartbeatTimer);
    clientHeartbeatTimer = null;
  }
  if (clientHeartbeatWatchdog) {
    clearInterval(clientHeartbeatWatchdog);
    clientHeartbeatWatchdog = null;
  }
}

function stopServer() {
  clearServerHeartbeat();
  clearBatchState();
  if (wss) {
    try {
      wss.clients.forEach(function (c) {
        safeCloseSocket(c, 'server_shutdown');
      });
      wss.close();
    } catch (e) {
      logFn('warn', '[LanWS] stopServer error: ' + (e && e.message ? e.message : String(e)));
    }
    wss = null;
  }
}

function stopClient() {
  clearClientHeartbeat();
  if (wsClient) {
    var sock = wsClient;
    wsClient = null;
    safeCloseSocket(sock, 'client_shutdown');
  }
}

function stopAll() {
  activeRole = null;
  activeCfg = null;
  reconnectAttempt = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopClient();
  stopServer();
  if (wsStatus !== 'disconnected') setStatus('disconnected');
  logHealth('stopAll');
}

function scheduleClientReconnect() {
  if (!activeCfg || activeRole !== 'network_client') return;
  if (reconnectTimer) return;
  var delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, reconnectAttempt));
  reconnectAttempt++;
  health.totalReconnects++;
  health.lastReconnectAt = new Date().toISOString();
  /* Between retries show disconnected — HTTP polling is active; avoids permanent "Reconnecting" label */
  setStatus('disconnected', { attempt: reconnectAttempt, nextMs: delay, wsFallback: true });
  logHealth('schedule_reconnect');
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    startClient(activeCfg, true);
  }, delay);
}

function startServerHeartbeat() {
  clearServerHeartbeat();
  serverHeartbeatTimer = setInterval(function () {
    if (!wss) return;
    wss.clients.forEach(function (ws) {
      if (!ws._authenticated) return;
      if (ws.isAlive === false) {
        logFn('warn', '[LanWS] Terminating unresponsive client ' + (ws._clientId || ''));
        safeCloseSocket(ws, 'heartbeat_timeout');
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {
        logFn('warn', '[LanWS] Server ping failed: ' + (e && e.message ? e.message : String(e)));
      }
    });
  }, HEARTBEAT_INTERVAL_MS);
}

function startClientHeartbeat() {
  clearClientHeartbeat();
  health.lastPongAt = Date.now();
  clientHeartbeatTimer = setInterval(function () {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN || !wsClient._authenticated) return;
    health.lastPingSentAt = Date.now();
    try {
      wsClient.send(JSON.stringify({ type: 'ping', ts: health.lastPingSentAt }));
    } catch (e) {
      logFn('warn', '[LanWS] Client ping send failed: ' + (e && e.message ? e.message : String(e)));
      if (wsClient) safeCloseSocket(wsClient, 'ping_failed');
    }
  }, HEARTBEAT_INTERVAL_MS);

  clientHeartbeatWatchdog = setInterval(function () {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN || !wsClient._authenticated) return;
    var last = health.lastPongAt || 0;
    if (Date.now() - last > HEARTBEAT_DEAD_MS) {
      logFn('warn', '[LanWS] Heartbeat timeout — reconnecting');
      logHealth('heartbeat_timeout');
      if (wsClient) safeCloseSocket(wsClient, 'heartbeat_timeout');
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function setWsDeviceValidator(fn) {
  wsDeviceValidatorFn = typeof fn === 'function' ? fn : null;
}

function completeWsAuth(ws, msg, clientId) {
  ws._authenticated = true;
  ws._clientId = clientId || String(msg.client_id || msg.clientId || '').slice(0, 128);
  ws.isAlive = true;
  health.lastAuthAt = new Date().toISOString();
  try {
    ws.send(JSON.stringify({
      type: 'auth_ok',
      msg_id: newMsgId('auth_ok'),
      revision: revision,
      server_time: new Date().toISOString(),
    }));
  } catch (e) {
    logFn('warn', '[LanWS] auth_ok send failed: ' + (e && e.message ? e.message : String(e)));
  }
  logFn('info', '[LanWS] Client authenticated' + (ws._clientId ? (': ' + ws._clientId) : ''));
  logHealth('client_authenticated');
  var clientLastRev = parseInt(msg.last_revision, 10);
  if (isNaN(clientLastRev) || clientLastRev < 0) clientLastRev = 0;
  if (clientLastRev < revision) {
    logFn('info', '[LanWS] Client behind revision (' + clientLastRev + ' < ' + revision + ')');
  }
}

function handleAuthMessage(ws, msg, expectedKey, authTimer) {
  if (msg.type !== 'auth') return false;
  var clientId = String(msg.client_id || msg.clientId || '').slice(0, 128);
  var clientLastRev = parseInt(msg.last_revision, 10);
  if (isNaN(clientLastRev) || clientLastRev < 0) clientLastRev = 0;

  var allowLegacy = process.env.TECHON_ERP_ALLOW_LEGACY_SYNC === '1';

  function finishLegacyAuth() {
    if (!allowLegacy) {
      try {
        ws.send(JSON.stringify({
          type: 'auth_fail',
          message: 'Legacy API key WebSocket auth disabled — use device credentials (or set TECHON_ERP_ALLOW_LEGACY_SYNC=1)',
          msg_id: newMsgId('auth_fail'),
        }));
      } catch (_e) {}
      try { safeCloseSocket(ws, 'auth_fail'); } catch (_e2) {}
      logFn('warn', '[LanWS] Legacy key auth rejected (migration flag off)');
      return;
    }
    var key = String(msg.apiKey || '');
    if (!key || key !== String(expectedKey || '')) {
      try {
        ws.send(JSON.stringify({ type: 'auth_fail', message: 'Invalid API key', msg_id: newMsgId('auth_fail') }));
      } catch (_e) {}
      try { safeCloseSocket(ws, 'auth_fail'); } catch (_e2) {}
      logFn('warn', '[LanWS] Auth rejected for client');
      return;
    }
    if (authTimer) clearTimeout(authTimer);
    completeWsAuth(ws, msg, clientId);
  }

  if (msg.device_id && msg.signature && wsDeviceValidatorFn) {
    wsDeviceValidatorFn(msg).then(function (result) {
      if (ws._authenticated || ws._tcAbandoned) return;
      if (result && result.ok) {
        if (authTimer) clearTimeout(authTimer);
        completeWsAuth(ws, msg, result.client_id || clientId);
      } else if (msg.apiKey && allowLegacy) {
        logFn('warn', '[LanWS] Device WS auth failed (' + ((result && result.message) || '?') + '), trying legacy key');
        finishLegacyAuth();
      } else {
        try {
          ws.send(JSON.stringify({
            type: 'auth_fail',
            message: (result && result.message) || 'Invalid device credentials',
            msg_id: newMsgId('auth_fail'),
          }));
        } catch (_e) {}
        try { safeCloseSocket(ws, 'auth_fail'); } catch (_e2) {}
        logFn('warn', '[LanWS] Device auth rejected');
      }
    }).catch(function (e) {
      logFn('warn', '[LanWS] Device auth error: ' + (e && e.message ? e.message : String(e)));
      if (msg.apiKey && allowLegacy) finishLegacyAuth();
      else try { safeCloseSocket(ws, 'auth_error'); } catch (_e2) {}
    });
    return true;
  }

  finishLegacyAuth();
  return true;
}

function flushBroadcastBatch() {
  batchTimer = null;
  var keys = Object.keys(batchKeys);
  var source = batchSourceClientId;
  batchKeys = Object.create(null);
  batchSourceClientId = '';
  if (!keys.length) return;
  broadcastAfterPatchImmediate(keys, source);
}

function queueBroadcast(keys, sourceClientId) {
  var safe = sanitizeKeys(keys);
  if (!safe.length) return;
  for (var i = 0; i < safe.length; i++) batchKeys[safe[i]] = true;
  if (sourceClientId) batchSourceClientId = String(sourceClientId);
  if (!batchTimer) {
    batchTimer = setTimeout(flushBroadcastBatch, BATCH_WINDOW_MS);
  }
}

function broadcastAfterPatchImmediate(keys, sourceClientId) {
  var safeKeys = sanitizeKeys(keys);
  if (!safeKeys.length) return;

  revision++;
  var payload = {
    type: 'kv_changed',
    msg_id: newMsgId('kv'),
    keys: safeKeys,
    revision: revision,
    source_client_id: String(sourceClientId || ''),
    server_time: new Date().toISOString(),
  };
  var raw = JSON.stringify(payload);

  if (wss) {
    wss.clients.forEach(function (client) {
      if (client.readyState === WebSocket.OPEN && client._authenticated) {
        try { client.send(raw); } catch (e) {
          logFn('warn', '[LanWS] Broadcast send failed: ' + (e && e.message ? e.message : String(e)));
        }
      }
    });
  }

  emitKvChanged(payload);
  logFn('info', '[LanWS] Broadcast revision=' + revision + ' msg_id=' + payload.msg_id + ' keys=[' + safeKeys.join(',') + ']');
  logHealth('broadcast');
}

function startServer(cfg) {
  stopServer();
  var port = getWsPort(cfg);
  var apiKey = cfg.apiKey || '';
  try {
    wss = new WebSocket.Server({ host: '0.0.0.0', port: port, clientTracking: true, maxPayload: MAX_MESSAGE_BYTES });
  } catch (e) {
    logFn('error', '[LanWS] Server start failed: ' + (e && e.message ? e.message : String(e)));
    setStatus('disconnected', { error: 'ws_server_failed' });
    return;
  }

  wss.on('listening', function () {
    logFn('info', '[LanWS] Server listening on port ' + port);
    setStatus('connected', { port: port, mode: 'server' });
    startServerHeartbeat();
    logHealth('server_listening');
  });

  wss.on('error', function (err) {
    logFn('error', '[LanWS] Server error: ' + (err && err.message ? err.message : String(err)));
  });

  wss.on('connection', function (ws) {
    ws._authenticated = false;
    ws.isAlive = true;
    ws.on('pong', function () { ws.isAlive = true; health.lastPongAt = Date.now(); });

    var authTimer = setTimeout(function () {
      if (!ws._authenticated) {
        logFn('warn', '[LanWS] Auth timeout — closing socket');
        try { ws.close(); } catch (_e) {}
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', function (raw) {
      var msg = parseInboundMessage(raw, ws._authenticated ? CLIENT_MSG_TYPES : { auth: 1 });
      if (!msg) return;
      if (!ws._authenticated) {
        if (handleAuthMessage(ws, msg, apiKey, authTimer)) return;
        return;
      }
      if (msg.type === 'ping') {
        if (typeof msg.ts === 'number') {
          health.lastPingLatencyMs = Math.max(0, Date.now() - msg.ts);
        }
        health.lastPongAt = Date.now();
        try {
          ws.send(JSON.stringify({
            type: 'pong',
            msg_id: newMsgId('pong'),
            ts: msg.ts,
            server_time: new Date().toISOString(),
          }));
        } catch (e) {
          logFn('warn', '[LanWS] pong send failed: ' + (e && e.message ? e.message : String(e)));
        }
        logHealth('server_pong');
        return;
      }
      if (msg.type === 'notify') {
        queueBroadcast(msg.keys, ws._clientId || msg.client_id || '');
      }
    });

    ws.on('error', function (err) {
      logFn('warn', '[LanWS] Client socket error: ' + (err && err.message ? err.message : String(err)));
    });

    ws.on('close', function () {
      clearTimeout(authTimer);
    });
  });
}

function startClient(cfg, isReconnect) {
  stopClient();
  var host = parseHostFromApiUrl(cfg.apiUrl);
  var port = getWsPort(cfg);
  var url = 'ws://' + host + ':' + port;
  var wasReconnect = !!isReconnect || reconnectAttempt > 0;
  setStatus('connecting', { url: url, reconnect: wasReconnect });

  var sock;
  try {
    sock = new WebSocket(url, { handshakeTimeout: 15000, maxPayload: MAX_MESSAGE_BYTES });
    wsClient = sock;
  } catch (e) {
    logFn('warn', '[LanWS] Client connect error: ' + (e && e.message ? e.message : String(e)));
    scheduleClientReconnect();
    return;
  }

  /* Attach error handler first — handshake timeout must never crash the main process */
  sock.on('error', function (err) {
    if (sock._tcAbandoned || wsClient !== sock) return;
    var msg = err && err.message ? err.message : String(err);
    logFn('warn', '[LanWS] Client error: ' + msg);
    logHealth('client_error');
  });

  sock.on('open', function () {
    if (sock._tcAbandoned || wsClient !== sock) return;
    try {
      var creds = cfg._deviceCreds;
      var authMsg;
      if (creds && creds.device_id && creds.device_secret && creds.status === 'approved') {
        authMsg = signWsAuth({
          deviceId: creds.device_id,
          deviceSecret: creds.device_secret,
          clientId: cfg._runtimeClientId || '',
          lastRevision: lastKnownRevision,
          apiKey: cfg.apiKey || '',
        });
      } else {
        authMsg = {
          type: 'auth',
          apiKey: cfg.apiKey || '',
          clientId: cfg._runtimeClientId || '',
          last_revision: lastKnownRevision,
        };
      }
      wsClient.send(JSON.stringify(authMsg));
    } catch (e) {
      logFn('warn', '[LanWS] Auth send failed: ' + (e && e.message ? e.message : String(e)));
      scheduleClientReconnect();
    }
  });

  sock.on('message', function (raw) {
    if (sock._tcAbandoned || wsClient !== sock) return;
    var msg = parseInboundMessage(raw, SERVER_MSG_TYPES);
    if (!msg) return;

    if (msg.type === 'auth_ok') {
      wsClient._authenticated = true;
      var serverRev = typeof msg.revision === 'number' ? msg.revision : revision;
      revision = Math.max(revision, serverRev);
      reconnectAttempt = 0;
      setStatus('connected', { url: url, mode: 'client', recovered: wasReconnect });
      startClientHeartbeat();
      logHealth('client_connected');

      var gap = lastKnownRevision < serverRev;
      if (wasReconnect || gap) {
        emitSyncCatchup(wasReconnect ? 'reconnect' : 'revision_gap', lastKnownRevision, serverRev);
      }
      return;
    }

    if (msg.type === 'auth_fail') {
      logFn('warn', '[LanWS] Auth rejected: ' + (msg.message || ''));
      safeCloseSocket(sock, 'auth_fail');
      setStatus('disconnected', { error: 'auth_fail' });
      scheduleClientReconnect();
      return;
    }

    if (msg.type === 'pong') {
      health.lastPongAt = Date.now();
      if (typeof msg.ts === 'number') {
        health.lastPingLatencyMs = Math.max(0, Date.now() - msg.ts);
      }
      logHealth('client_pong');
      return;
    }

    if (msg.type === 'sync_catchup') {
      emitSyncCatchup(msg.reason || 'server', msg.from_revision || lastKnownRevision, msg.to_revision || revision);
      return;
    }

    if (msg.type === 'kv_changed') {
      if (!msg.revision || !msg.msg_id) {
        logFn('warn', '[LanWS] Ignored kv_changed without revision/msg_id');
        return;
      }
      if (msg.revision < lastEmittedRevision) {
        logFn('debug', '[LanWS] Ignored out-of-order kv_changed rev=' + msg.revision);
        return;
      }
      if (hasProcessedMsgId(msg.msg_id)) {
        logFn('debug', '[LanWS] Ignored duplicate msg_id=' + msg.msg_id);
        return;
      }
      revision = Math.max(revision, msg.revision);
      emitKvChanged(msg);
    }
  });

  sock.on('close', function () {
    if (wsClient === sock) wsClient = null;
    clearClientHeartbeat();
    if (activeRole === 'network_client' && !reconnectTimer) {
      setStatus('disconnected');
      scheduleClientReconnect();
    }
  });
}

function restart(cfg, winGetter, logger) {
  if (typeof winGetter === 'function') setMainWindowGetter(winGetter);
  if (typeof logger === 'function') setLogFn(logger);

  var preservedRevision = lastKnownRevision;
  try {
    stopAll();
  } catch (e) {
    logFn('warn', '[LanWS] restart stopAll: ' + (e && e.message ? e.message : String(e)));
  }
  if (!cfg || !cfg.apiUrl || cfg.role === 'standalone') {
    setStatus('disconnected');
    return { ok: true, mode: 'off' };
  }

  activeCfg = cfg;
  activeRole = cfg.role;
  lastKnownRevision = typeof cfg._lastKnownRevision === 'number' ? cfg._lastKnownRevision : preservedRevision;
  lastEmittedRevision = lastKnownRevision;
  reconnectAttempt = 0;

  if (cfg.role === 'network_server') {
    startServer(cfg);
    return { ok: true, mode: 'server', port: getWsPort(cfg) };
  }
  if (cfg.role === 'network_client') {
    startClient(cfg, false);
    return { ok: true, mode: 'client', url: 'ws://' + parseHostFromApiUrl(cfg.apiUrl) + ':' + getWsPort(cfg) };
  }
  return { ok: false, mode: 'unknown' };
}

function broadcastAfterPatch(keys, sourceClientId) {
  queueBroadcast(keys, sourceClientId);
}

function clientNotifyKeys(keys, sourceClientId) {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN || !wsClient._authenticated) {
    logFn('warn', '[LanWS] clientNotifyKeys skipped — client not connected');
    return false;
  }
  var safeKeys = sanitizeKeys(keys);
  if (!safeKeys.length) return false;
  try {
    wsClient.send(JSON.stringify({
      type: 'notify',
      keys: safeKeys,
      client_id: String(sourceClientId || ''),
      msg_id: newMsgId('notify'),
    }));
    return true;
  } catch (e) {
    logFn('warn', '[LanWS] clientNotifyKeys failed: ' + (e && e.message ? e.message : String(e)));
    return false;
  }
}

function getStatus() {
  return {
    status: wsStatus,
    role: activeRole,
    revision: revision,
    lastKnownRevision: lastKnownRevision,
    port: activeCfg ? getWsPort(activeCfg) : DEFAULT_WS_PORT,
    health: Object.assign({}, health),
  };
}

function setRuntimeClientId(clientId) {
  if (activeCfg) activeCfg._runtimeClientId = String(clientId || '').slice(0, 128);
}

function setLastKnownRevision(rev) {
  var n = parseInt(rev, 10);
  if (!isNaN(n) && n >= 0) {
    lastKnownRevision = n;
    lastEmittedRevision = Math.max(lastEmittedRevision, n);
  }
}

module.exports = {
  DEFAULT_WS_PORT,
  setMainWindowGetter,
  setLogFn,
  restart,
  stopAll,
  broadcastAfterPatch,
  clientNotifyKeys,
  getStatus,
  setRuntimeClientId,
  setLastKnownRevision,
  setWsDeviceValidator,
  _test: {
    parseInboundMessage: parseInboundMessage,
    sanitizeKeys: sanitizeKeys,
    queueBroadcast: queueBroadcast,
    flushBroadcastBatch: flushBroadcastBatch,
    CLIENT_MSG_TYPES: CLIENT_MSG_TYPES,
    SERVER_MSG_TYPES: SERVER_MSG_TYPES,
  },
};
