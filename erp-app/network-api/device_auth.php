<?php
/**
 * Techon ERP — LAN Device Authentication Engine
 *
 * HMAC-SHA256 request signing. Offline / LAN-only — no JWT, no OAuth.
 * Used by requireAuth() (dual mode) and WebSocket auth validation.
 *
 * Signature covers: METHOD + PATH + TIMESTAMP + NONCE + BODY_SHA256_HEX
 *
 * Requires config.php to be loaded before use (db, loadApiKey, serverLog).
 */

/* ── Constants ─────────────────────────────────────────────────────── */
define('TC_DEVICE_AUTH_TS_SKEW', 300);       /* ±5 minutes */
define('TC_DEVICE_AUTH_NONCE_TTL', 600);     /* 10 minutes */
define('TC_DEVICE_ID_RE', '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i');
define('TC_DEVICE_NONCE_RE', '/^[0-9a-f]{32,64}$/i');

/* ── Master key for encrypting device secrets at rest ──────────────── */
function tcDeviceMasterKey() {
    static $key = null;
    if ($key !== null) return $key;
    $file = __DIR__ . '/tc_device_master.php';
    if (file_exists($file)) {
        require_once $file;
        if (defined('TC_DEVICE_MASTER_KEY') && TC_DEVICE_MASTER_KEY !== '') {
            $key = TC_DEVICE_MASTER_KEY;
            return $key;
        }
    }
    $apiKey = loadApiKey();
    if ($apiKey) {
        $key = hash('sha256', 'tc-device-master-v1:' . $apiKey, true);
        return $key;
    }
    /* Fail closed: do not use a public deterministic key in production. */
    if (getenv('TECHON_ERP_OPEN_API') === '1' || getenv('TECHON_ERP_DEV_DEVICE_MASTER') === '1') {
        $key = hash('sha256', 'tc-device-master-dev', true);
        return $key;
    }
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'message' => 'Device master key not configured — create network-api/tc_device_master.php or set TECHON_ERP_DEV_DEVICE_MASTER=1 for local dev only.',
    ]);
    exit();
}

function tcEncryptSecret($plainSecret) {
    $key = tcDeviceMasterKey();
    $iv  = random_bytes(16);
    $ct  = openssl_encrypt($plainSecret, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
    if ($ct === false) return null;
    return base64_encode($iv . $ct);
}

function tcDecryptSecret($enc) {
    if (!$enc) return null;
    $raw = base64_decode($enc, true);
    if ($raw === false || strlen($raw) < 17) return null;
    $key = tcDeviceMasterKey();
    $iv  = substr($raw, 0, 16);
    $ct  = substr($raw, 16);
    $plain = openssl_decrypt($ct, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
    return ($plain !== false) ? $plain : null;
}

function tcGenerateDeviceSecret() {
    return bin2hex(random_bytes(32)); /* 256-bit */
}

function tcGenerateTokenId() {
    return bin2hex(random_bytes(16));
}

function tcBodyHashHex($rawBody) {
    return hash('sha256', (string) $rawBody);
}

/**
 * Build canonical string for HMAC (must match device-crypto.cjs).
 */
function tcBuildSignString($method, $path, $timestamp, $nonce, $bodyHashHex) {
    return strtoupper((string) $method) . "\n"
        . (string) $path . "\n"
        . (string) $timestamp . "\n"
        . (string) $nonce . "\n"
        . (string) $bodyHashHex;
}

function tcComputeSignature($secret, $method, $path, $timestamp, $nonce, $bodyHashHex) {
    $payload = tcBuildSignString($method, $path, $timestamp, $nonce, $bodyHashHex);
    return hash_hmac('sha256', $payload, (string) $secret);
}

function tcRequestPath() {
    $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '/';
    $qpos = strpos($uri, '?');
    if ($qpos !== false) {
        return substr($uri, 0, $qpos) . substr($uri, $qpos);
    }
    return $uri;
}

function tcGetHeader($name) {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (!empty($_SERVER[$key])) return trim((string) $_SERVER[$key]);
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, $name) === 0) return trim((string) $v);
        }
    }
    return '';
}

