<?php
/**
 * device_status.php — Poll registration / fetch one-time device secret after approval.
 *
 * Auth: legacy X-TC-KEY during migration, or device HMAC once approved.
 * GET ?device_id=uuid
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/device_auth.php';

$auth = requireAuth();
$deviceId = isset($_GET['device_id']) ? trim((string) $_GET['device_id']) : '';

if ($deviceId === '' || !preg_match(TC_DEVICE_ID_RE, $deviceId)) {
    respond(['success' => false, 'message' => 'device_id required'], 400);
}

if ($auth['mode'] === 'device' && $auth['device']['device_id'] !== $deviceId) {
    respond(['success' => false, 'message' => 'device_id mismatch'], 403);
}

$device = tcGetTrustedDevice($deviceId);
if (!$device) {
    respond(['success' => false, 'message' => 'Device not found'], 404);
}

$data = [
    'device_id'   => $device['device_id'],
    'device_name' => $device['device_name'],
    'status'      => $device['status'],
    'permissions' => is_string($device['permissions']) ? json_decode($device['permissions'], true) : $device['permissions'],
    'last_seen'   => $device['last_seen'],
];

if ($device['status'] === 'approved' && empty($device['secret_delivered'])) {
    $delivery = tcDeliverDeviceSecret($deviceId);
    if (!empty($delivery['secret_ready'])) {
        $data['device_secret'] = $delivery['device_secret'];
        $data['token_id'] = $delivery['token_id'];
        $data['permissions'] = $delivery['permissions'];
    }
}

respond(['success' => true, 'message' => 'ok', 'data' => $data]);
