<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}

$data     = getInput();
$email    = trim($data['email'] ?? '');
$password = $data['password'] ?? '';

if (!$email || !$password) {
    respond(['success' => false, 'error' => 'Email and password required'], 400);
}

$pdo  = db();
$stmt = $pdo->prepare('SELECT u.*, s.name as shop_name, s.api_key, s.currency, s.license_key FROM users u JOIN shops s ON u.shop_id = s.id WHERE u.email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    respond(['success' => false, 'error' => 'Incorrect email or password'], 401);
}

/* ── Check dashboard_access from licenses.json ── */
$licensesFile = '/home/techonlk/public_html/license.techon.lk/licenses.json';
$dashExpires  = null;
if (file_exists($licensesFile)) {
    $fp = fopen($licensesFile, 'r');
    if ($fp && flock($fp, LOCK_SH)) {
        $raw  = ltrim(stream_get_contents($fp), "\xEF\xBB\xBF");
        flock($fp, LOCK_UN); fclose($fp);
        $lics = json_decode($raw, true) ?: [];
        foreach ($lics as $lic) {
            if (strtoupper($lic['key'] ?? '') !== strtoupper($user['license_key'] ?? '')) continue;
            if (empty($lic['dashboard_access'])) {
                respond(['success' => false, 'error' => 'Dashboard access not enabled. Contact Techon.'], 403);
            }
            if (!empty($lic['dashboard_expires'])) {
                $today   = new DateTime(date('Y-m-d'));
                $expDate = new DateTime($lic['dashboard_expires']);
                if ($today > $expDate) {
                    respond(['success' => false, 'error' => 'Dashboard subscription expired ' . $lic['dashboard_expires'] . '. Contact Techon to renew.'], 403);
                }
                $dashExpires = $lic['dashboard_expires'];
            }
            break;
        }
    } elseif ($fp) { fclose($fp); }
}

/* ── SESSION TOKEN STRATEGY ──
   CRITICAL: Only create a new session_token if none exists or it has expired.
   If a valid token already exists, PRESERVE IT unchanged.
   This prevents the ERP background sync (which calls login.php) from
   invalidating the browser dashboard session.
   ────────────────────────────── */
$existingToken   = $user['session_token']   ?? null;
$existingExpires = $user['token_expires']   ?? null;
$tokenIsValid    = $existingToken && $existingExpires && strtotime($existingExpires) > time();

if ($tokenIsValid) {
    /* Existing valid token — keep it, do NOT overwrite */
    $token = $existingToken;
} else {
    /* No valid token — create a new one valid for 1 year */
    $token   = generateToken(32);
    $expires = date('Y-m-d H:i:s', strtotime('+1 year'));
    $pdo->prepare('UPDATE users SET session_token = ?, token_expires = ? WHERE id = ?')
        ->execute([$token, $expires, $user['id']]);
}

respond([
    'success'          => true,
    'token'            => $token,
    'name'             => $user['name'],
    'email'            => $user['email'],
    'shop_name'        => $user['shop_name'],
    'shop_id'          => $user['shop_id'],
    'api_key'          => $user['api_key'],
    'currency'         => $user['currency'] ?? 'Rs',
    'dashboard_expires'=> $dashExpires,
    'subscription'     => $dashExpires ? ['plan' => 'Dashboard', 'expires_at' => $dashExpires] : null
]);
?>
