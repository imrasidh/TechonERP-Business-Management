<?php
@ini_set('display_errors', '0');
require_once __DIR__ . '/env_load.php';
techon_load_dotenv(__DIR__);
techon_force_https_if_production();
techon_register_safe_api_log(__DIR__);

require_once __DIR__ . '/cors_utils.php';

$dbHost = techon_env('DB_HOST', '');
if ($dbHost === false || $dbHost === '') {
    $dbHost = 'localhost';
}
$dbName = techon_env('DB_NAME', '');
if ($dbName === false || $dbName === '') {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'An error occurred']);
    exit();
}
$dbUser = techon_env('DB_USER', '');
if ($dbUser === false || $dbUser === '') {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'An error occurred']);
    exit();
}
$dbPass = techon_env('DB_PASS', null);
if ($dbPass === false || $dbPass === null) {
    $dbPass = '';
}

define('DB_HOST', $dbHost);
define('DB_NAME', $dbName);
define('DB_USER', $dbUser);
define('DB_PASS', $dbPass);
define('APP_NAME', 'TechonERP Dashboard');

techon_apply_api_cors_headers('Content-Type, Authorization, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

function db() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER, DB_PASS,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                 PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                 PDO::ATTR_EMULATE_PREPARES => false]
            );
        } catch (PDOException $e) {
            error_log('[Techon Dashboard] DB connection failed');
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'An error occurred']);
            exit();
        }
    }
    return $pdo;
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}

function getInput() {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 2097152) {
        respond(['success' => false, 'error' => 'Invalid request'], 413);
    }
    $data = techon_parse_json_body($raw, 2097152, 20);
    if ($data === null) {
        $t = ltrim((string) $raw);
        if ($t !== '') {
            respond(['success' => false, 'error' => 'Invalid request'], 400);
        }
        return [];
    }
    return $data;
}

function generateToken($length = 64) {
    return bin2hex(random_bytes($length));
}

function getBearerToken() {
    /* Try every possible way to read the Authorization header */
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return str_replace('Bearer ', '', trim($_SERVER['HTTP_AUTHORIZATION']));
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return str_replace('Bearer ', '', trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']));
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strtolower($key) === 'authorization') {
                return str_replace('Bearer ', '', trim($value));
            }
        }
    }
    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $key => $value) {
            if (strtolower($key) === 'authorization') {
                return str_replace('Bearer ', '', trim($value));
            }
        }
    }
    /* Token must be sent via Authorization: Bearer only (not query string). */
    return '';
}

function getApiKey() {
    /* Read API key from X-API-Key header */
    if (!empty($_SERVER['HTTP_X_API_KEY'])) return trim($_SERVER['HTTP_X_API_KEY']);
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strtolower($key) === 'x-api-key') return trim($value);
        }
    }
    return '';
}

function validateToken($token) {
    if (!$token) return false;
    $pdo = db();
    $stmt = $pdo->prepare(
        'SELECT u.*, s.name as shop_name, s.api_key, s.currency, s.license_key, s.id AS shop_pk
         FROM users u
         JOIN shops s ON u.shop_id = s.id
         WHERE u.session_token = ?
         AND u.token_expires > NOW()'
    );
    $stmt->execute([$token]);
    return $stmt->fetch();
}

function validateApiKey($apiKey) {
    /* Used by ERP sync — does NOT touch session_token, never conflicts with browser session */
    if (!$apiKey) return false;
    $pdo = db();
    $stmt = $pdo->prepare(
        'SELECT u.*, s.name as shop_name, s.api_key, s.currency, s.license_key, s.id AS shop_pk
         FROM shops s
         JOIN users u ON u.shop_id = s.id
         WHERE s.api_key = ?
         LIMIT 1'
    );
    $stmt->execute([$apiKey]);
    return $stmt->fetch();
}

function requireAuth() {
    /* Try session token first (browser dashboard) */
    $token = getBearerToken();
    if ($token) {
        $user = validateToken($token);
        if ($user) return $user;
    }

    /* Try api_key (ERP sync — keeps browser session intact) */
    $apiKey = getApiKey();
    if ($apiKey) {
        $user = validateApiKey($apiKey);
        if ($user) return $user;
    }

    respond(['success' => false, 'error' => 'Unauthorized'], 401);
}
?>
