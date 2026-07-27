<?php
/**
 * device_register.php — Counter device registration (pending approval).
 *
 * Auth: legacy X-TC-KEY required during migration (no device secret yet).
 * Remote legacy is allowed here (enrollment) but rate-limited.
 * POST: { device_id, device_name, computer_name?, mac_address?, software_version? }
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/device_auth.php';

requireLegacyAuth();
tcEnforceRemoteAuthPolicy(['mode' => 'legacy'], ['allowRemoteLegacy' => true]);

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!tcRateLimitAllow('device_register_' . $ip, 20)) {
    respond(['success' => false, 'message' => 'Too many registration attempts. Please retry shortly.'], 429);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'POST required'], 405);
}

$input = getInput();
$result = tcRegisterDeviceRequest($input, $ip);

if (!$result['ok']) {
    respond(['success' => false, 'message' => $result['message']], 400);
}

respond([
    'success' => true,
    'message' => $result['message'] ?? 'Registration submitted — awaiting administrator approval',
    'data'    => [
        'device_id' => $result['device_id'],
        'status'    => $result['status'],
        'token_id'  => $result['token_id'] ?? null,
    ],
]);
