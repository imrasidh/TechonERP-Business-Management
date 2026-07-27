<?php
/**
 * get_customers.php — Customer list for POS clients.
 * Auth: device HMAC preferred; remote legacy X-TC-KEY blocked (same as sync_patch).
 */
require_once __DIR__ . '/config.php';

$auth = requireAuth();
tcEnforceRemoteAuthPolicy($auth);
if (!tcDeviceMayReadKey($auth, 'tc3_customers')) {
    respond(['success' => false, 'message' => 'Permission denied for customers'], 403);
}

$clientId = $_SERVER['HTTP_X_TC_CLIENT_ID'] ?? '';
$ip       = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if ($clientId) touchSession($clientId, $ip);

$customers = kvGet('tc3_customers', []);

respond([
    'success'   => true,
    'message'   => count($customers) . ' customers',
    'data'      => ['customers' => $customers],
    'customers' => $customers,   // backwards compat
    'count'     => count($customers),
]);
?>