/* ── Schema bootstrap (idempotent) ─────────────────────────────────── */
function tcEnsureDeviceTables() {
    static $done = false;
    if ($done) return;
    $done = true;
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS trusted_devices (
        device_id        VARCHAR(64)   NOT NULL,
        device_name      VARCHAR(255)  DEFAULT NULL,
        device_secret_enc TEXT         NOT NULL,
        token_id         VARCHAR(64)   DEFAULT NULL,
        status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
        permissions      JSON          DEFAULT NULL,
        computer_name    VARCHAR(255)  DEFAULT NULL,
        ip_address       VARCHAR(64)   DEFAULT NULL,
        mac_address      VARCHAR(64)   DEFAULT NULL,
        software_version VARCHAR(64)   DEFAULT NULL,
        first_connected  TIMESTAMP     NULL DEFAULT NULL,
        last_seen        TIMESTAMP     NULL DEFAULT NULL,
        approved_at      TIMESTAMP     NULL DEFAULT NULL,
        secret_delivered TINYINT(1)    NOT NULL DEFAULT 0,
        created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (device_id),
        INDEX idx_status (status),
        INDEX idx_last_seen (last_seen)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS device_nonces (
        nonce       VARCHAR(64)  NOT NULL,
        device_id   VARCHAR(64)  NOT NULL,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (nonce),
        INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS device_audit_log (
        id          BIGINT       NOT NULL AUTO_INCREMENT,
        device_id   VARCHAR(64)  DEFAULT NULL,
        event       VARCHAR(64)  NOT NULL,
        detail      TEXT         DEFAULT NULL,
        ip          VARCHAR(64)  DEFAULT NULL,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_device (device_id),
        INDEX idx_event (event),
        INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try {
        $pdo->exec('ALTER TABLE trusted_devices ADD COLUMN secret_delivered TINYINT(1) NOT NULL DEFAULT 0');
    } catch (Exception $ignored) {}
}

function tcDeviceAudit($event, $deviceId = null, $detail = null, $ip = null) {
    try {
        tcEnsureDeviceTables();
        $pdo = db();
        $stmt = $pdo->prepare(
            'INSERT INTO device_audit_log (device_id, event, detail, ip) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $deviceId ? (string) $deviceId : null,
            (string) $event,
            $detail !== null ? (string) $detail : null,
            $ip !== null ? (string) $ip : ($_SERVER['REMOTE_ADDR'] ?? null),
        ]);
    } catch (Exception $e) {
        serverLog('warn', '[DeviceAuth] audit failed: ' . $e->getMessage());
    }
}

function tcPurgeOldNonces() {
    try {
        tcEnsureDeviceTables();
        db()->exec(
            'DELETE FROM device_nonces WHERE created_at < NOW() - INTERVAL '
            . (int) TC_DEVICE_AUTH_NONCE_TTL . ' SECOND'
        );
    } catch (Exception $e) {}
}

function tcNonceSeen($deviceId, $nonce) {
    tcEnsureDeviceTables();
    tcPurgeOldNonces();
    $pdo = db();
    $stmt = $pdo->prepare('SELECT 1 FROM device_nonces WHERE nonce = ? LIMIT 1');
    $stmt->execute([(string) $nonce]);
    return (bool) $stmt->fetch();
}

/** Persist nonce after successful signature verification (prevents unauthenticated nonce flooding). */
function tcRememberNonce($deviceId, $nonce) {
    tcEnsureDeviceTables();
    try {
        $ins = db()->prepare('INSERT INTO device_nonces (nonce, device_id) VALUES (?, ?)');
        $ins->execute([(string) $nonce, (string) $deviceId]);
        return true;
    } catch (Exception $e) {
        /* Duplicate — treat as replay */
        return false;
    }
}

function tcGetTrustedDevice($deviceId) {
    if (!preg_match(TC_DEVICE_ID_RE, (string) $deviceId)) return null;
    tcEnsureDeviceTables();
    $stmt = db()->prepare('SELECT * FROM trusted_devices WHERE device_id = ? LIMIT 1');
    $stmt->execute([(string) $deviceId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function tcTouchDeviceSeen($deviceId, $ip = null) {
    try {
        tcEnsureDeviceTables();
        $pdo = db();
        $stmt = $pdo->prepare(
            'UPDATE trusted_devices SET last_seen = NOW(), ip_address = COALESCE(?, ip_address) WHERE device_id = ?'
        );
        $stmt->execute([$ip, (string) $deviceId]);
    } catch (Exception $e) {}
}

/**
 * Validate device HMAC headers. Returns device row on success, null on failure.
 * Sets global $TC_DEVICE_AUTH_ERROR with reason code.
 */
function tcValidateDeviceAuth($method = null, $path = null, $rawBody = null) {
    global $TC_DEVICE_AUTH_ERROR;
    $TC_DEVICE_AUTH_ERROR = null;

    $deviceId  = tcGetHeader('X-TC-DEVICE-ID');
    $timestamp = tcGetHeader('X-TC-TIMESTAMP');
    $nonce     = tcGetHeader('X-TC-NONCE');
    $signature = tcGetHeader('X-TC-SIGNATURE');
    $ip        = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

    if ($deviceId === '' || $timestamp === '' || $nonce === '' || $signature === '') {
        $TC_DEVICE_AUTH_ERROR = 'missing_headers';
        return null;
    }

    if (!preg_match(TC_DEVICE_ID_RE, $deviceId)) {
        $TC_DEVICE_AUTH_ERROR = 'invalid_device_id';
        tcDeviceAudit('auth_fail', $deviceId, 'invalid_device_id', $ip);
        return null;
    }

    if (!preg_match(TC_DEVICE_NONCE_RE, $nonce)) {
        $TC_DEVICE_AUTH_ERROR = 'invalid_nonce';
        tcDeviceAudit('auth_fail', $deviceId, 'invalid_nonce', $ip);
        return null;
    }

    if (!ctype_digit($timestamp)) {
        $TC_DEVICE_AUTH_ERROR = 'invalid_timestamp';
        tcDeviceAudit('auth_fail', $deviceId, 'invalid_timestamp', $ip);
        return null;
    }

    $ts = (int) $timestamp;
    $now = time();
    if (abs($now - $ts) > TC_DEVICE_AUTH_TS_SKEW) {
        $TC_DEVICE_AUTH_ERROR = 'timestamp_skew';
        tcDeviceAudit('replay_attempt', $deviceId, 'timestamp_skew ts=' . $ts, $ip);
        return null;
    }

    $device = tcGetTrustedDevice($deviceId);
    if (!$device) {
        $TC_DEVICE_AUTH_ERROR = 'unknown_device';
        tcDeviceAudit('auth_fail', $deviceId, 'unknown_device', $ip);
        return null;
    }

    if ($device['status'] === 'pending') {
        $TC_DEVICE_AUTH_ERROR = 'pending_approval';
        tcDeviceAudit('auth_fail', $deviceId, 'pending_approval', $ip);
        return null;
    }

    if ($device['status'] === 'disabled') {
        $TC_DEVICE_AUTH_ERROR = 'device_disabled';
        tcDeviceAudit('disabled_access', $deviceId, 'device_disabled', $ip);
        return null;
    }

    if ($device['status'] !== 'approved') {
        $TC_DEVICE_AUTH_ERROR = 'invalid_status';
        tcDeviceAudit('auth_fail', $deviceId, 'status=' . $device['status'], $ip);
        return null;
    }

    if (tcNonceSeen($deviceId, $nonce)) {
        $TC_DEVICE_AUTH_ERROR = 'duplicate_nonce';
        tcDeviceAudit('replay_attempt', $deviceId, 'duplicate_nonce', $ip);
        return null;
    }

    $secret = tcDecryptSecret($device['device_secret_enc']);
    if (!$secret) {
        $TC_DEVICE_AUTH_ERROR = 'secret_unavailable';
        tcDeviceAudit('auth_fail', $deviceId, 'secret_decrypt_failed', $ip);
        return null;
    }

    $reqMethod = $method !== null ? $method : ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $reqPath   = $path !== null ? $path : tcRequestPath();
    if ($rawBody === null) {
        $rawBody = tcGetRawBody();
    }

    $bodyHash = tcBodyHashHex($rawBody);
    $expected = tcComputeSignature($secret, $reqMethod, $reqPath, $timestamp, $nonce, $bodyHash);

    if (!hash_equals($expected, strtolower($signature))) {
        $TC_DEVICE_AUTH_ERROR = 'invalid_signature';
        tcDeviceAudit('auth_fail', $deviceId, 'invalid_signature', $ip);
        return null;
    }

    if (!tcRememberNonce($deviceId, $nonce)) {
        $TC_DEVICE_AUTH_ERROR = 'duplicate_nonce';
        tcDeviceAudit('replay_attempt', $deviceId, 'duplicate_nonce_insert', $ip);
        return null;
    }

    tcTouchDeviceSeen($deviceId, $ip);
    tcDeviceAudit('auth_success', $deviceId, $reqMethod . ' ' . $reqPath, $ip);
    $TC_DEVICE_AUTH_ERROR = null;
    return $device;
}

/**
 * Validate WebSocket auth message (type=auth with device headers in message body).
 */
function tcValidateWsDeviceAuth($msg, $method = 'WS', $path = '/ws') {
    if (!is_array($msg) || ($msg['type'] ?? '') !== 'auth') {
        global $TC_DEVICE_AUTH_ERROR;
        $TC_DEVICE_AUTH_ERROR = 'invalid_ws_auth';
        return null;
    }

    $deviceId  = (string) ($msg['device_id'] ?? '');
    $timestamp = (string) ($msg['timestamp'] ?? '');
    $nonce     = (string) ($msg['nonce'] ?? '');
    $signature = (string) ($msg['signature'] ?? '');

    $_SERVER['HTTP_X_TC_DEVICE_ID']  = $deviceId;
    $_SERVER['HTTP_X_TC_TIMESTAMP']  = $timestamp;
    $_SERVER['HTTP_X_TC_NONCE']     = $nonce;
    $_SERVER['HTTP_X_TC_SIGNATURE']  = $signature;

    $wsPayload = json_encode([
        'type'      => 'auth',
        'device_id' => $deviceId,
        'timestamp' => $timestamp,
        'nonce'     => $nonce,
        'client_id' => (string) ($msg['client_id'] ?? ''),
        'last_revision' => $msg['last_revision'] ?? 0,
    ], JSON_UNESCAPED_UNICODE);

    return tcValidateDeviceAuth($method, $path, $wsPayload);
}

/**
 * Dual authentication: device HMAC first, legacy X-TC-KEY fallback.
 * Returns ['mode' => 'device'|'legacy', 'device' => row|null].
 */
function tcRequireAuthDual() {
    global $TC_DEVICE_AUTH_ERROR;

    $rawBody = tcGetRawBody();
    if ($rawBody === false) $rawBody = '';

    $device = tcValidateDeviceAuth(null, null, $rawBody);
    if ($device) {
        return ['mode' => 'device', 'device' => $device];
    }

    $hasDeviceHeaders = tcGetHeader('X-TC-DEVICE-ID') !== '';
    if ($hasDeviceHeaders) {
        $reason = $TC_DEVICE_AUTH_ERROR ?: 'device_auth_failed';
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Unauthorized — device authentication failed (' . $reason . ')',
        ]);
        exit();
    }

    $storedKey = loadApiKey();
    if ($storedKey === null) {
        if (getenv('TECHON_ERP_OPEN_API') === '1') {
            if (!tcIsLocalhostRequest()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'OPEN_API is localhost-only']);
                exit();
            }
            return ['mode' => 'open', 'device' => null];
        }
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'API key not configured — add network-api/tc_api_key.php (Server Setup) or set TECHON_ERP_OPEN_API=1 for local dev only.',
        ]);
        exit();
    }

    $incoming = tcGetHeader('X-TC-KEY');
    if ($incoming === '' || !hash_equals($storedKey, $incoming)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized — invalid API key']);
        exit();
    }

    return ['mode' => 'legacy', 'device' => null];
}

