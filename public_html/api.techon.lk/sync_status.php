<?php
/* Sync diagnostic — shows what's in the DB for your shop
   Auth: Authorization: Bearer <tc_token> OR header X-API-Key: <shop api key>
   Delete this file after diagnosing. */
require_once 'config.php';

$pdo = db();

$token  = getBearerToken();
$apiKey = getApiKey();

if ($token) {
    $user = validateToken($token);
} elseif ($apiKey) {
    $user = validateApiKey($apiKey);
} else {
    respond([
        'error' => 'Send Authorization: Bearer <token> from dashboard localStorage (tc_token), or X-API-Key: <erp sync key>',
        'how_to_get_token' => 'Open app.techon.lk → F12 → Application → Local Storage → tc_token; use in Authorization header (not URL).',
    ], 400);
}

if (!$user) {
    respond(['error' => 'Invalid credentials. Try reconnecting the ERP first (Settings > Backup > Disconnect then Connect)', 'api_key_provided' => $apiKey ? substr($apiKey, 0, 8).'...' : 'none', 'token_provided' => $token ? substr($token, 0, 8).'...' : 'none'], 401);
}

$shopId = $user['shop_id'];

function ct($pdo, $table, $shopId) {
    try {
        $r = $pdo->prepare("SELECT COUNT(*) as c FROM `$table` WHERE shop_id = ?");
        $r->execute([$shopId]);
        return (int)$r->fetch()['c'];
    } catch (Exception $e) {
        return 'TABLE_ERROR: ' . $e->getMessage();
    }
}

$snap = $pdo->prepare('SELECT * FROM settings_snapshot WHERE shop_id = ?');
$snap->execute([$shopId]);
$snapData = $snap->fetch();

/* Sample a product to show what fields exist */
$sampleProd = null;
try {
    $sp = $pdo->prepare('SELECT * FROM products WHERE shop_id = ? LIMIT 1');
    $sp->execute([$shopId]);
    $sampleProd = $sp->fetch();
} catch(Exception $e) { $sampleProd = 'error: '.$e->getMessage(); }

respond([
    'success'        => true,
    'shop'           => $user['shop_name'],
    'shop_id'        => $shopId,
    'api_key_in_db'  => $user['api_key'],
    'counts'         => [
        'sales'              => ct($pdo, 'sales',              $shopId),
        'purchases'          => ct($pdo, 'purchases',          $shopId),
        'products'           => ct($pdo, 'products',           $shopId),
        'customers'          => ct($pdo, 'customers',          $shopId),
        'suppliers'          => ct($pdo, 'suppliers',          $shopId),
        'expenses'           => ct($pdo, 'expenses',           $shopId),
        'repairs'            => ct($pdo, 'repairs',            $shopId),
        'cheques'            => ct($pdo, 'cheques',            $shopId),
        'manual_receivables' => ct($pdo, 'manual_receivables', $shopId),
        'manual_payables'    => ct($pdo, 'manual_payables',    $shopId),
    ],
    'snapshot'       => $snapData ?: 'not found',
    'sample_product' => $sampleProd,
    'instructions'   => 'If products=0 but ERP has products, go to ERP Settings > Backup > Sync Now, then refresh this page'
]);
?>
