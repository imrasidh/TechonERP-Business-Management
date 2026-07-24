<?php
/**
 * Techon ERP — Local Network API Config v2
 * Database: getenv() → .env (same directory, then erp-app/) → local dev defaults below.
 * Security: X-TC-KEY token auth generated per-server during setup
 */
@ini_set('display_errors', '0');
require_once __DIR__ . '/env_load.php';
techon_load_dotenv(__DIR__);
techon_load_dotenv(dirname(__DIR__));
techon_force_https_if_production();
techon_register_safe_api_log(__DIR__);

require_once __DIR__ . '/cors_utils.php';

$dbHost = techon_env('DB_HOST', '');
if ($dbHost === '' || $dbHost === false) {
    $dbHost = 'localhost';
}
$dbName = techon_env('DB_NAME', '');
if ($dbName === '' || $dbName === false) {
    $dbName = 'techon_erp_network';
}
$dbUser = techon_env('DB_USER', '');
if ($dbUser === '' || $dbUser === false) {
    $dbUser = 'root';
}
$dbPass = techon_env('DB_PASS', null);
if ($dbPass === null || $dbPass === false) {
    $dbPass = ''; /* empty password valid for local XAMPP */
}

define('DB_HOST', $dbHost);
define('DB_NAME', $dbName);
define('DB_USER', $dbUser);
define('DB_PASS', $dbPass);

function techon_apply_cors_headers() {
    techon_apply_json_cors_headers(
        'Content-Type, X-TC-KEY, X-TC-Client-ID, X-TC-License-Sync, Authorization, '
        . 'X-TC-DEVICE-ID, X-TC-TIMESTAMP, X-TC-NONCE, X-TC-SIGNATURE'
    );
}

techon_apply_cors_headers();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ── Token Auth ───────────────────────────────────────────────────────
// The API key is written to tc_api_key.php during server setup by the Electron app.
// ping.php is exempt (used for initial connectivity check).
function loadApiKey() {
    $keyFile = __DIR__ . '/tc_api_key.php';
    if (!file_exists($keyFile)) return null;
    // The file defines TC_API_KEY constant
    require_once $keyFile;
    return defined('TC_API_KEY') ? TC_API_KEY : null;
}

/**
 * Cached raw request body (php://input is single-read).
 */
function tcGetRawBody() {
    static $cached = null;
    if ($cached === null) {
        $cached = file_get_contents('php://input');
        if ($cached === false) $cached = '';
    }
    return $cached;
}

function tcIsLocalhostRequest() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    return $ip === '127.0.0.1'
        || $ip === '::1'
        || $ip === 'localhost'
        || $ip === '::ffff:127.0.0.1';
}

/**
 * Legacy API key auth — kept for backward compatibility during device migration.
 */
function requireLegacyAuth() {
    $storedKey = loadApiKey();
    if ($storedKey === null) {
        if (getenv('TECHON_ERP_OPEN_API') === '1') {
            if (!tcIsLocalhostRequest()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'OPEN_API is localhost-only']);
                exit();
            }
            return;
        }
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'API key not configured — add network-api/tc_api_key.php (Server Setup) or set TECHON_ERP_OPEN_API=1 for local dev only.',
        ]);
        exit();
    }

    $incoming = '';
    if (!empty($_SERVER['HTTP_X_TC_KEY'])) {
        $incoming = trim((string) $_SERVER['HTTP_X_TC_KEY']);
    }

    if ($incoming === '' || !hash_equals($storedKey, $incoming)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized — invalid API key']);
        exit();
    }
}

/**
 * Dual auth: device HMAC when headers present, else legacy X-TC-KEY.
 * Returns auth context array or exits on failure.
 */
function requireAuth() {
    require_once __DIR__ . '/device_auth.php';
    return tcRequireAuthDual();
}

// ── DB connection ────────────────────────────────────────────────────
function db() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    } catch (PDOException $e) {
        error_log('[TechonERP] DB connection failed');
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'An error occurred']);
        exit();
    }
    return $pdo;
}

// ── Helpers ──────────────────────────────────────────────────────────
function respond($data, $code = 200) {
    // Always wrap in standard envelope
    if (!is_array($data)) $data = ['data' => $data];
    if (!isset($data['success'])) $data['success'] = ($code >= 200 && $code < 300);
    if (!isset($data['message'])) $data['message'] = $data['success'] ? 'ok' : 'error';
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function getInput() {
    $raw = tcGetRawBody();
    if (strlen($raw) > 2097152) {
        respond(['success' => false, 'message' => 'Invalid request'], 413);
    }
    $data = techon_parse_json_body($raw, 2097152, 20);
    if ($data === null) {
        $t = ltrim((string) $raw);
        if ($t !== '') {
            respond(['success' => false, 'message' => 'Invalid request'], 400);
        }
        return [];
    }
    return $data;
}

function kvGet($key, $default = null) {
    $pdo  = db();
    $stmt = $pdo->prepare('SELECT `value` FROM kv_store WHERE store_key = ?');
    $stmt->execute([$key]);
    $row  = $stmt->fetch();
    if (!$row) return $default;
    $dec = json_decode($row['value'], true);
    return ($dec !== null) ? $dec : $default;
}

function kvSet($key, $value) {
    $pdo  = db();
    $json = json_encode($value, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare(
        'INSERT INTO kv_store (store_key, `value`) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
    );
    $stmt->execute([$key, $json]);
}

function touchSession($clientId, $ip) {
    if (!$clientId) return;
    try {
        $pdo  = db();
        $host = @gethostbyaddr($ip) ?: $ip;
        $stmt = $pdo->prepare(
            'INSERT INTO client_sessions (id, hostname, ip) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE hostname = VALUES(hostname), ip = VALUES(ip), last_seen = NOW()'
        );
        $stmt->execute([$clientId, $host, $ip]);
    } catch (Exception $e) {}
}

function serverLog($level, $message) {
    try {
        $logDir  = __DIR__ . '/logs';
        if (!is_dir($logDir)) mkdir($logDir, 0755, true);
        $date    = date('Y-m-d');
        $entry   = '[' . date('Y-m-d H:i:s') . '] [' . strtoupper($level) . '] ' . $message . PHP_EOL;
        file_put_contents($logDir . '/api-' . $date . '.log', $entry, FILE_APPEND | LOCK_EX);
    } catch (Exception $e) {}
}
?>
