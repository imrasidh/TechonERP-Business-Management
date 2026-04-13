<?php
error_reporting(0);
@ini_set('display_errors', 0);
ob_start();

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-TC-Token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_end_clean();
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ob_end_clean();
    echo json_encode(['status' => 'INVALID']);
    exit;
}

require_once __DIR__ . '/license_bootstrap.php';
$SERVER_SECRET = tc_license_server_secret();
if ($SERVER_SECRET === '') {
    ob_end_clean();
    http_response_code(500);
    echo json_encode(['status' => 'INVALID']);
    exit;
}

$expected_token = substr(hash_hmac('sha256', 'techon-client', $SERVER_SECRET), 0, 16);

$incoming_token = '';
if (!empty($_SERVER['HTTP_X_TC_TOKEN'])) {
    $incoming_token = trim($_SERVER['HTTP_X_TC_TOKEN']);
} elseif (function_exists('apache_request_headers')) {
    foreach (apache_request_headers() as $name => $val) {
        if (strtolower($name) === 'x-tc-token') {
            $incoming_token = trim($val);
            break;
        }
    }
}

if ($incoming_token !== $expected_token) {
    ob_end_clean();
    http_response_code(403);
    echo json_encode(['status' => 'INVALID']);
    exit;
}

/* ── Parse body ── */
$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!$body || !is_array($body)) {
    ob_end_clean();
    echo json_encode(['status' => 'INVALID']);
    exit;
}

$license_key = !empty($body['license_key']) ? strtoupper(trim((string)$body['license_key'])) : '';
$device_id   = !empty($body['device_id'])   ? trim((string)$body['device_id'])               : '';

if (!$license_key || !$device_id) {
    ob_end_clean();
    echo json_encode(['status' => 'INVALID']);
    exit;
}

$licenses_file = __DIR__ . '/licenses.json';

if (!file_exists($licenses_file)) {
    ob_end_clean();
    echo json_encode(['status' => 'INVALID']);
    exit;
}

$fp = fopen($licenses_file, 'r');
if (!$fp) {
    ob_end_clean();
    echo json_encode(['status' => 'INVALID']);
    exit;
}

if (!flock($fp, LOCK_SH)) {
    fclose($fp);
    ob_end_clean();
    echo json_encode(['status' => 'INVALID']);
    exit;
}

$contents = stream_get_contents($fp);
if (empty($contents)) $contents = '[]';
$contents = ltrim($contents, "\xEF\xBB\xBF");

flock($fp, LOCK_UN);
fclose($fp);

$licenses = json_decode($contents, true);

if (!is_array($licenses)) {
    ob_end_clean();
    echo json_encode(['status' => 'INVALID']);
    exit;
}

foreach ($licenses as $entry) {
    if (!isset($entry['key']) || $entry['key'] !== $license_key) continue;

    /* ── Device lock check (unchanged) ── */
    if (empty($entry['device']) || $entry['device'] !== $device_id) {
        ob_end_clean();
        echo json_encode(['status' => 'INVALID']);
        exit;
    }

    /* ── Blocked check ── */
    if (!empty($entry['blocked'])) {
        ob_end_clean();
        echo json_encode(['status' => 'INVALID']);
        exit;
    }

    /* ── Expiration check ── */
    $plan    = !empty($entry['plan'])    ? strtolower($entry['plan']) : 'monthly';
    $expires = !empty($entry['expires']) ? $entry['expires']          : null;

    // Lifetime licences never expire
    if ($plan !== 'lifetime' && $expires !== null) {
        $today      = new DateTime(date('Y-m-d'));
        $expireDate = new DateTime($expires);
        if ($today > $expireDate) {
            ob_end_clean();
            echo json_encode([
                'status'  => 'EXPIRED',
                'expires' => $expires,
                'plan'    => $plan
            ]);
            exit;
        }
    }

    /* ── All checks passed ── */
    ob_end_clean();
    echo json_encode([
        'status'    => 'VALID',
        'shop_name' => $entry['shop'] ?? '',
        'plan'      => $plan,
        'expires'   => $expires
    ]);
    exit;
}

ob_end_clean();
echo json_encode(['status' => 'INVALID']);
exit;
