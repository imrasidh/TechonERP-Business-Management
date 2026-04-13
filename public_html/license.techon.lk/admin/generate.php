<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/generate.php
 * POST-only: generates a new unique TCERP-XXXX-XXXX key with a plan and writes it to licenses.json
 */
require_once __DIR__ . '/config.php';
requireLogin();
error_reporting(0);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php'); exit;
}

verifyCsrf();

$valid_plans = ['3days', 'monthly', 'yearly', '2year', 'lifetime'];
$plan        = strtolower(trim($_POST['plan'] ?? 'monthly'));
if (!in_array($plan, $valid_plans, true)) {
    flash('err', 'Invalid plan selected.');
    header('Location: index.php'); exit;
}

$licenses = readLicenses();
$newKey   = generateKey($licenses);

$licenses[] = [
    'key'          => $newKey,
    'plan'         => $plan,
    'expires'      => null,
    'device'       => null,
    'shop'         => null,
    'activated_at' => null
];

if (writeLicenses($licenses)) {
    $planLabel = ['3days'=>'3-Day Demo','monthly'=>'Monthly','yearly'=>'Yearly','2year'=>'2 Year','lifetime'=>'Lifetime'][$plan];
    flash('ok', 'New ' . $planLabel . ' license key generated: ' . $newKey);
} else {
    flash('err', 'Could not write to licenses.json — check file permissions (should be 644).');
}

header('Location: index.php');
exit;
