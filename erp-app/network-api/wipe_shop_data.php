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

if ($authMode === 'open' && !$isLoopback) {
    respond(['success' => false, 'message' => 'OPEN_API wipe is localhost-only'], 403);
}
if ($authMode === 'legacy' && !$isLoopback && getenv('TECHON_ERP_ALLOW_LEGACY_SYNC') !== '1') {
    respond(['success' => false, 'message' => 'Legacy wipe is localhost-only'], 403);
}
if ($authMode === 'device' && !$isLoopback) {
    respond(['success' => false, 'message' => 'Shop wipe not allowed from counter device'], 403);
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
