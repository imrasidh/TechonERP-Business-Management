<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/dashboard.php
 * POST-only: enables or disables dashboard access for a license key.
 *
 * enable  → dashboard_access=true, dashboard_expires = today + 365 days
 * disable → dashboard_access=false, dashboard_expires = null
 * renew   → dashboard_expires = today + 365 days from TODAY (re-enables too)
 */
require_once __DIR__ . '/config.php';
requireLogin();
error_reporting(0);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php'); exit;
}

verifyCsrf();

$targetKey = strtoupper(trim($_POST['key']    ?? ''));
$action    = strtolower(trim($_POST['action'] ?? ''));

if (!$targetKey || !in_array($action, ['enable','disable','renew'], true)) {
    flash('err', 'Invalid request.');
    header('Location: index.php'); exit;
}

$licenses = readLicenses();
$found    = false;

foreach ($licenses as &$lic) {
    if (($lic['key'] ?? '') !== $targetKey) continue;

    if ($action === 'disable') {
        $lic['dashboard_access']  = false;
        $lic['dashboard_expires'] = null;
        $verb = 'DISABLED';
        $extra = '';
    } else {
        /* enable or renew: +365 days from today */
        $expiry = date('Y-m-d', strtotime('+365 days'));
        $lic['dashboard_access']  = true;
        $lic['dashboard_expires'] = $expiry;
        $verb  = $action === 'renew' ? 'RENEWED' : 'ENABLED';
        $extra = ' — expires ' . $expiry;
    }

    $found = true;
    break;
}
unset($lic);

if (!$found) {
    flash('err', 'License key not found: ' . $targetKey);
    header('Location: index.php'); exit;
}

if (writeLicenses($licenses)) {
    flash('ok', 'Dashboard access ' . $verb . ' for: ' . $targetKey . $extra);
} else {
    flash('err', 'Failed to save. Check file permissions on licenses.json.');
}

header('Location: index.php');
exit;
