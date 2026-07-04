<?php
/**
 * device_manage.php — Main PC trusted device administration.
 *
 * Auth: legacy X-TC-KEY or approved device with admin permission (future).
 * During migration, legacy key is sufficient for server-side admin UI on Main PC.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/device_auth.php';

$auth = requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $pending = isset($_GET['pending']) && $_GET['pending'] === '1';
    $devices = tcListTrustedDevices();
    if ($pending) {
        $devices = array_values(array_filter($devices, function ($d) {
            return ($d['status'] ?? '') === 'pending';
        }));
    }
    respond(['success' => true, 'message' => 'ok', 'data' => ['devices' => $devices]]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'GET or POST required'], 405);
}

$input = getInput();
$action = isset($input['action']) ? (string) $input['action'] : '';
$deviceId = isset($input['device_id']) ? (string) $input['device_id'] : '';

switch ($action) {
    case 'approve':
        $perms = isset($input['permissions']) && is_array($input['permissions']) ? $input['permissions'] : null;
        $result = tcApproveDevice($deviceId, $perms);
        break;
    case 'disable':
        $result = tcSetDeviceStatus($deviceId, 'disabled');
        break;
    case 'enable':
        $result = tcSetDeviceStatus($deviceId, 'approved');
        break;
    case 'rename':
        $name = isset($input['device_name']) ? trim((string) $input['device_name']) : '';
        if ($name === '') {
            respond(['success' => false, 'message' => 'device_name required'], 400);
        }
        tcEnsureDeviceTables();
        $stmt = db()->prepare('UPDATE trusted_devices SET device_name = ? WHERE device_id = ?');
        $stmt->execute([$name, $deviceId]);
        $result = $stmt->rowCount() ? ['ok' => true, 'device_id' => $deviceId] : ['ok' => false, 'message' => 'Device not found'];
        break;
    case 'remove':
        $result = tcRemoveDevice($deviceId);
        break;
    case 'regenerate_secret':
        $result = tcRegenerateDeviceSecret($deviceId);
        break;
    default:
        respond(['success' => false, 'message' => 'Unknown action'], 400);
}

if (empty($result['ok'])) {
    respond(['success' => false, 'message' => $result['message'] ?? 'Action failed'], 400);
}

$out = ['success' => true, 'message' => 'ok', 'data' => $result];
respond($out);
