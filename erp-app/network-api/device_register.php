<?php
/**
 * device_register.php — Counter device registration (pending approval).
 *
 * Auth: legacy X-TC-KEY required during migration (no device secret yet).
 * POST: { device_id, device_name, computer_name?, mac_address?, software_version? }
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/device_auth.php';

requireLegacyAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'POST required'], 405);
}

$input = getInput();
$result = tcRegisterDeviceRequest($input, $_SERVER['REMOTE_ADDR'] ?? null);

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
