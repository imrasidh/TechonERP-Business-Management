<?php
/**
 * health_check.php — Deep database health check.
 *
 * Checks:
 *  1. MySQL connection
 *  2. Required tables exist
 *  3. Basic read on kv_store works
 *  4. Returns structured status with per-check results
 *
 * Auth: X-TC-KEY required (same as all other endpoints).
 * Used by:
 *  - App on server-mode startup
 *  - Client before showing "database issue" warning
 *
 * Returns:
 *  { success: true/false, message: "...", data: { checks: {...}, tables: [...] } }
 */
require_once __DIR__ . '/config.php';

$auth = requireAuth();
tcEnforceRemoteAuthPolicy($auth);

$checks = [
    'db_connection' => false,
    'kv_store'      => false,
    'audit_log'     => false,
    'client_sessions'    => false,
    'processed_patches'  => false,
    'basic_read'    => false,
];
$details = [];
$allOk   = true;

// ── 1. DB Connection ────────────────────────────────────────────────
try {
    db()->query('SELECT 1');
    $checks['db_connection'] = true;
} catch (Exception $e) {
    error_log('[health_check] DB: ' . $e->getMessage());
    $details[] = 'DB connection failed';
    $allOk = false;
    // Cannot continue without DB
    respond([
        'success' => false,
        'message' => 'Database connection failed. Check if MySQL is running.',
        'data'    => ['checks' => $checks, 'details' => $details],
    ]);
}

// ── 2. Required tables ───────────────────────────────────────────────
$requiredTables = ['kv_store', 'audit_log', 'client_sessions', 'processed_patches'];
try {
    $pdo  = db();
    $stmt = $pdo->query("SHOW TABLES");
    $existing = array_column($stmt->fetchAll(PDO::FETCH_NUM), 0);
    foreach ($requiredTables as $tbl) {
        if (in_array($tbl, $existing)) {
            $checks[$tbl] = true;
        } else {
            $details[] = 'Missing table: ' . $tbl;
            $allOk = false;
        }
    }
} catch (Exception $e) {
    error_log('[health_check] tables: ' . $e->getMessage());
    $details[] = 'Table check failed';
    $allOk = false;
}

// ── 3. Basic read on kv_store ────────────────────────────────────────
if ($checks['kv_store']) {
    try {
        $pdo  = db();
        $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM kv_store");
        $row  = $stmt->fetch();
        $checks['basic_read'] = true;
        $details[] = 'kv_store has ' . $row['cnt'] . ' rows';
    } catch (Exception $e) {
        error_log('[health_check] kv read: ' . $e->getMessage());
        $details[] = 'Basic read failed';
        $allOk = false;
    }
}

// ── 4. Auto-create missing processed_patches table if absent ─────────
if (!$checks['processed_patches']) {
    try {
        db()->exec("
            CREATE TABLE IF NOT EXISTS processed_patches (
              patch_id     VARCHAR(128) NOT NULL,
              store_key    VARCHAR(255) NOT NULL,
              processed_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (patch_id),
              INDEX idx_processed_at (processed_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        $checks['processed_patches'] = true;
        $details[] = 'processed_patches table was created automatically';
        $allOk = true; // re-evaluate
        $vals = array_values($checks);
        $allOk = true;
        foreach ($vals as $v) {
            if ($v === false) {
                $allOk = false;
                break;
            }
        }
    } catch (Exception $e) {
        error_log('[health_check] processed_patches: ' . $e->getMessage());
        $details[] = 'Could not create processed_patches table';
    }
}

$allOk = !in_array(false, $checks, true);

$presentTables = [];
foreach ($checks as $k => $v) {
    if ($v === true && in_array($k, $requiredTables, true)) {
        $presentTables[] = $k;
    }
}

respond([
    'success' => $allOk,
    'message' => $allOk ? 'All health checks passed' : 'Some checks failed — see details',
    'data'    => [
        'checks'  => $checks,
        'tables'  => $presentTables,
        'details' => $details,
        'time'    => date('Y-m-d H:i:s'),
    ],
]);
?>
