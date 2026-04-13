<?php
/**
 * ping.php — Health check. Auth NOT required (used for initial discovery).
 * Returns standard envelope: { success, message, data: { db, version, time } }
 */
require_once __DIR__ . '/config.php';

try {
    db()->query('SELECT 1');
    $dbOk = true;
} catch (Exception $e) {
    error_log('[ping] ' . $e->getMessage());
    $dbOk = false;
}

respond([
    'success' => $dbOk,
    'message' => $dbOk ? 'Server ready' : 'Database unavailable',
    'data'    => [
        'db'   => $dbOk ? 'connected' : 'error',
        'time' => date('Y-m-d H:i:s'),
    ],
]);
?>
