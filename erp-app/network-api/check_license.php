<?php
/**
 * check_license.php — Clients read the server's license status.
 *
 * Auth: X-TC-KEY required (same as all other LAN endpoints).
 *
 * Reads from shop_license table (id = 1).
 * Clients must NEVER call save_license.php — read-only access here.
 *
 * Response format:
 *   {
 *     success   : true | false,
 *     valid     : true | false,
 *     status    : "trial" | "activated" | "expired" | "locked",
 *     message   : "...",
 *     data: {
 *       shop_name : "...",
 *       plan      : "...",
 *       expires   : "2026-01-01" | null,
 *       days_left : 10 | null
 *     }
 *   }
 */
require_once __DIR__ . '/config.php';

requireAuth();

$pdo = db();

/* ── Try to read from shop_license table ────────────────────────── */
$row = null;
try {
    $stmt = $pdo->query("SELECT * FROM `shop_license` WHERE `id` = 1 LIMIT 1");
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    /* Table doesn't exist yet — server not fully set up */
    serverLog('warn', '[check_license] shop_license table missing: ' . $e->getMessage());
    respond([
        'success'  => false,
        'valid'    => false,
        'status'   => 'locked',
        'message'  => 'Server license not configured yet. Please activate on the main server PC.',
        'data'     => ['shop_name' => '', 'plan' => '', 'expires' => null, 'days_left' => null],
    ]);
}

/* ── Check if license is present and activated ──────────────────── */
if (!$row || $row['status'] === 'none' || empty($row['license_key'])) {
    respond([
        'success'  => false,
        'valid'    => false,
        'status'   => 'locked',
        'message'  => 'Server license not activated. Please activate on the main server PC first.',
        'data'     => ['shop_name' => $row['shop_name'] ?? '', 'plan' => '', 'expires' => null, 'days_left' => null],
    ]);
}

/* ── Calculate days remaining ───────────────────────────────────── */
$daysLeft = null;
$isExpired = ($row['status'] === 'expired');

if (!$isExpired && !empty($row['expires_at']) && $row['plan'] !== 'lifetime') {
    $exp = strtotime($row['expires_at']);
    if ($exp !== false && $exp > 0) {
        $daysLeft  = max(0, (int) ceil(($exp - time()) / 86400));
        $isExpired = ($daysLeft <= 0);
    }
}

$finalStatus = $isExpired ? 'expired' : ($row['status'] ?? 'activated');

/* ── If server is in trial mode, include actual module counts so network
   clients can enforce limits against server data (not local cache).
   Clients MUST use these counts — never their own local array lengths.  */
$serverCounts     = null;
$trialMaxRecords  = 20;

if ($finalStatus === 'trial') {
    $trialMaxRecords = 20; /* keep in sync with TRIAL_MAX_RECORDS in main.cjs */
    $countTables = [
        'sales'     => 'tc3_sales',
        'products'  => 'tc3_products',
        'customers' => 'tc3_customers',
        'expenses'  => 'tc3_expenses',
        'purchases' => 'tc3_purchases',
        'suppliers' => 'tc3_suppliers',
        'quotations'=> 'tc3_quotations',
        'repairs'   => 'tc3_repairs',
    ];
    $serverCounts = [];
    foreach ($countTables as $key => $table) {
        try {
            $cnt = $pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
            $serverCounts[$key] = (int)$cnt;
        } catch (Exception $e) {
            $serverCounts[$key] = 0; /* table missing = 0 records */
        }
    }
    serverLog('info', '[check_license] Trial counts: ' . json_encode($serverCounts));
}

respond([
    'success'        => true,
    'valid'          => !$isExpired,
    'status'         => $finalStatus,
    'message'        => $isExpired ? 'Server license has expired. Please renew.' : 'License valid',
    /* supportsCounts tells clients this server version can supply module counts.
       Clients use this flag to distinguish "server is old" from "server is offline". */
    'supportsCounts' => true,
    'data'           => [
        'shop_name'      => $row['shop_name'] ?? '',
        'plan'           => $row['plan']      ?? '',
        'expires'        => $row['expires_at'] ?? null,
        'days_left'      => $daysLeft,
        'serverCounts'   => $serverCounts,    /* null when not trial */
        'trialMaxRecords'=> $trialMaxRecords,
    ],
]);
?>
