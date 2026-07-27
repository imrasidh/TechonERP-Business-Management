<?php
/**
 * wipe_shop_data.php — Hard-clear shop KV on Main PC (Reset / Restore).
 *
 * POST { "confirm": "WIPE_SHOP_DATA" }
 *
 * Deletes all tc3_* rows from kv_store so the next forceReplace upload
 * cannot merge with stale journal/sales. Localhost / API-key only.
 */
require_once __DIR__ . '/config.php';

$auth = requireAuth();
$authMode = is_array($auth) ? ($auth['mode'] ?? '') : '';
$isLoopback = function_exists('tcIsLocalhostRequest') ? tcIsLocalhostRequest() : false;
$mainActionToken = null;
if (file_exists(__DIR__ . '/tc_main_action.php')) {
    require_once __DIR__ . '/tc_main_action.php';
    if (defined('TC_MAIN_ACTION_TOKEN')) $mainActionToken = (string)TC_MAIN_ACTION_TOKEN;
}

if ($authMode === 'open' && !$isLoopback) {
    respond(['success' => false, 'message' => 'OPEN_API wipe is localhost-only'], 403);
}
/* Wiping the shop is Main PC only in every auth mode. The migration flag
   TECHON_ERP_ALLOW_LEGACY_SYNC must never open a remote wipe. */
if (!$isLoopback) {
    respond(['success' => false, 'message' => 'Shop wipe is Main PC (localhost) only'], 403);
}
if (!$mainActionToken || !hash_equals($mainActionToken, (string)($_SERVER['HTTP_X_TC_MAIN_ACTION'] ?? ''))) {
    respond(['success' => false, 'message' => 'Main action token required'], 403);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'POST required'], 405);
}

$input = getInput();
$confirm = isset($input['confirm']) ? (string)$input['confirm'] : '';
if ($confirm !== 'WIPE_SHOP_DATA') {
    respond(['success' => false, 'message' => 'confirm must be WIPE_SHOP_DATA'], 400);
}

$pdo = db();
$deleted = 0;
$clearedPatches = 0;

try {
    $pdo->beginTransaction();

    /* Keep license / device / non-shop keys; wipe ERP business payload only. */
    $stmt = $pdo->prepare(
        "DELETE FROM kv_store WHERE store_key LIKE 'tc3_%'"
    );
    $stmt->execute();
    $deleted = (int)$stmt->rowCount();

    try {
        $p = $pdo->prepare(
            "DELETE FROM processed_patches WHERE store_key LIKE 'tc3_%'"
        );
        $p->execute();
        $clearedPatches = (int)$p->rowCount();
    } catch (Exception $ePatches) {
        /* older schemas may lack store_key column — ignore */
        $clearedPatches = 0;
    }

    $pdo->commit();
    serverLog('info', 'wipe_shop_data: deleted ' . $deleted . ' kv rows, patches=' . $clearedPatches);
    respond([
        'success' => true,
        'message' => 'Shop data wiped from MySQL',
        'data' => [
            'deletedKeys' => $deleted,
            'clearedPatches' => $clearedPatches,
        ],
    ]);
} catch (Exception $e) {
    try { $pdo->rollBack(); } catch (Exception $ignored) {}
    serverLog('error', 'wipe_shop_data failed: ' . $e->getMessage());
    respond(['success' => false, 'message' => 'Wipe failed: ' . $e->getMessage()], 500);
}
