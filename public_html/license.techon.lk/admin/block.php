<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/block.php
 * POST-only: sets blocked=true on a key (or removes it to unblock).
 *
 * The ERP's activate.php and verify.php must also check for blocked=true
 * and return INVALID if set.  See note at bottom.
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

if (!$targetKey || !in_array($action, ['block','unblock'], true)) {
    flash('err', 'Invalid request.');
    header('Location: index.php'); exit;
}

$licenses = readLicenses();
$found    = false;

foreach ($licenses as &$lic) {
    if (($lic['key'] ?? '') === $targetKey) {
        if ($action === 'block') {
            $lic['blocked'] = true;
        } else {
            unset($lic['blocked']);   /* remove flag entirely — cleaner JSON */
        }
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
    $verb = $action === 'block' ? 'blocked' : 'unblocked';
    flash('ok', 'License ' . $verb . ': ' . $targetKey);
} else {
    flash('err', 'Failed to save changes. Check file permissions on licenses.json.');
}

header('Location: index.php');
exit;

/*
 * ──────────────────────────────────────────────────────────────────
 * NOTE: To make blocking effective on the ERP side, add this check
 * inside your activate.php and verify.php BEFORE the device check:
 *
 *   if (!empty($entry['blocked'])) {
 *       echo json_encode(['status' => 'INVALID', 'message' => 'License is blocked.']);
 *       exit;
 *   }
 * ──────────────────────────────────────────────────────────────────
 */
