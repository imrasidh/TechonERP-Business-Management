<?php
/**
 * Standalone self-test for device_auth.php crypto (no MySQL required).
 * Run: php network-api/device_auth_selftest.php
 */
@ini_set('display_errors', '1');
error_reporting(E_ALL);

$root = dirname(__DIR__);
require_once $root . '/network-api/device_auth.php';

function assert_true($cond, $msg) {
    if (!$cond) {
        fwrite(STDERR, "FAIL: $msg\n");
        exit(1);
    }
    echo "PASS: $msg\n";
}

/* Stub loadApiKey for master key derivation */
if (!function_exists('loadApiKey')) {
    function loadApiKey() { return 'test-api-key-for-selftest-only'; }
}
if (!function_exists('db')) {
    function db() { throw new Exception('DB not available in crypto-only selftest'); }
}
if (!function_exists('serverLog')) {
    function serverLog($level, $message) {}
}

$secret = tcGenerateDeviceSecret();
$method = 'POST';
$path = '/api/sync_patch.php';
$ts = '1700000000';
$nonce = bin2hex(random_bytes(16));
$body = '{"patches":[]}';
$hash = tcBodyHashHex($body);
$sig = tcComputeSignature($secret, $method, $path, $ts, $nonce, $hash);

assert_true(strlen($sig) === 64, 'HMAC signature length');
assert_true(
    tcBuildSignString($method, $path, $ts, $nonce, $hash) === "POST\n/api/sync_patch.php\n1700000000\n$nonce\n$hash",
    'Canonical sign string'
);

$enc = tcEncryptSecret($secret);
$dec = tcDecryptSecret($enc);
assert_true($dec === $secret, 'Secret encrypt/decrypt round-trip');

/* Cross-check against known Node vector if provided via env */
$envSig = getenv('TC_TEST_EXPECTED_SIG');
if ($envSig) {
    assert_true(hash_equals($envSig, $sig), 'Cross-language signature match');
}

echo "OK: device_auth crypto selftest complete\n";
exit(0);
