<?php
/**
 * Techon ERP — Local Network API Config v2
 * Database: techon_erp_network (local XAMPP MySQL)
 * Security: X-TC-KEY token auth generated per-server during setup
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'techon_erp_network');
define('DB_USER', 'root');
define('DB_PASS', '');   // Default XAMPP has no root password

// ── CORS (reflect Origin when present; fallback * for non-browser clients) ──
function techon_apply_cors_headers() {
    header('Content-Type: application/json; charset=utf-8');
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string)$_SERVER['HTTP_ORIGIN']) : '';
    if ($origin !== '' && preg_match('#^https?://#i', $origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    } else {
        header('Access-Control-Allow-Origin: *');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-TC-KEY, X-TC-Client-ID, X-TC-License-Sync');
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
 * Open API without a key is only allowed when TECHON_ERP_OPEN_API=1 (local dev).
 * Production must ship network-api/tc_api_key.php from server setup.
 */
function requireAuth() {
    $storedKey = loadApiKey();
    if ($storedKey === null) {
        if (getenv('TECHON_ERP_OPEN_API') === '1') {
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
        $incoming = trim($_SERVER['HTTP_X_TC_KEY']);
    }

    if ($incoming === '' || !hash_equals($storedKey, $incoming)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized — invalid API key']);
        exit();
    }
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
        error_log('[TechonERP] DB connection failed: ' . $e->getMessage());
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database unavailable']);
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
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) return [];
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
