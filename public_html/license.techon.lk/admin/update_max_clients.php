<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/update_max_clients.php
 * POST-only: updates max client PC limit for a license key.
 */
require_once __DIR__ . '/config.php';
requireLogin();
error_reporting(0);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php'); exit;
}

verifyCsrf();

$targetKey   = strtoupper(trim($_POST['key'] ?? ''));
$max_clients = isset($_POST['max_clients']) ? intval($_POST['max_clients']) : 0;
if ($max_clients < 0) $max_clients = 0;

if (!$targetKey) {
    flash('err', 'No license key provided.');
    header('Location: index.php'); exit;
}

$licenses = readLicenses();
$found = false;

foreach ($licenses as &$lic) {
    if (($lic['key'] ?? '') !== $targetKey) continue;
    $lic['max_clients'] = $max_clients;
    $found = true;
    break;
}
unset($lic);

if (!$found) {
    flash('err', 'License key not found: ' . $targetKey);
    header('Location: index.php'); exit;
}

if (writeLicenses($licenses)) {
    $label = $max_clients === 0 ? 'No client PCs allowed' : (string)$max_clients;
    flash('ok', 'Max client PCs updated for ' . $targetKey . ': ' . $label);
} else {
    flash('err', 'Failed to save changes. Check file permissions on licenses.json.');
}

header('Location: index.php');
exit;

