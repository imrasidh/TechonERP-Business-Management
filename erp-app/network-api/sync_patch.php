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
require_once __DIR__ . '/merge_records.php';

$auth = requireAuth();

/* Sync writes: device HMAC preferred. Legacy/open only from localhost (Main PC) unless explicitly allowed. */
$authMode = is_array($auth) ? ($auth['mode'] ?? '') : '';
$isLoopback = function_exists('tcIsLocalhostRequest') ? tcIsLocalhostRequest() : false;
if ($authMode === 'open' && !$isLoopback) {
    respond(['success' => false, 'message' => 'OPEN_API sync is localhost-only'], 403);
}
if ($authMode === 'legacy' && !$isLoopback && getenv('TECHON_ERP_ALLOW_LEGACY_SYNC') !== '1') {
    respond([
        'success' => false,
        'message' => 'Legacy API key sync is localhost-only — counters must use device authentication (or set TECHON_ERP_ALLOW_LEGACY_SYNC=1 during migration)',
    ], 403);
}

/**
 * Soft period lock for money arrays — reject locked-dated row mutations when strictPeriodLock is on.
 */
function tcRowLockDate($row, $key) {
    if (!is_array($row)) return '';
    if ($key === 'tc3_repairs') {
        return (string)($row['dateIn'] ?? $row['date'] ?? '');
    }
    if ($key === 'tc3_cheques') {
        return (string)($row['clearedDate'] ?? $row['issuedDate'] ?? $row['dueDate'] ?? $row['date'] ?? '');
    }
    if ($key === 'tc3_raw_material_usage' || $key === 'tc3_raw_material_counts') {
        return (string)($row['date'] ?? $row['usageDate'] ?? $row['countDate'] ?? '');
    }
    if ($key === 'tc3_damageLog') {
        return (string)($row['date'] ?? '');
    }
    return (string)($row['date'] ?? '');
}

function tcLoadSettingsLock($pdo) {
    static $cached = null;
    if ($cached !== null) return $cached;
    $cached = ['lockedUntilDate' => '', 'strictPeriodLock' => false];
    try {
        $st = $pdo->prepare('SELECT `value` FROM kv_store WHERE store_key = ? LIMIT 1');
        $st->execute(['tc3_settings']);
        $raw = $st->fetchColumn();
        if ($raw) {
            $j = json_decode((string)$raw, true);
            if (is_array($j)) {
                $cached['lockedUntilDate'] = (string)($j['lockedUntilDate'] ?? '');
                $cached['strictPeriodLock'] = !empty($j['strictPeriodLock']);
            }
        }
    } catch (Exception $e) { /* ignore */ }
    return $cached;
}

/** Detect locked-dated paymentHistory adds/changes on sales/purchases/manuals. */
function tcPaymentHistoryDeltaViolatesLock($oldRow, $newRow, $until) {
    if ($until === '' || !is_array($newRow)) return false;
    $oPh = (is_array($oldRow) && isset($oldRow['paymentHistory']) && is_array($oldRow['paymentHistory']))
        ? $oldRow['paymentHistory'] : [];
    $nPh = (isset($newRow['paymentHistory']) && is_array($newRow['paymentHistory']))
        ? $newRow['paymentHistory'] : [];
    $oldById = [];
    foreach ($oPh as $op) {
        if (is_array($op) && isset($op['id'])) $oldById[(string)$op['id']] = $op;
    }
    foreach ($nPh as $idx => $np) {
        if (!is_array($np)) continue;
        $d = (string)($np['date'] ?? '');
        if ($d === '') continue;
        $oldP = null;
        if (isset($np['id']) && isset($oldById[(string)$np['id']])) {
            $oldP = $oldById[(string)$np['id']];
        } elseif (!isset($np['id']) && isset($oPh[$idx]) && is_array($oPh[$idx])) {
            $oldP = $oPh[$idx];
        }
        if ($oldP) {
            if ((string)($np['date'] ?? '') !== (string)($oldP['date'] ?? '')) {
                if ($d <= $until) return true;
            }
        } else if ($d <= $until) {
            return true;
        }
    }
    return false;
}

