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
$dbPass = techon_env('DB_PASS', null);
$allowDevDbDefaults = getenv('TECHON_ERP_ALLOW_DEV_DB_DEFAULTS') === '1';
/* Fallback root/empty password is for local XAMPP only — require env or localhost host. */
if ($dbUser === '' || $dbUser === false) {
    if ($allowDevDbDefaults || $dbHost === 'localhost' || $dbHost === '127.0.0.1') {
        $dbUser = 'root';
    } else {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'DB_USER is not configured']);
        exit();
    }
}
if ($dbPass === null || $dbPass === false) {
    if ($allowDevDbDefaults || $dbHost === 'localhost' || $dbHost === '127.0.0.1') {
        $dbPass = ''; /* empty password valid for local XAMPP */
    } else {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'DB_PASS is not configured']);
        exit();
    }
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

/**
 * After requireAuth(): block OPEN and remote legacy unless allowed.
 * $opts['allowRemoteLegacy'] — enrollment endpoints (device_register/status) may use
 * legacy key from LAN so counters can enroll before device HMAC exists; still rate-limit those.
 */
function tcEnforceRemoteAuthPolicy($auth, $opts = []) {
    $authMode = is_array($auth) ? (string)($auth['mode'] ?? '') : '';
    $isLoopback = tcIsLocalhostRequest();
    $allowRemoteLegacy = !empty($opts['allowRemoteLegacy']);
    if ($authMode === 'open' && !$isLoopback) {
        respond(['success' => false, 'message' => 'OPEN_API is localhost-only'], 403);
    }
    if ($authMode === 'legacy' && !$isLoopback) {
        if ($allowRemoteLegacy || getenv('TECHON_ERP_ALLOW_LEGACY_SYNC') === '1') {
            return;
        }
        respond([
            'success' => false,
            'message' => 'Legacy API key is localhost-only — counters must use device authentication (or set TECHON_ERP_ALLOW_LEGACY_SYNC=1 during migration)',
        ], 403);
    }
}

/**
 * Lightweight file-based rate limit (per IP / device key). Returns false when blocked.
 */
function tcRateLimitAllow($bucketKey, $maxPerMinute = 30) {
    try {
        $rlKey = preg_replace('/[^A-Za-z0-9_.-]/', '_', (string)$bucketKey);
        if ($rlKey === '') $rlKey = 'unknown';
        $rlDir = __DIR__ . '/logs/ratelimit';
        if (!is_dir($rlDir)) @mkdir($rlDir, 0755, true);
        $rlFile = $rlDir . '/rl_' . $rlKey . '.json';
        $nowMin = date('Y-m-d H:i');
        $bucket = ['minute' => $nowMin, 'count' => 0];
        if (file_exists($rlFile)) {
            $raw = @file_get_contents($rlFile);
            $dec = json_decode((string)$raw, true);
            if (is_array($dec) && !empty($dec['minute'])) $bucket = $dec;
        }
        if (($bucket['minute'] ?? '') !== $nowMin) $bucket = ['minute' => $nowMin, 'count' => 0];
        $bucket['count'] = (int)($bucket['count'] ?? 0) + 1;
        @file_put_contents($rlFile, json_encode($bucket), LOCK_EX);
        return ((int)$bucket['count']) <= (int)$maxPerMinute;
    } catch (Exception $e) {
        /* Fail open: broken rate-limit store must not block legitimate shop traffic. */
        error_log('[TechonERP] rate limit store error: ' . $e->getMessage());
        return true;
    }
}

/**
 * Device permission → which storage keys this counter may write.
 */
