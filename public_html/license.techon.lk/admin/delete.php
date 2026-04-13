<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/delete.php
 * POST-only: permanently removes a license key from licenses.json.
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
$before   = count($licenses);

$licenses = array_values(array_filter($licenses, fn($l) => ($l['key'] ?? '') !== $targetKey));

if (count($licenses) === $before) {
    flash('err', 'License key not found: ' . $targetKey);
    header('Location: index.php'); exit;
}

if (writeLicenses($licenses)) {
    flash('ok', 'License deleted: ' . $targetKey);
} else {
    flash('err', 'Failed to save changes. Check file permissions on licenses.json.');
}

header('Location: index.php');
exit;