function tcPeriodLockBlocksArrayChange($pdo, $key, $existing, $incoming) {
    $lockKeys = [
        'tc3_sales' => true, 'tc3_purchases' => true, 'tc3_expenses' => true,
        'tc3_salesReturns' => true, 'tc3_purchaseReturns' => true, 'tc3_cheques' => true,
        'tc3_repairs' => true, 'tc3_manualReceivables' => true, 'tc3_manualPayables' => true,
        'tc3_capLedger' => true, 'tc3_profitDist' => true, 'tc3_assets' => true,
        'tc3_journal_lines' => true,
        'tc3_raw_material_usage' => true, 'tc3_raw_material_counts' => true,
        'tc3_damageLog' => true,
    ];
    if (!isset($lockKeys[$key])) return null;
    $cfg = tcLoadSettingsLock($pdo);
    $until = $cfg['lockedUntilDate'];
    if ($until === '' || empty($cfg['strictPeriodLock'])) return null;
    if (!is_array($incoming)) return null;
    $phKeys = [
        'tc3_sales' => true, 'tc3_purchases' => true,
        'tc3_manualReceivables' => true, 'tc3_manualPayables' => true,
    ];
    $oldById = [];
    if (is_array($existing)) {
        foreach ($existing as $er) {
            if (is_array($er) && isset($er['id'])) $oldById[(string)$er['id']] = $er;
        }
    }
    foreach ($incoming as $nr) {
        if (!is_array($nr)) continue;
        /* No-id money rows dated in lock window: reject (prevents silent bypass). */
        if (!isset($nr['id'])) {
            $dBare = tcRowLockDate($nr, $key);
            if ($dBare !== '' && $dBare <= $until) {
                return $key . ': period lock — cannot add/modify row without id dated on/before ' . $until;
            }
            continue;
        }
        $id = (string)$nr['id'];
        $dNew = tcRowLockDate($nr, $key);
        $old = $oldById[$id] ?? null;
        if ($old) {
            $dOld = tcRowLockDate($old, $key);
            if ($dOld !== '' && $dOld <= $until) {
                $oJson = json_encode($old);
                $nJson = json_encode($nr);
                if ($oJson !== $nJson) {
                    return $key . ': period lock — cannot modify row dated on/before ' . $until;
                }
            }
            if (isset($phKeys[$key]) && tcPaymentHistoryDeltaViolatesLock($old, $nr, $until)) {
                return $key . ': period lock — cannot add/change payment dated on/before ' . $until;
            }
        } else if ($dNew !== '' && $dNew <= $until) {
            return $key . ': period lock — cannot add row dated on/before ' . $until;
        } else if (isset($phKeys[$key]) && tcPaymentHistoryDeltaViolatesLock(null, $nr, $until)) {
            return $key . ': period lock — cannot add payment dated on/before ' . $until;
        }
    }
    /* Deletes of locked-dated rows */
    $newIds = [];
    foreach ($incoming as $nr) {
        if (is_array($nr) && isset($nr['id'])) $newIds[(string)$nr['id']] = true;
    }
    foreach ($oldById as $oid => $orow) {
        if (!empty($newIds[$oid])) continue;
        $dOld = tcRowLockDate($orow, $key);
        if ($dOld !== '' && $dOld <= $until) {
            return $key . ': period lock — cannot delete row dated on/before ' . $until;
        }
    }
    return null;
}

/**
 * Map device permissions → which storage keys this counter may write.
 * Deny by default when the matching permission bit is false.
 */
