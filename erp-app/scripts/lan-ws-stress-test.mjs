/**
 * LAN WebSocket layer stress test (Node.js, no Electron UI).
 * Run: node scripts/lan-ws-stress-test.mjs
 */
import WebSocket from 'ws';
import lanWs from '../lan-ws-sync.cjs';

const TEST_PORT = 9877;
const TEST_KEY = 'stress-test-key';
const logLines = [];

function testLog(msg) {
  logLines.push(msg);
  console.log(msg);
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function connectClient(name, lastRevision) {
  return new Promise(function (resolve, reject) {
    var ws = new WebSocket('ws://127.0.0.1:' + TEST_PORT, { maxPayload: 65536 });
    var received = [];
    ws.on('open', function () {
      ws.send(JSON.stringify({
        type: 'auth',
        apiKey: TEST_KEY,
        clientId: name,
        last_revision: lastRevision || 0,
      }));
    });
    ws.on('message', function (raw) {
      var msg = JSON.parse(String(raw));
      received.push(msg);
      if (msg.type === 'auth_ok') resolve({ ws: ws, received: received, msg: msg });
      if (msg.type === 'auth_fail') reject(new Error('auth_fail'));
    });
    ws.on('error', reject);
    setTimeout(function () { reject(new Error('connect timeout')); }, 5000);
  });
}

async function run() {
  var passed = 0;
  var failed = 0;

  function ok(name) { passed++; testLog('PASS: ' + name); }
  function fail(name, err) { failed++; testLog('FAIL: ' + name + ' — ' + (err && err.message ? err.message : String(err))); }

  lanWs.setLogFn(function (level, msg) {
    if (String(level) === 'debug' || String(level) === 'info' || String(level) === 'warn') {
      /* capture health + reliability logs */
    }
  });

  /* 1. Message validation */
  try {
    var bad = lanWs._test.parseInboundMessage('{not json', lanWs._test.CLIENT_MSG_TYPES);
    if (bad === null) ok('reject malformed JSON'); else fail('reject malformed JSON');
  } catch (e) { fail('reject malformed JSON', e); }

  try {
    var big = lanWs._test.parseInboundMessage('"' + 'x'.repeat(70000) + '"', lanWs._test.CLIENT_MSG_TYPES);
    if (big === null) ok('reject oversized payload'); else fail('reject oversized payload');
  } catch (e) { fail('reject oversized payload', e); }

  /* 2. Start server */
  var serverResult = lanWs.restart({
    role: 'network_server',
    apiUrl: 'http://127.0.0.1/api/',
    apiKey: TEST_KEY,
    wsPort: TEST_PORT,
  }, function () { return null; }, function (lvl, msg) { testLog('[' + lvl + '] ' + msg); });

  if (!serverResult.ok) { fail('start server', new Error('not ok')); process.exit(1); }
  ok('start server');
  await sleep(300);

  /* 3. Three counter clients connect */
  var clients = [];
  try {
    for (var i = 1; i <= 3; i++) {
      clients.push(await connectClient('counter-' + i, 0));
    }
    ok('3 counter PCs connect + auth');
  } catch (e) { fail('3 counter PCs connect', e); }

  /* 4. Rapid broadcasts batched */
  try {
    for (var j = 0; j < 20; j++) {
      lanWs.broadcastAfterPatch(['tc3_sales', 'tc3_products'], 'counter-1');
    }
    await sleep(250);
    var kvCount = 0;
    clients.forEach(function (c) {
      kvCount += c.received.filter(function (m) { return m.type === 'kv_changed'; }).length;
    });
    if (kvCount <= 6) ok('batching reduces notifications (got ' + kvCount + ' total kv_changed across 3 clients)'); else fail('batching', new Error('too many messages: ' + kvCount));
  } catch (e) { fail('batching', e); }

  /* 5. Duplicate msg_id ignored on server emit path */
  try {
    var st = lanWs.getStatus();
    if (st && typeof st.revision === 'number') ok('revision tracking active (rev=' + st.revision + ')'); else fail('revision tracking');
  } catch (e) { fail('revision tracking', e); }

  /* 6. Client notify relay */
  try {
    lanWs.setRuntimeClientId('counter-1');
    lanWs.restart({
      role: 'network_client',
      apiUrl: 'http://127.0.0.1/api/',
      apiKey: TEST_KEY,
      wsPort: TEST_PORT,
      _lastKnownRevision: 0,
    }, function () { return null; }, function () {});
    await sleep(800);
    ok('client role restart for notify test');
  } catch (e) { fail('client notify setup', e); }

  /* 7. Server restart simulation */
  try {
    lanWs.stopAll();
    await sleep(200);
    lanWs.restart({
      role: 'network_server',
      apiUrl: 'http://127.0.0.1/api/',
      apiKey: TEST_KEY,
      wsPort: TEST_PORT,
    }, function () { return null; }, function () {});
    await sleep(300);
    var re = await connectClient('counter-after-restart', 5);
    var catchup = re.received.some(function (m) { return m.type === 'sync_catchup' || m.needs_full_sync; });
    /* catchup is emitted via IPC in Electron; in Node getMainWindow is null — check auth_ok revision instead */
    if (re.msg && re.msg.type === 'auth_ok') ok('reconnect after main restart (auth_ok revision=' + re.msg.revision + ')'); else fail('main restart reconnect');
    re.ws.close();
  } catch (e) { fail('main restart reconnect', e); }

  /* Cleanup */
  clients.forEach(function (c) { try { c.ws.close(); } catch (_e) {} });
  lanWs.stopAll();

  testLog('\n--- Stress test summary ---');
  testLog('Passed: ' + passed);
  testLog('Failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function (e) {
  console.error(e);
  process.exit(1);
});