function tcDeviceAuthError() {
    global $TC_DEVICE_AUTH_ERROR;
    return $TC_DEVICE_AUTH_ERROR;
}

/**
 * Default permissions for new devices (extensible).
 */
function tcDefaultDevicePermissions() {
    return [
        'sales'     => true,
        'inventory' => true,
        'reports'   => true,
        'accounts'  => false,
        'manager'   => false,
        'admin'     => false,
    ];
}

function tcRegisterDeviceRequest($payload, $ip = null) {
    tcEnsureDeviceTables();
    $deviceId = isset($payload['device_id']) ? (string) $payload['device_id'] : '';
    if (!preg_match(TC_DEVICE_ID_RE, $deviceId)) {
        return ['ok' => false, 'message' => 'Invalid device_id'];
    }
    $existing = tcGetTrustedDevice($deviceId);
    if ($existing && $existing['status'] === 'approved') {
        return ['ok' => false, 'message' => 'Device already registered'];
    }
    if ($existing && $existing['status'] === 'pending') {
        return ['ok' => true, 'status' => 'pending', 'device_id' => $deviceId, 'message' => 'Registration already pending'];
    }

    $name = isset($payload['device_name']) ? trim((string) $payload['device_name']) : 'Counter PC';
    $computer = isset($payload['computer_name']) ? trim((string) $payload['computer_name']) : null;
    $mac = isset($payload['mac_address']) ? trim((string) $payload['mac_address']) : null;
    $version = isset($payload['software_version']) ? trim((string) $payload['software_version']) : null;

    $pdo = db();
    $stmt = $pdo->prepare(
        'INSERT INTO trusted_devices
         (device_id, device_name, device_secret_enc, token_id, status, permissions, computer_name, ip_address, mac_address, software_version, first_connected)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           device_name = VALUES(device_name),
           computer_name = VALUES(computer_name),
           ip_address = VALUES(ip_address),
           mac_address = VALUES(mac_address),
           software_version = VALUES(software_version),
           status = IF(status = \'disabled\', status, \'pending\')'
    );
    $tokenId = tcGenerateTokenId();
    $perms = json_encode(tcDefaultDevicePermissions(), JSON_UNESCAPED_UNICODE);
    $stmt->execute([
        $deviceId, $name, '', $tokenId, 'pending', $perms,
        $computer, $ip ?: ($_SERVER['REMOTE_ADDR'] ?? null), $mac, $version,
    ]);

    tcDeviceAudit('device_registered', $deviceId, $name, $ip);
    return ['ok' => true, 'status' => 'pending', 'device_id' => $deviceId, 'token_id' => $tokenId];
}

function tcApproveDevice($deviceId, $permissions = null) {
    tcEnsureDeviceTables();
    $device = tcGetTrustedDevice($deviceId);
    if (!$device) return ['ok' => false, 'message' => 'Device not found'];
    $secret = tcGenerateDeviceSecret();
    $enc = tcEncryptSecret($secret);
    if (!$enc) return ['ok' => false, 'message' => 'Failed to secure device secret'];
    /* Keep registration token_id as the one-time claim proof for secret delivery. */
    $tokenId = !empty($device['token_id']) ? $device['token_id'] : tcGenerateTokenId();
    $perms = $permissions !== null ? json_encode($permissions, JSON_UNESCAPED_UNICODE) : $device['permissions'];
    $pdo = db();
    $stmt = $pdo->prepare(
        'UPDATE trusted_devices SET status = ?, approved_at = NOW(), permissions = COALESCE(?, permissions),
         device_secret_enc = ?, token_id = ?, secret_delivered = 0 WHERE device_id = ?'
    );
    $stmt->execute(['approved', $perms, $enc, $tokenId, (string) $deviceId]);
    tcDeviceAudit('device_approved', $deviceId, null, $_SERVER['REMOTE_ADDR'] ?? null);
    return [
        'ok' => true,
        'device_id' => $deviceId,
        'status' => 'approved',
        'device_secret' => $secret,
        'token_id' => $tokenId,
    ];
}

function tcSetDeviceStatus($deviceId, $status) {
    if (!in_array($status, ['approved', 'disabled', 'pending'], true)) {
        return ['ok' => false, 'message' => 'Invalid status'];
    }
    tcEnsureDeviceTables();
    $pdo = db();
    $stmt = $pdo->prepare('UPDATE trusted_devices SET status = ? WHERE device_id = ?');
    $stmt->execute([$status, (string) $deviceId]);
    if ($stmt->rowCount() === 0) return ['ok' => false, 'message' => 'Device not found'];
    tcDeviceAudit('device_status_' . $status, $deviceId, null, $_SERVER['REMOTE_ADDR'] ?? null);
    return ['ok' => true, 'device_id' => $deviceId, 'status' => $status];
}

function tcRegenerateDeviceSecret($deviceId) {
    tcEnsureDeviceTables();
    $device = tcGetTrustedDevice($deviceId);
    if (!$device) return ['ok' => false, 'message' => 'Device not found'];
    $secret = tcGenerateDeviceSecret();
    $enc = tcEncryptSecret($secret);
    if (!$enc) return ['ok' => false, 'message' => 'Failed to secure device secret'];
    $tokenId = tcGenerateTokenId();
    $pdo = db();
    $stmt = $pdo->prepare(
        'UPDATE trusted_devices SET device_secret_enc = ?, token_id = ?, secret_delivered = 0 WHERE device_id = ?'
    );
    $stmt->execute([$enc, $tokenId, (string) $deviceId]);
    tcDeviceAudit('secret_regenerated', $deviceId, null, $_SERVER['REMOTE_ADDR'] ?? null);
    return ['ok' => true, 'device_id' => $deviceId, 'device_secret' => $secret, 'token_id' => $tokenId];
}

function tcRemoveDevice($deviceId) {
    tcEnsureDeviceTables();
    $pdo = db();
    $stmt = $pdo->prepare('DELETE FROM trusted_devices WHERE device_id = ?');
    $stmt->execute([(string) $deviceId]);
    if ($stmt->rowCount() === 0) return ['ok' => false, 'message' => 'Device not found'];
    tcDeviceAudit('device_removed', $deviceId, null, $_SERVER['REMOTE_ADDR'] ?? null);
    return ['ok' => true, 'device_id' => $deviceId];
}

function tcListTrustedDevices() {
    tcEnsureDeviceTables();
    $stmt = db()->query(
        'SELECT device_id, device_name, token_id, status, permissions, computer_name, ip_address,
                mac_address, software_version, first_connected, last_seen, approved_at, created_at
         FROM trusted_devices ORDER BY created_at DESC'
    );
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        unset($r['device_secret_enc']);
        if (isset($r['permissions']) && is_string($r['permissions'])) {
            $r['permissions'] = json_decode($r['permissions'], true);
        }
    }
    return $rows;
}