function tcDeviceMayWriteKey($auth, $key) {
    if (!is_array($auth) || ($auth['mode'] ?? '') !== 'device') return true;
    $device = $auth['device'] ?? null;
    if (!$device) return false;
    $perms = $device['permissions'] ?? null;
    if (is_string($perms)) $perms = json_decode($perms, true);
    if (!is_array($perms)) $perms = [];
    if (!empty($perms['admin']) || !empty($perms['manager'])) return true;

    $accountsKeys = [
        'tc3_users' => true,
        'tc3_settings' => true,
        'tc3_journal_lines' => true,
        'tc3_gl_accounts' => true,
        'tc3_gl_mode' => true,
        'tc3_gl_audit' => true,
        'tc3_journal_hash' => true,
        'tc3_financial_snapshots' => true,
        'tc3_openBal' => true,
        'tc3_capLedger' => true,
        'tc3_capLog' => true,
        'tc3_profitDist' => true,
        'tc3_admin_name' => true,
        'tc3_financial_mutation_log' => true,
        'tc3_apppass' => true,
    ];
    $salesKeys = [
        'tc3_sales' => true,
        'tc3_salesReturns' => true,
        'tc3_quotations' => true,
        'tc3_held_invoices' => true,
        'tc3_customers' => true,
        'tc3_manualReceivables' => true,
        'tc3_cheques' => true,
        'tc3_codRecords' => true,
        'tc3_codPartners' => true,
        'tc3_codWithdrawals' => true,
        'tc3_codProfitSettings' => true,
        'tc3_invoice_edit_locks' => true,
        'tc3_repairs' => true,
        'tc3_repairDeleteLog' => true,
        'tc3_others' => true,
    ];
    $inventoryKeys = [
        'tc3_products' => true,
        'tc3_purchases' => true,
        'tc3_purchaseReturns' => true,
        'tc3_suppliers' => true,
        'tc3_manualPayables' => true,
        'tc3_damageLog' => true,
        'tc3_productLog' => true,
        'tc3_stock_movements' => true,
        'tc3_inv_reconciliation' => true,
        'tc3_inventory_layers' => true,
        'tc3_raw_material_usage' => true,
        'tc3_raw_material_counts' => true,
        'tc3_assets' => true,
        'tc3_assetLog' => true,
        'tc3_expenses' => true,
    ];
    if (isset($accountsKeys[$key])) {
        return !empty($perms['accounts']);
    }
    if (isset($salesKeys[$key])) {
        return !empty($perms['sales']);
    }
    if (isset($inventoryKeys[$key])) {
        return !empty($perms['inventory']);
    }
    /* Remaining keys (labels, audit, business type, …) need reports or sales. */
    return !empty($perms['reports']) || !empty($perms['sales']) || !empty($perms['inventory']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'POST required'], 405);
}

$input    = getInput();
$patches  = isset($input['patches']) && is_array($input['patches']) ? $input['patches'] : [];
$clientId = isset($input['client_id']) ? (string)$input['client_id'] : '';

if (empty($patches)) {
    respond(['success' => false, 'message' => 'No patches provided'], 400);
}
if (count($patches) > 200) {
    respond(['success' => false, 'message' => 'Too many patches in one request (max 200)'], 400);
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
    'tc3_codRecords'         => 'array',
    'tc3_codPartners'        => 'array',
    'tc3_codProfitSettings'  => 'object',
    'tc3_codWithdrawals'     => 'array',
    'tc3_invoice_edit_locks' => 'array',
    'tc3_raw_material_usage' => 'array',
    'tc3_raw_material_counts'=> 'array',
    'tc3_users'              => 'array',
    'tc3_others'             => 'array',
    'tc3_repair3p_product_seq'=> 'any',
    'tc3_financial_mutation_log' => 'array',
];

function validatePatchValue($key, $value, $expectedType) {
    if ($expectedType === 'any')    return null;
    if ($expectedType === 'array'  && !is_array($value))  return $key . ': expected array';
    if ($expectedType === 'object' && (!is_array($value) || array_keys($value) === range(0, count($value) - 1)))
        return $key . ': expected object';
    if ($expectedType === 'array' && is_array($value)) {
        $maxItems = 50000;
        if (count($value) > $maxItems) return $key . ': too many items (max ' . $maxItems . ')';
        $err = tcValidateArrayItems($key, $value);
        if ($err) return $err;
    }
    return null;
}

/**
 * Light per-key item bounds — reject obviously hostile / corrupt payloads without blocking normal ERP shapes.
 */