function tcDeviceMayWriteKey($auth, $key) {
    if (!is_array($auth) || ($auth['mode'] ?? '') !== 'device') return true;
    $device = $auth['device'] ?? null;
    if (!$device) return false;
    $perms = $device['permissions'] ?? null;
    if (is_string($perms)) $perms = json_decode($perms, true);
    if (!is_array($perms)) $perms = [];
    if (!empty($perms['admin']) || !empty($perms['manager'])) return true;

    $accountsKeys = [
        'tc3_users' => true,
        'tc3_settings' => true,
        'tc3_journal_lines' => true,
        'tc3_gl_accounts' => true,
        'tc3_gl_mode' => true,
        'tc3_gl_audit' => true,
        'tc3_journal_hash' => true,
        'tc3_gl_last_error' => true,
        'tc3_financial_snapshots' => true,
        'tc3_openBal' => true,
        'tc3_capLedger' => true,
        'tc3_capLog' => true,
        'tc3_profitDist' => true,
        'tc3_admin_name' => true,
        'tc3_financial_mutation_log' => true,
        'tc3_apppass' => true,
        'tc3_auditLog' => true,
    ];
    $salesKeys = [
        'tc3_sales' => true,
        'tc3_salesReturns' => true,
        'tc3_quotations' => true,
        'tc3_held_invoices' => true,
        'tc3_customers' => true,
        'tc3_manualReceivables' => true,
        'tc3_cheques' => true,
        'tc3_codRecords' => true,
        'tc3_codPartners' => true,
        'tc3_codWithdrawals' => true,
        'tc3_codProfitSettings' => true,
        'tc3_invoice_edit_locks' => true,
        'tc3_repairs' => true,
        'tc3_repairDeleteLog' => true,
        'tc3_others' => true,
    ];
    $inventoryKeys = [
        'tc3_products' => true,
        'tc3_purchases' => true,
        'tc3_purchaseReturns' => true,
        'tc3_suppliers' => true,
        'tc3_manualPayables' => true,
        'tc3_damageLog' => true,
        'tc3_productLog' => true,
        'tc3_stock_movements' => true,
        'tc3_inv_reconciliation' => true,
        'tc3_inventory_layers' => true,
        'tc3_raw_material_usage' => true,
        'tc3_raw_material_counts' => true,
        'tc3_assets' => true,
        'tc3_assetLog' => true,
        'tc3_expenses' => true,
        'tc3_labelDesigns' => true,
        'tc3_businessType' => true,
        'tc3_repair3p_product_seq' => true,
    ];
    if (isset($accountsKeys[$key])) {
        return !empty($perms['accounts']);
    }
    if (isset($salesKeys[$key])) {
        return !empty($perms['sales']);
    }
    if (isset($inventoryKeys[$key])) {
        return !empty($perms['inventory']);
    }
    /* Deny unknown keys by default (no catch-all privilege broaden). */
    return false;
}

/**
 * Read ACL for server_state hydrate. Financial ledger keys require accounts;
 * shop settings readable with any operational permission (hashes already stripped).
 */
function tcDeviceMayReadKey($auth, $key) {
    if (!is_array($auth) || ($auth['mode'] ?? '') !== 'device') return true;
    $device = $auth['device'] ?? null;
    if (!$device) return false;
    $perms = $device['permissions'] ?? null;
    if (is_string($perms)) $perms = json_decode($perms, true);
    if (!is_array($perms)) $perms = [];
    if (!empty($perms['admin']) || !empty($perms['manager'])) return true;

    $accountsOnly = [
        'tc3_users' => true,
        'tc3_journal_lines' => true,
        'tc3_gl_accounts' => true,
        'tc3_gl_mode' => true,
        'tc3_gl_audit' => true,
        'tc3_journal_hash' => true,
        'tc3_gl_last_error' => true,
        'tc3_financial_snapshots' => true,
        'tc3_openBal' => true,
        'tc3_capLedger' => true,
        'tc3_capLog' => true,
        'tc3_profitDist' => true,
        'tc3_admin_name' => true,
        'tc3_financial_mutation_log' => true,
        'tc3_apppass' => true,
        'tc3_auditLog' => true,
    ];
    if (isset($accountsOnly[$key])) {
        return !empty($perms['accounts']);
    }
    /* Settings / shop identity needed for POS — allow any operational bit (hashes stripped). */
    if ($key === 'tc3_settings' || $key === 'tc3_businessType' || $key === 'tc3_labelDesigns') {
        return !empty($perms['sales']) || !empty($perms['inventory']) || !empty($perms['reports']) || !empty($perms['accounts']);
    }
    return tcDeviceMayWriteKey($auth, $key);
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
