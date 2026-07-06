<?php
/**
 * server_state.php — Return full or partial ERP state.
 * Auth: X-TC-KEY required.
 * GET ?keys=tc3_products,tc3_customers → returns only those keys
 * GET (no params) → returns ALL ERP keys
 * Returns: { success, message, data: { tc3_products: [...], ... }, keys: [...] }
 */
require_once __DIR__ . '/config.php';

requireAuth();

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

if (empty($requested)) {
    respond(['success' => false, 'message' => 'No valid keys requested'], 400);
}

$placeholders = implode(',', array_fill(0, count($requested), '?'));
$pdo  = db();
$stmt = $pdo->prepare("SELECT store_key, `value` FROM kv_store WHERE store_key IN ($placeholders)");
$stmt->execute($requested);
$rows = $stmt->fetchAll();

$result = [];
foreach ($requested as $k) {
    $result[$k] = (strpos($k, 'tc3_settings') !== false) ? (object)[] : [];
}
foreach ($rows as $row) {
    $decoded = json_decode($row['value'], true);
    $result[$row['store_key']] = ($decoded !== null) ? $decoded : [];
}

respond([
    'success' => true,
    'message' => count($result) . ' keys returned',
    'data'    => $result,
    'keys'    => array_keys($result),
]);
?>
