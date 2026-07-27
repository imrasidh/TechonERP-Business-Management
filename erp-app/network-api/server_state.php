<?php
/**
 * server_state.php — Return full or partial ERP state.
 * Auth: X-TC-KEY required.
 * GET ?keys=tc3_products,tc3_customers → returns only those keys
 * GET (no params) → returns ALL ERP keys
 * Returns: { success, message, data: { tc3_products: [...], ... }, keys: [...] }
 */
require_once __DIR__ . '/config.php';

$auth = requireAuth();
$authMode = is_array($auth) ? ($auth['mode'] ?? '') : '';
tcEnforceRemoteAuthPolicy($auth);

$clientId = $_SERVER['HTTP_X_TC_CLIENT_ID'] ?? '';
$ip       = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if ($clientId) touchSession($clientId, $ip);

$ALL_KEYS = [
    'tc3_settings', 'tc3_products', 'tc3_customers', 'tc3_suppliers',
    'tc3_sales', 'tc3_purchases', 'tc3_expenses', 'tc3_repairs',
    'tc3_assets', 'tc3_damageLog', 'tc3_productLog', 'tc3_repairDeleteLog',
    'tc3_salesReturns', 'tc3_purchaseReturns', 'tc3_quotations', 'tc3_cheques',
    'tc3_manualReceivables', 'tc3_manualPayables',
    'tc3_capLedger', 'tc3_capLog', 'tc3_profitDist', 'tc3_assetLog',
    'tc3_openBal', 'tc3_labelDesigns', 'tc3_businessType',
    'tc3_auditLog', 'tc3_admin_name', 'tc3_held_invoices',
    /* Keep in sync with sync_patch.php — full client hydrate after restart */
    'tc3_journal_lines', 'tc3_gl_accounts', 'tc3_gl_mode', 'tc3_gl_audit',
    'tc3_journal_hash', 'tc3_gl_last_error', 'tc3_stock_movements',
    'tc3_inv_reconciliation', 'tc3_inventory_layers', 'tc3_financial_snapshots',
    'tc3_codRecords', 'tc3_codPartners',
    'tc3_codProfitSettings',
    'tc3_codWithdrawals',
    'tc3_invoice_edit_locks',
    'tc3_raw_material_usage',
    'tc3_raw_material_counts',
    'tc3_users',
    'tc3_others',
    'tc3_repair3p_product_seq',
    'tc3_financial_mutation_log',
];

$requested = [];
if (!empty($_GET['keys'])) {
    $requested = array_values(array_intersect(
        array_filter(array_map('trim', explode(',', $_GET['keys']))),
        $ALL_KEYS
    ));
} else {
    $requested = $ALL_KEYS;
}

/* Read ACL: sales-only devices must not hydrate journal/GL/accounts keys. */
if ($authMode === 'device') {
    $requested = array_values(array_filter($requested, function ($k) use ($auth) {
        return tcDeviceMayReadKey($auth, $k);
    }));
}

if (empty($requested)) {
    respond(['success' => false, 'message' => 'No permitted keys for this device'], 403);
}

$placeholders = implode(',', array_fill(0, count($requested), '?'));
$pdo  = db();
$stmt = $pdo->prepare("SELECT store_key, `value` FROM kv_store WHERE store_key IN ($placeholders)");
$stmt->execute($requested);
$rows = $stmt->fetchAll();

$result = [];
/* Only return keys that exist in kv_store — missing keys must not arrive as []
   and wipe a good local chart of accounts / scalar GL fields on pull. */
foreach ($rows as $row) {
    $decoded = json_decode($row['value'], true);
    if ($decoded !== null) {
        $result[$row['store_key']] = $decoded;
    }
}

/* Never ship password hashes / credential material to LAN clients. */
if (isset($result['tc3_users']) && is_array($result['tc3_users'])) {
    $result['tc3_users'] = array_map(function ($u) {
        if (!is_array($u)) return $u;
        unset($u['passwordHash'], $u['password'], $u['pin'], $u['pinHash']);
        return $u;
    }, $result['tc3_users']);
}
if (isset($result['tc3_settings']) && is_array($result['tc3_settings'])) {
    unset(
        $result['tc3_settings']['mainAdminPassHash'],
        $result['tc3_settings']['appPassHash'],
        $result['tc3_settings']['passwordHash'],
        $result['tc3_settings']['adminPin']
    );
}
if (array_key_exists('tc3_apppass', $result)) {
    $result['tc3_apppass'] = '';
}

respond([
    'success' => true,
    'message' => count($result) . ' keys returned',
    'data'    => $result,
    'keys'    => array_keys($result),
]);
?>
