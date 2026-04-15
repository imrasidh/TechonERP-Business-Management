<?php
/**
 * Admin login rate limit: max 5 failures / 5 minutes per IP → block 10 minutes.
 * Stored in SQLite (data/rate_guard.sqlite).
 */
if (!function_exists('tc_admin_client_ip')) {
    function tc_admin_client_ip() {
        if (function_exists('techon_trusted_client_ip')) {
            return techon_trusted_client_ip();
        }
        return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    }
}

if (!function_exists('tc_admin_rate_guard_cleanup')) {
    /**
     * Remove stale rows (no active block, window older than 24h).
     */
    function tc_admin_rate_guard_cleanup() {
        try {
            $pdo = tc_admin_rate_guard_pdo();
            $now = time();
            $cut = $now - 86400;
            $pdo->prepare(
                'DELETE FROM admin_rate_guard WHERE window_start < ? AND (blocked_until = 0 OR blocked_until < ?)'
            )->execute([$cut, $now]);
        } catch (Exception $e) {
        }
    }
}

if (!function_exists('tc_admin_rate_guard_pdo')) {
    function tc_admin_rate_guard_pdo() {
        static $pdo = null;
        if ($pdo !== null) {
            return $pdo;
        }
        $path = dirname(__DIR__) . '/data/rate_guard.sqlite';
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS admin_rate_guard (
                ip TEXT PRIMARY KEY,
                window_start INTEGER NOT NULL,
                fail_count INTEGER NOT NULL,
                blocked_until INTEGER NOT NULL DEFAULT 0
            )'
        );
        return $pdo;
    }
}

/**
 * @return array{ok:bool,message?:string}
 */
if (!function_exists('tc_admin_rate_guard_check')) {
    function tc_admin_rate_guard_check($ip) {
        if ($ip === '') {
            return ['ok' => true];
        }
        tc_admin_rate_guard_cleanup();
        try {
            $pdo = tc_admin_rate_guard_pdo();
            $st = $pdo->prepare('SELECT blocked_until FROM admin_rate_guard WHERE ip = ?');
            $st->execute([$ip]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row && (int) $row['blocked_until'] > time()) {
                return ['ok' => false, 'message' => 'Too many attempts. Try again later.'];
            }
        } catch (Exception $e) {
        }
        return ['ok' => true];
    }
}

if (!function_exists('tc_admin_rate_guard_failure')) {
    function tc_admin_rate_guard_failure($ip) {
        if ($ip === '') {
            return;
        }
        tc_admin_rate_guard_cleanup();
        $now = time();
        $windowSec = 300;
        $maxFails = 5;
        $blockSec = 600;
        try {
            $pdo = tc_admin_rate_guard_pdo();
            $st = $pdo->prepare('SELECT window_start, fail_count FROM admin_rate_guard WHERE ip = ?');
            $st->execute([$ip]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                $ins = $pdo->prepare('INSERT INTO admin_rate_guard (ip, window_start, fail_count, blocked_until) VALUES (?, ?, 1, 0)');
                $ins->execute([$ip, $now]);
                $failCount = 1;
            } else {
                $ws = (int) $row['window_start'];
                $fc = (int) $row['fail_count'];
                if ($now - $ws > $windowSec) {
                    $fc = 1;
                    $ws = $now;
                } else {
                    $fc++;
                }
                $blocked = 0;
                if ($fc >= $maxFails) {
                    $blocked = $now + $blockSec;
                    $fc = 0;
                    $ws = $now;
                }
                $up = $pdo->prepare('UPDATE admin_rate_guard SET window_start = ?, fail_count = ?, blocked_until = ? WHERE ip = ?');
                $up->execute([$ws, $fc, $blocked, $ip]);
            }
        } catch (Exception $e) {
        }
    }
}

if (!function_exists('tc_admin_rate_guard_success')) {
    function tc_admin_rate_guard_success($ip) {
        if ($ip === '') {
            return;
        }
        try {
            $pdo = tc_admin_rate_guard_pdo();
            $pdo->prepare('DELETE FROM admin_rate_guard WHERE ip = ?')->execute([$ip]);
        } catch (Exception $e) {
        }
    }
}
