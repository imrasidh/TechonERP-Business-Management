<?php
/**
 * Bcrypt admin credentials: env vars (preferred) or SQLite store (bootstrap_admin.php).
 * Never store plaintext passwords.
 */
if (!function_exists('tc_admin_auth_db_path')) {
    function tc_admin_auth_db_path() {
        $override = getenv('ADMIN_AUTH_SQLITE_PATH');
        if ($override !== false && $override !== '') {
            return $override;
        }
        return dirname(__DIR__) . '/data/admin_auth.sqlite';
    }
}

if (!function_exists('tc_admin_auth_pdo')) {
    function tc_admin_auth_pdo() {
        $path = tc_admin_auth_db_path();
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS admin_login (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL
            )'
        );
        return $pdo;
    }
}

/**
 * @return array{username:string,password_hash:string}|null
 */
if (!function_exists('tc_admin_resolve_credentials')) {
    function tc_admin_resolve_credentials() {
        $user = getenv('ADMIN_USERNAME');
        if ($user === false || $user === '') {
            $user = 'admin';
        }
        $hash = getenv('ADMIN_PASSWORD_HASH');
        if ($hash !== false && $hash !== '') {
            return ['username' => $user, 'password_hash' => $hash];
        }
        try {
            $pdo = tc_admin_auth_pdo();
            $st = $pdo->query('SELECT username, password_hash FROM admin_login WHERE id = 1 LIMIT 1');
            $row = $st ? $st->fetch(PDO::FETCH_ASSOC) : null;
            if ($row && !empty($row['password_hash'])) {
                return ['username' => (string) $row['username'], 'password_hash' => (string) $row['password_hash']];
            }
        } catch (Exception $e) {
        }
        return null;
    }
}
