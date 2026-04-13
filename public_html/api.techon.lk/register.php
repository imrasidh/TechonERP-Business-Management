<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}

$data       = getInput();
$name       = trim($data['name'] ?? '');
$email      = trim($data['email'] ?? '');
$password   = $data['password'] ?? '';
$shopName   = trim($data['shop_name'] ?? '');
$licenseKey = strtoupper(trim($data['license_key'] ?? ''));

if (!$name || !$email || !$password || !$shopName || !$licenseKey) {
    respond(['success' => false, 'error' => 'All fields are required including license key'], 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['success' => false, 'error' => 'Invalid email address'], 400);
}
if (strlen($password) < 6) {
    respond(['success' => false, 'error' => 'Password must be at least 6 characters'], 400);
}

// ── Find licenses.json ──
$licensesFile = '/home/techonlk/public_html/license.techon.lk/licenses.json';

if (!file_exists($licensesFile)) {
    respond(['success' => false, 'error' => 'License verification unavailable. Please contact support.'], 500);
}

$fp = fopen($licensesFile, 'r');
if (!$fp || !flock($fp, LOCK_SH)) {
    if ($fp) fclose($fp);
    respond(['success' => false, 'error' => 'Could not read license file. Please try again.'], 500);
}
$contents = stream_get_contents($fp);
flock($fp, LOCK_UN);
fclose($fp);

$contents = ltrim($contents, "\xEF\xBB\xBF");
$licenses = json_decode($contents, true);

if (!is_array($licenses)) {
    respond(['success' => false, 'error' => 'License file error. Please contact support.'], 500);
}

$licenseValid = false;
$licenseData  = null;

foreach ($licenses as $entry) {
    if (!isset($entry['key'])) continue;
    if (strtoupper(trim($entry['key'])) !== $licenseKey) continue;

    if (!empty($entry['blocked'])) {
        respond(['success' => false, 'error' => 'This license has been blocked. Please contact support.'], 403);
    }
    if (empty($entry['device'])) {
        respond(['success' => false, 'error' => 'This license has not been activated on any device yet. Please install and activate TechonERP first, then register here.'], 403);
    }

    $plan    = strtolower($entry['plan'] ?? 'monthly');
    $expires = $entry['expires'] ?? null;
    if ($plan !== 'lifetime' && $expires !== null) {
        $today      = new DateTime(date('Y-m-d'));
        $expireDate = new DateTime($expires);
        if ($today > $expireDate) {
            respond(['success' => false, 'error' => 'This license expired on ' . $expires . '. Please renew to continue.'], 403);
        }
    }

    $licenseValid = true;
    $licenseData  = $entry;
    break;
}

if (!$licenseValid) {
    respond(['success' => false, 'error' => 'Invalid license key. Please check and try again.'], 403);
}

$pdo = db();

$stmt = $pdo->prepare('SELECT id FROM shops WHERE license_key = ?');
$stmt->execute([$licenseKey]);
if ($stmt->fetch()) {
    respond(['success' => false, 'error' => 'This license key is already linked to an account. Please log in instead.'], 409);
}

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);
if ($stmt->fetch()) {
    respond(['success' => false, 'error' => 'This email is already registered. Please log in instead.'], 409);
}

$finalShopName = $shopName ?: ($licenseData['shop'] ?? $shopName);

/* ── Check dashboard_access on the ERP license ── */
if (empty($licenseData['dashboard_access'])) {
    respond(['success' => false, 'error' => 'Dashboard access is not enabled for this license. Please contact Techon to enable it.'], 403);
}

/* Auto-expiry check */
if (!empty($licenseData['dashboard_expires'])) {
    $today   = new DateTime(date('Y-m-d'));
    $expDate = new DateTime($licenseData['dashboard_expires']);
    if ($today > $expDate) {
        respond(['success' => false, 'error' => 'Your dashboard subscription has expired (expired ' . $licenseData['dashboard_expires'] . '). Please contact Techon to renew.'], 403);
    }
}

try {
    $pdo->beginTransaction();

    $shopId  = bin2hex(random_bytes(16));
    $apiKey  = generateToken(32);
    $stmt = $pdo->prepare('INSERT INTO shops (id, name, api_key, license_key) VALUES (?, ?, ?, ?)');
    $stmt->execute([$shopId, $finalShopName, $apiKey, $licenseKey]);

    $userId   = bin2hex(random_bytes(16));
    $passHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmt = $pdo->prepare('INSERT INTO users (id, shop_id, name, email, password_hash) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$userId, $shopId, $name, $email, $passHash]);

    $stmt = $pdo->prepare('INSERT INTO settings_snapshot (shop_id, shop_name) VALUES (?, ?)');
    $stmt->execute([$shopId, $finalShopName]);

    $pdo->commit();

    respond([
        'success'         => true,
        'message'         => 'Account created! Welcome to TechonERP Dashboard.',
        'shop_id'         => $shopId,
        'api_key'         => $apiKey,
        'dashboard_expires' => $licenseData['dashboard_expires'] ?? null,
        'shop_name'       => $finalShopName
    ]);

} catch (Exception $e) {
    $pdo->rollBack();
    respond(['success' => false, 'error' => 'Registration failed: ' . $e->getMessage()], 500);
}
?>
