<?php
/**
 * CLI: create or replace admin row in SQLite (bcrypt).
 * Usage: php bootstrap_admin.php admin "YourSecurePassword"
 * Env ADMIN_AUTH_SQLITE_PATH overrides default data path.
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('CLI only');
}

require_once __DIR__ . '/auth_store.php';

$username = isset($argv[1]) ? trim((string) $argv[1]) : '';
$password = isset($argv[2]) ? (string) $argv[2] : '';

if ($username === '' || $password === '') {
    fwrite(STDERR, "Usage: php bootstrap_admin.php <username> <password>\n");
    exit(1);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
if ($hash === false) {
    fwrite(STDERR, "password_hash failed\n");
    exit(1);
}

$pdo = tc_admin_auth_pdo();
$pdo->exec('DELETE FROM admin_login');
$st = $pdo->prepare('INSERT INTO admin_login (id, username, password_hash) VALUES (1, ?, ?)');
$st->execute([$username, $hash]);

echo "OK — admin stored in " . tc_admin_auth_db_path() . "\n";
echo "Unset ADMIN_PASSWORD_HASH in server env if you use SQLite only.\n";
exit(0);
