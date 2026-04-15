<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/config.php
 * Shared configuration, session helpers, and file I/O functions.
 */
require_once dirname(__DIR__) . '/env_load.php';
techon_load_dotenv(dirname(__DIR__));
techon_force_https_if_production();

/* ════════════════════════════════════════════════════════════
   ADMIN LOGIN — bcrypt only (never plaintext in repo).
   Set server environment:
     ADMIN_USERNAME (default: admin)
     ADMIN_PASSWORD_HASH (output of: php -r "echo password_hash('YourPass', PASSWORD_DEFAULT);")
   Or run once: php admin/bootstrap_admin.php admin "YourPassword"
   (stores hash in data/admin_auth.sqlite — add data/ to backup list)
   ════════════════════════════════════════════════════════════ */
require_once __DIR__ . '/auth_store.php';
require_once __DIR__ . '/rate_guard.php';

/* ════════════════════════════════════════════════════════════
   PATHS
   ════════════════════════════════════════════════════════════ */
/* licenses.json sits one level above /admin/ */
define('LICENSES_FILE', dirname(__DIR__) . '/licenses.json');

/* ════════════════════════════════════════════════════════════
   SESSION
   ════════════════════════════════════════════════════════════ */
define('SESSION_NAME', 'tc_lic_admin');

function startAdminSession() {
    session_name(SESSION_NAME);
    if (session_status() === PHP_SESSION_NONE) {
        $secure = function_exists('techon_request_is_https') ? techon_request_is_https() : (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.cookie_secure', $secure ? '1' : '0');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function requireLogin() {
    startAdminSession();
    if (empty($_SESSION['tc_admin_auth'])) {
        header('Location: login.php');
        exit;
    }
}

/* ════════════════════════════════════════════════════════════
   CSRF
   ════════════════════════════════════════════════════════════ */
function csrfToken() {
    startAdminSession();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(20));
    }
    return $_SESSION['csrf'];
}

function verifyCsrf() {
    startAdminSession();
    $post   = trim($_POST['csrf'] ?? '');
    $stored = $_SESSION['csrf'] ?? '';
    if (!$stored || !hash_equals($stored, $post)) {
        http_response_code(403);
        die('Forbidden');
    }
}

/* ════════════════════════════════════════════════════════════
   LICENSE FILE I/O
   ════════════════════════════════════════════════════════════ */
function readLicenses(): array {
    if (!file_exists(LICENSES_FILE)) return [];
    $fp = fopen(LICENSES_FILE, 'r');
    if (!$fp) return [];
    flock($fp, LOCK_SH);
    clearstatcache(true, LICENSES_FILE);
    $raw = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    if (empty($raw)) $raw = '[]';
    $raw  = ltrim($raw, "\xEF\xBB\xBF");
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function writeLicenses(array $licenses): bool {
    $fp = fopen(LICENSES_FILE, 'r+');
    if (!$fp) return false;
    flock($fp, LOCK_EX);
    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, json_encode(
        $licenses,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    ));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return true;
}

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */

/**
 * Returns: 'blocked' | 'expired' | 'active' | 'unused'
 */
function licStatus(array $lic): string {
    if (!empty($lic['blocked'])) return 'blocked';

    $plan    = !empty($lic['plan'])    ? strtolower($lic['plan']) : 'monthly';
    $expires = !empty($lic['expires']) ? $lic['expires']          : null;

    if (!empty($lic['device'])) {
        // Check if expired (lifetime never expires)
        if ($plan !== 'lifetime' && $expires !== null) {
            $today      = new DateTime(date('Y-m-d'));
            $expireDate = new DateTime($expires);
            if ($today > $expireDate) return 'expired';
        }
        return 'active';
    }

    return 'unused';
}

/**
 * Human-readable plan label
 */
function planLabel(string $plan): string {
    return match(strtolower($plan)) {
        '3days'    => '3-Day Demo',
        'monthly'  => 'Monthly',
        'yearly'   => 'Yearly',
        '2year'    => '2 Year',
        'lifetime' => 'Lifetime',
        default    => ucfirst($plan),
    };
}

/**
 * Plan badge colour class
 */
function planClass(string $plan): string {
    return match(strtolower($plan)) {
        '3days'    => 'plan-3days',
        'monthly'  => 'plan-monthly',
        'yearly'   => 'plan-yearly',
        '2year'    => 'plan-2year',
        'lifetime' => 'plan-lifetime',
        default    => 'plan-monthly',
    };
}

function generateKey(array $existing): string {
    $pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $len  = strlen($pool) - 1;
    $keys = array_column($existing, 'key');
    do {
        $a = $b = '';
        for ($i = 0; $i < 4; $i++) { $a .= $pool[random_int(0, $len)]; }
        for ($i = 0; $i < 4; $i++) { $b .= $pool[random_int(0, $len)]; }
        $key = "TCERP-$a-$b";
    } while (in_array($key, $keys, true));
    return $key;
}

function flash(string $type, string $msg): void {
    startAdminSession();
    $_SESSION['flash'] = ['type' => $type, 'msg' => $msg];
}

function getFlash(): ?array {
    startAdminSession();
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}

function h(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
