<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'techonlk_techon_dashboard');
define('DB_USER', 'techonlk_techonlk');
define('DB_PASS', 'Fitriyah0408@');
define('APP_NAME', 'TechonERP Dashboard');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');

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
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database connection failed']);
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
    $data = json_decode($raw, true);
    return $data ?: [];
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
    if (!empty($_GET['token'])) {
        return trim($_GET['token']);
    }
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
        'SELECT u.*, s.name as shop_name, s.api_key, s.currency, s.license_key
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
        'SELECT u.*, s.name as shop_name, s.api_key, s.currency, s.license_key
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
