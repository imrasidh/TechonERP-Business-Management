<?php
/**
 * device_validate.php — Internal WebSocket auth validation (localhost only).
 *
 * POST: WS auth message { type, device_id, timestamp, nonce, signature, client_id, last_revision }
 * No HTTP auth required — restricted to 127.0.0.1 / ::1 for main-process WS server.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/device_auth.php';

$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$lanOnly = (bool) preg_match(
    '#^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1)#',
    $ip
);
if (!$lanOnly) {
    respond(['success' => false, 'message' => 'Forbidden'], 403);
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
