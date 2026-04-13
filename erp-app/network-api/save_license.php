<?php
/**
 * save_license.php — Store/update license snapshot in MySQL.
 *
 * Called ONLY by the Electron main process on the server PC,
 * after a successful activation or license verification.
 *
 * Clients MUST NOT call this endpoint directly.
 *
 * Auth: X-TC-License-Sync header must equal the LAN API key
 *       stored in tc_api_key.php (same secret as X-TC-KEY).
 *
 * Method: POST
 * Body (JSON):
 *   {
 *     status        : "none"|"trial"|"activated"|"expired",
 *     shop_name     : "My Shop",
 *     license_key   : "TCERP-XXXX-XXXX",
 *     plan          : "monthly"|"yearly"|"lifetime"|...,
 *     expires_at    : "2026-01-01" | null,
 *     trial_ends_at : "2026-01-05" | null
 *   }
 *
 * Returns: { success, message, data: null }
 */
require_once __DIR__ . '/config.php';

/* ── Auth: X-TC-License-Sync must match LAN API key (same as tc_api_key.php) ── */
$syncKey = isset($_SERVER['HTTP_X_TC_LICENSE_SYNC'])
    ? trim($_SERVER['HTTP_X_TC_LICENSE_SYNC'])
    : '';

$apiKey = loadApiKey();

if (!$syncKey || !$apiKey || !hash_equals($apiKey, $syncKey)) {
    serverLog('warn', '[save_license] Unauthorized sync attempt from ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    respond(['success' => false, 'message' => 'Unauthorized'], 401);
}

/* ── Method check ───────────────────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'POST required'], 405);
}

/* ── Parse body ─────────────────────────────────────────────────── */
$input = getInput();

$status      = isset($input['status'])        ? (string)$input['status']        : 'none';
$shopName    = isset($input['shop_name'])      ? (string)$input['shop_name']     : null;
$licenseKey  = isset($input['license_key'])    ? (string)$input['license_key']   : null;
$plan        = isset($input['plan'])           ? (string)$input['plan']          : null;
$expiresAt   = isset($input['expires_at'])     ? (string)$input['expires_at']    : null;
$trialEndsAt = isset($input['trial_ends_at'])  ? (string)$input['trial_ends_at'] : null;

/* ── Ensure table exists (auto-migrate old installs) ────────────── */
$pdo = db();
$pdo->exec("
    CREATE TABLE IF NOT EXISTS shop_license (
        `id`            INT           NOT NULL DEFAULT 1,
        `status`        VARCHAR(20)   NOT NULL DEFAULT 'none',
        `shop_name`     VARCHAR(255)  DEFAULT NULL,
        `license_key`   VARCHAR(100)  DEFAULT NULL,
        `plan`          VARCHAR(50)   DEFAULT NULL,
        `expires_at`    VARCHAR(50)   DEFAULT NULL,
        `trial_ends_at` VARCHAR(50)   DEFAULT NULL,
        `synced_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

/* ── UPSERT (always id = 1) ─────────────────────────────────────── */
$stmt = $pdo->prepare("
    INSERT INTO shop_license
        (`id`, `status`, `shop_name`, `license_key`, `plan`, `expires_at`, `trial_ends_at`)
    VALUES
        (1, :status, :shop_name, :license_key, :plan, :expires_at, :trial_ends_at)
    ON DUPLICATE KEY UPDATE
        `status`        = VALUES(`status`),
        `shop_name`     = VALUES(`shop_name`),
        `license_key`   = VALUES(`license_key`),
        `plan`          = VALUES(`plan`),
        `expires_at`    = VALUES(`expires_at`),
        `trial_ends_at` = VALUES(`trial_ends_at`)
");

$stmt->execute([
    ':status'        => $status,
    ':shop_name'     => $shopName,
    ':license_key'   => $licenseKey,
    ':plan'          => $plan,
    ':expires_at'    => $expiresAt,
    ':trial_ends_at' => $trialEndsAt,
]);

serverLog('info', '[save_license] Synced status=' . $status . ' shop=' . ($shopName ?? 'none'));

respond([
    'success' => true,
    'message' => 'License snapshot saved',
    'data'    => null,
]);
?>
