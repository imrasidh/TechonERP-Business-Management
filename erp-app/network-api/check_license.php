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
const TRIAL_MAX_CLIENTS = 2;

$pdo = db();
try { $pdo->exec("ALTER TABLE shop_license ADD COLUMN max_clients INT NOT NULL DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE shop_license ADD COLUMN read_only TINYINT(1) NOT NULL DEFAULT 0"); } catch (Exception $e) {}
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS connected_clients (
            id INT NOT NULL AUTO_INCREMENT,
            device_id VARCHAR(120) NOT NULL,
            device_name VARCHAR(255) DEFAULT NULL,
            last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_device_id (device_id),
            INDEX idx_last_seen (last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
} catch (Exception $e) {}
/* Backward-compatible hardening for old tables */
try { $pdo->exec("ALTER TABLE connected_clients ADD UNIQUE KEY uniq_device (device_id)"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE connected_clients ADD INDEX idx_last_seen (last_seen)"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE connected_clients ADD COLUMN client_label VARCHAR(255) DEFAULT NULL"); } catch (Exception $e) {}
/* Lightweight license event audit trail */
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS license_events (
            id INT NOT NULL AUTO_INCREMENT,
            event_type VARCHAR(80) NOT NULL,
            device_id VARCHAR(120) DEFAULT NULL,
            note TEXT DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_event_time (created_at),
            INDEX idx_event_type (event_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
} catch (Exception $e) {}

function logLicenseEvent($pdo, $eventType, $deviceId, $note) {
    try {
        $st = $pdo->prepare("INSERT INTO license_events (event_type, device_id, note, created_at) VALUES (?, ?, ?, NOW())");
        $st->execute([(string)$eventType, (string)($deviceId ?? ''), (string)($note ?? '')]);
    } catch (Exception $e) {}
}

/**
 * Ensure client_label is unique per device (case-insensitive), excluding $deviceId.
 * Friendly: on conflict, appends " (2)", " (3)", … to the admin's base text.
 *
 * @return array{value: ?string, adjusted: bool}
 */
function tc_resolve_unique_client_label($pdo, $deviceId, $desiredLabel) {
    $desiredLabel = trim((string)$desiredLabel);
    if ($desiredLabel === '') {
        return ['value' => null, 'adjusted' => false];
    }
    $base = $desiredLabel;
    $candidate = $base;
    $n = 2;
    for ($attempt = 0; $attempt < 150; $attempt++) {
        if (function_exists('mb_strlen') && mb_strlen($candidate) > 255) {
            $candidate = mb_substr($candidate, 0, 255);
        } elseif (strlen($candidate) > 255) {
            $candidate = substr($candidate, 0, 255);
        }
        $q = $pdo->prepare(
            'SELECT device_id FROM connected_clients WHERE device_id <> ? AND client_label IS NOT NULL AND TRIM(client_label) <> \'\' AND LOWER(TRIM(client_label)) = LOWER(?) LIMIT 1'
        );
        $q->execute([$deviceId, $candidate]);
        if (!$q->fetch(PDO::FETCH_ASSOC)) {
            return [
                'value' => $candidate,
                'adjusted' => ($candidate !== $base),
            ];
        }
        $candidate = $base . ' (' . $n . ')';
        $n++;
    }
    $fallback = $base . ' (' . substr((string)time(), -5) . ')';
    if (function_exists('mb_strlen') && mb_strlen($fallback) > 255) {
        $fallback = mb_substr($fallback, 0, 255);
    } elseif (strlen($fallback) > 255) {
        $fallback = substr($fallback, 0, 255);
    }
    return ['value' => $fallback, 'adjusted' => true];
}

/* Server-side remove action (used by server admin UI) */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = getInput();
    if (($in['action'] ?? '') === 'remove_client') {
        $did = trim((string)($in['deviceId'] ?? ''));
        if ($did === '') respond(['success' => false, 'message' => 'deviceId required'], 400);
        $st = $pdo->prepare("DELETE FROM connected_clients WHERE device_id = ?");
        $st->execute([$did]);
        respond(['success' => true, 'message' => 'Client removed']);
    }
    if (($in['action'] ?? '') === 'set_client_label') {
        $did = trim((string)($in['deviceId'] ?? ''));
        $lbl = isset($in['clientLabel']) ? trim((string)$in['clientLabel']) : '';
        if ($did === '') respond(['success' => false, 'message' => 'deviceId required'], 400);
        if (function_exists('mb_strlen') && mb_strlen($lbl) > 255) {
            $lbl = mb_substr($lbl, 0, 255);
        } elseif (strlen($lbl) > 255) {
            $lbl = substr($lbl, 0, 255);
        }
        try {
            $resolved = tc_resolve_unique_client_label($pdo, $did, $lbl);
            $final = $resolved['value'];
            $adjusted = !empty($resolved['adjusted']);
            $st = $pdo->prepare('UPDATE connected_clients SET client_label = ? WHERE device_id = ?');
            $st->execute([$final, $did]);
        } catch (Exception $e) {
            respond(['success' => false, 'message' => 'Could not update label'], 500);
        }
        $msg = $adjusted
            ? 'That label was already in use. Saved as: ' . (string)$final
            : ($final === null || $final === '' ? 'Label cleared' : 'Label updated');
        respond([
            'success' => true,
            'message' => $msg,
            'client_label' => $final !== null && $final !== '' ? (string)$final : '',
            'label_adjusted' => $adjusted,
        ]);
    }
}

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
$rowStatus = strtolower(trim((string)($row['status'] ?? 'none')));
if (!$row || $rowStatus === 'none') {
    respond([
        'success'  => false,
        'valid'    => false,
        'status'   => 'locked',
        'message'  => 'Server license not configured yet. Please open Techon ERP on the main server PC.',
        'data'     => ['shop_name' => $row['shop_name'] ?? '', 'plan' => '', 'expires' => null, 'days_left' => null],
    ]);
}
/* Trial mode: no serial key required — main PC syncs trial snapshot to MySQL */
if ($rowStatus !== 'trial' && empty($row['license_key'])) {
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
$isReadOnly = !empty($row['read_only']);
$maxClients = (int)($row['max_clients'] ?? 0);
if ($finalStatus === 'trial') {
    $maxClients = TRIAL_MAX_CLIENTS;
}
$listOnly = !empty($_GET['listClients']);
$deviceId = trim((string)($_GET['deviceId'] ?? ''));
$deviceName = trim((string)($_GET['deviceName'] ?? ''));
if ($deviceName === '') {
    $deviceName = $deviceId !== '' ? (substr($deviceId, 0, 6) . '...') : ($_SERVER['REMOTE_ADDR'] ?? 'Client');
}
$isDevLog = (getenv('TECHON_ERP_OPEN_API') === '1');

/* Lightweight per-client rate limit: 60 requests/minute */
try {
    $rlKeyRaw = ($deviceId !== '' ? $deviceId : ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $rlKey = preg_replace('/[^A-Za-z0-9_.-]/', '_', (string)$rlKeyRaw);
    $rlDir = __DIR__ . '/logs/ratelimit';
    if (!is_dir($rlDir)) @mkdir($rlDir, 0755, true);
    $rlFile = $rlDir . '/rl_' . $rlKey . '.json';
    $nowMin = date('Y-m-d H:i');
    $bucket = ['minute' => $nowMin, 'count' => 0];
    if (file_exists($rlFile)) {
        $raw = @file_get_contents($rlFile);
        $dec = json_decode((string)$raw, true);
        if (is_array($dec) && !empty($dec['minute'])) $bucket = $dec;
    }
    if (($bucket['minute'] ?? '') !== $nowMin) $bucket = ['minute' => $nowMin, 'count' => 0];
    $bucket['count'] = (int)($bucket['count'] ?? 0) + 1;
    @file_put_contents($rlFile, json_encode($bucket), LOCK_EX);
    if ((int)$bucket['count'] > 60) {
        logLicenseEvent($pdo, 'device_blocked_ratelimit', $deviceId, 'Too many requests for key=' . $rlKeyRaw);
        respond([
            'success' => false,
            'valid' => false,
            'status' => 'blocked',
            'message' => 'Too many requests. Please retry shortly.',
            'data' => ['read_only_reason' => 'blocked']
        ], 200);
    }
} catch (Exception $e) {}

/* max_clients policy:
   0 or less => no client PCs allowed (standalone only) */
if ($maxClients <= 0 && !$listOnly) {
    logLicenseEvent($pdo, 'device_blocked_no_clients', $deviceId, 'max_clients=' . $maxClients);
    respond([
        'success' => false,
        'valid' => false,
        'status' => 'blocked',
        'reason' => 'no_clients_allowed',
        'message' => 'This license does not allow client PCs.',
        'data' => [
            'shop_name' => $row['shop_name'] ?? '',
            'plan' => $row['plan'] ?? '',
            'expires' => $row['expires_at'] ?? null,
            'days_left' => $daysLeft,
            'max_clients' => $maxClients,
            'connected_clients' => (int)$pdo->query("SELECT COUNT(*) FROM connected_clients")->fetchColumn(),
            'read_only_reason' => 'blocked'
        ]
    ], 200);
}

/* Client-id hygiene (limit mode only): block empty / too-short IDs */
if ($maxClients > 0 && !$listOnly) {
    $isValidDeviceId = (bool)preg_match('/^[A-Za-z0-9_-]{8,120}$/', $deviceId);
    if ($deviceId === '' || strlen($deviceId) < 8 || !$isValidDeviceId) {
        logLicenseEvent($pdo, 'device_blocked_invalid', $deviceId, 'Rejected invalid device identifier');
        respond([
            'success' => false,
            'valid' => false,
            'status' => 'blocked',
            'message' => 'Client identification is invalid. Please reconnect from a registered client.',
            'data' => [
                'shop_name' => $row['shop_name'] ?? '',
                'plan' => $row['plan'] ?? '',
                'expires' => $row['expires_at'] ?? null,
                'days_left' => $daysLeft,
                'max_clients' => $maxClients,
                'connected_clients' => (int)$pdo->query("SELECT COUNT(*) FROM connected_clients")->fetchColumn(),
                'read_only_reason' => 'blocked'
            ]
        ], 200);
    }
}

/* Client limit enforcement (only when max_clients > 0 and a deviceId was supplied) */
if ($maxClients > 0 && $deviceId !== '' && !$listOnly) {
    /* Auto-clean stale devices (inactive for 3+ days), but preserve latest up to max_clients */
    try {
        $keepIds = [];
        $kq = $pdo->prepare("SELECT device_id FROM connected_clients ORDER BY last_seen DESC LIMIT ?");
        $kq->bindValue(1, max(1, $maxClients), PDO::PARAM_INT);
        $kq->execute();
        $keepIds = array_map(function ($r) { return (string)$r['device_id']; }, $kq->fetchAll(PDO::FETCH_ASSOC));
        if (count($keepIds) > 0) {
            $ph = implode(',', array_fill(0, count($keepIds), '?'));
            $dq = $pdo->prepare("DELETE FROM connected_clients WHERE last_seen < NOW() - INTERVAL 3 DAY AND device_id NOT IN ($ph)");
            $dq->execute($keepIds);
            if ((int)$dq->rowCount() > 0) logLicenseEvent($pdo, 'stale_cleanup', $deviceId, 'Removed stale clients=' . (int)$dq->rowCount());
        } else {
            $del = $pdo->exec("DELETE FROM connected_clients WHERE last_seen < NOW() - INTERVAL 3 DAY");
            if ((int)$del > 0) logLicenseEvent($pdo, 'stale_cleanup', $deviceId, 'Removed stale clients=' . (int)$del);
        }
    } catch (Exception $e) {}
    $existsStmt = $pdo->prepare("SELECT id FROM connected_clients WHERE device_id = ? LIMIT 1");
    $existsStmt->execute([$deviceId]);
    $existing = $existsStmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        /* Handle duplicate/blank labels by appending short device id */
        try {
            $dupStmt = $pdo->prepare("SELECT COUNT(*) FROM connected_clients WHERE device_name = ? AND device_id <> ?");
            $dupStmt->execute([$deviceName, $deviceId]);
            $dupCnt = (int)$dupStmt->fetchColumn();
            if ($dupCnt > 0) $deviceName = $deviceName . '-' . substr($deviceId, 0, 4);
        } catch (Exception $e) {}
        $up = $pdo->prepare("UPDATE connected_clients SET device_name = ?, last_seen = NOW() WHERE device_id = ?");
        $up->execute([$deviceName, $deviceId]);
    } else {
        /* Safer concurrent insert path: transaction + re-check just before insert */
        $cnt = 0;
        $inserted = false;
        try {
            $pdo->beginTransaction();
            $cnt = (int)$pdo->query("SELECT COUNT(*) FROM connected_clients FOR UPDATE")->fetchColumn();
            if ($cnt < $maxClients) {
                try {
                    $dupStmt2 = $pdo->prepare("SELECT COUNT(*) FROM connected_clients WHERE device_name = ?");
                    $dupStmt2->execute([$deviceName]);
                    if ((int)$dupStmt2->fetchColumn() > 0) $deviceName = $deviceName . '-' . substr($deviceId, 0, 4);
                } catch (Exception $e) {}
                $ins = $pdo->prepare("INSERT INTO connected_clients (device_id, device_name, last_seen) VALUES (?, ?, NOW())");
                $ins->execute([$deviceId, $deviceName]);
                $inserted = true;
            }
            $pdo->commit();
        } catch (Exception $e) {
            try { if ($pdo->inTransaction()) $pdo->rollBack(); } catch (Exception $e2) {}
            $inserted = false;
            $cnt = (int)$pdo->query("SELECT COUNT(*) FROM connected_clients")->fetchColumn();
        }
        if (!$inserted) {
            if ($isDevLog) serverLog('info', '[check_license] max_clients=' . $maxClients . ' count=' . $cnt . ' decision=BLOCK');
            logLicenseEvent($pdo, 'device_blocked_limit', $deviceId, 'count=' . $cnt . ' max=' . $maxClients);
            respond([
                'success' => false,
                'valid' => false,
                'status' => 'blocked',
                'message' => 'Client limit reached. Please contact server admin to remove a device or upgrade license.',
                'data' => [
                    'shop_name' => $row['shop_name'] ?? '',
                    'plan' => $row['plan'] ?? '',
                    'expires' => $row['expires_at'] ?? null,
                    'days_left' => $daysLeft,
                    'max_clients' => $maxClients,
                    'connected_clients' => max($cnt, $maxClients),
                    'read_only_reason' => 'blocked'
                ]
            ], 200);
        }
        if ($isDevLog) serverLog('info', '[check_license] max_clients=' . $maxClients . ' count=' . $cnt . ' decision=ALLOW');
        logLicenseEvent($pdo, 'device_allowed', $deviceId, 'count=' . $cnt . ' max=' . $maxClients);
    }
}
/* Optional housekeeping list for server admin UI */
$clients = [];
try {
    $q = $pdo->query("SELECT device_id, device_name, client_label, last_seen FROM connected_clients ORDER BY last_seen DESC");
    $clients = $q->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) { $clients = []; }
$connectedCount = count($clients);

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

/* Resolved display name for this device (admin label > auto device_name > hostname param > short id) */
$resolvedClientLabel = '';
if ($deviceId !== '' && !$listOnly) {
    $crow = null;
    try {
        $st = $pdo->prepare("SELECT device_name, client_label FROM connected_clients WHERE device_id = ? LIMIT 1");
        $st->execute([$deviceId]);
        $crow = $st->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $crow = null;
    }
    if ($crow) {
        $lab = isset($crow['client_label']) ? trim((string)$crow['client_label']) : '';
        $dn = trim((string)($crow['device_name'] ?? ''));
        if ($lab !== '') {
            $resolvedClientLabel = $lab;
        } elseif ($dn !== '') {
            $resolvedClientLabel = $dn;
        }
    }
    if ($resolvedClientLabel === '') {
        $resolvedClientLabel = $deviceName !== '' ? $deviceName : (strlen($deviceId) >= 8 ? substr($deviceId, 0, 8) : $deviceId);
    }
}

respond([
    'success'        => true,
    'valid'          => !$isExpired && !$isReadOnly,
    'status'         => $isReadOnly ? 'read_only' : $finalStatus,
    'message'        => $isReadOnly ? 'Server is in read-only mode until license sync succeeds.' : ($isExpired ? 'Server license has expired. Please renew.' : 'License valid'),
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
        'max_clients'    => $maxClients,
        'connected_clients' => $connectedCount,
        'clients'        => $listOnly ? $clients : [],
        'read_only'      => $isReadOnly ? 1 : 0,
        'read_only_reason' => $isReadOnly ? 'offline_timeout' : '',
        'client_label'   => $resolvedClientLabel,
    ],
]);
?>