function tcGetDeviceSecretPlain($deviceId) {
    $device = tcGetTrustedDevice($deviceId);
    if (!$device) return null;
    return tcDecryptSecret($device['device_secret_enc']);
}

/**
 * One-time secret delivery for counter after admin approval (legacy-key authenticated).
 */
function tcDeliverDeviceSecret($deviceId) {
    tcEnsureDeviceTables();
    $device = tcGetTrustedDevice($deviceId);
    if (!$device || $device['status'] !== 'approved') {
        return ['ok' => false, 'message' => 'Device not approved'];
    }
    if (!empty($device['secret_delivered'])) {
        return ['ok' => true, 'status' => 'approved', 'device_id' => $deviceId, 'secret_ready' => false];
    }
    $secret = tcDecryptSecret($device['device_secret_enc']);
    if (!$secret) {
        return ['ok' => false, 'message' => 'Secret unavailable'];
    }
    $pdo = db();
    /* Atomic one-time claim — only the winning UPDATE returns the secret. */
    $stmt = $pdo->prepare(
        'UPDATE trusted_devices SET secret_delivered = 1
         WHERE device_id = ? AND status = ? AND (secret_delivered IS NULL OR secret_delivered = 0)'
    );
    $stmt->execute([(string) $deviceId, 'approved']);
    if ($stmt->rowCount() !== 1) {
        return ['ok' => true, 'status' => 'approved', 'device_id' => $deviceId, 'secret_ready' => false];
    }
    return [
        'ok' => true,
        'status' => 'approved',
        'device_id' => $deviceId,
        'secret_ready' => true,
        'device_secret' => $secret,
        'token_id' => $device['token_id'],
        'permissions' => is_string($device['permissions']) ? json_decode($device['permissions'], true) : $device['permissions'],
    ];
}
