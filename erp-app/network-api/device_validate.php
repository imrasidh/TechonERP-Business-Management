<?php
/**
 * device_validate.php — Internal WebSocket auth validation (localhost only).
 *
 * POST: WS auth message { type, device_id, timestamp, nonce, signature, client_id, last_revision }
 * No HTTP auth required — restricted to Main PC loopback for main-process WS server.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/device_auth.php';

if (!tcIsLocalhostRequest()) {
    respond(['success' => false, 'message' => 'Forbidden — device_validate is localhost-only'], 403);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'POST required'], 405);
}

$input = getInput();
$device = tcValidateWsDeviceAuth($input);

if (!$device) {
    $reason = tcDeviceAuthError() ?: 'auth_failed';
    respond(['success' => false, 'message' => $reason], 401);
}

respond([
    'success' => true,
    'message' => 'ok',
    'data' => [
        'device_id' => $device['device_id'],
        'device_name' => $device['device_name'],
        'client_id' => isset($input['client_id']) ? (string) $input['client_id'] : '',
    ],
]);
