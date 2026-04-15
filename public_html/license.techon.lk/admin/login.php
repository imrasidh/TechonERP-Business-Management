<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/login.php
 */
require_once __DIR__ . '/config.php';
error_reporting(0);
startAdminSession();

if (!empty($_SESSION['tc_admin_auth'])) {
    header('Location: index.php'); exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $tok = trim($_POST['csrf'] ?? '');
    $storedCsrf = $_SESSION['csrf'] ?? '';
    if (!$storedCsrf || !hash_equals($storedCsrf, $tok)) {
        $error = 'Invalid session. Please refresh the page and try again.';
    } else {
        $u = trim((string) ($_POST['username'] ?? ''));
        $p = (string) ($_POST['password'] ?? '');
        if (strlen($u) > 128) {
            $u = substr($u, 0, 128);
        }
        if (strlen($p) > 2048) {
            $p = substr($p, 0, 2048);
        }
        $clientIp = tc_admin_client_ip();
        $rl = tc_admin_rate_guard_check($clientIp);
        if (!$rl['ok']) {
            $error = isset($rl['message']) ? $rl['message'] : 'Too many attempts. Try again later.';
        } else {
            $cred = tc_admin_resolve_credentials();
            if (!$cred) {
                $error = 'Admin login is not configured. Set ADMIN_PASSWORD_HASH (bcrypt) and ADMIN_USERNAME on the server, or run: php bootstrap_admin.php admin "password"';
            } elseif ($u === $cred['username'] && password_verify($p, $cred['password_hash'])) {
                tc_admin_rate_guard_success($clientIp);
                session_regenerate_id(true);
                $_SESSION['tc_admin_auth'] = true;
                /* New session ID + fresh CSRF to limit fixation / token reuse */
                $_SESSION['csrf'] = bin2hex(random_bytes(20));
                header('Location: index.php'); exit;
            } else {
                tc_admin_rate_guard_failure($clientIp);
                $error = 'Incorrect username or password.';
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin Login — Techon ERP</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
:root {
  --ink:   #0a0f1e;
  --mid:   #111827;
  --panel: #161e32;
  --edge:  #1f2d4a;
  --blue:  #2563eb;
  --blue2: #3b82f6;
  --text:  #e2e8f7;
  --muted: #64748b;
  --err:   #ef4444;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Space Grotesk', sans-serif;
  background: var(--ink);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
/* geometric background */
body::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 80%, rgba(37,99,235,.18) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 85% 15%, rgba(59,130,246,.12) 0%, transparent 55%);
  pointer-events: none;
}
.grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(37,99,235,.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37,99,235,.06) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
}
.card {
  position: relative;
  z-index: 1;
  background: var(--panel);
  border: 1px solid var(--edge);
  border-radius: 20px;
  padding: 44px 44px 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 32px 80px rgba(0,0,0,.5);
}
.logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 32px;
}
.logo-box {
  width: 48px; height: 48px;
  background: linear-gradient(135deg, var(--blue), var(--blue2));
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 900; color: #fff;
  flex-shrink: 0;
  box-shadow: 0 0 24px rgba(37,99,235,.4);
}
.logo-text h1 { font-size: 17px; font-weight: 800; color: var(--text); letter-spacing: -.02em; }
.logo-text p  { font-size: 12px; color: var(--muted); margin-top: 2px; font-weight: 500; }
.divider { height: 1px; background: var(--edge); margin-bottom: 28px; }
label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .1em;
  margin-bottom: 6px;
}
input[type=text], input[type=password] {
  width: 100%;
  padding: 11px 14px;
  background: var(--mid);
  border: 1.5px solid var(--edge);
  border-radius: 9px;
  color: var(--text);
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
  outline: none;
  transition: border-color .15s;
}
input:focus { border-color: var(--blue); }
.btn {
  width: 100%;
  padding: 12px;
  background: var(--blue);
  color: #fff;
  border: none;
  border-radius: 9px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: .01em;
  transition: background .15s, transform .1s;
  margin-top: 4px;
}
.btn:hover { background: var(--blue2); }
.btn:active { transform: scale(.98); }
.error-box {
  background: rgba(239,68,68,.1);
  border: 1px solid rgba(239,68,68,.3);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fca5a5;
  margin-bottom: 16px;
}

/* Mobile: comfortable tap targets + safe areas (desktop unchanged) */
@media (max-width: 520px) {
  body {
    align-items: flex-start;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }
  .card {
    padding: 32px 22px 36px;
    border-radius: 16px;
    max-width: 100%;
  }
  .logo-row { margin-bottom: 24px; }
  input[type=text], input[type=password] {
    font-size: 16px; /* reduces iOS zoom on focus */
    min-height: 48px;
    margin-bottom: 14px;
  }
  .btn {
    min-height: 48px;
    font-size: 15px;
  }
}
</style>
</head>
<body>
<div class="grid-bg"></div>
<div class="card">
  <div class="logo-row">
    <div class="logo-box">T</div>
    <div class="logo-text">
      <h1>Techon ERP</h1>
      <p>License Admin Panel</p>
    </div>
  </div>
  <div class="divider"></div>
  <?php if ($error): ?>
  <div class="error-box">⚠ <?= h($error) ?></div>
  <?php endif; ?>
  <form method="POST" autocomplete="off">
    <input type="hidden" name="csrf" value="<?= h(csrfToken()) ?>"/>
    <label>Username</label>
    <input type="text" name="username" placeholder="admin" maxlength="128" required autofocus/>
    <label>Password</label>
    <input type="password" name="password" placeholder="••••••••" maxlength="2048" required/>
    <button class="btn" type="submit">Sign In →</button>
  </form>
</div>
</body>
</html>
