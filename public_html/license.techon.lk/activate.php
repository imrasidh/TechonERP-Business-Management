<?php
error_reporting(0);
@ini_set('display_errors', 0);
ob_start();

require_once __DIR__ . '/env_load.php';
techon_load_dotenv(__DIR__);
techon_force_https_if_production();
techon_register_safe_api_log(__DIR__);

require_once __DIR__ . '/cors_utils.php';
techon_license_apply_cors_headers('Content-Type, X-TC-Token, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_end_clean();
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ob_end_clean();
    echo json_encode(['status' => 'ERROR', 'message' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/license_bootstrap.php';
$SERVER_SECRET = tc_license_server_secret();
/* TEMP: set TC_LIC_ACTIVATE_DEBUG=1 in server env to log secret length (remove after verification). */
if (getenv('TC_LIC_ACTIVATE_DEBUG') === '1') {
    error_log('[activate.php] LICENSE_SECRET/TC length=' . strlen($SERVER_SECRET));
}
if ($SERVER_SECRET === '') {
    ob_end_clean();
    http_response_code(500);
    echo json_encode(['status' => 'ERROR', 'message' => 'Server configuration error']);
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
    echo json_encode(['status' => 'ERROR', 'message' => 'Forbidden']);
    exit;
}

/* ── Parse body ── */
$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!$body || !is_array($body)) {
    ob_end_clean();
    echo json_encode(['status' => 'ERROR', 'message' => 'Invalid request body']);
    exit;
}

$license_key = !empty($body['license_key']) ? strtoupper(trim((string)$body['license_key'])) : '';
$device_id   = !empty($body['device_id'])   ? trim((string)$body['device_id'])               : '';
$shop_name   = !empty($body['shop_name'])   ? trim((string)$body['shop_name'])                : '';
$device_name = !empty($body['device_name']) ? trim((string)$body['device_name'])              : '';

if (!$license_key || !$device_id || !$shop_name) {
    ob_end_clean();
    echo json_encode(['status' => 'ERROR', 'message' => 'Missing required fields']);
    exit;
}

$shop_name = substr($shop_name, 0, 100);
$licenses_file = __DIR__ . '/licenses.json';

if (!file_exists($licenses_file)) {
    ob_end_clean();
    echo json_encode(['status' => 'ERROR', 'message' => 'License database not found on server']);
    exit;
}

$fp = fopen($licenses_file, 'r+');
if (!$fp) {
    ob_end_clean();
    echo json_encode(['status' => 'ERROR', 'message' => 'Cannot open database']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    ob_end_clean();
    echo json_encode(['status' => 'ERROR', 'message' => 'Cannot lock license database']);
    exit;
}

$contents = stream_get_contents($fp);
if (empty($contents)) $contents = '[]';
$contents = ltrim($contents, "\xEF\xBB\xBF");
$licenses = json_decode($contents, true);

if (!is_array($licenses)) {
    flock($fp, LOCK_UN);
    fclose($fp);
    ob_end_clean();
    echo json_encode(['status' => 'ERROR', 'message' => 'License database corrupted']);
    exit;
}

/* ── Find license entry ── */
$index = -1;
for ($i = 0, $len = count($licenses); $i < $len; $i++) {
    if (isset($licenses[$i]['key']) && $licenses[$i]['key'] === $license_key) {
        $index = $i;
        break;
    }
}

if ($index === -1) {
    flock($fp, LOCK_UN);
    fclose($fp);
    ob_end_clean();
    echo json_encode(['status' => 'INVALID', 'message' => 'License key not found']);
    exit;
}

$entry = $licenses[$index];
$stored_device_id = trim((string)($entry['device_id'] ?? ($entry['device'] ?? '')));

/* ── Strict one-device binding ── */
if ($stored_device_id !== '' && $stored_device_id !== $device_id) {
    flock($fp, LOCK_UN);
    fclose($fp);
    ob_end_clean();
    echo json_encode([
        'status' => 'blocked',
        'message' => 'This license is already activated on another device. Please contact admin to reset.'
    ]);
    exit;
}

/* ── Blocked check ── */
if (!empty($entry['blocked'])) {
    flock($fp, LOCK_UN);
    fclose($fp);
    ob_end_clean();
    echo json_encode(['status' => 'INVALID', 'message' => 'License key is blocked']);
    exit;
}

/* ── Same-device re-activation safety: allow silently, keep current binding ── */
$plan = !empty($entry['plan']) ? strtolower($entry['plan']) : 'monthly';
if ($stored_device_id !== '' && $stored_device_id === $device_id) {
    flock($fp, LOCK_UN);
    fclose($fp);
    ob_end_clean();
    echo json_encode([
        'status'      => 'OK',
        'shop_name'   => $entry['shop'] ?? ($entry['shop_name'] ?? $shop_name),
        'plan'        => $plan,
        'expires'     => $entry['expires'] ?? null,
        'max_clients' => intval($entry['max_clients'] ?? 0),
        'message'     => 'Activation successful'
    ]);
    exit;
}

/* ── First activation after fresh key / admin reset ── */
$activated_at = date('Y-m-d');
$expires      = null;

switch ($plan) {
    case '3days':
        $expires = date('Y-m-d', strtotime('+3 days'));
        break;
    case 'monthly':
        $expires = date('Y-m-d', strtotime('+1 month'));
        break;
    case 'yearly':
        $expires = date('Y-m-d', strtotime('+1 year'));
        break;
    case '2year':
        $expires = date('Y-m-d', strtotime('+2 years'));
        break;
    case 'lifetime':
        $expires = null; // never expires
        break;
    default:
        $expires = date('Y-m-d', strtotime('+1 month'));
        break;
}

/* ── Write updated entry ── */
$licenses[$index]['device']       = $device_id;   // backward compatibility
$licenses[$index]['device_id']    = $device_id;
$licenses[$index]['device_name']  = $device_name !== '' ? substr($device_name, 0, 100) : ($entry['device_name'] ?? null);
$licenses[$index]['shop']         = $shop_name;   // backward compatibility
$licenses[$index]['shop_name']    = $shop_name;
$licenses[$index]['activated_at'] = $activated_at;
$licenses[$index]['expires']      = $expires;

$new_json = json_encode($licenses, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

rewind($fp);
ftruncate($fp, 0);
fwrite($fp, $new_json);
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

ob_end_clean();
echo json_encode([
    'status'    => 'OK',
    'shop_name' => $shop_name,
    'plan'      => $plan,
    'expires'   => $expires,
    'max_clients' => intval($entry['max_clients'] ?? 0),
    'message'   => 'Activation successful'
]);
exit;
