<?php
require_once 'config.php';

$data  = getInput();
$email = trim($data['email'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['success' => false, 'error' => 'Invalid email'], 400);
}

$pdo  = db();
$stmt = $pdo->prepare('SELECT id, name FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

// Always respond success — don't reveal if email exists
if (!$user) {
    respond(['success' => true, 'message' => 'If that email exists, a reset link has been sent.']);
}

$token   = generateToken(32);
$expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
$stmt = $pdo->prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?');
$stmt->execute([$token, $expires, $user['id']]);

$resetLink = 'https://erp.techon.lk/dashboard/reset_password.html?token=' . $token;

$subject = 'TechonERP — Password Reset Request';
$message  = "Hello " . $user['name'] . ",\n\n";
$message .= "You requested a password reset for your TechonERP Dashboard account.\n\n";
$message .= "Click the link below to reset your password (valid for 1 hour):\n\n";
$message .= $resetLink . "\n\n";
$message .= "If you did not request this, please ignore this email.\n\n";
$message .= "— TechonERP Team";

$headers = 'From: noreply@erp.techon.lk' . "\r\n" . 'Reply-To: noreply@erp.techon.lk';
mail($email, $subject, $message, $headers);

respond(['success' => true, 'message' => 'If that email exists, a reset link has been sent.']);
?>
