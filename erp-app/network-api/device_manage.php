<?php
/**
 * device_manage.php — Main PC trusted device administration.
 *
 * Auth:
 *  - Device HMAC with permissions.admin === true, OR
 *  - Legacy X-TC-KEY only from localhost (Main PC server UI), OR
 *    TECHON_ERP_ALLOW_LEGACY_DEVICE_ADMIN=1 for controlled remote admin.
 *  - Open API mode is never allowed here.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/device_auth.php';

$auth = requireAuth();

function tcClientIsLocalhost() {
    return function_exists('tcIsLocalhostRequest') ? tcIsLocalhostRequest() : false;
}

function tcDeviceHasAdminPermission($device) {
    if (!$device || !is_array($device)) return false;
    $perms = $device['permissions'] ?? null;
    if (is_string($perms)) {
        $perms = json_decode($perms, true);
    }
    return is_array($perms) && !empty($perms['admin']);
}

function tcRequireDeviceAdminAuth($auth) {
    $mode = is_array($auth) ? ($auth['mode'] ?? '') : '';
    if ($mode === 'open') {
        respond(['success' => false, 'message' => 'Device administration requires authentication'], 403);
    }
    if ($mode === 'device') {
        if (!tcDeviceHasAdminPermission($auth['device'] ?? null)) {
            respond(['success' => false, 'message' => 'Admin device permission required'], 403);
        }
        return;
    }
    if ($mode === 'legacy') {
        $allowRemote = getenv('TECHON_ERP_ALLOW_LEGACY_DEVICE_ADMIN') === '1';
        if (!$allowRemote && !tcClientIsLocalhost()) {
            respond([
                'success' => false,
                'message' => 'Legacy API key cannot administer devices remotely — use an admin-approved device or localhost Main PC',
            ], 403);
        }
        return;
    }
    respond(['success' => false, 'message' => 'Unauthorized'], 401);
}

tcRequireDeviceAdminAuth($auth);

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
