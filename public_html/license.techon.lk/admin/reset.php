<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/reset.php
 * POST-only: clears device binding so the key can be reactivated on a new PC.
 */
require_once __DIR__ . '/config.php';
requireLogin();
error_reporting(0);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php'); exit;
}

verifyCsrf();

$targetKey = strtoupper(trim($_POST['key'] ?? ''));

if (!$targetKey) {
    flash('err', 'No license key provided.');
    header('Location: index.php'); exit;
}

$licenses = readLicenses();
$found    = false;

foreach ($licenses as &$lic) {
    if (($lic['key'] ?? '') === $targetKey) {
        $lic['device']       = null;
        $lic['device_id']    = null;
        $lic['device_name']  = null;
        $lic['shop']         = null;
        $lic['shop_name']    = null;
        $lic['activated_at'] = null;
        /* Keep plan/expires/max_clients unchanged; reset only unbinds device. */
        /* blocked flag intentionally preserved — reset ≠ unblock */
        $found = true;
        break;
    }
}
unset($lic);

if (!$found) {
    flash('err', 'License key not found: ' . $targetKey);
    header('Location: index.php'); exit;
}

if (writeLicenses($licenses)) {
    flash('ok', 'License reset: ' . $targetKey . ' — device binding cleared, ready for a new device.');
} else {
    flash('err', 'Failed to save changes. Check file permissions on licenses.json.');
}

header('Location: index.php');
exit;
