<?php
/**
 * sync_patch.php — Receive key-value patches from ERP desktop.
 *
 * POST body: {
 *   "patches":   [{ "key": "tc3_products", "value": [...], "patch_id": "uuid" }],
 *   "client_id": "..."
 * }
 *
 * Safety guarantees:
 *  1. Auth: X-TC-KEY header required.
 *  2. Validation: key must be in allowed list, value must match expected type.
 *  3. Dedup: each patch_id is checked against processed_patches — duplicates are skipped.
 *  4. Write verification: after UPSERT, the stored value is read back and its
 *     JSON length is compared to what was written. Mismatch → fail that key.
 *  5. Returns: { success, message, data: { saved, failed, duplicates } }
 */
require_once __DIR__ . '/config.php';

requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'POST required'], 405);
}

$input    = getInput();
$patches  = isset($input['patches']) && is_array($input['patches']) ? $input['patches'] : [];
$clientId = isset($input['client_id']) ? (string)$input['client_id'] : '';

if (empty($patches)) {
    respond(['success' => false, 'message' => 'No patches provided'], 400);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if ($clientId) touchSession($clientId, $ip);

// ── Purge processed_patches older than 7 days (lightweight GC) ──────
try {
    db()->exec("DELETE FROM processed_patches WHERE processed_at < NOW() - INTERVAL 7 DAY");
} catch (Exception $ignored) {}

// ── Allowed keys + expected types ───────────────────────────────────
$ALLOWED = [
    'tc3_settings'         => 'object',
    'tc3_products'         => 'array',
    'tc3_customers'        => 'array',
    'tc3_suppliers'        => 'array',
    'tc3_sales'            => 'array',
    'tc3_purchases'        => 'array',
    'tc3_expenses'         => 'array',
    'tc3_repairs'          => 'array',
    'tc3_assets'           => 'array',
    'tc3_damageLog'        => 'array',
    'tc3_productLog'       => 'array',
    'tc3_repairDeleteLog'  => 'array',
    'tc3_salesReturns'     => 'array',
    'tc3_purchaseReturns'  => 'array',
    'tc3_quotations'       => 'array',
    'tc3_cheques'          => 'array',
    'tc3_manualReceivables'=> 'array',
    'tc3_manualPayables'   => 'array',
    'tc3_capLedger'        => 'array',
    'tc3_capLog'           => 'array',
    'tc3_profitDist'       => 'array',
    'tc3_assetLog'         => 'array',
    'tc3_openBal'          => 'any',
    'tc3_labelDesigns'     => 'array',
    'tc3_businessType'     => 'any',
    'tc3_auditLog'         => 'array',
    'tc3_admin_name'       => 'any',
    'tc3_held_invoices'    => 'array',
    'tc3_journal_lines'  => 'array',
    'tc3_gl_accounts'    => 'array',
    'tc3_gl_mode'        => 'any',
    'tc3_gl_audit'       => 'array',
    'tc3_journal_hash'   => 'any',
    'tc3_gl_last_error'  => 'any',
    'tc3_stock_movements' => 'array',
    'tc3_inv_reconciliation' => 'any',
    'tc3_inventory_layers'   => 'object',
    'tc3_financial_snapshots' => 'array',
];

function validatePatchValue($key, $value, $expectedType) {
    if ($expectedType === 'any')    return null;
    if ($expectedType === 'array'  && !is_array($value))  return $key . ': expected array';
    if ($expectedType === 'object' && (!is_array($value) || array_keys($value) === range(0, count($value) - 1)))
        return $key . ': expected object';
    return null;
}

$pdo        = db();
$saved      = [];
$failed     = [];
$duplicates = [];

$upsertStmt = $pdo->prepare(
    'INSERT INTO kv_store (store_key, `value`) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
);
$verifyStmt  = $pdo->prepare('SELECT `value` FROM kv_store WHERE store_key = ?');
$dedupCheck  = $pdo->prepare('SELECT 1 FROM processed_patches WHERE patch_id = ? LIMIT 1');
$dedupInsert = $pdo->prepare(
    'INSERT IGNORE INTO processed_patches (patch_id, store_key) VALUES (?, ?)'
);

foreach ($patches as $patch) {
    if (!isset($patch['key'])) { continue; }
    $key     = (string)$patch['key'];
    $patchId = isset($patch['patch_id']) ? (string)$patch['patch_id'] : '';

    // ── Allowed key check ──────────────────────────────────────────
    if (!array_key_exists($key, $ALLOWED)) {
        $failed[] = ['key' => $key, 'reason' => 'Key not allowed'];
        continue;
    }

    $value   = $patch['value'] ?? null;
    $typeErr = validatePatchValue($key, $value, $ALLOWED[$key]);
    if ($typeErr) {
        $failed[] = ['key' => $key, 'reason' => $typeErr];
        serverLog('warn', 'Validation failed: ' . $typeErr);
        continue;
    }

    // ── Reject empty arrays for critical data ──────────────────────
    if (is_array($value) && count($value) === 0) {
        $allowEmpty = in_array($key, [
            'tc3_auditLog','tc3_damageLog','tc3_productLog',
            'tc3_repairDeleteLog','tc3_salesReturns','tc3_purchaseReturns',
            'tc3_quotations','tc3_cheques','tc3_manualReceivables','tc3_manualPayables',
            'tc3_capLedger','tc3_capLog','tc3_profitDist','tc3_assetLog',
            'tc3_held_invoices','tc3_labelDesigns',
            'tc3_journal_lines','tc3_gl_accounts',
        ]);
        if (!$allowEmpty) {
            $failed[] = ['key' => $key, 'reason' => 'Rejecting empty array for ' . $key];
            serverLog('warn', 'Rejected empty array for ' . $key . ' from client ' . $clientId);
            continue;
        }
    }

    // ── Duplicate patch protection ─────────────────────────────────
    if ($patchId !== '') {
        $dedupId = $patchId . ':' . $key; // key is part of the unique ID
        try {
            $dedupCheck->execute([$dedupId]);
            if ($dedupCheck->fetchColumn()) {
                $duplicates[] = $key;
                serverLog('info', 'Duplicate patch skipped: ' . $dedupId);
                continue;
            }
        } catch (Exception $e) {
            serverLog('warn', 'Dedup check failed: ' . $e->getMessage());
        }
    }

    $json = json_encode($value, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        $failed[] = ['key' => $key, 'reason' => 'JSON encoding failed'];
        continue;
    }

    try {
        // ── Write ───────────────────────────────────────────────────
        $upsertStmt->execute([$key, $json]);

        // ── Verify: read back and compare encoded length ────────────
        $verifyStmt->execute([$key]);
        $stored = $verifyStmt->fetchColumn();
        if ($stored === false || strlen($stored) !== strlen($json)) {
            $failed[] = ['key' => $key, 'reason' => 'Write verification failed (length mismatch)'];
            serverLog('error', 'Write verification failed for ' . $key . ' — written=' . strlen($json) . ' stored=' . ($stored === false ? 'null' : strlen($stored)));
            continue;
        }

        $saved[] = $key;

        // ── Record patch ID to block future duplicates ──────────────
        if ($patchId !== '') {
            try {
                $dedupInsert->execute([$patchId . ':' . $key, $key]);
            } catch (Exception $ignored) {}
        }
    } catch (PDOException $e) {
        $failed[] = ['key' => $key, 'reason' => 'database_error'];
        serverLog('error', 'DB write failed for ' . $key . ': ' . $e->getMessage());
    }
}

/* success = no failed writes; duplicate-only batches are still OK (idempotent) */
$success = count($failed) === 0;
$dedupeOnly = empty($saved) && empty($failed) && !empty($duplicates);

respond([
    'success' => $success,
    'message' => $dedupeOnly
        ? 'No new rows (duplicates only)'
        : (count($saved) . ' saved, ' . count($failed) . ' failed, ' . count($duplicates) . ' skipped (duplicate)'),
    'data'    => [
        'saved'       => $saved,
        'failed'      => $failed,
        'duplicates'  => $duplicates,
        'dedupe_only' => $dedupeOnly,
        'time'        => date('Y-m-d H:i:s'),
    ],
]);
?>