function tcValidateArrayItems($key, $arr) {
    $moneyKeys = [
        'tc3_sales' => true,
        'tc3_purchases' => true,
        'tc3_expenses' => true,
        'tc3_cheques' => true,
        'tc3_salesReturns' => true,
        'tc3_purchaseReturns' => true,
        'tc3_manualReceivables' => true,
        'tc3_manualPayables' => true,
        'tc3_journal_lines' => true,
    ];
    $i = 0;
    foreach ($arr as $row) {
        $i++;
        if ($i > 50000) break;
        if (!is_array($row)) {
            if ($key === 'tc3_journal_lines' || isset($moneyKeys[$key])) {
                return $key . ': item must be object';
            }
            continue;
        }
        if (isset($row['id']) && is_string($row['id']) && strlen($row['id']) > 128) {
            return $key . ': id too long';
        }
        foreach (['total', 'paid', 'paidAmount', 'amount', 'balance', 'debit', 'credit', 'qty', 'cost', 'price'] as $numField) {
            if (!array_key_exists($numField, $row)) continue;
            $n = $row[$numField];
            if ($n === null || $n === '') continue;
            if (is_string($n) && !is_numeric($n)) return $key . ': ' . $numField . ' must be numeric';
            if (is_numeric($n)) {
                $f = (float)$n;
                if (!is_finite($f)) return $key . ': ' . $numField . ' must be finite';
                if (abs($f) > 1e12) return $key . ': ' . $numField . ' out of bounds';
            }
        }
        if ($key === 'tc3_journal_lines') {
            if (isset($row['accountId']) && is_string($row['accountId']) && strlen($row['accountId']) > 32) {
                return $key . ': accountId too long';
            }
        }
        if ($key === 'tc3_users') {
            if (isset($row['passwordHash']) && is_string($row['passwordHash']) && strlen($row['passwordHash']) > 512) {
                return $key . ': passwordHash too long';
            }
            if (isset($row['role']) && is_string($row['role'])) {
                $role = strtolower($row['role']);
                if (!in_array($role, ['admin', 'manager', 'cashier', 'viewer', 'stock'], true)) {
                    return $key . ': invalid role';
                }
            }
        }
        if ($key === 'tc3_cheques' && isset($row['status']) && is_string($row['status'])) {
            $st = $row['status'];
            if (!in_array($st, ['Pending', 'Cleared', 'Bounced', 'Voided', 'Cancelled'], true)) {
                return $key . ': invalid cheque status';
            }
        }
    }
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

/* Multi-key batches (sale+stock+cheque) commit atomically so peers never see half a sale */
$batchTxn = is_array($patches) && count($patches) > 1;
if ($batchTxn) {
    try { $pdo->beginTransaction(); } catch (Exception $e) { $batchTxn = false; }
}

foreach ($patches as $patch) {
    if (!isset($patch['key'])) { continue; }
    $key     = (string)$patch['key'];
    $patchId = isset($patch['patch_id']) ? (string)$patch['patch_id'] : '';

    // ── Allowed key check ──────────────────────────────────────────
    if (!array_key_exists($key, $ALLOWED)) {
        $failed[] = ['key' => $key, 'reason' => 'Key not allowed'];
        continue;
    }
    if (!tcDeviceMayWriteKey($auth, $key)) {
        $failed[] = ['key' => $key, 'reason' => 'Device permission denied for key'];
        serverLog('warn', 'Device permission denied for ' . $key);
        continue;
    }

    $value   = $patch['value'] ?? null;
    $typeErr = validatePatchValue($key, $value, $ALLOWED[$key]);
    if ($typeErr) {
        $failed[] = ['key' => $key, 'reason' => $typeErr];
        serverLog('warn', 'Validation failed: ' . $typeErr);
        continue;
    }

    // ── Duplicate patch protection — reserve id BEFORE write ────────
    if ($patchId !== '') {
        $dedupId = $patchId . ':' . $key;
        try {
            $dedupInsert->execute([$dedupId, $key]);
            if ($dedupInsert->rowCount() === 0) {
                $duplicates[] = $key;
                serverLog('info', 'Duplicate patch skipped: ' . $dedupId);
                continue;
            }
        } catch (Exception $e) {
            $duplicates[] = $key;
            serverLog('info', 'Duplicate patch skipped (conflict): ' . $dedupId);
            continue;
        }
    }

    $json = json_encode($value, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        $failed[] = ['key' => $key, 'reason' => 'JSON encoding failed'];
        continue;
    }

    /* Admin restore/reset: hard-replace MySQL value (skip merge / append-only / mass-wipe guards). */
    $forceReplace = !empty($patch['_forceReplace']);
    if ($forceReplace) {
        /* Counters must not wipe the shop — Main PC / localhost / API-key only. */
        if ($authMode === 'device' && !$isLoopback) {
            $failed[] = ['key' => $key, 'reason' => 'forceReplace not allowed from counter device'];
            serverLog('warn', 'forceReplace denied for device on ' . $key);
            continue;
        }
        serverLog('info', 'forceReplace applied for ' . $key);
        /* Skip merge + period-lock — intentional full snapshot from Main PC restore/reset. */
    }
    /* Array patches: chunked = additive merge; full snapshot = incoming membership (deletes work) */
    else if (is_array($value) && $ALLOWED[$key] === 'array') {
        try {
            $verifyStmt->execute([$key]);
            $existingRaw = $verifyStmt->fetchColumn();
            $existing = ($existingRaw !== false && $existingRaw !== null)
                ? json_decode((string)$existingRaw, true)
                : [];
            if (!is_array($existing)) $existing = [];
            $isChunk = !empty($patch['_chunk']);
            if ($key === 'tc3_invoice_edit_locks') {
                /* Soft locks: never drop other counters' locks via full-array snapshot. */
                $value = tcMergeRecordArraysByNewest($existing, $value, $key);
            } else if ($isChunk) {
                $value = tcMergeRecordArraysByNewest($existing, $value, $key);
            } else {
                $value = tcApplyFullArraySnapshot($existing, $value, $key);
            }
            $lockErr = tcPeriodLockBlocksArrayChange($pdo, $key, $existing, $value);
            if ($lockErr) {
                $failed[] = ['key' => $key, 'reason' => $lockErr];
                serverLog('warn', 'Period lock blocked: ' . $lockErr);
                continue;
            }
            $typeErr2 = validatePatchValue($key, $value, $ALLOWED[$key]);
            if ($typeErr2) {
                $failed[] = ['key' => $key, 'reason' => 'After merge: ' . $typeErr2];
                continue;
            }
            $json = json_encode($value, JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                $failed[] = ['key' => $key, 'reason' => 'JSON encoding failed after merge'];
                continue;
            }
        } catch (Exception $e) {
            serverLog('warn', 'Array merge failed for ' . $key . ': ' . $e->getMessage());
        }
    }

    /* Settings: shallow merge so counter POS toggles do not wipe main shop config */
    if (!$forceReplace && $key === 'tc3_settings' && is_array($value)) {
        try {
            $verifyStmt->execute([$key]);
            $existingRaw = $verifyStmt->fetchColumn();
            $existing = ($existingRaw !== false && $existingRaw !== null)
                ? json_decode((string)$existingRaw, true)
                : [];
            if (!is_array($existing)) $existing = [];
            if (isset($existing['moduleToggles']) && is_array($existing['moduleToggles'])
                && isset($value['moduleToggles']) && is_array($value['moduleToggles'])) {
                $value['moduleToggles'] = array_merge($existing['moduleToggles'], $value['moduleToggles']);
            }
            $value = array_merge($existing, $value);
            $json = json_encode($value, JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                $failed[] = ['key' => $key, 'reason' => 'JSON encoding failed after settings merge'];
                continue;
            }
        } catch (Exception $e) {
            serverLog('warn', 'Settings merge failed: ' . $e->getMessage());
        }
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
    } catch (PDOException $e) {
        $failed[] = ['key' => $key, 'reason' => 'database_error'];
        serverLog('error', 'DB write failed for ' . $key . ': ' . $e->getMessage());
        if ($batchTxn) break;
    }
}

if ($batchTxn) {
    try {
        if (count($failed) > 0) {
            $pdo->rollBack();
            /* After rollback nothing was committed — clear optimistic saved list */
            $saved = [];
        } else {
            $pdo->commit();
        }
    } catch (Exception $e) {
        try { $pdo->rollBack(); } catch (Exception $ignored) {}
        $saved = [];
        $failed[] = ['key' => '_batch', 'reason' => 'transaction_failed'];
        serverLog('error', 'Batch transaction failed: ' . $e->getMessage());
    }
}

$VOID_RETURN_KEYS = ['tc3_sales', 'tc3_salesReturns', 'tc3_purchases', 'tc3_purchaseReturns'];
if (count(array_intersect($saved, $VOID_RETURN_KEYS)) > 0) {
    try {
        tcReconcileVoidReturnStateOnServer(db());
    } catch (Exception $e) {
        serverLog('warn', 'Void/return reconcile failed: ' . $e->getMessage());
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
